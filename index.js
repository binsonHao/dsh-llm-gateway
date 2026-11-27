/**
 * Host half of the local LLM relay.
 *
 * The gateway itself is a plain Python process (F:\workspace\llm-gateway). This
 * plugin owns its lifetime: it starts it when the plugin is enabled, stops it
 * when the plugin is disabled or the host unloads, and exposes one agent tool so
 * both the user and the model can see what is running.
 *
 * Enabling or disabling this plugin in Settings → Plugins is the switch.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'

export const name = 'llm-gateway'
export const inject = ['tools']

export const Config = Schema.object({
  enabled: Schema.boolean()
    .default(true)
    .description('插件启用时自动拉起本地中转站；关闭后由你手动运行 start.bat。'),
  pythonPath: Schema.string()
    .default('python')
    .description('Python 解释器，留 python 表示走 PATH。'),
  scriptDir: Schema.string()
    .default('')
    .description('网关工作目录；留空表示 <用户主目录>/.dsh/llm-gateway（首次启用会自动释放内置脚本）。'),
  port: Schema.natural()
    .min(1)
    .max(65535)
    .default(4000)
    .description('网关监听端口，需与 gateway.json 保持一致。'),
  startupTimeoutMs: Schema.natural()
    .min(1000)
    .max(120000)
    .default(30000)
    .description('等待网关就绪的超时时间。'),
})

const SERVICE_KEY = 'llmGateway'
const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))
const BUNDLED_GATEWAY = join(PACKAGE_ROOT, 'gateway')

/** Default working directory: per-user DSH home, so an installed plugin never needs the author's paths. */
export function defaultGatewayDir() {
  return join(homedir(), '.dsh', 'llm-gateway')
}

/**
 * Materialise the bundled gateway sources into `dir`.
 * The sources ship inside this package; only `channels.json` is the user's own file.
 */
export function ensureGatewayLayout(dir) {
  mkdirSync(dir, { recursive: true })
  for (const name of ['gateway.py', 'build_channels.py']) {
    const target = join(dir, name)
    if (!existsSync(target)) copyFileSync(join(BUNDLED_GATEWAY, name), target)
  }
  if (!existsSync(join(dir, 'channels.json'))) {
    throw new Error(
      `缺少 ${join(dir, 'channels.json')}。这是你自己的上游清单（站点 + key + 模型），`
      + '请按 README 的格式创建，或先用 build_channels.py 从令牌表生成。',
    )
  }
  return dir
}

