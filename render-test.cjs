/**
 * 离线渲染测试：把 client.js 的 factory 抽出来，用假 React 跑一遍设置页，
 * 检查分组、截断、白名单过滤是否真的生效——不用开浏览器。
 */
const fs = require('fs');

const src = fs.readFileSync(`${__dirname}/client.js`, 'utf8');
const start = src.indexOf('factory(require) {') + 'factory(require) {'.length;
const end = src.search(/return \{[\s]*inject:/);
if (start < 10 || end < 0) throw new Error('切片失败：没找到 factory 边界');
const body = src.slice(start, end);

const h = (type, props, ...kids) => ({
  type,
  props: props || {},
  kids: kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false),
});

// 假 React 要能真的跑 effect 与 setState，否则组件停在 loading 态
const React = (() => {
  let slots = [];
  let cursor = 0;
  let effects = [];
  let pending = null;
  return {
    createElement: h,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      const set = next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; pending = true; };
      return [slots[i], set];
    },
    useCallback(fn) { cursor++; return fn; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn) { cursor++; effects.push(fn); },
    useId: () => 'x',
    memo: f => f,
    __reset() { slots = []; cursor = 0; effects = []; pending = null; },
    __rewind() { cursor = 0; effects = []; },   // 保留 state，只重置 hook 游标
    __runEffects() { const list = effects; effects = []; cursor = 0; list.forEach(fn => fn()); },
    __renderPass: (mod, t) => mod.LlmGatewayPage({ t }),
    __tookUpdate: () => pending,
  };
})();
let React_ref = React;

const status = {
  running: true,
  base: 'http://127.0.0.1:4000/v1',
  dir: 'C:/Users/Administrator/.dsh/llm-gateway',
  channels: [
    { id: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', models: 4, healthy: true, ok: 9, fail: 0, cooldown: 0, lastError: '', latencyMs: 5000,
      modelList: ['DeepSeek-V4.1-Flash', 'DeepSeek-V4-Pro', 'GLM-5.3-Flash', 'kimi-k3'] },
    { id: 'ch1-elysiver-h-e-top', site: 'elysiver', models: 3, healthy: false, ok: 0, fail: 4, cooldown: 30,
      modelList: ['DeepSeek-V4.1-Flash', 'grok-4.7', 'grok-4.6'],
      lastError: '401 {"error":{"code":"","message":"Invalid token (request id: 202611270353090443437168268d9d6ZscNCcRC)","type":"new_api_error"}}', latencyMs: 8547 },
  ],
  healthy: 1,
  verified: 1,
  modelCount: 8,
  totalModelCount: 231,
  models: ['DeepSeek-V4.1-Flash', 'DeepSeek-V4-Pro', 'DeepSeek-R1-0528-Qwen3-8B', 'grok-4.5', 'grok-4.6', 'grok-4.7', 'GLM-5.3-Flash', 'kimi-k3'],
  allModels: ['gpt-4o', 'claude-opus-4-5', 'temperatures-outside-allowlist'],
  probe: {
    at: Date.now(), ok: 1, total: 2, image: 1,
    rows: [
      { channel: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', model: 'DeepSeek-V4.1-Flash', ok: true, ms: 4725, image: true },
      { channel: 'ch1-elysiver-h-e-top', site: 'elysiver', model: 'DeepSeek-V4.1-Flash', ok: false, ms: 0, status: 401 },
    ],
  },
  pins: { 'DeepSeek-V4.1-Flash': ['ch4-api-chengmo-cc-cd'] },
};

const dict = {
  title: '本地中转站', description: 'desc', running: '运行中', base: '出口地址', dir: '工作目录', channels: '通道',
  healthy: '健康', verified: '实测通过', models: '模型', restart: '重启', stop: '停止', reload: '热加载', probe: '测速', refresh: '刷新',
  channelId: '通道', site: '站点', state: '状态', colLatency: '实测延迟', colImage: '图片', fails: '失败', latency: '延迟', lastError: '最近错误',
  okState: '正常', coolState: '冷却中', modelList: '热门模型与通道选择', showAll: '显示全部模型',
  pickHint: '点通道名把它设为该模型的首选', pinnedTag: '首选', clearPin: '恢复自动', unprobed: '未测',
  imageYes: '支持', imageNo: '不支持', imageSkipped: '—', noProbe: '未测', probeNever: '还没测过',
};
const t = (key, vars) => {
  if (key === 'probeResult') return `最近测速：${vars?.ok}/${vars?.total}`;
  return dict[key] ?? key;
};

globalThis.fetch = async () => ({ ok: true, json: async () => status });

const mod = new Function('require', 'window', 'globalThis', `${body}\nreturn { LlmGatewayPage };`)(
  () => React,
  { __ModuleLoader__: {} },
  globalThis,
);

// 首渲染 → 立刻执行本次渲染登记的 effect（load）→ 等 promise → 再渲染
async function render() {
  React.__reset();
  React.__renderPass(mod, t);    // 第一遍，登记 effect
  React.__runEffects();          // 这时 load() 才真正执行
  await new Promise(r => setImmediate(r));
  await new Promise(r => setTimeout(r, 20));
  React.__rewind();              // 保留 state，只把游标拨回开头
  return React.__renderPass(mod, t);
}

render().then(tree => {
const flat = JSON.stringify(tree);
if (process.env.DEBUG) {
  const chips = [];
  (function w(n) { if (!n || typeof n !== 'object') return;
    if (typeof n.props?.className === 'string' && n.props.className.startsWith('lgw-chip')) {
      chips.push(JSON.stringify(n.kids.map(k => (k && k.kids) ? k.kids.join('') : String(k))));
    }
    (n.kids || []).forEach(w); })(tree);
  console.log('芯片明细:', chips.join('\n  '));
}

let groupCount = 0;
let chipCount = 0;
const families = new Set();
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.className === 'lgw-group') groupCount += 1;
  if (node.type === 'button' && typeof node.props?.className === 'string' && node.props.className.startsWith('lgw-chip')) chipCount += 1;
  if (node.props?.className === 'lgw-group-name' && node.kids[0]) families.add(node.kids[0]);
  (node.kids || []).forEach(walk);
})(tree);

const checks = [
  ['分组渲染', groupCount === 4, `期望 4 组，实际 ${groupCount}（${[...families].join(', ')}）`],
  ['通道芯片', chipCount === 7, `白名单 8 个模型里 7 个能落到通道（R1-0528 不在任何通道声明里），实际 ${chipCount}`],
  ['错误压缩', flat.includes('Invalid token (request id: 202611270353090…'), '最近错误未压缩成单行'],
  ['白名单外不泄漏', !flat.includes('temperatures-outside-allowlist'), 'allModels 混进了默认视图'],
  ['首选标记', flat.includes('"首选"'), '没有渲染首选标记'],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}
console.log(`\n分组：${[...families].join(' / ')}`);
process.exit(failed === 0 ? 0 : 1);
});
