/**
 * Local LLM relay — zero-dependency Node implementation.
 *
 * Merges many OpenAI-compatible upstreams behind one endpoint. A model name is
 * routed across every channel that advertises it, in health order, until one
 * answers. Failures cool a channel down so the next request skips it.
 *
 * This module is pure library code: it never touches DSH APIs, so it can be
 * embedded by the plugin, exercised by tests, or run standalone.
 */
import { createServer } from 'node:http'
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export const DEFAULTS = {
  host: '127.0.0.1',
  port: 4000,
  requestTimeoutMs: 60_000,
  totalBudgetMs: 100_000,
  maxAttempts: 3,
  connectTimeoutMs: 10_000,
}

const COOLDOWN_MS = { 401: 1_800_000, 403: 900_000, 429: 120_000, 5: 120_000 }
const RETRYABLE_STATUS = new Set([401, 402, 403, 404, 408, 410, 429, 500, 502, 503, 504])
const UA = 'dsh-llm-gateway/0.2 (+https://github.com/binsonHao/dsh-llm-gateway)'

/* ------------------------------------------------------------------ config */

export function ensureConfig(dir, overrides = {}) {
  const file = join(dir, 'gateway.json')
  let stored = {}
  if (existsSync(file)) {
    try {
      stored = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      stored = {}
    }
  }
  const config = {
    ...DEFAULTS,
    ...stored,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined && value !== '')),
  }
  if (typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
    config.apiKey = `sk-local-${randomBytes(18).toString('base64url')}`
  }
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  } catch {
    // a read-only install still runs; the key just is not persisted
  }
  return config
}

