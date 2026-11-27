/**
 * Host half of the local LLM relay.
 *
 * The relay runs inside the DSH host process — no child process, no Python.
 * Enabling this plugin starts it, disabling stops it. The same service backs the
 * `llm_gateway` agent tool and the Settings page, which reaches it over
 * same-origin HTTP routes registered on the harness web server.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { createGateway, ensureConfig } from './lib/gateway.mjs'
import { probeAll, readProbeSnapshot } from './lib/probe.mjs'

export const name = 'llm-gateway'
export const inject = ['tools', 'webServer']

export const Config = Schema.object({
  enabled: Schema.boolean()
    .default(true)
    .description('插件启用时自动启动本地中转站；关闭后可在设置页或用 llm_gateway 工具手动启动。'),
  host: Schema.string()
    .default('127.0.0.1')
    .description('监听地址，保持 127.0.0.1 表示只允许本机访问。'),
  port: Schema.natural()
    .min(1)
    .max(65535)
    .default(4000)
    .description('监听端口，DSH 里的 provider baseURL 要指向同一端口。'),
  dir: Schema.string()
    .default('')
    .description('工作目录（放 channels.json、health.json、日志）；留空表示 <用户主目录>/.dsh/llm-gateway。'),
})

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))
const API_PREFIX = '/llm-gateway/api'

/** Per-user working directory, so an installed plugin never depends on the author's paths. */
export function defaultGatewayDir() {
  return join(homedir(), '.dsh', 'llm-gateway')
}

/**
 * Prepare the working directory. `channels.json` is the user's own upstream list
 * and is never generated or shipped; the example is dropped once for reference.
 */
export function ensureGatewayLayout(dir) {
  mkdirSync(dir, { recursive: true })
  const example = join(dir, 'channels.example.json')
  if (!existsSync(example)) {
    try {
      copyFileSync(join(PACKAGE_ROOT, 'channels.example.json'), example)
    } catch {
      // the example is a convenience, not a requirement
    }
  }
  if (!existsSync(join(dir, 'channels.json'))) {
    throw new Error(
      `缺少 ${join(dir, 'channels.json')}。这是你自己的上游清单（站点 + key + 模型），`
      + '格式见同目录的 channels.example.json 或 README。',
    )
  }
  return dir
}

/** One text block for the agent tool. */
export function renderStatus(payload, options = {}) {
  const lines = []
  lines.push(payload.running
    ? `本地中转站：运行中 ${payload.base}`
    : `本地中转站：未运行${payload.base ? `（预期出口 ${payload.base}）` : ''}`)

  if (payload.running) {
    lines.push(`通道 ${payload.channels.length} 条（健康 ${payload.healthy}，实测通过 ${payload.verified}），`
      + `可调度模型 ${payload.modelCount} 个`)
    const broken = payload.channels.filter(row => !row.healthy || row.fail > 0)
    if (broken.length > 0) {
      lines.push('异常通道：')
      for (const row of broken.slice(0, 10)) {
        const cool = row.cooldown > 0 ? `，冷却 ${row.cooldown}s` : ''
        const detail = row.lastError ? `：${row.lastError}` : ''
        lines.push(`- ${row.id}（${row.site}）失败 ${row.fail} 次${cool}${detail}`)
      }
    }
  }
  if (payload.detail) lines.push(`说明：${payload.detail}`)
  if (options.withModels && payload.models.length > 0) {
    lines.push('', `可调度模型 ${payload.models.length} 个：`)
    for (const id of payload.models.slice(0, 60)) lines.push(`- ${id}`)
    if (payload.models.length > 60) lines.push(`- …另有 ${payload.models.length - 60} 个`)
  }
  return lines.join('\n')
}

/** Owns one gateway instance for the lifetime of the plugin. */
class Relay {
  constructor(settings, logger) {
    this.settings = settings
    this.logger = logger
    this.gateway = null
    this.lastError = null
  }

  get base() {
    return `http://${this.settings.host}:${this.settings.port}/v1`
  }

  status() {
    const summary = this.gateway?.running ? this.gateway.summary() : null
    return {
      running: Boolean(this.gateway?.running),
      base: this.base,
      dir: this.settings.dir,
      detail: this.lastError ?? undefined,
      channels: summary?.rows ?? [],
      healthy: summary?.healthy ?? 0,
      verified: summary?.verified ?? 0,
      modelCount: summary?.models ?? 0,
      models: this.gateway?.running ? this.gateway.models() : [],
      probe: readProbeSnapshot(this.settings.dir),
    }
  }

  async start() {
    if (this.gateway?.running) return this.status()
    ensureGatewayLayout(this.settings.dir)
    const config = ensureConfig(this.settings.dir, { host: this.settings.host, port: this.settings.port })
    this.gateway = createGateway({ dir: this.settings.dir, config })
    try {
      await this.gateway.start()
      this.lastError = null
      this.logger?.info?.(`llm-gateway listening on ${this.base}`)
    } catch (error) {
      this.gateway = null
      this.lastError = error?.code === 'EADDRINUSE'
        ? `端口 ${this.settings.port} 已被占用（可能有另一个中转站或 start.bat 在跑）`
        : String(error?.message ?? error)
      throw new Error(this.lastError)
    }
    return this.status()
  }

