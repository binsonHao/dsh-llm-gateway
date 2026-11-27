/** Offline harness: mount against a fake Cordis context so a broken contract fails here, not in DSH. */
import { apply, Config, ensureGatewayLayout, name, inject, defaultGatewayDir } from './index.js'

const tool = { definition: null }
const disposers = []
const logs = []

const ctx = {
  logger: { info: m => logs.push(`INFO ${m}`), warn: m => logs.push(`WARN ${m}`) },
  tools: { register(d) { tool.definition = d; return () => { tool.definition = null } } },
  effect(factory, label) {
    const disposer = factory()
    if (typeof disposer === 'function') disposers.push({ label, disposer })
    return disposer
  },
}

console.log('name =', name, '| inject =', inject)
console.log('config defaults =', JSON.stringify(Config({})))
console.log('default dir =', defaultGatewayDir())

// layout materialisation from the bundled sources
const probeDir = 'F:/workspace/dsh-llm-gateway/.selftest-dir'
try { ensureGatewayLayout(probeDir) } catch (error) { console.log('layout guard =', error.message.slice(0, 60), '…') }

apply(ctx, { enabled: true, scriptDir: 'F:/workspace/llm-gateway', port: 4000 })
if (!tool.definition) throw new Error('tool was not registered')
console.log('tool =', tool.definition.name, '| timeout =', tool.definition.timeoutMs)

await new Promise(resolve => setTimeout(resolve, 2000))
for (const action of ['status', 'models']) {
  const text = await tool.definition.execute({ action })
  if (typeof text !== 'string') throw new Error(`${action} did not return a string`)
  console.log(`\n--- ${action} ---\n${text.split('\n').slice(0, 4).join('\n')}`)
}
console.log('\nlogs:', logs)
console.log('disposers:', disposers.map(i => i.label))
for (const { disposer } of disposers) disposer()
console.log('\nOK')