function normalizeDir(dir) {
  return String(dir ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function tail(text, max = 400) {
  const value = String(text ?? '').trim()
  return value.length <= max ? value : `…${value.slice(-max)}`
}

/** One gateway instance per plugin mount. */
class GatewayProcess {
  constructor(ctx, config, logger) {
    this.ctx = ctx
    this.config = config
    this.logger = logger
    this.child = null
    this.startedAt = 0
    this.lastExit = null
  }

  get base() {
    return `http://127.0.0.1:${this.config.port}`
  }

  get scriptPath() {
    return join(normalizeDir(this.config.scriptDir), 'gateway.py')
  }

  get logPath() {
    return join(normalizeDir(this.config.scriptDir), 'gateway.plugin.log')
  }

  async health(timeoutMs = 2500) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${this.base}/health`, { signal: controller.signal })
      if (!response.ok) return { up: false, detail: `HTTP ${response.status}` }
      return { up: true, body: await response.json() }
    } catch (error) {
      return { up: false, detail: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** True when something (this plugin or a manual start.bat) already answers. */
  async adoptIfRunning() {
    const probe = await this.health(1200)
    return probe.up ? probe.body : null
  }

  appendLog(chunk) {
    try {
      mkdirSync(normalizeDir(this.config.scriptDir), { recursive: true })
      appendFileSync(this.logPath, String(chunk), 'utf8')
    } catch {
      // logging must never take the plugin down
    }
  }

  async start() {
    if (this.child) return { started: false, reason: 'already spawned by this plugin' }
    const adopted = await this.adoptIfRunning()
    // Something already listens on the port (e.g. start.bat). Report it, do not double-bind.
    if (adopted) return { started: false, adopted: true, state: adopted }

    ensureGatewayLayout(normalizeDir(this.config.scriptDir))

    this.child = spawn(this.config.pythonPath, ['-u', 'gateway.py'], {
      cwd: normalizeDir(this.config.scriptDir),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.startedAt = Date.now()

    const pipe = chunk => this.appendLog(chunk)
    this.child.stdout?.on('data', pipe)
    this.child.stderr?.on('data', pipe)
    this.child.on('exit', (code, signal) => {
      this.lastExit = { code, signal, at: Date.now() }
      this.child = null
      this.logger?.warn?.(`llm-gateway exited code=${code} signal=${signal}`)
    })

    const deadline = Date.now() + this.config.startupTimeoutMs
    while (Date.now() < deadline) {
      const probe = await this.health(1500)
      if (probe.up) return { started: true, state: probe.body, pid: this.child?.pid ?? null }
      if (!this.child) break
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    const detail = this.lastExit ? `进程退出 code=${this.lastExit.code}` : '等待就绪超时'
    throw new Error(`${detail}，日志见 ${this.logPath}`)
  }

  stop() {
    if (!this.child) return false
    const child = this.child
    this.child = null
    try {
      child.kill()
    } catch {
      // ignore
    }
    return true
  }

  stats() {
    return {
      childPid: this.child?.pid ?? null,
      startedAt: this.startedAt || null,
      lastExit: this.lastExit,
      scriptPath: this.scriptPath,
      logPath: this.logPath,
    }
  }
}

/** The gateway's own bearer key lives next to its script, not in the DSH config. */
function readGatewayKey(dir) {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'gateway.json'), 'utf8'))
    return typeof raw?.apiKey === 'string' && raw.apiKey.length > 0 ? raw.apiKey : null
  } catch {
    return null
  }
}

/** Upstream errors arrive as JSON strings; show the human sentence, not the envelope. */
function readableError(text) {
  const value = String(text ?? '').trim()
  const start = value.indexOf('{')
  if (start >= 0) {
    try {
      const parsed = JSON.parse(value.slice(start))
      const message = parsed?.error?.message ?? parsed?.message
      if (typeof message === 'string') return message
    } catch {
      // fall through to the raw text
    }
  }
  return value
}

function describeHealth(state) {
  const channels = Array.isArray(state?.channels) ? state.channels : []
  const healthy = channels.filter(channel => channel.healthy)
  const withTraffic = channels.filter(channel => (channel.ok ?? 0) > 0)
  return {
    channels: channels.length,
    healthy: healthy.length,
    verified: withTraffic.length,
    models: state?.models ?? 0,
    broken: channels
      .filter(channel => !channel.healthy || (channel.fail ?? 0) > 0)
      .map(channel => ({
        id: channel.id,
        site: channel.site,
        fail: channel.fail ?? 0,
        cooldown: channel.cooldown ?? 0,
        lastError: readableError(channel.lastError),
      })),
  }
}

function renderStatus(payload) {
  const lines = []
  lines.push(payload.up ? `本地中转站：运行中 ${payload.base}` : `本地中转站：未运行 ${payload.base}`)
  if (payload.up && payload.summary) {
    const s = payload.summary
    lines.push(`通道 ${s.channels} 条（健康 ${s.healthy}，实测通过 ${s.verified}），可调度模型 ${s.models} 个`)
    if (s.broken.length > 0) {
      lines.push('异常通道：')
      for (const channel of s.broken.slice(0, 10)) {
        const cool = channel.cooldown > 0 ? `，冷却 ${channel.cooldown}s` : ''
        lines.push(`- ${channel.id}（${channel.site}）失败 ${channel.fail} 次${cool}：${tail(channel.lastError, 120)}`)
      }
    }
  }
  if (payload.detail) lines.push(`说明：${payload.detail}`)
  return lines.join('\n')
}

export function apply(ctx, config) {
  const resolved = {
    enabled: config?.enabled ?? true,
    pythonPath: config?.pythonPath || 'python',
    scriptDir: normalizeDir(config?.scriptDir || defaultGatewayDir()),
    port: Number(config?.port ?? 4000),
    startupTimeoutMs: Number(config?.startupTimeoutMs ?? 30000),
  }

  const gateway = new GatewayProcess(ctx, resolved, ctx.logger)

  const status = async () => {
    const probe = await gateway.health()
    return {
      up: probe.up,
      base: `${gateway.base}/v1`,
      summary: probe.up ? describeHealth(probe.body) : null,
      detail: probe.up ? undefined : probe.detail,
      ...gateway.stats(),
    }
  }

  const start = async () => {
    const outcome = await gateway.start()
    return { ...(await status()), outcome }
  }

  const stop = async () => {
    const killed = gateway.stop()
    return { ...(await status()), killed }
  }

  const restart = async () => {
    gateway.stop()
    await new Promise(resolve => setTimeout(resolve, 600))
    const outcome = await gateway.start()
    return { ...(await status()), outcome }
  }

  const reload = async () => {
    const response = await fetch(`${gateway.base}/admin/reload`, { method: 'POST' })
    const body = await response.json().catch(() => ({}))
    return { ...(await status()), reload: body }
  }

  const authHeaders = () => {
    const key = readGatewayKey(resolved.scriptDir)
    return key ? { authorization: `Bearer ${key}` } : {}
  }

  const models = async () => {
    const response = await fetch(`${gateway.base}/v1/models`, { headers: authHeaders() })
    if (!response.ok) throw new Error(`/v1/models 返回 ${response.status}`)
    const body = await response.json()
    return (body.data ?? []).map(item => item.id)
  }

  ctx.effect(() => ctx.tools.register({
    name: 'llm_gateway',
    description: '查看和管理本机 LLM 聚合中转站（把多个第三方站点令牌合并成一个 OpenAI 兼容出口）。'
      + 'status 返回运行状态与通道健康度；start/stop/restart 控制本地进程；reload 在改动 channels.json 后热加载；models 列出可调度模型。',
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
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic',
      title: `本地中转站：${args?.action ?? 'status'}`,
      kind: (args?.action ?? 'status') === 'status' || args?.action === 'models' ? 'read' : 'edit',
      rawInput: args,
    }),
    async execute({ action = 'status' } = {}) {
      switch (action) {
        case 'start': return renderStatus(await start())
        case 'stop': return renderStatus(await stop())
        case 'restart': return renderStatus(await restart())
        case 'reload': return renderStatus(await reload())
        case 'models': {
          const list = await models()
          const head = renderStatus(await status())
          return [head, '', `可调度模型 ${list.length} 个：`, ...list.slice(0, 60).map(id => `- ${id}`)].join('\n')
        }
        default: return renderStatus(await status())
      }
    },
  }), 'llm-gateway.tool')

  // Ownership is explicit: only a process this plugin spawned is ever killed.
  ctx.effect(() => () => {
    if (gateway.stop()) ctx.logger?.info?.('llm-gateway stopped with the plugin')
  }, `${SERVICE_KEY}.lifetime`)

  if (resolved.enabled) {
    gateway.start()
      .then(result => ctx.logger?.info?.(`llm-gateway ready (${result.adopted ? 'adopted running instance' : 'spawned'})`))
      .catch(error => ctx.logger?.warn?.(`llm-gateway did not start: ${error?.message ?? error}`))
  }
}

