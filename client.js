window.__ModuleLoader__.load({
  id: 'dsh-llm-gateway',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-llm-gateway';
    const SECTION_ID = 'llm-gateway';
    const PACKAGE = 'dsh-llm-gateway';
    const NAMESPACE = 'llmGateway';

    const API = '/llm-gateway/api';

    async function callApi(action, options = {}) {
      const response = await fetch(`${API}/${action}`, {
        method: options.method ?? (action === 'status' || action === 'models' ? 'GET' : 'POST'),
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      return payload;
    }

    async function postJson(action, payload) {
      const response = await fetch(`${API}/${action}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
      return data;
    }

    const api = {
      status: () => callApi('status'),
      start: () => callApi('start'),
      stop: () => callApi('stop'),
      restart: () => callApi('restart'),
      reload: () => callApi('reload'),
      models: () => callApi('models'),
      probe: () => callApi('probe', { method: 'POST' }),
      probeSnapshot: () => callApi('probe'),
      pin: (model, channelId) => postJson('pin', { model, channelId }),
    };

    const zh = {
      nav: '本地中转站',
      title: '本地中转站',
      description: '把多个 OpenAI 兼容上游合并成一个本地出口，同名模型自动在通道间故障转移。开关与通道健康状况都在这里。',
      running: '运行中',
      stopped: '未运行',
      base: '出口地址',
      dir: '工作目录',
      channels: '通道',
      healthy: '健康',
      verified: '实测通过',
      models: '模型',
      start: '启动',
      stop: '停止',
      restart: '重启',
      reload: '热加载',
      refresh: '刷新',
      busy: '处理中…',
      loading: '正在读取状态…',
      empty: '还没有通道。把你自己的 channels.json 放进工作目录后点「热加载」。',
      channelId: '通道',
      site: '站点',
      state: '状态',
      fails: '失败',
      cooldown: '冷却',
      latency: '延迟',
      lastError: '最近错误',
      okState: '正常',
      coolState: '冷却中',
      modelList: '热门模型与通道选择',
      showAll: '显示全部模型',
      pickHint: '点通道名把它设为该模型的首选；再点一次取消。首选通道不可用时会自动切下一个。',
      pinnedTag: '首选',
      noProbe: '未测',
      clearPin: '恢复自动',
      started: '已启动',
      stoppedNotice: '已停止',
      restarted: '已重启',
      reloaded: '已热加载',
      failed: '操作失败：{message}',
      cannot: '无法调用宿主服务：{message}',
      probe: '测速',
      probing: '测速中…',
      probeResult: '最近测速：{time}，{ok}/{total} 通道可用，{image} 个支持图片',
      probeNever: '还没测过。点「测速」并发跑一遍全部通道，会消耗少量上游额度。',
      probeDone: '测速完成：{ok}/{total} 可用，「{fastest}」最快 {ms}',
      probeFailed: '测速失败：{message}',
      colLatency: '实测延迟',
      colImage: '图片',
      colModel: '代表模型',
      unprobed: '未测',
      unusable: '不可用',
      probeFail: '✗ 失败',
      imageYes: '支持',
      imageNo: '不支持',
      imageSkipped: '—',
    };
    const en = {
      nav: 'Local relay',
      title: 'Local relay',
      description: 'Merges many OpenAI-compatible upstreams behind one local endpoint and fails over between them per model name. The switch and channel health live here.',
      running: 'Running',
      stopped: 'Stopped',
      base: 'Endpoint',
      dir: 'Working directory',
      channels: 'Channels',
      healthy: 'Healthy',
      verified: 'Verified',
      models: 'Models',
      start: 'Start',
      stop: 'Stop',
      restart: 'Restart',
      reload: 'Reload',
      refresh: 'Refresh',
      busy: 'Working…',
      loading: 'Reading status…',
      empty: 'No channels yet. Put your own channels.json into the working directory, then press Reload.',
      channelId: 'Channel',
      site: 'Site',
      state: 'State',
      fails: 'Fails',
      cooldown: 'Cooldown',
      latency: 'Latency',
      lastError: 'Last error',
      okState: 'OK',
      coolState: 'Cooling',
      modelList: 'Popular models and channel choice',
      showAll: 'Show every model',
      pickHint: 'Click a channel to prefer it for this model; click again to unselect. If it fails, the next one takes over.',
      pinnedTag: 'preferred',
      noProbe: 'not probed',
      clearPin: 'Back to automatic',
      started: 'Started',
      stoppedNotice: 'Stopped',
      restarted: 'Restarted',
      reloaded: 'Reloaded',
      failed: 'Action failed: {message}',
      cannot: 'Cannot reach the host service: {message}',
      unprobed: 'not probed',
      unusable: 'unusable',
      probeFail: '✗ failed',
    };

    /**
     * 样式基线：只用 DSH 真实存在的主题令牌（--dsw-alias-*）。
     * 之前用的是 --dsw-border / --dsw-accent，这两个变量并不存在，
     * 所以边框全落到兜底灰色、强调色永远不生效——那才是「看着业余」的根源。
     */
    const STYLE_TOKENS = {
      surface: 'var(--dsw-alias-bg-layer-1, #fff)',
      surfaceSunken: 'var(--dsw-alias-bg-subtle, rgba(127,127,127,.06))',
      border: 'var(--dsw-alias-border-l1, rgba(127,127,127,.22))',
      borderStrong: 'var(--dsw-alias-border-l2, rgba(127,127,127,.38))',
      text: 'var(--dsw-alias-text-primary, inherit)',
      textSecondary: 'var(--dsw-alias-text-secondary, rgba(0,0,0,.62))',
      textTertiary: 'var(--dsw-alias-text-tertiary, rgba(0,0,0,.45))',
      accent: 'var(--dsw-alias-accent, #6b8f4e)',
      accentSoft: 'var(--dsw-alias-accent-soft, rgba(107,143,78,.14))',
      danger: 'var(--dsw-alias-danger, #b0483c)',
      green: 'var(--dsw-static-green-500, #4c8d3f)',
      amber: 'var(--dsw-static-amber-500, #b8860b)',
      red: 'var(--dsw-static-red-500, #b0483c)',
      routeLight: '8px 12px',
      routeSection: '14px 16px',
    };

    const styles = `
      .lgw-page {
        display: flex; flex-direction: column; gap: 20px;
        padding: 8px 4px 32px; color: ${STYLE_TOKENS.text};
        container-type: inline-size;
      }

      /* ---------- 页头 ---------- */
      .lgw-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
      .lgw-head-text { min-width: 0; flex: 1 1 280px; }
      .lgw-title { margin: 0 0 6px; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
      .lgw-desc { margin: 0; font-size: 13px; line-height: 1.6; color: ${STYLE_TOKENS.textSecondary}; max-width: 58ch; }
      .lgw-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

      .lgw-btn {
        border: 1px solid ${STYLE_TOKENS.border}; background: ${STYLE_TOKENS.surface};
        color: inherit; border-radius: ${STYLE_TOKENS.routeLight};
        padding: 7px 14px; font-size: 13px; line-height: 1.2; cursor: pointer;
        transition: background .12s ease, border-color .12s ease;
      }
      .lgw-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-hover, rgba(127,127,127,.08)); }
      .lgw-btn:focus-visible { outline: 2px solid ${STYLE_TOKENS.accent}; outline-offset: 1px; }
      .lgw-btn:disabled { opacity: .45; cursor: default; }
      .lgw-btn-primary { background: ${STYLE_TOKENS.accent}; border-color: ${STYLE_TOKENS.accent}; color: var(--dsw-alias-label-on-color, #fff); }
      .lgw-btn-primary:hover:not(:disabled) { filter: brightness(.94); background: ${STYLE_TOKENS.accent}; }

      /* ---------- 卡片 ---------- */
      .lgw-card {
        border: 1px solid ${STYLE_TOKENS.border}; border-radius: 14px;
        padding: ${STYLE_TOKENS.routeSection}; background: ${STYLE_TOKENS.surface};
      }
      .lgw-card-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-wrap: wrap; margin-bottom: 12px;
      }
      .lgw-card-title { font-size: 13px; font-weight: 600; margin: 0; }
      .lgw-card-sub { font-size: 12px; color: ${STYLE_TOKENS.textTertiary}; }

      /* ---------- 状态概览 ---------- */
      .lgw-overview { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
      .lgw-dot { width: 8px; height: 8px; border-radius: 50%; background: ${STYLE_TOKENS.red}; flex: none; }
      .lgw-dot-on { background: ${STYLE_TOKENS.green}; }
      .lgw-overview-label { font-size: 14px; font-weight: 600; }

      .lgw-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px 16px; }
      .lgw-meta-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .lgw-meta-label { font-size: 11px; color: ${STYLE_TOKENS.textTertiary}; letter-spacing: .02em; }
      .lgw-meta-value { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .lgw-meta-value.mono { font-size: 12px; font-weight: 400; color: ${STYLE_TOKENS.textSecondary};
        overflow-wrap: anywhere; word-break: break-all; }
      /* 工作目录占满整行，别把路径截成看不出是哪儿 */
      .lgw-meta-item-wide { grid-column: 1 / -1; }

      /* ---------- 通道紧凑列表 ---------- */
      .lgw-rows { display: flex; flex-direction: column; }
      .lgw-row { border-bottom: 1px solid ${STYLE_TOKENS.border}; }
      .lgw-row:last-child { border-bottom: 0; }

      .lgw-row-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto 18px;
        align-items: center; gap: 12px;
        padding: 9px 4px; width: 100%;
        background: none; border: 0; color: inherit;
        font: inherit; text-align: left; cursor: pointer; border-radius: 6px;
      }
      .lgw-row-main:hover { background: var(--dsw-alias-bg-hover, rgba(127,127,127,.05)); }
      .lgw-row-main:focus-visible { outline: 2px solid ${STYLE_TOKENS.accent}; outline-offset: -2px; }
      .lgw-row-id {
        min-width: 0; display: flex; align-items: baseline; gap: 8px;
      }
      .lgw-row-name {
        font-size: 13px; font-weight: 500; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; font-family: var(--dsw-font-mono, ui-monospace, monospace);
      }
      .lgw-row-site { font-size: 11px; color: ${STYLE_TOKENS.textTertiary}; flex: none; }
  .lgw-row-fail { font-size: 11px; color: ${STYLE_TOKENS.red}; flex: none; font-variant-numeric: tabular-nums; }
      .lgw-row-lat { font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; min-width: 62px; white-space: nowrap; }
      .lgw-caret { font-size: 10px; color: ${STYLE_TOKENS.textTertiary}; transition: transform .15s ease; }
      .lgw-caret-open { transform: rotate(90deg); }
      .lgw-row-dead .lgw-row-name, .lgw-row-dead .lgw-row-site { opacity: .5; }

      .lgw-row-detail {
        display: flex; flex-wrap: wrap; gap: 10px 28px;
        padding: 2px 4px 14px 12px;
        border-left: 2px solid ${STYLE_TOKENS.border};
        margin-left: 2px;
      }
      .lgw-detail-item { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .lgw-detail-label { font-size: 11px; color: ${STYLE_TOKENS.textTertiary}; }
      .lgw-detail-value { font-size: 12px; font-variant-numeric: tabular-nums; }
      .lgw-detail-error {
        flex: 1 1 100%; font-size: 12px; color: ${STYLE_TOKENS.textSecondary};
        background: ${STYLE_TOKENS.surfaceSunken}; border-radius: 6px; padding: 8px 10px;
        word-break: break-word; white-space: pre-wrap; line-height: 1.5;
      }

      /* ---------- 状态徽标 ---------- */
      .lgw-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; flex: none; }
      .lgw-badge-ok { background: var(--dsw-static-green-500-a12, rgba(76,141,63,.14)); color: ${STYLE_TOKENS.green}; }
      .lgw-badge-cool { background: var(--dsw-static-red-400-a12, rgba(176,72,60,.14)); color: ${STYLE_TOKENS.red}; }
      .lgw-badge-pin { background: ${STYLE_TOKENS.accentSoft}; color: inherit; }

      .lgw-fast { color: ${STYLE_TOKENS.green}; font-weight: 500; }
      .lgw-mid { color: ${STYLE_TOKENS.amber}; font-weight: 500; }
      .lgw-slow { color: ${STYLE_TOKENS.red}; font-weight: 500; }
      .lgw-muted { color: ${STYLE_TOKENS.textTertiary}; }

      /* ---------- 模型选择 ---------- */
      .lgw-group {
        border: 1px solid ${STYLE_TOKENS.border}; border-radius: 10px;
        padding: 12px 14px; margin-top: 10px;
      }
      .lgw-group-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
      .lgw-group-name { font-size: 13px; font-weight: 600; }
      .lgw-group-meta { font-size: 11px; color: ${STYLE_TOKENS.textTertiary}; }

      .lgw-picks { list-style: none; margin: 0; padding: 0; }
      .lgw-pick-row { padding: 10px 0; border-bottom: 1px solid ${STYLE_TOKENS.border}; }
      .lgw-pick-row:last-child { border-bottom: 0; padding-bottom: 2px; }
      .lgw-pick-name { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; min-width: 0; }
      .lgw-pick-name code {
        font-size: 12.5px; font-family: var(--dsw-font-mono, ui-monospace, monospace);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .lgw-chips { display: flex; flex-wrap: wrap; gap: 6px; }

      .lgw-chip {
        font: inherit; font-size: 11.5px; padding: 4px 10px; border-radius: 999px;
        cursor: pointer; border: 1px solid ${STYLE_TOKENS.border};
        background: transparent; color: inherit; max-width: 100%;
        display: inline-flex; align-items: center; gap: 6px;
        transition: border-color .12s ease, background .12s ease;
      }
      .lgw-chip:hover { border-color: ${STYLE_TOKENS.accent}; }
      .lgw-chip:focus-visible { outline: 2px solid ${STYLE_TOKENS.accent}; outline-offset: 1px; }
      .lgw-chip-on { background: ${STYLE_TOKENS.accentSoft}; border-color: ${STYLE_TOKENS.accent}; font-weight: 600; }
      .lgw-chip-dead { opacity: .42; text-decoration: line-through; }
      .lgw-chip-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .lgw-mini {
        font: inherit; font-size: 11px; padding: 2px 8px; border-radius: 6px; cursor: pointer;
        border: 1px solid ${STYLE_TOKENS.border}; background: transparent;
        color: ${STYLE_TOKENS.textSecondary};
      }
      .lgw-mini:hover { color: inherit; border-color: ${STYLE_TOKENS.borderStrong}; }

      /* ---------- 开关与提示 ---------- */
      .lgw-switch {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 12px; color: ${STYLE_TOKENS.textSecondary}; cursor: pointer; user-select: none;
      }
      .lgw-switch input { margin: 0; accent-color: ${STYLE_TOKENS.accent}; }

      .lgw-notice {
        padding: 9px 12px; border-radius: ${STYLE_TOKENS.routeLight};
        font-size: 13px; background: ${STYLE_TOKENS.surfaceSunken};
        color: ${STYLE_TOKENS.textSecondary};
      }
      .lgw-notice-error { background: var(--dsw-static-red-400-a12, rgba(176,72,60,.12)); color: ${STYLE_TOKENS.red}; }
      .lgw-empty { font-size: 13px; color: ${STYLE_TOKENS.textSecondary}; margin: 0; line-height: 1.6; }

      /* 窄容器：隐藏次要列，优先保住通道名和延迟 */
      /* 窄容器：.lgw-row-site 在 .lgw-row-id 内部，不是网格列，所以列数不能减——
         减了会把展开箭头挤到第二行、延迟推出右边界。只压缩次要信息的宽度。 */
      @container (max-width: 520px) {
        .lgw-row-site { display: none; }
        .lgw-row-main { gap: 8px; }
        .lgw-row-lat { min-width: 44px; font-size: 11.5px; }
        .lgw-badge { padding: 2px 6px; font-size: 10.5px; }
      }
    `;

    function errorMessage(reason) {
      if (reason instanceof Error) return reason.message;
      if (typeof reason === 'string') return reason;
      try { return JSON.stringify(reason); } catch { return String(reason); }
    }

    function RelayGlyph({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: 'M3 6h6l3 6 3-6h6' }), h('path', { d: 'M3 18h6l3-6 3 6h6' }));
    }

    function LlmGatewayPage(props) {
      const { t } = props;
      const [state, setState] = React.useState({ loading: true, data: null, error: null });
      const [busy, setBusy] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [showAll, setShowAll] = React.useState(false);
      const [openChannel, setOpenChannel] = React.useState(null);
      const titleId = React.useId();

      const load = React.useCallback(async () => {
        try {
          const data = await api.status();
          setState({ loading: false, data, error: null });
        } catch (reason) {
          setState({ loading: false, data: null, error: errorMessage(reason) });
        }
      }, [api]);

      React.useEffect(() => { load(); }, [load]);

      const run = React.useCallback(async (action) => {
        setBusy(action);
        setNotice(null);
        try {
          if (action === 'probe') {
            const { snapshot } = await api.probe();
            const fresh = await api.status();
            setState({ loading: false, data: fresh, error: null });
            const best = (snapshot?.rows ?? []).find(row => row.ok);
            setNotice({ tone: 'ok', text: t('probeDone', {
              ok: snapshot?.ok ?? 0, total: snapshot?.total ?? 0,
              fastest: best?.channel ?? '—', ms: `${best?.ms ?? 0}ms`,
            }) });
            return;
          }
          const data = action === 'reload' ? (await api.reload()).status : await api[action]();
          setState({ loading: false, data, error: null });
          setNotice({ tone: 'ok', text: t(action === 'start' ? 'started' : action === 'stop' ? 'stoppedNotice' : action === 'restart' ? 'restarted' : 'reloaded') });
        } catch (reason) {
          setNotice({ tone: 'error', text: t('failed', { message: errorMessage(reason) }) });
        } finally {
          setBusy(null);
        }
      }, [api, t]);

      const data = state.data;
      const rows = data?.channels ?? [];
      const probeRows = data?.probe?.rows ?? [];
      const probeByChannel = new globalThis.Map(probeRows.map(row => [row.channel, row]));

      // 候选通道：优先用测速结果（有真实延迟），没测过的回落到通道声明
      const candidatesByModel = React.useMemo(() => {
        const map = new globalThis.Map();
        for (const row of probeRows) {
          if (!map.has(row.model)) map.set(row.model, []);
          map.get(row.model).push(row);
        }
        // 测速快照可能过期：它只记录当时跑到的通道，之后新加的通道不会在里面。
        // 所以通道声明的候选要并进来，不能因为「测速里有这个模型」就整体跳过。
        for (const row of rows) {
          for (const model of row.modelList ?? []) {
            if (!map.has(model)) map.set(model, []);
            const list = map.get(model);
            if (list.some(entry => entry.channel === row.id)) continue;
            list.push({
              channel: row.id,
              site: row.site,
              ok: row.healthy,
              ms: 0,                    // 没实测过，别拿通道历史延迟冒充
              image: undefined,
              probed: false,
            });
          }
        }
        for (const list of map.values()) {
          list.sort((a, b) => (a.ok === b.ok ? (a.ms || 1e9) - (b.ms || 1e9) : a.ok ? -1 : 1));
        }
        return map;
      }, [probeRows, rows]);

      function channelsFor(model) {
        const list = candidatesByModel.get(model) ?? [];
        const pinnedFor = new Set(data?.pins?.[model] ?? []);
        return list
          .map(row => ({
            id: row.channel,
            pinned: pinnedFor.has(row.channel),
            dead: row.ok === false,
            // 只认实测延迟；没测过的显示「未测」，不拿通道历史值充数
            ms: row.ok === false ? 0 : (row.probed === false ? 0 : (row.ms || 0)),
            probed: row.probed !== false && Boolean(row.ms),
            title: `${row.channel} · ${row.site}${row.probed === false ? ' · 未测速' : row.ok ? ` · ${row.ms}ms` : ` · ${row.status || '失败'}`}`,
          }))
          .sort((a, b) => (a.pinned === b.pinned ? (a.dead === b.dead ? a.ms - b.ms : a.dead ? 1 : -1) : a.pinned ? -1 : 1));
      }

      // 按厂商家族分组，231 个模型平铺没法看
      const groupedModels = (() => {
        const source = showAll ? (data?.allModels ?? data?.models ?? []) : (data?.models ?? []);
        const map = new globalThis.Map();
        for (const model of source) {
          const family = modelFamily(model);
          if (!map.has(family)) map.set(family, []);
          map.get(family).push(model);
        }
        return [...map.entries()]
          .map(([family, models]) => ({ family, models: models.sort() }))
          .sort((a, b) => b.models.length - a.models.length || a.family.localeCompare(b.family));
      })();

      async function choosePin(model, channelId) {        try {
          const fresh = await api.pin(model, channelId);
          setState({ loading: false, data: fresh, error: null });
          setNotice({ tone: 'ok', text: channelId ? `${model} → ${channelId}` : `${model} ${t('clearPin')}` });
        } catch (reason) {
          setNotice({ tone: 'error', text: t('failed', { message: errorMessage(reason) }) });
        }
      }

      return h('section', { className: 'lgw-page', 'aria-labelledby': titleId },
        h('style', null, styles),

        h('div', { className: 'lgw-head' },
          h('div', { className: 'lgw-head-text' },
            h('h2', { className: 'lgw-title', id: titleId }, t('title')),
            h('p', { className: 'lgw-desc' }, t('description'))),
          h('div', { className: 'lgw-actions' },
            data?.running
              ? h('button', { type: 'button', className: 'lgw-btn lgw-btn-primary', disabled: Boolean(busy), onClick: () => run('restart') }, busy === 'restart' ? t('busy') : t('restart'))
              : h('button', { type: 'button', className: 'lgw-btn lgw-btn-primary', disabled: Boolean(busy), onClick: () => run('start') }, busy === 'start' ? t('busy') : t('start')),
            data?.running ? h('button', { type: 'button', className: 'lgw-btn', disabled: Boolean(busy), onClick: () => run('stop') }, busy === 'stop' ? t('busy') : t('stop')) : null,
            h('button', { type: 'button', className: 'lgw-btn', disabled: Boolean(busy) || !data?.running, onClick: () => run('reload') }, busy === 'reload' ? t('busy') : t('reload')),
            h('button', { type: 'button', className: 'lgw-btn', disabled: Boolean(busy) || !data?.running, onClick: () => run('probe') }, busy === 'probe' ? t('probing') : t('probe')),
            h('button', { type: 'button', className: 'lgw-btn', disabled: Boolean(busy), onClick: () => { setBusy('refresh'); load().finally(() => setBusy(null)); } }, busy === 'refresh' ? t('busy') : t('refresh')))),

        state.error ? h('div', { className: 'lgw-notice lgw-notice-error', role: 'alert' }, t('cannot', { message: state.error })) : null,
        notice ? h('div', { className: notice.tone === 'error' ? 'lgw-notice lgw-notice-error' : 'lgw-notice', role: 'status' }, notice.text) : null,
        state.loading ? h('div', { className: 'lgw-notice' }, t('loading')) : null,

        // ---- 概览 ----
        data ? h('div', { className: 'lgw-card' },
          h('div', { className: 'lgw-overview' },
            h('span', { className: data.running ? 'lgw-dot lgw-dot-on' : 'lgw-dot' }),
            h('span', { className: 'lgw-overview-label' }, data.running ? t('running') : t('stopped'))),
          h('div', { className: 'lgw-meta' },
            h('div', { className: 'lgw-meta-item' }, h('span', { className: 'lgw-meta-label' }, t('base')), h('span', { className: 'lgw-meta-value mono', title: data.base }, data.base)),
            data.running ? h('div', { className: 'lgw-meta-item' },
              h('span', { className: 'lgw-meta-label' }, t('channels')),
              h('span', { className: 'lgw-meta-value' }, `${data.healthy} / ${rows.length}`)) : null,
            data.running ? h('div', { className: 'lgw-meta-item' },
              h('span', { className: 'lgw-meta-label' }, t('verified')),
              h('span', { className: 'lgw-meta-value' }, String(data.verified))) : null,
            data.running ? h('div', { className: 'lgw-meta-item' },
              h('span', { className: 'lgw-meta-label' }, t('models')),
              h('span', { className: 'lgw-meta-value' }, String(data.modelCount))) : null,
            h('div', { className: 'lgw-meta-item lgw-meta-item-wide' },
              h('span', { className: 'lgw-meta-label' }, t('dir')),
              h('span', { className: 'lgw-meta-value mono', title: data.dir }, data.dir))),
          data.detail ? h('p', { className: 'lgw-desc', style: { marginTop: 12, color: 'var(--dsw-alias-danger, #b0483c)' } }, data.detail) : null) : null,

        data?.running && rows.length === 0
          ? h('div', { className: 'lgw-card' }, h('p', { className: 'lgw-empty' }, t('empty')))
          : null,

        // ---- 通道：紧凑列表，点开看详情 ----
        data?.running && rows.length > 0 ? h('div', { className: 'lgw-card' },
          h('div', { className: 'lgw-card-head' },
            h('h3', { className: 'lgw-card-title' }, t('channels')),
            probeRows.length > 0
              ? h('span', { className: 'lgw-card-sub' }, t('probeResult', {
                time: new Date(data.probe.at).toLocaleTimeString(),
                ok: data.probe.ok, total: data.probe.total, image: data.probe.image,
              }))
              : h('span', { className: 'lgw-card-sub' }, t('probeNever'))),
          h('div', { className: 'lgw-rows' }, rows.map(row => {
            const probe = probeByChannel.get(row.id);
            const dead = probe ? !probe.ok : !row.healthy;
            const open = openChannel === row.id;
            // 状态列要说「这个通道现在能不能用」：健康但实测失败，仍算不可用
            const usable = row.healthy && (!probe || probe.ok);
            const lat = probe?.ok ? probe.ms : 0;
            return h('div', { key: row.id, className: `lgw-row${dead ? ' lgw-row-dead' : ''}` },
              h('button', {
                type: 'button',
                className: 'lgw-row-main',
                'aria-expanded': open,
                onClick: () => setOpenChannel(open ? null : row.id),
              },
                h('span', { className: 'lgw-row-id' },
                  h('span', { className: 'lgw-row-name', title: row.id }, row.id),
                  h('span', { className: 'lgw-row-site' }, row.site),
                  row.fail > 0 ? h('span', { className: 'lgw-row-fail', title: t('fails') + ': ' + row.fail }, `×${row.fail}`) : null),
                h('span', { className: usable ? 'lgw-badge lgw-badge-ok' : 'lgw-badge lgw-badge-cool' },
                  usable ? t('okState') : (row.cooldown > 0 ? `${t('coolState')} ${row.cooldown}s` : t('unusable'))),
                h('span', { className: 'lgw-row-lat' },
                  probe
                    ? (probe.ok
                      ? h('span', { className: latencyClass(probe.ms) }, `${probe.ms}ms`)
                      : h('span', { className: 'lgw-slow', title: shortError(row.lastError || '') }, t('probeFail')))
                    : h('span', { className: 'lgw-muted' }, t('unprobed'))),
                h('span', { className: `lgw-caret${open ? ' lgw-caret-open' : ''}`, 'aria-hidden': 'true' }, '▶')),
              open ? h('div', { className: 'lgw-row-detail' },
                h('div', { className: 'lgw-detail-item' },
                  h('span', { className: 'lgw-detail-label' }, t('site')),
                  h('span', { className: 'lgw-detail-value' }, row.site)),
                h('div', { className: 'lgw-detail-item' },
                  h('span', { className: 'lgw-detail-label' }, t('fails')),
                  h('span', { className: 'lgw-detail-value' }, String(row.fail))),
                h('div', { className: 'lgw-detail-item' },
                  h('span', { className: 'lgw-detail-label' }, t('latency')),
                  h('span', { className: 'lgw-detail-value' }, row.latencyMs > 0 ? `${Math.round(row.latencyMs)}ms` : '—')),
                h('div', { className: 'lgw-detail-item' },
                  h('span', { className: 'lgw-detail-label' }, t('colImage')),
                  h('span', { className: 'lgw-detail-value' },
                    probe ? (probe.ok ? (probe.image ? t('imageYes') : t('imageNo')) : t('imageSkipped')) : '—')),
                row.lastError
                  ? h('div', { className: 'lgw-detail-error', title: row.lastError }, shortError(row.lastError))
                  : null)
                : null);
          }))) : null,

        // ---- 模型与通道选择 ----
        data?.running && data.models?.length > 0 ? h('div', { className: 'lgw-card' },
          h('div', { className: 'lgw-card-head' },
            h('h3', { className: 'lgw-card-title' }, `${t('modelList')} · ${data.models.length}`),
            h('label', { className: 'lgw-switch' },
              h('input', { type: 'checkbox', checked: showAll, onChange: event => setShowAll(event.target.checked) }),
              t('showAll'))),
          h('p', { className: 'lgw-card-sub', style: { margin: '0 0 4px' } }, t('pickHint')),
          groupedModels.map(group => h('div', { key: group.family, className: 'lgw-group' },
            h('div', { className: 'lgw-group-head' },
              h('span', { className: 'lgw-group-name' }, group.family),
              h('span', { className: 'lgw-group-meta' }, String(group.models.length))),
            h('ul', { className: 'lgw-picks' }, group.models.map(model => {
              const candidates = channelsFor(model);
              const pinnedNow = data.pins?.[model]?.[0];
              if (candidates.length === 0) {
                return h('li', { key: model, className: 'lgw-pick-row' },
                  h('div', { className: 'lgw-pick-name' }, h('code', null, model)),
                  h('span', { className: 'lgw-card-sub' }, t('noProbe')));
              }
              return h('li', { key: model, className: 'lgw-pick-row' },
                h('div', { className: 'lgw-pick-name' },
                  h('code', { title: model }, model),
                  pinnedNow ? h('span', { className: 'lgw-badge lgw-badge-pin' }, t('pinnedTag')) : null,
                  pinnedNow ? h('button', {
                    type: 'button', className: 'lgw-mini',
                    onClick: () => choosePin(model, null),
                  }, t('clearPin')) : null),
                h('div', { className: 'lgw-chips' }, candidates.map(candidate => h('button', {
                  key: candidate.id,
                  type: 'button',
                  className: `lgw-chip${candidate.pinned ? ' lgw-chip-on' : ''}${candidate.dead ? ' lgw-chip-dead' : ''}`,
                  title: candidate.title,
                  onClick: () => choosePin(model, candidate.pinned ? null : candidate.id),
                },
                  h('span', { className: candidate.probed ? latencyClass(candidate.ms) : 'lgw-muted' },
                    candidate.probed ? `${candidate.ms}ms` : t('unprobed')),
                  h('span', { className: 'lgw-chip-text' }, candidate.id)))));
            })))))
          : null);
    }

    /** 错误文本常常是几百字的 JSON，整段塞进表格会把布局撑散——只留能看懂的开头。 */
    function shortError(raw) {
      const text = String(raw).replace(/\s+/g, ' ').trim();
      const match = text.match(/"message"\s*:\s*"([^"]{0,80})"/);
      const head = match ? match[1] : text;
      return head.length > 42 ? `${head.slice(0, 42)}…` : head;
    }

    function modelFamily(model) {
      const head = String(model).split('/')[0].toLowerCase();
      if (head.includes('deepseek')) return 'DeepSeek';
      if (head.includes('grok')) return 'Grok';
      if (head.includes('glm')) return 'GLM';
      if (head.includes('kimi') || head.includes('moonshot')) return 'Kimi';
      if (head.includes('qwen')) return 'Qwen';
      if (head.includes('claude')) return 'Claude';
      if (head.includes('gemini')) return 'Gemini';
      if (head.includes('gpt') || head.includes('o1') || head.includes('o3')) return 'OpenAI';
      if (head.includes('minimax')) return 'MiniMax';
      if (head.includes('step')) return 'Step';
      if (head.includes('embed') || head.includes('rerank') || head.includes('bge')) return 'Embedding';
      const clean = head.replace(/^[\d,.]+$/, '').trim();
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '其他';
    }

    function latencyClass(ms) {
      if (!ms) return 'lgw-err';
      if (ms <= 8000) return 'lgw-fast';
      if (ms <= 18000) return 'lgw-mid';
      return 'lgw-slow';
    }

    function SettingsRelayIcon({ size = 16 }) {
      return h(RelayGlyph, { size });
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'llm-gateway.dictionaries');
        const t = ctx.locale.bind(NS);
        const injected = () => ({ t });
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: SECTION_ID, order: 28, label: () => t('nav'), locale: NS, inject: injected,
        }, LlmGatewayPage));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon', id: SECTION_ID,
        }, SettingsRelayIcon));
      },
    };
  },
});
