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
    };

    const styles = `
      .lgw-page { display: flex; flex-direction: column; gap: 16px; padding: 4px 2px 24px; }
      .lgw-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .lgw-title { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
      .lgw-desc { margin: 0; opacity: .72; font-size: 13px; line-height: 1.6; max-width: 62ch; }
      .lgw-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .lgw-btn { border: 1px solid var(--dsw-border, rgba(127,127,127,.35)); background: transparent; color: inherit;
        border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
      .lgw-btn:hover:not(:disabled) { background: rgba(127,127,127,.12); }
      .lgw-btn:disabled { opacity: .45; cursor: default; }
      .lgw-btn-primary { background: #4c8d3f; border-color: #4c8d3f; color: #fff; }
      .lgw-btn-primary:hover:not(:disabled) { background: #447e38; }
      .lgw-card { border: 1px solid var(--dsw-border, rgba(127,127,127,.28)); border-radius: 12px; padding: 14px 16px; }
      .lgw-status { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-weight: 600; }
      .lgw-dot { width: 9px; height: 9px; border-radius: 50%; background: #b0483c; }
      .lgw-dot-on { background: #4c8d3f; }
      .lgw-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .lgw-meta-item { display: flex; flex-direction: column; gap: 3px; }
      .lgw-meta-label { font-size: 12px; opacity: .62; }
      .lgw-meta-value { font-size: 15px; font-weight: 600; }
      .lgw-meta-value.mono { font-size: 12px; font-weight: 400; word-break: break-all; opacity: .85; }
      .lgw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .lgw-table th { text-align: left; font-weight: 500; font-size: 12px; opacity: .62; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--dsw-border, rgba(127,127,127,.22)); }
      .lgw-table td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--dsw-border, rgba(127,127,127,.12)); vertical-align: top; }
      .lgw-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; }
      .lgw-badge-ok { background: rgba(76,141,63,.16); color: #3f7a33; }
      .lgw-badge-cool { background: rgba(176,72,60,.16); color: #a8453a; }
      .lgw-err { opacity: .6; font-size: 12px; max-width: 16ch; word-break: break-word; cursor: help; }
      .lgw-row-dead td { opacity: .45; }
      .lgw-fast { color: #2f7d46; font-weight: 500; }
      .lgw-slow { color: #a8453a; }
      .lgw-mid { color: #9a6b18; }
      .lgw-sum { opacity: .64; font-size: 12px; margin: 0 0 10px; }
      .lgw-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
      .lgw-toolbar-title { font-size: 13px; font-weight: 600; }
      .lgw-switch { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; opacity: .75; cursor: pointer; }
      .lgw-group { border: 1px solid var(--dsw-border, rgba(127,127,127,.2)); border-radius: 10px; padding: 10px 12px; margin-top: 8px; }
      .lgw-group-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
      .lgw-group-name { font-size: 13px; font-weight: 600; }
      .lgw-group-meta { font-size: 11px; opacity: .55; }
      .lgw-picks { list-style: none; margin: 0; padding: 0; }
      .lgw-pick-row { padding: 9px 0; border-bottom: 1px solid var(--dsw-border, rgba(127,127,127,.1)); }
      .lgw-pick-row:last-child { border-bottom: 0; }
      .lgw-pick-name { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .lgw-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .lgw-chip { font: inherit; font-size: 12px; padding: 3px 9px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--dsw-border, rgba(127,127,127,.28)); background: transparent; color: inherit; }
      .lgw-chip:hover { border-color: var(--dsw-accent, #6b8f4e); }
      .lgw-chip-on { background: rgba(107,143,78,.18); border-color: var(--dsw-accent, #6b8f4e); font-weight: 600; }
      .lgw-chip-dead { opacity: .45; text-decoration: line-through; }
      .lgw-badge-pin { background: rgba(107,143,78,.18); color: inherit; }
      .lgw-mini { font: inherit; font-size: 11px; padding: 1px 7px; border-radius: 6px; cursor: pointer;
        border: 1px solid var(--dsw-border, rgba(127,127,127,.28)); background: transparent; color: inherit; opacity: .7; }
      .lgw-notice { padding: 8px 12px; border-radius: 8px; font-size: 13px; background: rgba(127,127,127,.12); }
      .lgw-notice-error { background: rgba(176,72,60,.14); color: #a8453a; }
      .lgw-models { margin: 0; padding: 8px 0 0 18px; font-size: 12px; columns: 2; column-gap: 24px; opacity: .8; }
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
          h('div', null,
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

        data ? h('div', { className: 'lgw-card' },
          h('div', { className: 'lgw-status' },
            h('span', { className: data.running ? 'lgw-dot lgw-dot-on' : 'lgw-dot' }),
            h('span', null, data.running ? t('running') : t('stopped'))),
          h('div', { className: 'lgw-meta' },
            h('div', { className: 'lgw-meta-item' }, h('span', { className: 'lgw-meta-label' }, t('base')), h('span', { className: 'lgw-meta-value mono' }, data.base)),
            data.running ? h('div', { className: 'lgw-meta-item' }, h('span', { className: 'lgw-meta-label' }, t('channels')), h('span', { className: 'lgw-meta-value' }, `${data.healthy} / ${rows.length}`)) : null,
            data.running ? h('div', { className: 'lgw-meta-item' }, h('span', { className: 'lgw-meta-label' }, t('verified')), h('span', { className: 'lgw-meta-value' }, String(data.verified))) : null,
            data.running ? h('div', { className: 'lgw-meta-item' }, h('span', { className: 'lgw-meta-label' }, t('models')), h('span', { className: 'lgw-meta-value' }, String(data.modelCount))) : null,
            h('div', { className: 'lgw-meta-item' }, h('span', { className: 'lgw-meta-label' }, t('dir')), h('span', { className: 'lgw-meta-value mono' }, data.dir))),
          data.detail ? h('p', { className: 'lgw-desc', style: { marginTop: 10, color: '#a8453a' } }, data.detail) : null) : null,

        data?.running && rows.length === 0
          ? h('div', { className: 'lgw-card' }, h('p', { className: 'lgw-desc' }, t('empty')))
          : null,

        data?.running && rows.length > 0 ? h('div', { className: 'lgw-card' },
          probeRows.length > 0
            ? h('p', { className: 'lgw-sum' }, t('probeResult', {
                time: new Date(data.probe.at).toLocaleTimeString(),
                ok: data.probe.ok, total: data.probe.total, image: data.probe.image,
              }))
            : h('p', { className: 'lgw-sum' }, t('probeNever')),
          h('table', { className: 'lgw-table' },
            h('thead', null, h('tr', null,
              h('th', null, t('channelId')),
              h('th', null, t('site')),
              h('th', null, t('state')),
              h('th', null, t('colLatency')),
              h('th', null, t('colImage')),
              h('th', null, t('fails')),
              h('th', null, t('latency')),
              h('th', null, t('lastError')))),
            h('tbody', null, rows.map(row => {
              const probe = probeByChannel.get(row.id);
              const dead = probe ? !probe.ok : false;
              return h('tr', { key: row.id, className: dead ? 'lgw-row-dead' : undefined },
                h('td', null, h('code', null, row.id)),
                h('td', null, row.site),
                h('td', null, h('span', { className: row.healthy ? 'lgw-badge lgw-badge-ok' : 'lgw-badge lgw-badge-cool' },
                  row.healthy ? t('okState') : `${t('coolState')} ${row.cooldown}s`)),
                h('td', null, probe
                  ? (probe.ok
                    ? h('span', { className: latencyClass(probe.ms) }, `${probe.ms}ms`)
                    : h('span', { className: 'lgw-slow' }, `✗ ${probe.status || probe.error?.slice(0, 18) || ''}`))
                  : h('span', { className: 'lgw-err' }, t('unprobed'))),
                h('td', null, probe
                  ? (probe.ok ? (probe.image ? t('imageYes') : t('imageNo')) : t('imageSkipped'))
                  : '—'),
                h('td', null, String(row.fail)),
                h('td', null, row.latencyMs > 0 ? `${Math.round(row.latencyMs)}ms` : '—'),
                h('td', null, h('span', { className: 'lgw-err', title: row.lastError || '' },
                  row.lastError ? shortError(row.lastError) : '—')));
            })))) : null,

        data?.running && data.models?.length > 0 ? h('div', { className: 'lgw-card' },
          h('div', { className: 'lgw-toolbar' },
            h('span', { className: 'lgw-toolbar-title' }, `${t('modelList')} · ${data.models.length}`),
            h('label', { className: 'lgw-switch' },
              h('input', {
                type: 'checkbox',
                checked: showAll,
                onChange: event => setShowAll(event.target.checked),
              }),
              t('showAll'))),
          h('p', { className: 'lgw-sum' }, t('pickHint')),
          groupedModels.map(group => h('div', { key: group.family, className: 'lgw-group' },
            h('div', { className: 'lgw-group-head' },
              h('span', { className: 'lgw-group-name' }, group.family),
              h('span', { className: 'lgw-group-meta' }, `${group.models.length}`)),
            h('ul', { className: 'lgw-picks' }, group.models.map(model => {
              const candidates = channelsFor(model);
              const pinnedNow = data.pins?.[model]?.[0];
              if (candidates.length === 0) {
                return h('li', { key: model, className: 'lgw-pick-row' },
                  h('code', null, model), ' ',
                  h('span', { className: 'lgw-err' }, t('noProbe')));
              }
              return h('li', { key: model, className: 'lgw-pick-row' },
                h('div', { className: 'lgw-pick-name' },
                  h('code', null, model),
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
                }, h('span', { className: candidate.probed ? latencyClass(candidate.ms) : 'lgw-err' },
                  candidate.probed ? `${candidate.ms}ms` : t('unprobed')), ' ', candidate.id))));
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
