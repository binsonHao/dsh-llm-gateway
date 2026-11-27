/**
 * Host half of the local LLM relay.
 *
 * The relay runs inside the DSH host process — no child process, no Python.
 * Enabling this plugin starts it, disabling stops it, and the `llm_gateway`
 * tool reports and controls it.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { createGateway, ensureConfig } from './lib/gateway.mjs'

export const name = 'llm-gateway'
export const inject = ['tools']

export const Config = Schema.object({
  enabled: Schema.boolean()
    .default(true)
    .description('插件启用时自动启动本地中转站；关闭后可用 llm_gateway 工具或 bin/gateway.mjs 手动启动。'),
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

/** Turn the gateway summary into the one text block the tool returns. */
export function renderStatus(payload, options = {}) {
  const lines = []
  lines.push(payload.running
    ? `本地中转站：运行中 ${payload.base}`
    : `本地中转站：未运行${payload.base ? `（配置端口 ${payload.base}）` : ''}`)

  if (payload.running && payload.summary) {
    const s = payload.summary
    lines.push(`通道 ${s.channels} 条（健康 ${s.healthy}，实测通过 ${s.verified}），可调度模型 ${s.models} 个`)
    const broken = s.rows.filter(row => !row.healthy || row.fail > 0)
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
  if (options.withModels && payload.models?.length) {
    lines.push('', `可调度模型 ${payload.models.length} 个：`)
    for (const id of payload.models.slice(0, 60)) lines.push(`- ${id}`)
    if (payload.models.length > 60) lines.push(`- …另有 ${payload.models.length - 60} 个`)
  }
  return lines.join('\n')
}

export function apply(ctx, config) {
  const resolved = {
    enabled: config?.enabled ?? true,
    host: config?.host || '127.0.0.1',
    port: Number(config?.port ?? 4000),
    dir: String(config?.dir ?? '').replace(/\\/g, '/').replace(/\/+$/, '') || defaultGatewayDir(),
  }

  let gateway = null
  let lastError = null

  const base = () => `http://${resolved.host}:${resolved.port}/v1`

  const start = async () => {
    if (gateway?.running) return
    ensureGatewayLayout(resolved.dir)
    const settings = ensureConfig(resolved.dir, { host: resolved.host, port: resolved.port })
    gateway = createGateway({ dir: resolved.dir, config: settings })
    try {
      await gateway.start()
      lastError = null
      ctx.logger?.info?.(`llm-gateway listening on ${base()} (${gateway.snapshot().channels} channels)`)
    } catch (error) {
      gateway = null
      lastError = error?.code === 'EADDRINUSE'
        ? `端口 ${resolved.port} 已被占用（可能有另一个中转站或 start.bat 在跑）`
        : String(error?.message ?? error)
      throw new Error(lastError)
    }
  }

  const stop = async () => {
    if (!gateway) return false
    const stopped = await gateway.stop()
    gateway = null
    return stopped
  }

  const status = () => ({
    running: Boolean(gateway?.running),
    base: base(),
    summary: gateway?.running ? gateway.summary() : null,
    models: gateway?.running ? gateway.models() : [],
    dir: resolved.dir,
    detail: lastError ?? undefined,
  })

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
      kind: args?.action === 'start' || args?.action === 'stop' || args?.action === 'restart' || args?.action === 'reload' ? 'edit' : 'read',
      rawInput: args,
    }),
    async execute({ action = 'status' } = {}) {
      switch (action) {
        case 'start':
          await start()
          return renderStatus(status())
        case 'stop':
          await stop()
          return renderStatus(status())
        case 'restart': {
          await stop()
          await start()
          return renderStatus(status())
        }
        case 'reload': {
          if (!gateway?.running) throw new Error('中转站未运行，先执行 start')
          const result = gateway.reload()
          return `${renderStatus(status())}\n\n已热加载：${result.channels} 条通道 / ${result.models} 个模型`
        }
        case 'models':
          if (!gateway?.running) throw new Error('中转站未运行，先执行 start')
          return renderStatus(status(), { withModels: true })
        default:
          return renderStatus(status())
      }
    },
  }), 'llm-gateway.tool')

  ctx.effect(() => () => {
    if (gateway?.running) {
      gateway.persist()
      gateway.stop().catch(() => {})
    }
  }, 'llm-gateway.lifetime')

  if (resolved.enabled) {
    start().catch(error => ctx.logger?.warn?.(`llm-gateway 未启动：${error?.message ?? error}`))
  }
}
