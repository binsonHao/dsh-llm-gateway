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

    const api = {
      status: () => callApi('status'),
      start: () => callApi('start'),
      stop: () => callApi('stop'),
      restart: () => callApi('restart'),
      reload: () => callApi('reload'),
      models: () => callApi('models'),
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
      modelList: '可调度模型（点击展开）',
      started: '已启动',
      stoppedNotice: '已停止',
      restarted: '已重启',
      reloaded: '已热加载',
      failed: '操作失败：{message}',
      cannot: '无法调用宿主服务：{message}',
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
      modelList: 'Routable models (click to expand)',
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
      .lgw-err { opacity: .6; font-size: 12px; max-width: 42ch; word-break: break-word; }
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
      const [showModels, setShowModels] = React.useState(false);
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
          h('table', { className: 'lgw-table' },
            h('thead', null, h('tr', null,
              h('th', null, t('channelId')),
              h('th', null, t('site')),
              h('th', null, t('state')),
              h('th', null, t('fails')),
              h('th', null, t('latency')),
              h('th', null, t('lastError')))),
            h('tbody', null, rows.map(row => h('tr', { key: row.id },
              h('td', null, h('code', null, row.id)),
              h('td', null, row.site),
              h('td', null, h('span', { className: row.healthy ? 'lgw-badge lgw-badge-ok' : 'lgw-badge lgw-badge-cool' },
                row.healthy ? t('okState') : `${t('coolState')} ${row.cooldown}s`)),
              h('td', null, String(row.fail)),
              h('td', null, row.latencyMs > 0 ? `${row.latencyMs}ms` : '—'),
              h('td', null, h('span', { className: 'lgw-err' }, row.lastError || '—'))))))) : null,

        data?.running && data.models?.length > 0 ? h('div', { className: 'lgw-card' },
          h('button', {
            type: 'button', className: 'lgw-btn', onClick: () => setShowModels(value => !value),
            'aria-expanded': showModels,
          }, `${t('modelList')} · ${data.models.length}`),
          showModels ? h('ul', { className: 'lgw-models' }, data.models.map(id => h('li', { key: id }, id))) : null) : null);
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
