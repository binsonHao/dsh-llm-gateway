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

// 两个字典必须键对齐，否则缺的那个 locale 会直接显示成 key 名（如字面量 probeNever）
const zhKeys = [...src.slice(src.indexOf('const zh = {'), src.indexOf('\n    };', src.indexOf('const zh = {'))).matchAll(/^\s{6}([A-Za-z0-9_]+):/gm)].map(m => m[1]);
const enKeys = [...src.slice(src.indexOf('const en = {'), src.indexOf('\n    };', src.indexOf('const en = {'))).matchAll(/^\s{6}([A-Za-z0-9_]+):/gm)].map(m => m[1]);
const dictGap = zhKeys.filter(k => !enKeys.includes(k));

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
    { id: 'ch4-api-chengmo-cc-cd', site: '城陌公益站', models: 3, healthy: true, ok: 9, fail: 0, cooldown: 0, lastError: '', latencyMs: 5000,
      modelList: ['DeepSeek-V4.1-Flash', 'GLM-5.3-Flash', 'grok-4.7'] },
    { id: 'ch19-wududu-edu-kg', site: 'wududu', models: 3, healthy: true, ok: 9, fail: 0, cooldown: 0, lastError: '', latencyMs: 1600,
      modelList: ['DeepSeek-V4.1-Flash', 'grok-4.6', 'grok-4.7'] },
    { id: 'ch1-elysiver-h-e-top', site: 'elysiver', models: 1, healthy: false, ok: 0, fail: 4, cooldown: 30,
      modelList: ['grok-4.5'],
      lastError: '401 {"error":{"code":"","message":"Invalid token (request id: 202611270353090443437168268d9d6ZscNCcRC)","type":"new_api_error"}}', latencyMs: 8547 },
  ],
  healthy: 2,
  verified: 2,
  modelCount: 5,
  totalModelCount: 231,
  models: ['DeepSeek-V4.1-Flash', 'GLM-5.3-Flash', 'grok-4.5', 'grok-4.6', 'grok-4.7'],
  allModels: ['gpt-4o', 'claude-opus-4-5', 'temperatures-outside-allowlist'],
  probe: {
    at: Date.now(), ok: 1, total: 2, image: 1,
    // 旧快照：只记了 3 个 hcnsec 通道，不含后加的 ch4/ch19——模拟线上真实情况
    rows: [
      { channel: 'ch13-api-hcnsec-cn', site: 'hcnsec', model: 'DeepSeek-V4.1-Flash', ok: false, ms: 0, status: 0 },
      { channel: 'ch14-api-hcnsec-cn', site: 'hcnsec', model: 'DeepSeek-V4.1-Flash', ok: false, ms: 0, status: 0 },
      { channel: 'ch15-api-hcnsec-cn', site: 'hcnsec', model: 'DeepSeek-V4.1-Flash', ok: false, ms: 0, status: 0 },
    ],
  },
  pins: { 'DeepSeek-V4.1-Flash': ['ch19-wududu-edu-kg'] },
};

const mod = new Function('require', 'window', 'globalThis', `${body}\nreturn { LlmGatewayPage, zh };`)(
  () => React,
  { __ModuleLoader__: {} },
  globalThis,
);

// 字典和 t() 都用组件里的真实实现，否则新增文案在测试里根本看不见
const dict = mod.zh;
const t = (key, vars) => {
  const raw = dict[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
};

globalThis.fetch = async () => ({ ok: true, json: async () => status });



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
let rowCount = 0;
const families = new Set();
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.className === 'lgw-group') groupCount += 1;
  if (node.type === 'button' && typeof node.props?.className === 'string' && node.props.className.startsWith('lgw-chip')) chipCount += 1;
  if (node.type === 'button' && node.props?.className === 'lgw-row-main') rowCount += 1;
  if (node.props?.className === 'lgw-group-name' && node.kids[0]) families.add(node.kids[0]);
  (node.kids || []).forEach(walk);
})(tree);

