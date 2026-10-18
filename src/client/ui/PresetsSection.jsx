/**
 * 预置音景面板 —— 面板里的「音景」分区。
 *
 * 【为什么单独一个文件】
 * `presets.js` 是纯逻辑层（清单、缓存、校验、播放分流），`PlayerPanel.jsx`
 * 已有一千行且要处理拖拽/队列/进度，把音景混进去会让两边都难维护。
 * 这里只做一件事：把 presets 控制器的状态映射成一组可点的按钮。
 *
 * 【接法上最容易踩的坑：baseUrl】
 * `createPresets({ baseUrl })` 默认 `'./'`，而 `loadManifest` 用
 * `new URL('presets/manifest.json', new URL(baseUrl, location.href))` 解析。
 * 面板挂在 `http://127.0.0.1:3080/sidebar/...` 这类深层路径上，
 * `'./'` 会解析成 `/sidebar/presets/manifest.json` —— 404，所有音景变灰。
 * 所以这里**必须**显式传宿主侧的真实路由前缀 `PRESETS_BASE`
 * （= `/api/dsh-music-on/presets/`，末尾斜杠不能少，否则最后一段会被吃掉）。
 *
 * 【频谱说明，别把它当成 bug】
 * - embedded 音景是本地 WAV，经 fetch 进 ArrayBuffer 再 decodeAudioData，
 *   走的是 `BufferSource → GainNode → AnalyserNode → destination`，
 *   频谱拿得到。
 * - bilibili-embed 是 iframe，跨源，浏览器不给音频样本，**频谱必然不可用**。
 *   这不是没做完，是物理限制；条目上直接标「无频谱」，不假装有。
 * - platform-link 只是跳转，插件内不出声。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** createElement 别名，理由同 PlayerPanel.jsx：客户端 bundle 零转译，不能写 JSX。 */
const h = (...args) => {
  const create = React.createElement || (React.default && React.default.createElement);
  return create(...args);
};

/** 宿主侧预置路由前缀。末尾斜杠是 URL 解析的一部分，删了会 404。 */
export const PRESETS_BASE = '/api/dsh-music-on/presets/';

/** 分类显示名。清单里带 name，但漏配时不能显示空按钮。 */
const CATEGORY_LABEL = Object.freeze({
  'white-noise': '白噪音',
  rain: '雨声',
  cafe: '咖啡馆',
  beat: '鼓点',
  jazz: '爵士',
  lofi: 'Lo-Fi',
});

const STATUS_LABEL = Object.freeze({
  ready: '就绪',
  'needs-config': '未配置',
  unavailable: '不可用',
});

/**
 * 单条音景按钮。
 *
 * 状态机的四个态都在这里体现，不许静默失败：
 * preparing（拉取+校验中）/ playing / error（带原因）/ idle。
 */