  async stop() {
    if (!this.gateway) return this.status()
    await this.gateway.stop()
    this.gateway = null
    return this.status()
  }

  async restart() {
    await this.stop()
    return this.start()
  }

  async reload() {
    if (!this.gateway?.running) throw new Error('中转站未运行，先执行 start')
    const result = this.gateway.reload()
    return { ...result, status: this.status() }
  }

  models() {
    return this.gateway?.running ? this.gateway.models() : []
  }

  async probe() {
    if (this.probing) throw new Error('上一轮测速还没结束')
    this.probing = true
    try {
      ensureGatewayLayout(this.settings.dir)
      return await probeAll({ dir: this.settings.dir })
    } finally {
      this.probing = false
    }
  }

  dispose() {
    if (!this.gateway?.running) return
    this.gateway.persist()
    this.gateway.stop().catch(() => {})
    this.gateway = null
  }
}

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  response.end(body)
}

/** Same-origin JSON API the Settings page talks to. */
function route(relay) {
  const handle = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://placeholder')
    const action = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '')
    const method = (request.method ?? 'GET').toUpperCase()

    try {
      if (action === 'status' && method === 'GET') {
        return sendJson(response, 200, relay.status())
      }
      if (action === 'models' && method === 'GET') {
        return sendJson(response, 200, { models: relay.models() })
      }
      if (action === 'probe') {
        if (method === 'GET') {
          return sendJson(response, 200, { snapshot: readProbeSnapshot(relay.settings.dir) })
        }
        if (method !== 'POST') {
          response.writeHead(405, { allow: 'GET, POST' })
          return response.end()
        }
        return sendJson(response, 200, { snapshot: await relay.probe() })
      }
      if (['start', 'stop', 'restart', 'reload'].includes(action)) {
        if (method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          return response.end()
        }
        if (action === 'start') return sendJson(response, 200, await relay.start())
        if (action === 'stop') return sendJson(response, 200, await relay.stop())
        if (action === 'restart') return sendJson(response, 200, await relay.restart())
        const result = await relay.reload()
        return sendJson(response, 200, { ...result, status: result.status })
      }
      return sendJson(response, 404, { error: { message: `no route ${method} ${url.pathname}` } })
    } catch (error) {
      return sendJson(response, 500, { error: { message: String(error?.message ?? error) } })
    }
  }

  return { kind: 'prefix', path: API_PREFIX, handler: handle }
}

export function apply(ctx, config) {
  const settings = {
    enabled: config?.enabled ?? true,
    host: config?.host || '127.0.0.1',
    port: Number(config?.port ?? 4000),
    dir: String(config?.dir ?? '').replace(/\\/g, '/').replace(/\/+$/, '') || defaultGatewayDir(),
  }
  const relay = new Relay(settings, ctx.logger)

  ctx.effect(() => ctx.webServer.register(route(relay)), 'llm-gateway.routes')
  ctx.effect(() => () => relay.dispose(), 'llm-gateway.lifetime')

  ctx.effect(() => ctx.tools.register({
    name: 'llm_gateway',
    description: '查看和管理本机 LLM 聚合中转站：把多个 OpenAI 兼容上游合并成一个出口，同名模型自动在通道间故障转移。'
      + 'status 返回运行状态与通道健康度；start/stop/restart 控制服务；reload 在改完 channels.json 后热加载；models 列出可调度模型。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'start', 'stop', 'restart', 'reload', 'models'],
          description: '要执行的动作，默认 status。',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    timeoutMs: 60_000,
    isConcurrencySafe: args => (args?.action ?? 'status') !== 'restart',
    presentCall: args => ({
      card: 'generic',
      title: `本地中转站：${args?.action ?? 'status'}`,
      kind: ['start', 'stop', 'restart', 'reload'].includes(args?.action) ? 'edit' : 'read',
      rawInput: args,
    }),
    async execute({ action = 'status' } = {}) {
      switch (action) {
        case 'start': return renderStatus(await relay.start())
        case 'stop': return renderStatus(await relay.stop())
        case 'restart': return renderStatus(await relay.restart())
        case 'reload': {
          const result = await relay.reload()
          return `${renderStatus(result.status)}\n\n已热加载：${result.channels} 条通道 / ${result.models} 个模型`
        }
        case 'models': return renderStatus(relay.status(), { withModels: true })
        default: return renderStatus(relay.status())
      }
    },
  }), 'llm-gateway.tool')

  if (settings.enabled) {
    relay.start().catch(error => ctx.logger?.warn?.(`llm-gateway 未启动：${error?.message ?? error}`))
  }
}
