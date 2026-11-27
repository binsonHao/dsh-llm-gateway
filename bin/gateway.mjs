#!/usr/bin/env node
/**
 * Standalone launcher: same gateway the plugin embeds, without DSH.
 *
 *   node bin/gateway.mjs [--dir <path>] [--port 4000] [--host 127.0.0.1]
 */
import { createGateway, ensureConfig } from '../lib/gateway.mjs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const flag = name => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

const dir = resolve(flag('dir') ?? process.env.DSH_LLM_GATEWAY_DIR ?? `${homedir()}/.dsh/llm-gateway`)
const port = Number(flag('port') ?? process.env.DSH_LLM_GATEWAY_PORT ?? 4000)
const host = flag('host') ?? '127.0.0.1'

const config = ensureConfig(dir, { host, port })
const gateway = createGateway({ dir, config })

const shutdown = async signal => {
  process.stdout.write(`\n[gateway] ${signal}, stopping\n`)
  await gateway.stop()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

await gateway.start()
const snapshot = gateway.snapshot()
process.stdout.write([
  `[gateway] ${snapshot.channels} channels, ${snapshot.models} models`,
  `[gateway] listen ${snapshot.base}`,
  `[gateway] dir ${dir}`,
  `[gateway] api key ${config.apiKey}`,
  '',
].join('\n'))