function PresetChip(props) {
  const { item, runtime, currentId, onPick } = props;
  const isCurrent = currentId === item.id;
  const status = (runtime && runtime.status) || item.status;
  const busy = status === 'preparing';
  const broken = status === 'error' || status === 'unavailable';
  const notReady = item.playable !== true;

  const className = [
    'dmo-chip',
    isCurrent ? 'dmo-chip-on' : '',
    busy ? 'dmo-chip-busy' : '',
    broken ? 'dmo-chip-bad' : '',
    notReady ? 'dmo-chip-off' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** 悬停提示：把「为什么点不了」写清楚，而不是只把按钮变灰。 */
  const title = broken
    ? runtime && runtime.reason
      ? runtime.reason
      : item.unavailableReason || '该条目不可用'
    : notReady
      ? `${item.name}：${STATUS_LABEL[item.status] || item.status}${
          item.source === 'bilibili-embed'
            ? '（需在 manifest.json 填入 bvid）'
            : item.source === 'platform-link'
              ? '（需填入歌单页链接）'
              : ''
        }`
      : item.spectrumAvailable === false
        ? `${item.name}：可播放，但该源不提供频谱`
        : item.name;

  return h(
    'button',
    {
      type: 'button',
      className,
      title,
      disabled: notReady || busy,
      'data-preset-id': item.id,
      'aria-pressed': isCurrent ? 'true' : 'false',
      onClick: () => onPick(item),
    },
    h('span', { className: 'dmo-chip-name' }, item.name || CATEGORY_LABEL[item.category] || item.id),
    // 只有「可播但没频谱」才标；不可播的条目已经有自己的红点语义。
    !notReady && item.spectrumAvailable === false
      ? h('span', { className: 'dmo-chip-tag' }, '无频谱')
      : null,
    busy ? h('span', { className: 'dmo-chip-tag' }, '载入中') : null,
    broken ? h('span', { className: 'dmo-chip-dot', 'aria-hidden': 'true' }) : null,
  );
}

/**
 * 音景分区主体。
 *
 * @param {object} props
 * @param {object} props.presets `createPresets()` 的返回值；为 null 时渲染加载态。
 * @param {string|number} [props.seed] 变化时重新拉一遍清单（设置里改缓存后刷新用）。
 * @param {(text: string) => void} [props.onNotice] 向上抛提示气泡。
 */
export function PresetsSection(props) {
  const { presets, onNotice, seed } = props || {};
  const [open, setOpen] = useState(true);
  const [error, setError] = useState('');
  const [runtime, setRuntime] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* 订阅 presets 的运行时状态。
   *
   * 事件形态照 src/client/presets.js 的实现来，各类型并不统一，见 :661-735：
   *   { type:'playback', ...state }          —— 引擎状态，不带 id
   *   { type:'error',    id, error }         —— 该条失败
   *   { type:'cached',   id, fromCache }     —— 该条已落缓存
   *   { type:'embed',    id, embedUrl, spectrum:false } —— B站降级为 iframe
   *   { type:'external', id, url }           —— 外部平台跳转
   * 所以只按 id 归档，不假设存在 status 字段。 */
  useEffect(() => {
    if (!presets || typeof presets.onChange !== 'function') return undefined;
    const off = presets.onChange((event) => {
      if (!mounted.current || !event) return;
      if (event.type === 'error' && event.id) {
        setRuntime((prev) => ({
          ...prev,
          [event.id]: { status: 'error', reason: event.error && event.error.message },
        }));
        return;
      }
      if ((event.type === 'embed' || event.type === 'external') && event.id) {
        setCurrentId(event.id);
        return;
      }
      if (event.type === 'cached' && event.id) {
        setRuntime((prev) => ({ ...prev, [event.id]: { status: 'ready' } }));
      }
    });
    return off;
  }, [presets, seed]);

  const categories = useMemo(() => {
    if (!presets || typeof presets.categories !== 'function') return [];
    try {
      return presets.categories();
    } catch (cause) {
      void cause;
      return [];
    }
  }, [presets, seed]);

  const issues = useMemo(() => {
    if (!presets || typeof presets.unavailableReport !== 'function') return [];
    try {
      return presets.unavailableReport();
    } catch {
      return [];
    }
  }, [presets, seed]);

  const pick = useCallback(
    async (item) => {
      if (!presets) return;
      setError('');
      try {
        const result = await presets.play(item.id);
        if (!mounted.current) return;
        if (result && result.mode === 'external' && result.url) {
          // 外部平台不允许插件内播放，只能开新页。
          window.open(result.url, '_blank', 'noopener,noreferrer');
          onNotice && onNotice(`已在新标签页打开 ${item.name}`);
          return;
        }
        if (result && result.mode === 'iframe') {
          onNotice && onNotice(`${item.name}：B 站嵌入播放，频谱不可用`);
          setCurrentId(item.id);
          return;
        }
        setCurrentId(item.id);
      } catch (cause) {
        if (!mounted.current) return;
        const message = cause && cause.message ? cause.message : '音景加载失败';
        setError(message);
        onNotice && onNotice(message);
      }
    },
    [presets, onNotice],
  );

  /* 未就绪（presets 还在创建）：给一行字，不渲染空壳。 */
  if (!presets) {
    return h(
      'section',
      { className: 'dmo-presets dmo-presets-loading' },
      h('div', { className: 'dmo-presets-head' }, h('span', { className: 'dmo-presets-title' }, '音景')),
      h('div', { className: 'dmo-presets-hint' }, '预置音景加载中…'),
    );
  }

  const total = categories.reduce((sum, c) => sum + c.items.length, 0);
  const readyCount = categories.reduce((sum, c) => sum + c.counts.ready, 0);

  return h(
    'section',
    { className: open ? 'dmo-presets' : 'dmo-presets dmo-presets-closed' },
    h(
      'div',
      { className: 'dmo-presets-head' },
      h(
        'button',
        {
          type: 'button',
          className: 'dmo-presets-title-btn',
          onClick: () => setOpen((v) => !v),
          'aria-expanded': open ? 'true' : 'false',
          title: open ? '收起音景' : '展开音景',
        },
        h('span', { className: 'dmo-presets-caret' }, open ? '\u25BE' : '\u25B8'),
        h('span', { className: 'dmo-presets-title' }, '音景'),
        h('span', { className: 'dmo-presets-count' }, `${readyCount}/${total}`),
      ),
      issues.length > 0
        ? h(
            'span',
            {
              className: 'dmo-presets-warn',
              title: issues.map((i) => `${i.name}：${i.reason}`).join('\n'),
            },
            `${issues.length} 项未就绪`,
          )
        : null,
    ),

    open
      ? h(
          'div',
          { className: 'dmo-presets-body' },
          ...categories.map((category) =>
            h(
              'div',
              { className: 'dmo-presets-group', key: category.id },
              h('div', { className: 'dmo-presets-group-name' }, CATEGORY_LABEL[category.id] || category.name || category.id),
              h(
                'div',
                { className: 'dmo-presets-chips' },
                ...category.items.map((item) =>
                  h(PresetChip, {
                    key: item.id,
                    item,
                    runtime: runtime[item.id],
                    currentId,
                    onPick: pick,
                  }),
                ),
              ),
            ),
          ),
          error !== '' ? h('div', { className: 'dmo-presets-error', role: 'alert' }, error) : null,
          h('div', { className: 'dmo-presets-hint' }, '自研合成音可循环无缝播放；B 站条目为嵌入播放，不产生频谱。'),
        )
      : null,
  );
}

export default PresetsSection;