const checks = [
  ['分组渲染', groupCount === 3, `期望 3 组（DeepSeek/GLM/Grok），实际 ${groupCount}（${[...families].join(', ')}）`],
  ['分组顺序', families instanceof Set && [...families][0] === 'DeepSeek', `有固定通道的 DeepSeek 应排第一，实际 ${[...families].join(' / ')}`],
  ['通道芯片', chipCount === 10, `期望 10 个（V4.1-Flash 5、GLM 1、grok-4.7 2、grok-4.6 1、grok-4.5 1），实际 ${chipCount}`],
  ['ch19 排首位', /ch19-wududu-edu-kg","[^}]*"[^"]*"，?ch4/.test(flat) || flat.indexOf('ch19-wududu-edu-kg') < flat.indexOf('ch13-api-hcnsec-cn'), '固定的 ch19 没排在候选前面'],
  ['错误压缩', true, '错误默认折叠在详情里，展开后单独断言'],
  ['通道行渲染', rowCount === 3, `期望 3 个通道行，实际 ${rowCount}`],
  ['字典对齐', dictGap.length === 0, `en 缺少 ${dictGap.length} 个 key：${dictGap.join(', ')}`],
  ['运行中不显示启动提示', !flat.includes(dict.stoppedHint), '运行中却出现了「点启动后…」的提示'],
  ['新增通道入口', flat.includes(dict.addChannel), '没有「新增通道」按钮'],
  ['白名单外不泄漏', !flat.includes('temperatures-outside-allowlist'), 'allModels 混进了默认视图'],
  ['首选标记', flat.includes('"首选"'), '没有渲染首选标记'],
  ['ch19 出现', flat.includes('ch19-wududu-edu-kg'), '固定优先的 ch19 没渲染出来（旧快照覆盖了通道声明）'],
  ['R1 已移除', !flat.includes('DeepSeek-R1-0528-Qwen3-8B'), 'DeepSeek-R1 仍在列表里'],
  ['V4-Pro 已移除', !flat.includes('DeepSeek-V4-Pro'), 'DeepSeek-V4-Pro 仍在列表里'],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}
console.log(`\n分组：${[...families].join(' / ')}`);

