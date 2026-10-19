import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KIND_EXTERNAL_EMBED, toEmbedUrl } from '../sources.js';

/**
 * 主面板。props = { engine, settings }
 *
 * 契约（跟 engine 的约定，改这里之前先确认引擎侧没变）：
 * - engine.play/pause/toggle/next/prev/seek(seconds)
 * - engine.addFiles(FileList|File[], { playFirst })  -> { position, added, skipped, total }
 * - engine.addUrl(url), engine.addEmbed(url)
 * - engine.remove(index), engine.clear(), engine.loadAt(index, { autoplay })
 * - engine.setVolume(0..1), engine.setMuted(bool), engine.cycleLoopMode()
 * - engine.onTrackChange / onStateChange / onTimeUpdate / onQueueChange / onError
 *   每个都返回取消函数；组件卸载时全部调用。
 * - engine.getState() / getQueue() 用于首屏同步，避免第一帧空白。
 *
 * 本文件刻意写成 ESM + React.createElement（在文件末尾绑定一个 h 别名），
 * 而不是真正的 JSX 语法：
 * 宿主的插件客户端 bundle 是「原样静态服务、零转译」的
 * （dsh-client-modules 服务端只 readFileSync 再加 sourceMappingURL 就吐给浏览器），
 * 浏览器里没有 JSX 编译器，写尖括号会直接 SyntaxError。
 * 保留 .jsx 扩展名是为了让读代码的人一眼知道这是组件文件。
 */

/**
 * createElement 的本地别名。
 * 宿主给客户端插件的模块表里 ,'react' 是完整命名空间（含 createElement / Fragment），
 * 但为了兼容只给默认导出的情况，这里回退到 React.default。
 */
const h = (...args) => {
  const create = React.createElement || (React.default && React.default.createElement);
  return create(...args);
};