export function loadChannels(dir) {
  const file = join(dir, 'channels.json')
  if (!existsSync(file)) {
    throw new Error(`缺少 ${file}：这是你自己的上游清单（站点 + key + 模型），请按 README 创建`)
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const list = Array.isArray(parsed) ? parsed : parsed?.channels
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${file} 里没有 channels 数组`)
  }
  return list.map((raw, index) => ({
    id: String(raw.id ?? `ch${index + 1}`),
    site: String(raw.site ?? raw.id ?? `channel-${index + 1}`),
    base: String(raw.base ?? '').replace(/\/+$/, ''),
    key: String(raw.key ?? ''),
    priority: Number.isFinite(raw.priority) ? raw.priority : 50,
    // 已验证过的模型：测速与健康检查优先用它，否则可能挑到该站并不真正供给的模型
    tested: typeof raw.tested === 'string' ? raw.tested : '',
    // 上游真实模型名：客户端用统一模型名，转发时再换成本站自己的拼写
    alias: raw.alias && typeof raw.alias === 'object' ? raw.alias : {},
    models: Array.isArray(raw.models) ? raw.models.map(String) : [],
  }))
}

/* ------------------------------------------------------------------ 通道文件读写 */

/**
 * 读 channels.json，同时记住它的形状（数组 or {channels:[...]}）。
 * 写回时要保持原形状，否则用户手写的 version/generatedAt 会丢。
 */
export function readChannelFile(dir) {
  const file = join(dir, 'channels.json')
  if (!existsSync(file)) {
    return { file, shape: 'object', doc: { version: 1, channels: [] }, list: [] }
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const shape = Array.isArray(parsed) ? 'array' : 'object'
  const list = shape === 'array' ? parsed : (Array.isArray(parsed.channels) ? parsed.channels : [])
  return { file, shape, doc: parsed, list }
}

/** 写回 channels.json：先备份 .bak 再落盘，格式与形状都保持原样。 */
export function writeChannelFile(dir, list) {
  const { file, shape, doc } = readChannelFile(dir)
  const next = shape === 'array'
    ? list
    : { ...doc, channels: list, updatedAt: new Date().toISOString() }
  if (existsSync(file)) copyFileSync(file, `${file}.bak`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return file
}

/** 把界面传来的模型/别名文本拆成干净列表。允许逗号、换行、空格分隔。 */
function toList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  return String(value ?? '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

/**
 * 校验并规整一条通道。返回的对象就是写进 channels.json 的形状。
 * 校验尽量给出能照着改的提示，而不是「invalid input」。
 */
export function normalizeChannel(raw, { mustExist = [], keepKey = '' } = {}) {
  const id = String(raw?.id ?? '').trim()
  if (!id) throw new Error('通道 ID 不能为空')
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(id)) {
    throw new Error('通道 ID 只能用字母、数字、点、下划线、短横线，长度 2–64')
  }
  if (mustExist.length > 0 && !mustExist.includes(id)) {
    throw new Error(`通道 ${id} 不存在`)
  }

  const base = String(raw?.base ?? '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('Base URL 不能为空')
  if (!/^https?:\/\//i.test(base)) throw new Error('Base URL 必须以 http:// 或 https:// 开头')
  // 网关内部会自己拼 /v1/chat/completions，填了会变成 /v1/v1/...
  if (/\/v1$/i.test(base)) throw new Error('Base URL 不要带结尾的 /v1，网关会自己拼')

  // 编辑时密钥留空表示「不修改」——界面拿不到原 key，也不该拿到
  const key = String(raw?.key ?? '').trim() || String(keepKey ?? '').trim()
  if (!key) throw new Error('API Key 不能为空')

  const models = toList(raw?.models)
  if (models.length === 0) throw new Error('至少填一个模型名')

  // 别名：界面传 [{from,to}] 或 {from:to} 都接受
  const alias = {}
  if (raw?.alias && typeof raw.alias === 'object' && !Array.isArray(raw.alias)) {
    for (const [from, to] of Object.entries(raw.alias)) {
      const a = String(from).trim()
      const b = String(to ?? '').trim()
      if (a && b) alias[a] = b
    }
  } else if (Array.isArray(raw?.alias)) {
    for (const entry of raw.alias) {
      const a = String(entry?.from ?? '').trim()
      const b = String(entry?.to ?? '').trim()
      if (a && b) alias[a] = b
    }
  }

  const priority = Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : 50
  const tested = String(raw?.tested ?? '').trim()

  return {
    id,
    site: String(raw?.site ?? '').trim() || id,
    base,
    key,
    priority,
    ...(tested ? { tested } : {}),
    ...(Object.keys(alias).length > 0 ? { alias } : {}),
    models,
  }
}

/* ------------------------------------------------------------------ health */

export function createHealth(dir) {
  const file = join(dir, 'health.json')
  const state = new Map()

  const entry = id => {
    if (!state.has(id)) state.set(id, { fails: 0, latencyMs: 0, cooldownUntil: 0, ok: 0, fail: 0, lastError: '' })
    return state.get(id)
  }

  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      for (const [id, value] of Object.entries(saved)) {
        const target = entry(id)
        Object.assign(target, {
          fails: Number(value.fails) || 0,
          latencyMs: Number(value.latencyMs) || 0,
          cooldownUntil: Number(value.cooldownUntil) || 0,
          ok: Number(value.ok) || 0,
          fail: Number(value.fail) || 0,
          lastError: String(value.lastError ?? ''),
        })
      }
    } catch {
      // corrupt history only costs a warm-up
    }
  }

  const persist = () => {
    try {
      writeFileSync(file, JSON.stringify(Object.fromEntries(state), null, 1), 'utf8')
    } catch {
      // telemetry must never break a request
    }
  }

  return {
    entry,
    persist,
    isHealthy: id => Date.now() >= entry(id).cooldownUntil,
    recordOk(id, latencyMs) {
      const target = entry(id)
      target.fails = 0
      target.cooldownUntil = 0
      target.ok += 1
      target.latencyMs = target.latencyMs > 0 ? target.latencyMs * 0.6 + latencyMs * 0.4 : latencyMs
    },
    recordFail(id, status, message) {
      const target = entry(id)
      target.fails += 1
      target.fail += 1
      target.lastError = `${status} ${String(message ?? '')}`.slice(0, 300).replace(/\s+/g, ' ')
      const cooldown = COOLDOWN_MS[status] ?? (status === 'net' ? COOLDOWN_MS[5] : 60_000)
      if (target.fails >= 2 || status === 401 || status === 403) {
        target.cooldownUntil = Date.now() + cooldown
      }
    },
    snapshot() {
      return Object.fromEntries(state)
    },
  }
}

/* ----------------------------------------------------------------- gateway */

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length })
  res.end(body)
}

function authorized(req, apiKey) {
  const header = String(req.headers.authorization ?? '')
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const alt = String(req.headers['x-api-key'] ?? '').trim()
  return bearer === apiKey || alt === apiKey
}

function pickCandidates(index, health, channelsById, model, pinned = new Set()) {
  let ids = index.get(model)
  if (!ids) {
    const lowered = model.toLowerCase()
    for (const [name, value] of index) {
      if (name.toLowerCase() === lowered) {
        ids = value
        break
      }
    }
  }
  if (!ids || ids.length === 0) return []
  // 「固定」是用户明确表达的选择，排在最前——除非该通道正在冷却（那说明上游此刻确实不可用）。
  // 不能因为一次瞬时失败就把固定通道整体后置：请求会先去挨个撞必超时的死通道，把预算耗尽。
  const rank = id => {
    const a = health.entry(id)
    return [
      pinned.has(id) && health.isHealthy(id) ? 0 : 1,   // 钉住且健康的最前
      health.isHealthy(id) ? 0 : 1,                     // 其余健康通道
      pinned.has(id) ? 0 : 1,                           // 钉住但冷却中，优先于同样冷却的
      a.fails > 0 ? 1 : 0,
      a.latencyMs || 2500,
      -(channelsById.get(id).priority ?? 50),
    ]
  }
  return [...ids].sort((left, right) => {
    const a = rank(left)
    const b = rank(right)
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] - b[i]
    }
    return 0
  })
}

function meaningful(payload) {
  if (payload === null || typeof payload !== 'object') return false
  if (payload.error) return false
  return 'choices' in payload || 'data' in payload || 'content' in payload
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024 * 1024) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createGateway({ dir, config }) {
  const channels = config?.__channels ?? loadChannels(dir)
  const byId = new Map(channels.map(channel => [channel.id, channel]))
  const index = new Map()
  for (const channel of channels) {
    for (const model of channel.models) {
      if (!index.has(model)) index.set(model, [])
      index.get(model).push(channel.id)
    }
  }

  const health = createHealth(dir)
  const pinFile = join(dir, 'pins.json')
  let pinned = new Set()
  if (existsSync(pinFile)) {
    try {
      const saved = JSON.parse(readFileSync(pinFile, 'utf8'))
      pinned = new Set(Object.values(saved).flat())
    } catch {
      pinned = new Set()
    }
  }
  const savePins = () => {
    // pins.json 存「模型 -> 偏好通道顺序」，重启后仍然生效
    const byModel = {}
    for (const model of index.keys()) {
      const order = [...index.get(model)].filter(id => pinned.has(id))
      if (order.length > 0) byModel[model] = order
    }
    try {
      writeFileSync(pinFile, JSON.stringify(byModel, null, 2), 'utf8')
    } catch {
      // 偏好存不下来只影响下次启动
    }
  }
  const logFile = join(dir, 'logs', 'requests.ndjson')
  mkdirSync(join(dir, 'logs'), { recursive: true })

  let server = null
  let closing = null

  const log = record => {
    try {
      appendFileSync(logFile, `${JSON.stringify({ ...record, ts: new Date().toISOString() })}\n`, 'utf8')
    } catch {
      // logging is best-effort
    }
  }

  const summary = () => {
    const snapshot = health.snapshot()
    const rows = channels.map(channel => {
      const state = health.entry(channel.id)
      return {
        id: channel.id,
        site: channel.site,
        models: channel.models.length,
        modelList: channel.models,
        // 编辑表单要用；key 故意不放进来，密钥不该进页面状态
        base: channel.base,
        priority: channel.priority,
        alias: channel.alias,
        healthy: health.isHealthy(channel.id),
        ok: state.ok,
        fail: state.fail,
        cooldown: Math.max(0, Math.round((state.cooldownUntil - Date.now()) / 1000)),
        lastError: state.lastError,
        latencyMs: Math.round(state.latencyMs),
        pinned: pinned.has(channel.id),
      }
    })
    const allow = Array.isArray(config.models) ? config.models : []
    const visibleCount = allow.length === 0
      ? index.size
      : [...index.keys()].filter(model => allow.includes(model)).length
    return {
      channels: rows.length,
      healthy: rows.filter(row => row.healthy).length,
      verified: rows.filter(row => row.ok > 0).length,
      models: visibleCount,
      totalModels: index.size,
      rows,
      snapshot,
    }
  }


/**
 * 部分公益站对空 `tools` 数组 + `tool_choice` 的组合会直接回 400
 * （`upstream_400`），而 DSH 在模型未声明工具能力时正是这样发的。
 * 转发前把空工具集整组去掉，并清掉显式 null 的字段——两者对上游都没有语义。
 */

/**
 * 有些宿主工具直接把 properties 当成 parameters 发（缺 `type: "object"`），
 * 严格的推理服务会整单拒收：`invalid_client_tool_schema: tool parameter root
 * must be an object type`。转发前把裸 properties 包成合法 object schema。
 */
function normalizeToolSchema(tool) {
  const fn = tool?.function
  if (!fn || typeof fn !== 'object') return tool
  const params = fn.parameters
  if (params === undefined) {
    return { ...tool, function: { ...fn, parameters: { type: 'object', properties: {} } } }
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return { ...tool, function: { ...fn, parameters: { type: 'object', properties: {} } } }
  }
  if (params.type === 'object') return tool
  // 没有 type 但已经是属性表：补上 type 和 properties
  const looksLikePropertyBag = !('type' in params)
    && Object.values(params).every(value => value && typeof value === 'object' && !Array.isArray(value))
  if (looksLikePropertyBag) {
    const { properties, required, additionalProperties, ...rest } = params
    return { ...tool, function: { ...fn, parameters: {
      type: 'object',
      ...(properties ? { properties } : { properties: params }),
      ...(required ? { required } : {}),
      ...(additionalProperties !== undefined ? { additionalProperties } : {}),
      ...rest,
    } } }
  }
  if (params.type !== 'object') {
    // 根节点是数组/字符串之类的工具，上游无法接受；退化成无参数对象
    return { ...tool, function: { ...fn, parameters: { type: 'object', properties: {} } } }
  }
  return tool
}

function countTools(body) {
  return Array.isArray(body?.tools) ? body.tools.length : 0
}

function countMessages(body) {
  return Array.isArray(body?.messages) ? body.messages.length : 0
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body
  const out = {}
  for (const [key, value] of Object.entries(body)) {
    if (value === null) continue
    out[key] = value
  }
  if (Array.isArray(out.tools) && out.tools.length === 0) {
    delete out.tools
    delete out.tool_choice
    delete out.parallel_tool_calls
  }
  if (Array.isArray(out.tools)) out.tools = out.tools.map(normalizeToolSchema)
  if (Array.isArray(out.functions) && out.functions.length === 0) {
    delete out.functions
    delete out.function_call
  }
  return out
}

  async function proxyChat(req, res, body) {
    const model = String(body?.model ?? '')
    // 白名单外一律拒绝——只过滤 /v1/models 列表挡不住真正发过来的请求
    if (config.models?.length > 0 && !modelVisible(model)) {
      return json(res, 404, {
        error: {
          message: `模型 ${model} 不在热门清单里`,
          type: 'invalid_request_error',
          code: 'model_not_allowed',
          hint: visibleModels(),
        },
      })
    }
    let candidates = pickCandidates(index, health, byId, model, pinned)
    if (config.__debugSingleChannel) candidates = candidates.slice(0, 1)
    if (candidates.length === 0) {
      return json(res, 404, {
        error: {
          message: `gateway 未收录模型 ${model}`,
          type: 'invalid_request_error',
          code: 'model_not_found',
          hint: [...index.keys()].slice(0, 8),
        },
      })
    }

    const outgoing = sanitizeBody(body)
    const stream = body?.stream === true
    const deadline = Date.now() + config.totalBudgetMs
    let attempts = 0
    let last = { status: 502, text: 'no upstream attempted', upstreamRejected: false }

    for (const id of candidates) {
      if (attempts >= config.maxAttempts || Date.now() >= deadline) break
      attempts += 1
      const channel = byId.get(id)
      const budget = Math.max(10_000, Math.min(config.requestTimeoutMs, deadline - Date.now()))
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), budget)
      const started = Date.now()

      try {
        const upstream = await fetch(`${channel.base}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${channel.key}`,
            'content-type': 'application/json',
            accept: stream ? 'text/event-stream, application/json' : 'application/json',
            'user-agent': UA,
          },
          // 成员站对同一模型的拼写常常不同（如 deepseek-ai/DeepSeek-V4.1-Flash-1017），
          // 这里把统一名换成该站真实的名字再发出去。
          body: JSON.stringify(channel.alias?.[model]
            ? { ...outgoing, model: channel.alias[model] }
            : outgoing),
          signal: controller.signal,
        })

        if (upstream.ok && stream) {
          clearTimeout(timer)
          res.writeHead(200, {
            'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          try {
            for await (const chunk of upstream.body) {
              if (res.writableEnded) break
              res.write(chunk)
            }
          } catch {
            // client hung up or upstream truncated; headers are already sent
          }
          res.end()
          health.recordOk(id, Date.now() - started)
          log({ model, channel: id, status: 200, stream: true, ms: Date.now() - started, tools: countTools(outgoing), msgs: countMessages(outgoing) })
          return
        }

        const text = await upstream.text()
        clearTimeout(timer)

        if (upstream.ok) {
          let payload = null
          try {
            payload = JSON.parse(text)
          } catch {
            payload = null
          }
          if (meaningful(payload)) {
            health.recordOk(id, Date.now() - started)
            log({ model, channel: id, status: 200, ms: Date.now() - started })
            return json(res, 200, payload)
          }
          // some upstreams answer 200 with an error envelope inside
          last = { status: 502, text: text.slice(0, 600) || 'empty 200 body' }
          health.recordFail(id, 'net', last.text)
          log({ model, channel: id, status: 200, err: '200-but-not-valid', ms: Date.now() - started })
          continue
        }

        last = { status: upstream.status, text, upstreamRejected: true }
        health.recordFail(id, upstream.status, text)
        log({ model, channel: id, status: upstream.status, err: text.slice(0, 160), ms: Date.now() - started })
        if (!RETRYABLE_STATUS.has(upstream.status) && upstream.status < 500) break
      } catch (error) {
        clearTimeout(timer)
        const aborted = error?.name === 'AbortError'
        last = { status: aborted ? 504 : 502, text: aborted ? 'gateway timeout' : String(error?.message ?? error) }
        health.recordFail(id, 'net', last.text)
        log({ model, channel: id, status: last.status, err: last.text.slice(0, 160), ms: Date.now() - started })
      }
    }

    health.persist()
    const status = last.status >= 400 && last.status < 600 ? last.status : 502
    let payload
    try {
      payload = JSON.parse(last.text)
    } catch {
      payload = { error: { message: last.text.slice(0, 500), type: 'upstream_error' } }
    }
    payload['x-gateway'] = { tried: attempts, model }
    try {
      if (!last.upstreamRejected) throw new Error('not an upstream rejection')
      writeFileSync(join(dir, 'logs', 'last-failure-request.json'),
        JSON.stringify({ at: new Date().toISOString(), status, model, lastError: last.text.slice(0, 2000), request: outgoing }, null, 2))
    } catch (error) {
      console.log('[capture] write failed:', error?.code, error?.message)
    }
    return json(res, status, payload)
  }

  async function route(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    if (path === '/health' && req.method === 'GET') {
      return json(res, 200, { ...summary(), base: `http://${config.host}:${config.port}/v1` })
    }

    if (!authorized(req, config.apiKey)) {
      return json(res, 401, { error: { message: 'invalid gateway api key', type: 'authentication_error' } })
    }

    if (path === '/v1/models' && req.method === 'GET') {
      const data = visibleModels().map(id => ({
        id,
        object: 'model',
        created: 0,
        owned_by: byId.get(index.get(id)[0]).site,
      }))
      return json(res, 200, { object: 'list', data })
    }

    if ((path === '/v1/chat/completions' || path === '/v1/completions') && req.method === 'POST') {
      let body
      try {
        body = await readBody(req)
      } catch (error) {
        return json(res, 400, { error: { message: `bad request body: ${error.message}`, type: 'invalid_request_error' } })
      }
      return proxyChat(req, res, body)
    }

    if (path === '/admin/reload' && req.method === 'POST') {
      try {
        return json(res, 200, { ok: true, ...reload() })
      } catch (error) {
        return json(res, 400, { ok: false, error: { message: error.message } })
      }
    }

    return json(res, 404, { error: { message: `no route ${req.method} ${path}`, type: 'invalid_request_error' } })
  }

  function reload() {
    const reloaded = loadChannels(dir)
    channels.length = 0
    channels.push(...reloaded)
    byId.clear()
    index.clear()
    for (const channel of channels) {
      byId.set(channel.id, channel)
      for (const model of channel.models) {
        if (!index.has(model)) index.set(model, [])
        index.get(model).push(channel.id)
      }
    }
    return { channels: channels.length, models: index.size }
  }

  /**
   * 只暴露白名单里的模型。白名单为空时暴露全部。
   * 这是给人用的「热门模型」清单——231 个模型摊开在设置页里没法看。
   */
  function visibleModels() {
    const all = [...index.keys()].sort()
    const allow = Array.isArray(config.models) ? config.models : []
    if (allow.length === 0) return all
    const wanted = new Set(allow.map(String))
    return all.filter(model => wanted.has(model))
  }

  /** 请求未命中白名单时，回一条说得清的 404，而不是静默失败。 */
  function modelVisible(model) {
    return visibleModels().includes(model)
  }

  return {
    summary,
    reload,
    models: visibleModels,
    modelVisible,
    allModels: () => [...index.keys()].sort(),
    /** 运行时改热门清单。配置是内存里的对象，改了立即生效，不必重启监听。 */
    setAllowlist: (models) => {
      config.models = Array.isArray(models) ? models.map(String) : []
      return { models: visibleModels().length, total: index.size }
    },
    /** 磁盘上的 pins.json 被外部改过（比如删了通道）后，把内存里的偏好重新读一遍。 */
    refreshPins: () => {
      try {
        const saved = JSON.parse(readFileSync(pinFile, 'utf8'))
        pinned = new Set(Object.values(saved).flat().filter(id => byId.has(id)))
      } catch {
        pinned = new Set()
      }
    },
    /** 读当前偏好：模型 -> 排在最前的通道。 */
    pins: () => {
      const byModel = {}
      for (const model of index.keys()) {
        const ordered = [...index.get(model)].filter(id => pinned.has(id))
        if (ordered.length > 0) byModel[model] = ordered
      }
      return byModel
    },
    /** 把某个通道设为某模型的首选；传 null 清除该模型全部偏好。 */
    setPin(model, channelId) {
      const ids = index.get(model)
      if (!ids) throw new Error(`未收录模型 ${model}`)
      // 先清掉这个模型的全旧首选，再设新的——否则旧偏好会一直抢在前面（曾因此选不中想要的通道）
      for (const id of ids) pinned.delete(id)
      if (channelId !== null) {
        if (!channelId) throw new Error('channelId 不能为空')
        if (!ids.includes(channelId)) throw new Error(`通道 ${channelId} 不提供模型 ${model}`)
        pinned.add(channelId)
      }
      savePins()
      return this.pins()
    },
    snapshot: () => ({ channels: channels.length, models: index.size, base: `http://${config.host}:${config.port}/v1` }),
    async start() {
      if (server) return this.snapshot()
      server = createServer((req, res) => {
        route(req, res).catch(error => {
          if (!res.headersSent) json(res, 500, { error: { message: String(error?.message ?? error) } })
          else res.end()
        })
      })
      server.keepAliveTimeout = 30_000
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.host, () => {
          server.off('error', reject)
          resolve()
        })
      })
      return this.snapshot()
    },
    async stop() {
      if (!server) return false
      closing = new Promise(resolve => {
        server.close(() => resolve())
        server.closeAllConnections?.()
      })
      await closing
      server = null
      closing = null
      health.persist()
      return true
    },
    get running() {
      return server !== null
    },
    persist: () => health.persist(),
  }
}