// 展开态：默认折叠时拿不到错误文本，单独渲染一次展开的通道
(async () => {
  const status2 = { ...status, __open: true };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => status2 });
  React.__reset();
  React.__renderPass(mod, t);
  React.__runEffects();
  await new Promise(r => setImmediate(r));
  React.__rewind();
  const collapsed = React.__renderPass(mod, t);

  // 找到那条有 lastError 的通道行，模拟点击展开
  let targetId = null;
  (function find(n) {
    if (!n || typeof n !== 'object') return;
    if (typeof n.props?.className === 'string' && n.props.className.startsWith('lgw-row')
      && !n.props.className.includes('main') && !n.props.className.includes('detail')) {
      targetId = n.props.key ?? targetId;
    }
    (n.kids || []).forEach(find);
  })(collapsed);

  const openTree = await (async () => {
    // 直接以展开态重渲染：把 openChannel 初值设成 ch1（有 lastError 的那个）
    const body2 = body.replace(
      'const [openChannel, setOpenChannel] = React.useState(null);',
      "const [openChannel, setOpenChannel] = React.useState('ch1-elysiver-h-e-top');",
    );
    const m2 = new Function('require', 'window', 'globalThis', `${body2}\nreturn { LlmGatewayPage };`)(
      () => React, { __ModuleLoader__: {} }, globalThis,
    );
    React.__reset();
    React.__renderPass(m2, t);   // 第一遍登记 effect
    React.__runEffects();        // load() 执行
    await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 20));
    React.__rewind();            // 保留 state
    return React.__renderPass(m2, t);
  })();

  const flatOpen = JSON.stringify(openTree);
  const detailOk = flatOpen.includes('Invalid token (request id: 202611270353090…');
  console.log(`${detailOk ? '✓' : '✗'} 展开后错误压缩${detailOk ? '' : ' — 详情里没有压缩后的错误文本'}`);

  // 搜索过滤：只留匹配的模型，且分组自动展开
  const searchTree = await (async () => {
    const body3 = body.replace(
      "const [search, setSearch] = React.useState('');",
      "const [search, setSearch] = React.useState('grok');",
    );
    const m3 = new Function('require', 'window', 'globalThis', `${body3}\nreturn { LlmGatewayPage, zh };`)(
      () => React, { __ModuleLoader__: {} }, globalThis,
    );
    React.__reset();
    React.__renderPass(m3, t);
    React.__runEffects();
    await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 20));
    React.__rewind();
    return React.__renderPass(m3, t);
  })();
  const flatSearch = JSON.stringify(searchTree);
  const searchOk = flatSearch.includes('grok-4.7')
    && !flatSearch.includes('DeepSeek-V4.1-Flash')
    && !flatSearch.includes('GLM-5.3-Flash');
  console.log(`${searchOk ? '✓' : '✗'} 搜索过滤${searchOk ? '' : ' — 输入 grok 后仍能看到无关模型'}`);

  // 新增表单：打开后必须出现 ID / Base URL / 模型 三个关键字段
  const formTree = await (async () => {
    const body4 = body.replace(
      'const [draft, setDraft] = React.useState(null);',
      "const [draft, setDraft] = React.useState({ mode: 'add', id: '', site: '', base: '', key: '', priority: '50', models: '', aliasText: '' });",
    );
    const m4 = new Function('require', 'window', 'globalThis', `${body4}\nreturn { LlmGatewayPage, zh };`)(
      () => React, { __ModuleLoader__: {} }, globalThis,
    );
    React.__reset();
    React.__renderPass(m4, t);
    React.__runEffects();
    await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 20));
    React.__rewind();
    return React.__renderPass(m4, t);
  })();
  const flatForm = JSON.stringify(formTree);
  const formOk = flatForm.includes('lgw-form')
    && flatForm.includes(dict.fieldId)
    && flatForm.includes(dict.fieldBase)
    && flatForm.includes(dict.fieldModels)
    && flatForm.includes(dict.fieldAlias);
  if (process.env.DEBUG) { console.log('  含 lgw-form:', flatForm.includes('lgw-form'), '| fieldId:', flatForm.includes(dict.fieldId), '| fieldBase:', flatForm.includes(dict.fieldBase), '| fieldModels:', flatForm.includes(dict.fieldModels), '| fieldAlias:', flatForm.includes(dict.fieldAlias)); }
  console.log(`${formOk ? '✓' : '✗'} 新增表单字段${formOk ? '' : ' — 表单缺字段或没渲染'}`);

  // 展开行里必须有「编辑」「删除」，点了删除要出现二次确认
  const delOk = flatOpen.includes(dict.edit) && flatOpen.includes(dict.delete) && flatOpen.includes(dict.cancel);
  console.log(`${delOk ? '✓' : '✗'} 通道编辑/删除入口${delOk ? '' : ' — 展开详情里没有编辑或删除按钮'}`);

  const confirmTree = await (async () => {
    const body5 = body
      .replace(
        'const [confirmDelete, setConfirmDelete] = React.useState(null);',
        "const [confirmDelete, setConfirmDelete] = React.useState('ch1-elysiver-h-e-top');",
      )
      .replace(
        'const [openChannel, setOpenChannel] = React.useState(null);',
        "const [openChannel, setOpenChannel] = React.useState('ch1-elysiver-h-e-top');",
      );
    const m5 = new Function('require', 'window', 'globalThis', `${body5}\nreturn { LlmGatewayPage, zh };`)(
      () => React, { __ModuleLoader__: {} }, globalThis,
    );
    React.__reset();
    React.__renderPass(m5, t);
    React.__runEffects();
    await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 20));
    React.__rewind();
    return React.__renderPass(m5, t);
  })();
  const confirmOk = JSON.stringify(confirmTree).includes(dict.confirmDelete);
  console.log(`${confirmOk ? '✓' : '✗'} 删除二次确认${confirmOk ? '' : ' — 点删除后没有出现确认按钮'}`);
  globalThis.fetch = orig;
  process.exit(failed === 0 && detailOk && searchOk && formOk && delOk && confirmOk ? 0 : 1);
})();

});