/** 秒 -> mm:ss / h:mm:ss。null 显示 --:--。 */
export function formatTime(seconds) {
  if (seconds === null || seconds === undefined || Number.isFinite(seconds) === false || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const hrs = Math.floor(total / 3600);
  const pad = (value) => (value < 10 ? `0${value}` : String(value));
  return hrs > 0 ? `${hrs}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 字节 -> 人类可读。 */
function formatSize(bytes) {
  if (typeof bytes !== 'number' || Number.isFinite(bytes) === false || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const LOOP_LABEL = Object.freeze({
  off: '播完停止',
  all: '列表循环',
  one: '单曲循环',
});

const LOOP_GLYPH = Object.freeze({
  off: '\u25B6',
  all: '\u21BB',
  one: '\u21BB\u00B9',
});

/**
 * 队列一行。
 * 单独抽出来是为了让「当前播放行」的重渲染不带上整棵列表 ——
 * 进度每秒变 4 次，列表动辄上百行。
 */
function QueueRow({ item, onSelect, onRemove }) {
  const badge = item.kind === KIND_EXTERNAL_EMBED ? '外链' : '';
  return h(
    'li',
    {
      className: item.current ? 'dmo-queue-row dmo-queue-row-current' : 'dmo-queue-row',
      'data-index': String(item.index),
    },
    h(
      'button',
      {
        type: 'button',
        className: 'dmo-queue-main',
        onClick: () => onSelect(item.index),
        title: item.unavailableReason ? `${item.title} - ${item.unavailableReason}` : item.title,
      },
      h('span', { className: 'dmo-queue-index' }, item.current ? '\u25B6' : String(item.index + 1)),
      h(
        'span',
        { className: 'dmo-queue-text' },
        h('span', { className: 'dmo-queue-title' }, item.title),
        item.artist ? h('span', { className: 'dmo-queue-artist' }, item.artist) : null,
      ),
      badge ? h('span', { className: 'dmo-queue-badge' }, badge) : null,
      item.unavailableReason ? h('span', { className: 'dmo-queue-badge dmo-queue-badge-warn' }, '不可用') : null,
      item.duration !== null ? h('span', { className: 'dmo-queue-dur' }, formatTime(item.duration)) : null,
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dmo-queue-remove',
        onClick: (event) => {
          event.stopPropagation();
          onRemove(item.index);
        },
        title: '从队列移除',
        'aria-label': `移除 ${item.title}`,
      },
      '\u00D7',
    ),
  );
}

/** 外部播放器面板：iframe + 明确的不可用说明。 */
function ExternalStage({ track, degraded }) {
  return h(
    'div',
    { className: 'dmo-stage dmo-stage-external' },
    h(
      'div',
      { className: 'dmo-embed-frame' },
      h('iframe', {
        src: track.embedUrl,
        title: track.title,
        allow: 'autoplay; fullscreen; picture-in-picture',
        frameBorder: '0',
        scrolling: 'no',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
        referrerPolicy: 'no-referrer-when-downgrade',
      }),
    ),
    h(
      'p',
      { className: 'dmo-embed-note' },
      degraded
        ? '音频流代理失败，已自动切到内嵌播放器。外部播放器，频谱不可用。'
        : '外部播放器，频谱不可用。进度与音量由播放器自身控制，本面板只负责切歌。',
    ),
  );
}

/** 空队列时的落区提示。 */
function EmptyStage({ dragging }) {
  return h(
    'div',
    { className: dragging ? 'dmo-stage dmo-stage-empty dmo-stage-drag' : 'dmo-stage dmo-stage-empty' },
    h('span', { className: 'dmo-stage-glyph' }, '\u266B'),
    h('p', { className: 'dmo-stage-title' }, '把音频文件拖到这里'),
    h('p', { className: 'dmo-stage-hint' }, '支持 mp3 / m4a / wav / flac / ogg，可一次拖入多首；也接受 B 站播放页链接。'),
  );
}

/**
 * 主面板组件。
 * @param {{ engine: object, settings: object }} props
 */
export function PlayerPanel(props) {
  const engine = props && props.engine ? props.engine : null;
  const settings = (props && props.settings) || {};

  // 四个订阅在卸载时全部取消；音乐本身继续播（引擎是模块级单例）。
  const [state, setState] = useState(() => (engine ? engine.getState() : { status: 'idle', mode: 'internal' }));
  const [queue, setQueue] = useState(() => (engine ? engine.getQueue() : []));
  const [dragDepth, setDragDepth] = useState(0);
  const [notice, setNotice] = useState('');
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const rootRef = useRef(null);
  const rangeRef = useRef(null);

  /* 订阅引擎。四个订阅在卸载时全部取消，音乐继续播（引擎是模块级单例）。 */
  useEffect(() => {
    if (engine === null) return undefined;
    setState(engine.getState());
    const offState = engine.onStateChange((next) => setState(next));
    const offQueue = engine.onQueueChange((payload) => {
      setQueue(payload.items);
    });
    const offTime = engine.onTimeUpdate((payload) => {
      setState((prev) => {
        if (prev.currentTime === payload.currentTime && prev.duration === payload.duration) return prev;
        return { ...prev, currentTime: payload.currentTime, duration: payload.duration };
      });
    });
    const offError = engine.onError((error) => {
      setNotice(error && error.message ? error.message : '播放出错');
    });
    return () => {
      offState();
      offQueue();
      offTime();
      offError();
    };
  }, [engine]);

  /* 设置里的默认音量 / 循环模式只在挂载时同步一次，之后以面板上的临时操作为准。 */
  useEffect(() => {
    if (engine === null) return;
    if (typeof settings.volume === 'number') engine.setVolume(settings.volume);
    if (typeof settings.loopMode === 'string') engine.setLoopMode(settings.loopMode);
    // 刻意只依赖 engine：settings 变化不覆盖用户在面板上的临时调整。
    // eslint 里这条会被报成缺依赖，但那是本意。
  }, [engine]);

  /* 提示气泡自动消失。 */
  useEffect(() => {
    if (notice === '') return undefined;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ---------------- 拖拽：整页拦截，避免浏览器把文件当导航打开 ---------------- */

  useEffect(() => {
    const onDragOver = (event) => {
      // 只在真的有文件的时候 preventDefault，否则会把内部拖拽（比如选文本）也吃掉。
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (event) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
        event.preventDefault();
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const ingestFiles = useCallback(
    async (fileList) => {
      if (engine === null) return;
      const result = await engine.addFiles(fileList, { playFirst: true });
      if (result && result.skipped > 0) {
        setNotice(`已加入 ${result.added} 首，跳过 ${result.skipped} 个非音频文件`);
      } else if (result && result.added > 0) {
        setNotice(`已加入 ${result.added} 首`);
      }
    },
    [engine],
  );

  const ingestText = useCallback(
    async (text) => {
      if (engine === null) return false;
      const raw = typeof text === 'string' ? text.trim() : '';
      if (raw === '') return false;
      const embed = toEmbedUrl(raw);
      if (embed !== null) {
        await engine.addEmbed(raw, { title: `Bilibili ${embed.bvid || ''}`.trim() });
        setNotice('已加入外部播放器');
        return true;
      }
      if (/^https?:\/\//i.test(raw)) {
        await engine.addUrl(raw);
        setNotice('已加入网络音频');
        return true;
      }
      // 纯文件名（从资源管理器拖文字）没什么可做，交给用户自己选文件。
      return false;
    },
    [engine],
  );

  const onDragEnter = useCallback((event) => {
    event.preventDefault();
    setDragDepth((depth) => depth + 1);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    setDragDepth((depth) => Math.max(0, depth - 1));
  }, []);

  const onDragOverZone = useCallback((event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDropZone = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDragDepth(0);
      const data = event.dataTransfer;
      if (!data) return;
      const files = data.files && data.files.length > 0 ? data.files : null;
      if (files !== null) {
        void ingestFiles(files);
        return;
      }
      const text = data.getData('text/uri-list') || data.getData('text/plain') || '';
      void ingestText(text).then((handled) => {
        if (handled === false) setNotice('没有识别到可播放的音频或链接');
      });
    },
    [ingestFiles, ingestText],
  );

  /* ---------------- 播放控制 ---------------- */

  const current = state.currentTrack;
  // 外部模式有两种入口：音源本身就是 embed，或 B 站双轨降级。两者 UI 表现一致。
  const isExternal = state.mode === 'external';
  const isPlaying = state.status === 'playing';
  const seekable = isExternal === false && state.seekable !== false;
  const duration = state.duration !== null && Number.isFinite(state.duration) ? state.duration : 0;
  const timeShown = scrubbing ? scrubValue : state.currentTime || 0;

  const onToggle = useCallback(() => {
    if (engine === null) return;
    void engine.toggle();
  }, [engine]);

  const onPrev = useCallback(() => {
    if (engine === null) return;
    void engine.prev();
  }, [engine]);

  const onNext = useCallback(() => {
    if (engine === null) return;
    void engine.next();
  }, [engine]);

  const onSeekStart = useCallback(() => {
    setScrubbing(true);
    setScrubValue(state.currentTime || 0);
  }, [state.currentTime]);

  const onSeekInput = useCallback((event) => {
    const value = Number(event.target.value);
    setScrubValue(Number.isFinite(value) ? value : 0);
  }, []);

  const onSeekCommit = useCallback(
    (event) => {
      if (engine === null) return;
      const value = Number(event.target.value);
      setScrubbing(false);
      if (Number.isFinite(value)) engine.seek(value);
    },
    [engine],
  );

  const onVolume = useCallback(
    (event) => {
      if (engine === null) return;
      const value = Number(event.target.value);
      if (Number.isFinite(value) === false) return;
      engine.setVolume(value / 100);
      if (value > 0 && state.muted === true) engine.setMuted(false);
    },
    [engine, state.muted],
  );

  const onMute = useCallback(() => {
    if (engine === null) return;
    engine.setMuted(state.muted !== true);
  }, [engine, state.muted]);

  const onLoop = useCallback(() => {
    if (engine === null) return;
    engine.cycleLoopMode();
  }, [engine]);

  const onClear = useCallback(() => {
    if (engine === null) return;
    engine.clear();
    setNotice('队列已清空');
  }, [engine]);

  const onSelect = useCallback(
    (index) => {
      if (engine === null) return;
      void engine.loadAt(index, { autoplay: true });
    },
    [engine],
  );

  const onRemove = useCallback(
    (index) => {
      if (engine === null) return;
      engine.remove(index);
    },
    [engine],
  );

  /* ---------------- 键盘：空格播放暂停，左右切歌（面板聚焦时） ---------------- */

  const onKeyDown = useCallback(
    (event) => {
      const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
      // 输入控件上的空格/箭头属于控件自己，别抢。
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return;
      if (event.key === ' ') {
        event.preventDefault();
        onToggle();
        return;
      }
      if (event.key === 'ArrowLeft' && event.altKey) {
        event.preventDefault();
        onPrev();
        return;
      }
      if (event.key === 'ArrowRight' && event.altKey) {
        event.preventDefault();
        onNext();
      }
    },
    [onNext, onPrev, onToggle],
  );

  /* ---------------- 渲染 ---------------- */

  const volumeValue = useMemo(() => {
    const value = typeof state.volume === 'number' ? state.volume : 0.6;
    return Math.round(value * 100);
  }, [state.volume]);

  const progressMax = duration > 0 ? duration : 0;
  const progressPercent = progressMax > 0 ? Math.min(100, Math.max(0, (timeShown / progressMax) * 100)) : 0;

  const loopMode = state.loopMode || 'all';
  const dragging = dragDepth > 0;

  return h(
    'div',
    {
      className: dragging ? 'dmo-panel dmo-panel-drag' : 'dmo-panel',
      ref: rootRef,
      tabIndex: 0,
      role: 'region',
      'aria-label': '音乐播放器',
      onKeyDown,
      onDragEnter,
      onDragLeave,
      onDragOver: onDragOverZone,
      onDrop: onDropZone,
    },
    h(
      'div',
      { className: 'dmo-panel-head' },
      h(
        'div',
        { className: 'dmo-now' },
        h('span', { className: 'dmo-now-title', title: current ? current.title : '' }, current ? current.title : '未在播放'),
        current && current.artist ? h('span', { className: 'dmo-now-artist' }, current.artist) : null,
        current && current.unavailableReason
          ? h('span', { className: 'dmo-now-warn' }, current.unavailableReason)
          : null,
      ),
      h(
        'div',
        { className: 'dmo-head-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'dmo-btn dmo-btn-ghost',
            onClick: onClear,
            disabled: queue.length === 0,
            title: '清空队列并停止播放',
          },
          '清空',
        ),
      ),
    ),

    dragging
      ? h(
          'div',
          { className: 'dmo-drop-hint' },
          h('span', { className: 'dmo-drop-glyph' }, '\u2B07'),
          h('span', null, '松手加入队列'),
        )
      : null,

    // 降级路径：current 仍是 url-audio 的 kind，但 state.mode 已是 external，
    // 此时同样要挂 iframe（embedUrl 来自 track 本身）。
    isExternal && current && current.embedUrl
      ? h(ExternalStage, { track: current, degraded: state.degraded === true })
      : queue.length === 0
        ? h(EmptyStage, { dragging })
        : h(
            'div',
            { className: 'dmo-stage' },
            h('span', { className: 'dmo-stage-glyph dmo-stage-glyph-live' }, isPlaying ? '\u266B' : '\u266A'),
            h('span', { className: 'dmo-stage-meta' }, `${queue.length} 首在队列中`),
            state.autoplayBlocked
              ? h('span', { className: 'dmo-stage-warn' }, '浏览器拦下了自动播放，点播放按钮即可')
              : null,
          ),

    /* 进度条：外部模式 / 无时长时禁用，并显示不确定态。 */
    h(
      'div',
      { className: 'dmo-progress' },
      h('span', { className: 'dmo-progress-time' }, formatTime(timeShown)),
      h(
        'div',
        { className: seekable && progressMax > 0 ? 'dmo-progress-track' : 'dmo-progress-track dmo-progress-indeterminate' },
        h('span', { className: 'dmo-progress-fill', style: { width: `${progressPercent}%` } }),
        h('input', {
          ref: rangeRef,
          type: 'range',
          className: 'dmo-progress-range',
          min: 0,
          max: progressMax > 0 ? progressMax : 1,
          step: 0.1,
          value: timeShown,
          disabled: seekable === false || progressMax <= 0,
          onChange: onSeekInput,
          onPointerDown: onSeekStart,
          onPointerUp: onSeekCommit,
          onKeyUp: onSeekCommit,
          'aria-label': '播放进度',
        }),
      ),
      h(
        'span',
        { className: 'dmo-progress-time' },
        isExternal ? '\u221E' : formatTime(progressMax > 0 ? progressMax : null),
      ),
    ),

    h(
      'div',
      { className: 'dmo-controls' },
      h(
        'button',
        { type: 'button', className: 'dmo-btn dmo-btn-icon', onClick: onPrev, title: '上一首', 'aria-label': '上一首' },
        '\u23EE',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dmo-btn dmo-btn-play',
          onClick: onToggle,
          title: isPlaying ? '暂停' : '播放',
          'aria-label': isPlaying ? '暂停' : '播放',
        },
        isPlaying ? '\u23F8' : '\u25B6',
      ),
      h(
        'button',
        { type: 'button', className: 'dmo-btn dmo-btn-icon', onClick: onNext, title: '下一首', 'aria-label': '下一首' },
        '\u23ED',
      ),
      h(
        'button',
        {
          type: 'button',
          className: loopMode === 'off' ? 'dmo-btn dmo-btn-icon dmo-btn-dim' : 'dmo-btn dmo-btn-icon',
          onClick: onLoop,
          title: `循环：${LOOP_LABEL[loopMode] || '列表循环'}`,
          'aria-label': `循环模式：${LOOP_LABEL[loopMode] || '列表循环'}`,
        },
        LOOP_GLYPH[loopMode] || LOOP_GLYPH.all,
      ),
      h(
        'div',
        { className: 'dmo-volume' },
        h(
          'button',
          {
            type: 'button',
            className: 'dmo-btn dmo-btn-icon dmo-btn-ghost',
            onClick: onMute,
            title: state.muted ? '取消静音' : '静音',
            'aria-label': state.muted ? '取消静音' : '静音',
          },
          state.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A',
        ),
        h('input', {
          type: 'range',
          className: 'dmo-range dmo-volume-range',
          min: 0,
          max: 100,
          step: 1,
          value: state.muted ? 0 : volumeValue,
          onChange: onVolume,
          'aria-label': '音量',
        }),
      ),
    ),

    queue.length > 0
      ? h(
          'ul',
          { className: 'dmo-queue' },
          queue.map((item) =>
            h(QueueRow, { key: item.id, item, onSelect, onRemove }),
          ),
        )
      : null,

    /* 面板底部不再挂任何预置分区，只保留播放器本体。 */
    notice !== '' ? h('div', { className: 'dmo-notice', role: 'status' }, notice) : null,
  );
}

export default PlayerPanel;
