/**
 * 把设置页渲染成真实 HTML 并截图，用来肉眼验收排版。
 * 依赖 render-test.cjs 里的假 React + 假数据。
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(`${__dirname}/client.js`, 'utf8');
const start = src.indexOf('factory(require) {') + 'factory(require) {'.length;
const end = src.search(/return \{[\s]*inject:/);
if (start < 10 || end < 0) throw new Error('切片失败');
let body = src.slice(start, end);
 const qIdx = process.argv.indexOf('--q');
 if (qIdx > -1 && process.argv[qIdx + 1]) {
   const term = JSON.stringify(process.argv[qIdx + 1]);
   body = body.replace("const [search, setSearch] = React.useState('');", `const [search, setSearch] = React.useState(${term});`);
 }
 if (process.argv.includes('--form')) {
   body = body.replace("const [draft, setDraft] = React.useState(null);",
     "const [draft, setDraft] = React.useState({ mode: 'add', id: '', site: '', base: '', key: '', priority: '50', models: '', aliasText: '' });");
 }
 if (process.argv.includes('--confirm')) {
   body = body.replace("const [confirmDelete, setConfirmDelete] = React.useState(null);",
     "const [confirmDelete, setConfirmDelete] = React.useState('ch14-api-hcnsec-cn');");
 }
 if (process.argv.includes('--all')) {
   body = body.replace("const [showAll, setShowAll] = React.useState(false);", "const [showAll, setShowAll] = React.useState(true);");
 }
 if (process.argv.includes('--open')) {
   body = body.replace("const [openChannel, setOpenChannel] = React.useState(null);", "const [openChannel, setOpenChannel] = React.useState('ch14-api-hcnsec-cn');");
 }

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toHtml(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  if (Array.isArray(node)) return node.map(toHtml).join('');
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'style') return `<style>${node.kids.map(k => (typeof k === 'string' ? k : '')).join('')}</style>`;
  const { type, props = {}, kids = [] } = node;
  if (typeof type === 'function') return toHtml(type(props));
  const attrs = Object.entries(props)
    .filter(([k]) => k !== 'children' && k !== 'key' && k !== 'onClick' && k !== 'onChange' && k !== 'ref')
    .map(([k, v]) => {
      const name = k === 'className' ? 'class' : k;
      if (v === true) return name;
      if (v === false || v === undefined || v === null) return '';
      return `${name}="${esc(v)}"`;
    })
    .filter(Boolean).join(' ');
  const open = `<${type}${attrs ? ' ' + attrs : ''}>`;
  if (VOID.has(type)) return open;
  return `${open}${kids.map(toHtml).join('')}</${type}>`;
}

const h = (type, props, ...kids) => ({
  type, props: props || {},
  kids: kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false),
});

function makeReact() {
  let slots = [];
  let cursor = 0;
  let effects = [];
  const R = {
    createElement: h,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      const set = next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; };
      return [slots[i], set];
    },
    useCallback(fn) { cursor++; return fn; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn) { cursor++; effects.push(fn); },
    useId: () => 'relay',
    memo: f => f,
    __reset() { slots = []; cursor = 0; effects = []; },
    __rewind() { cursor = 0; effects = []; },
    __runEffects() { const l = effects; effects = []; cursor = 0; l.forEach(f => f()); },
  };
  return R;
}

const React = makeReact();

const status = {
  running: true,
  base: 'http://127.0.0.1:4000/v1',
  dir: 'C:\\Users\\Administrator\\.dsh\\llm-gateway',
  channels: [
    { id: 'ch19-wududu-edu-kg', site: 'wududu', models: 3, healthy: true, ok: 9, fail: 0, cooldown: 0, lastError: '', latencyMs: 1600,
      modelList: ['DeepSeek-V4.1-Flash', 'grok-4.6', 'grok-4.7'] },
    { id: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', models: 3, healthy: true, ok: 9, fail: 1, cooldown: 0, latencyMs: 5000,
      lastError: 'net gateway timeout', modelList: ['DeepSeek-V4.1-Flash', 'GLM-5.3-Flash', 'grok-4.7'] },
    { id: 'ch14-api-hcnsec-cn', site: 'hcnsec', models: 2, healthy: true, ok: 0, fail: 3, cooldown: 24,
      lastError: 'net gateway timeout', modelList: ['DeepSeek-V4.1-Flash'] },
    { id: 'ch18-integrate-api-nvidia-com', site: '英伟达', models: 2, healthy: true, ok: 0, fail: 0, cooldown: 0,
      lastError: '', latencyMs: 2656, modelList: ['grok-4.7', 'nvidia/nemotron-3.5-super-vl-120b-a12b'] },
    { id: 'ch1-elysiver-h-e-top', site: 'elysiver', models: 1, healthy: false, ok: 0, fail: 4, cooldown: 30,
      lastError: '401 {"error":{"code":"","message":"Invalid token (request id: 202611270353090443437168268d9d6ZscNCcRC)","type":"new_api_error"}}',
      modelList: ['grok-4.5'] },
  ],
  healthy: 3, verified: 2, modelCount: 5, totalModelCount: 231,
  models: ['DeepSeek-V4.1-Flash', 'GLM-5.3-Flash', 'grok-4.5', 'grok-4.6', 'grok-4.7', 'nvidia/nemotron-3.5-super-vl-120b-a12b'],
  allowlist: ['DeepSeek-V4.1-Flash', 'GLM-5.3-Flash', 'grok-4.5', 'grok-4.6', 'grok-4.7'],
  allModels: ['DeepSeek-V4.1-Flash', 'GLM-5.3-Flash', 'grok-4.5', 'grok-4.6', 'grok-4.7', 'gpt-4o', 'claude-opus-4-5', 'nvidia/nemotron-3.5-super-vl-120b-a12b'],
  probe: {
    at: Date.now(), ok: 6, total: 8, okChannels: 3, totalChannels: 5, image: 1, channels: 5,
    // 一个通道多行（代表模型 + 白名单模型），芯片才有各自延迟可比
    rows: [
      { channel: 'ch19-wududu-edu-kg', site: 'wududu', model: 'DeepSeek-V4.1-Flash', representative: true, ok: true, ms: 1306, image: true },
      { channel: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', model: 'DeepSeek-V4.1-Flash', representative: true, ok: true, ms: 4725, image: false },
      { channel: 'ch14-api-hcnsec-cn', site: 'hcnsec', model: 'DeepSeek-V4.1-Flash', representative: true, ok: false, ms: 0, status: 504, image: null },
      { channel: 'ch19-wududu-edu-kg', site: 'wududu', model: 'grok-4.7', representative: false, ok: true, ms: 1180, image: null },
      { channel: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', model: 'grok-4.7', representative: false, ok: true, ms: 6400, image: null },
      { channel: 'ch18-integrate-api-nvidia-com', site: '英伟达', model: 'grok-4.7', representative: true, ok: true, ms: 2656, image: false },
      { channel: 'ch1-elysiver-h-e-top', site: 'elysiver', model: 'grok-4.5', representative: true, ok: false, ms: 0, status: 401, image: null },
      { channel: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', model: 'GLM-5.3-Flash', representative: false, ok: true, ms: 4545, image: null },
    ],
  },
  pins: { 'DeepSeek-V4.1-Flash': ['ch19-wududu-edu-kg'] },
};

const mod = new Function('require', 'window', 'globalThis', `${body}\nreturn { LlmGatewayPage, zh };`)(
  () => React, { __ModuleLoader__: {} }, globalThis,
);

// 用组件真实的 zh 字典，避免预览和线上文案脱节
const dict = mod.zh;
const t = (k, vars) => {
  const raw = dict[k] ?? k;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
};

if (process.argv.includes('--stopped')) {
  Object.assign(status, { running: false, channels: [], healthy: 0, verified: 0, modelCount: 0, models: [], allModels: [], probe: { at: 0, ok: 0, total: 0, image: 0, rows: [] }, pins: {} });
}
globalThis.fetch = async () => ({ ok: true, json: async () => status });



(async () => {
  React.__reset();
  React.__renderPass = (m, tt) => m.LlmGatewayPage({ t: tt });
  React.__renderPass(mod, t);
  React.__runEffects();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setTimeout(r, 10));
  React.__rewind();
  const tree = React.__renderPass(mod, t);
  const inner = toHtml(tree);

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  :root {
    --dsw-alias-bg-layer-1: #fdfcf7;
    --dsw-alias-bg-subtle: rgba(120,110,80,.06);
    --dsw-alias-bg-hover: rgba(120,110,80,.06);
    --dsw-alias-border-l1: rgba(120,110,80,.22);
    --dsw-alias-border-l2: rgba(120,110,80,.38);
    --dsw-alias-text-primary: #2c2a24;
    --dsw-alias-text-secondary: #5c584d;
    --dsw-alias-text-tertiary: #8a8577;
    --dsw-alias-accent: #5f8c3f;
    --dsw-alias-accent-soft: rgba(95,140,63,.14);
    --dsw-alias-label-on-color: #fff;
    --dsw-alias-danger: #b0483c;
    --dsw-static-green-500: #4c8d3f;
    --dsw-static-green-500-a12: rgba(76,141,63,.12);
    --dsw-static-amber-500: #b8860b;
    --dsw-static-red-500: #b0483c;
    --dsw-static-red-400-a12: rgba(176,72,60,.12);
  }
  body.dark { 
  --dsw-alias-bg-layer-1: #26251f;
  --dsw-alias-bg-subtle: rgba(255,250,230,.06);
  --dsw-alias-bg-hover: rgba(255,250,230,.07);
  --dsw-alias-border-l1: rgba(255,250,230,.18);
  --dsw-alias-border-l2: rgba(255,250,230,.30);
  --dsw-alias-text-primary: #ece8dc;
  --dsw-alias-text-secondary: #b3ae9e;
  --dsw-alias-text-tertiary: #837e70;
  --dsw-alias-accent: #8fb96a;
  --dsw-alias-accent-soft: rgba(143,185,106,.20);
  --dsw-alias-label-on-color: #1a1a16;
  --dsw-alias-danger: #e08076;
  --dsw-static-green-500: #7fae5c;
  --dsw-static-green-500-a12: rgba(127,174,92,.18);
  --dsw-static-amber-500: #d4a53a;
  --dsw-static-red-500: #e08076;
  --dsw-static-red-400-a12: rgba(224,128,118,.18);
 background:#1c1b17; }
  body.dark .frame { background:#26251f; }
  body { margin: 0; background: #f4f2ea; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .frame { max-width: 720px; margin: 0 auto; padding: 24px 20px 60px; background: #fdfcf7; min-height: 100vh; }
  .narrow .frame { max-width: 420px; }
</style></head>
<body class="${[process.argv.includes('--narrow') ? 'narrow' : '', process.argv.includes('--dark') ? 'dark' : ''].join(' ').trim()}">
  <div class="frame">${inner}</div>
</body></html>`;

  // 每个变体写自己的文件，否则后一次会覆盖前一次、带上不该有的 body class
  const variant = [
    process.argv.includes('--q') ? 'q' : '',
    process.argv.includes('--all') ? 'all' : '',
    process.argv.includes('--open') ? 'open' : '',
    process.argv.includes('--narrow') ? 'narrow' : '',
    process.argv.includes('--dark') ? 'dark' : '',
    process.argv.includes('--stopped') ? 'stopped' : '',
    process.argv.includes('--form') ? 'form' : '',
    process.argv.includes('--confirm') ? 'confirm' : '',
  ].filter(Boolean).join('-') || 'base';
  const outFile = `preview-${variant}.html`;
  fs.writeFileSync(path.join(__dirname, outFile), html, 'utf8');
  console.log(`已生成 ${outFile}，${html.length} bytes`);
})();
