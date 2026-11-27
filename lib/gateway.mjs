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
  appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
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
    models: Array.isArray(raw.models) ? raw.models.map(String) : [],
  }))
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

function pickCandidates(index, health, channelsById, model) {
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
  const ordered = [...ids].sort((left, right) => {
    const a = health.entry(left)
    const b = health.entry(right)
    const failOrder = Number(a.fails > 0) - Number(b.fails > 0)
    if (failOrder !== 0) return failOrder
    const latency = (a.latencyMs || 2500) - (b.latencyMs || 2500)
    if (latency !== 0) return latency
    return channelsById.get(right).priority - channelsById.get(left).priority
  })
  return [...ordered.filter(id => health.isHealthy(id)), ...ordered.filter(id => !health.isHealthy(id))]
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
        healthy: health.isHealthy(channel.id),
        ok: state.ok,
        fail: state.fail,
        cooldown: Math.max(0, Math.round((state.cooldownUntil - Date.now()) / 1000)),
        lastError: state.lastError,
        latencyMs: Math.round(state.latencyMs),
      }
    })
    return {
      channels: rows.length,
      healthy: rows.filter(row => row.healthy).length,
      verified: rows.filter(row => row.ok > 0).length,
      models: index.size,
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
    let candidates = pickCandidates(index, health, byId, model)
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
          body: JSON.stringify(outgoing),
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
      const data = [...index.keys()].sort().map(id => ({
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

  return {
    summary,
    reload,
    models: () => [...index.keys()].sort(),
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
