/** Offline checks: import surface, pure helpers, and a fake-context smoke mount. */
import { defaultGatewayDir, ensureGatewayLayout, renderStatus } from './index.js'
import { DESCRIPTORS, NAMESPACE, PACKAGE } from './remote.js'

console.log('default dir =', defaultGatewayDir())
console.log('remote =', PACKAGE, '/', NAMESPACE, '| methods:', DESCRIPTORS.map(d => d.method).join(','))

const probeDir = 'F:/workspace/.selftest-dir'
try { ensureGatewayLayout(probeDir) } catch (error) { console.log('layout guard =', error.message.slice(0, 56), '…') }

// renderStatus must survive an empty/unstarted status object
const stopped = { running: false, base: 'http://127.0.0.1:4000/v1', dir: probeDir, channels: [], healthy: 0, verified: 0, modelCount: 0, models: [] }
console.log('\n--- 未运行 ---\n' + renderStatus(stopped))

const running = {
  running: true, base: 'http://127.0.0.1:4000/v1', dir: probeDir, channels: [
    { id: 'ch1', site: 'site-a', models: 12, healthy: true, ok: 3, fail: 0, cooldown: 0, latencyMs: 820, lastError: '' },
    { id: 'ch2', site: 'site-b', models: 5, healthy: false, ok: 1, fail: 2, cooldown: 90, latencyMs: 4100, lastError: '401 Invalid token' },
  ], healthy: 1, verified: 2, modelCount: 17, models: ['a', 'b'],
}
console.log('\n--- 运行中 ---\n' + renderStatus(running))
console.log('\n--- 带模型 ---\n' + renderStatus(running, { withModels: true }).split('\n').slice(0, 6).join('\n'))
console.log('\nOK')
