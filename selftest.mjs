/** Offline checks: pure helpers plus a live mount against a fake context. */
import { apply, defaultGatewayDir, ensureGatewayLayout, renderStatus } from './index.js'

console.log('default dir =', defaultGatewayDir())

const probeDir = 'F:/workspace/.selftest-dir'
try { ensureGatewayLayout(probeDir) } catch (error) { console.log('layout guard =', error.message.slice(0, 56), '…') }

const stopped = { running: false, base: 'http://127.0.0.1:4000/v1', dir: probeDir, channels: [], healthy: 0, verified: 0, modelCount: 0, models: [] }
console.log('\n--- 未运行 ---\n' + renderStatus(stopped))

const running = {
  running: true, base: 'http://127.0.0.1:4400/v1', dir: 'F:/workspace/.gwtest', channels: [
    { id: 'ch1', site: 'site-a', models: 12, healthy: true, ok: 3, fail: 0, cooldown: 0, latencyMs: 820, lastError: '' },
    { id: 'ch2', site: 'site-b', models: 5, healthy: false, ok: 1, fail: 2, cooldown: 90, latencyMs: 4100, lastError: '401 Invalid token' },
  ], healthy: 1, verified: 2, modelCount: 17, models: ['a', 'b'],
}
console.log('\n--- 运行中 ---\n' + renderStatus(running))

// mount against a fake context: routes + tool must register without a real host
const registered = { routes: null, tool: null }
const disposers = []
const ctx = {
  logger: { info() {}, warn(m) { console.log('warn:', m) } },
  tools: { register(def) { registered.tool = def; return () => { registered.tool = null } } },
  webServer: { register(route) { registered.routes = route; return () => { registered.routes = null } } },
  effect(factory, label) { const d = factory(); if (typeof d === 'function') disposers.push({ label, d }); return d },
}
apply(ctx, { enabled: false, host: '127.0.0.1', port: 4400, dir: 'F:/workspace/.gwtest' })
console.log('\nroutes =', registered.routes?.kind, registered.routes?.path)
console.log('tool =', registered.tool?.name)
for (const { d } of disposers) d()
console.log('disposers =', disposers.map(x => x.label).join(','))
console.log('\nOK')
