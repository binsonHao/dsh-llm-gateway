/**
 * Host half of the local LLM relay.
 *
 * The relay runs inside the DSH host process — no child process, no Python.
 * Enabling this plugin starts it, disabling stops it. The same service object
 * backs both the `llm_gateway` agent tool and the Settings page (via remote.js).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createGateway, ensureConfig } from './lib/gateway.mjs'
import { registerLlmGatewayRemote } from './remote.js'

export const name = 'llm-gateway'
export const inject = ['tools', 'typert']

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))

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
    : `本地中转站：未运行${payload.base ? `（配置端口 ${payload.base}）` : ''}`)

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

export default class LlmGatewayService extends TypertRemoteService {
  static inject = inject

  constructor(ctx, config = {}) {
    super(ctx, 'llmGateway')
    this.settings = {
      enabled: config?.enabled ?? true,
      host: config?.host || '127.0.0.1',
      port: Number(config?.port ?? 4000),
      dir: String(config?.dir ?? '').replace(/\\/g, '/').replace(/\/+$/, '') || defaultGatewayDir(),
    }
    this.gateway = null
    this.lastError = null

    ctx.effect(() => registerLlmGatewayRemote(ctx), 'llm-gateway.remote')
    ctx.effect(() => ctx.tools.register(this.#tool()), 'llm-gateway.tool')
    ctx.effect(() => () => {
      if (this.gateway?.running) {
        this.gateway.persist()
        this.gateway.stop().catch(() => {})
      }
    }, 'llm-gateway.lifetime')

    if (this.settings.enabled) {
      this.start().catch(error => ctx.logger?.warn?.(`llm-gateway 未启动：${error?.message ?? error}`))
    }
  }

  get #base() {
    return `http://${this.settings.host}:${this.settings.port}/v1`
  }

  /** Everything the Settings page renders, in one call. */
  status() {
    const summary = this.gateway?.running ? this.gateway.summary() : null
    return {
      running: Boolean(this.gateway?.running),
      base: this.#base,
      dir: this.settings.dir,
      detail: this.lastError ?? undefined,
      channels: summary?.rows ?? [],
      healthy: summary?.healthy ?? 0,
      verified: summary?.verified ?? 0,
      modelCount: summary?.models ?? 0,
      models: this.gateway?.running ? this.gateway.models() : [],
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
      this.ctx.logger?.info?.(`llm-gateway listening on ${this.#base}`)
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

  #tool() {
    const self = this
    return {
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
          case 'start': return renderStatus(await self.start())
          case 'stop': return renderStatus(await self.stop())
          case 'restart': return renderStatus(await self.restart())
          case 'reload': {
            const result = await self.reload()
            return `${renderStatus(result.status)}\n\n已热加载：${result.channels} 条通道 / ${result.models} 个模型`
          }
          case 'models': return renderStatus(self.status(), { withModels: true })
          default: return renderStatus(self.status())
        }
      },
    }
  }
}
