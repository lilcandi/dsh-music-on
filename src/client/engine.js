/**
 * 播放引擎：模块级单例，跨面板、跨视图续播。
 *
 * 铁律（改代码前先读这一段的理由，别当注释装饰）：
 * 1. AudioContext 存在模块作用域，绝不随面板卸载 close。UI 卸载只是解订阅，
 *    音乐不停——这是「切面板 / 切会话不打断播放」的唯一实现方式。
 * 2. 音频图：来源 → GainNode → AnalyserNode → destination。
 *    所有音源都是同一个 <audio> 元素经 createMediaElementSource 接入。
 * 3. 本地文件走 createObjectURL + MediaElementSource 流式播放。
 *    严禁 decodeAudioData 整块解码：一个 80MB 的 FLAC 会把内存和主线程一起拖死。
 * 4. 一份 <audio> 元素复用到底。MediaElementSource 对同一元素只能创建一次，
 *    所以元素必须活到 AudioContext 关闭为止。
 * 5. 事件订阅式。UI 不轮询，引擎只在状态真的变了的时候推。
 * 6. external-embed 音源（B 站 iframe）进不了 AudioContext：
 *    引擎切「外部播放器模式」——暂停内部 audio、清空频谱、spectrumAvailable=false。
 *
 * 生命周期真相：这是单例，dispose() 只在页面卸载 / 插件停用时调用。
 * 面板卸载走的是 unsubscribe，不是 dispose。
 */

import {
  KIND_EXTERNAL_EMBED,
  isInternalKind,
  describeTrack,
  createUrlTrack,
  createEmbedTrack,
  createPresetTrack,
  createBilibiliTrack,
  createPlatformTrack,
  tracksFromFiles,
  tracksFromManifest,
  resolvePresetRoute,
  toEmbedUrl,
} from './sources.js';

export const LOOP_MODES = Object.freeze(['off', 'all', 'one']);
export const ENGINE_MODES = Object.freeze(['internal', 'external']);

/** 循环模式的轮转顺序：off -> all -> one -> off。UI 的按钮按这个数组取下一个。 */
const LOOP_ORDER = Object.freeze(['off', 'all', 'one']);

const TIME_UPDATE_INTERVAL_MS = 250;
const DEFAULT_VOLUME = 0.6;

function clamp01(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, num));
}

/**
 * 事件包：每个 listener 抛错都只影响它自己，不能拖垮播放。
 * @param {Set<Function>} set
 * @param {any} payload
 */
function emit(set, payload) {
  if (set.size === 0) return;
  for (const listener of [...set]) {
    try {
      listener(payload);
    } catch (error) {
      // 订阅者是 UI；UI 崩了不该让声音停。上报给控制台便于排查。
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[dsh-music-on] 事件订阅者抛错', error);
      }
    }
  }
}

/**
 * 建立引擎。整个模块只有一个实例（见文件末尾的 getEngine）。
 * @returns {object} 引擎门面
 */
function createEngine() {
  /* ---------------- 模块级音频设施：惰性创建，活到 dispose ---------------- */

  /** @type {AudioContext | null} */
  let context = null;
  /** @type {GainNode | null} */
  let gain = null;
  /** @type {AnalyserNode | null} */
  let analyser = null;
  /** @type {HTMLMediaElement | null} */
  let audio = null;
  /** @type {MediaElementAudioSourceNode | null} */
  let sourceNode = null;
  /** @type {Uint8Array | null} 复用的频谱缓冲，避免每帧 new。 */
  let frequencyBin = null;

  /* ---------------- 队列与播放状态 ---------------- */

  /** @type {object[]} */
  let queue = [];
  let index = -1;
  /** @type {object | null} */
  let current = null;
  /** 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' */
  let status = 'idle';
  let currentTime = 0;
  let duration = null;
  let volume = DEFAULT_VOLUME;
  let muted = false;
  let loopMode = 'all';
  let mode = 'internal';
  let spectrumAvailable = false;
  let lastError = null;
  /** autoplay 被浏览器策略拦下来的那一次，UI 可以据此提示「点一下播放」。 */
  let autoplayBlocked = false;
  let allowAutoplay = false;
  /** 上一首 / 下一首的方向，给「单曲循环」外的随机模式记历史用。 */
  let disposed = false;
  /** 每条 B 站轨只降级一次：防止 stream 反复失败时在 stream <-> embed 之间打转。 */
  const degradedTracks = new Set();

  /* ---------------- 订阅者 ---------------- */

  const trackListeners = new Set();
  const stateListeners = new Set();
  const timeListeners = new Set();
  const queueListeners = new Set();
  const errorListeners = new Set();

  /* ---------------- 内部工具 ---------------- */

  /** 当前 state 的不可变快照。UI 拿到的永远是同一个形状。 */
  function snapshot() {
    const external = mode === 'external';
    return {
      status,
      mode,
      spectrumAvailable: external ? false : spectrumAvailable,
      loopMode,
      volume,
      muted,
      currentIndex: index,
      queueLength: queue.length,
      currentTrack: current ? describeTrack(current) : null,
      // 外部模式下时长与可寻位一律为空：B 站那条虽然知道 10865s，
      // 但那个时间轴属于 iframe，拿来画进度条就是骗人。
      seekable: external ? false : current ? current.seekable !== false : false,
      duration: external ? null : duration,
      currentTime: external ? 0 : currentTime,
      allowAutoplay,
      autoplayBlocked,
      error: lastError,
      degraded: current !== null && degradedTracks.has(current.id) === true,
    };
  }

  function publishState(reason) {
    const state = snapshot();
    state.reason = reason;
    emit(stateListeners, state);
  }

  function publishQueue() {
    emit(queueListeners, {
      items: queue.map((track, position) => ({ ...describeTrack(track), index: position, current: position === index })),
      currentIndex: index,
    });
  }

  function publishTrack(reason) {
    if (current === null) {
      emit(trackListeners, null);
      return;
    }
    const described = describeTrack(current);
    described.reason = reason;
    described.index = index;
    emit(trackListeners, described);
  }

  function publishTime() {
    emit(timeListeners, { currentTime, duration, seekable: current ? current.seekable !== false : false });
  }

  function fail(error, phase) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    lastError = { phase, message, at: Date.now() };
    status = 'error';
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`[dsh-music-on] ${phase}: ${message}`);
    }
    emit(errorListeners, lastError);
    publishState('error');
  }

  /**
   * 惰性创建 AudioContext 与音频图。
   * 不创建就一定能播吗？不能——但创建了才能接 analyser 与音量。
   * 所以这里在第一次真正播放时才建，避免「打开页面就有个 suspended context」。
   */
  function ensureGraph() {
    if (context !== null) return context;
    const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (typeof Ctor !== 'function') {
      throw new Error('当前环境没有 Web Audio API');
    }
    context = new Ctor();
    gain = context.createGain();
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    frequencyBin = new Uint8Array(analyser.frequencyBinCount);

    audio = document.createElement('audio');
    audio.preload = 'auto';
    // 不上 DOM 树也能出声，但部分浏览器对「未入文档的媒体元素」的播放策略更严，
    // 这里挂在 body 下并视觉隐藏，换取最大的兼容性。
    audio.style.display = 'none';
    audio.setAttribute('playsinline', '');
    // crossOrigin 必须留空 —— 这是「有进度没声音」的元凶。
    // 设成 'anonymous' 会进入 CORS 模式：一旦响应的 ACAO 头对不上，规范规定
    // MediaElementAudioSourceNode 必须输出静音，而 audio.play() 依然返回成功。
    // 本项目所有音源都同源（/api/dsh-music-on/stream 与 objectURL），根本不需要
    // CORS 模式；打开它只会把「同源流」推到一个更严格的判定分支里。
    // 用 removeAttribute 而不是赋空串：空串在某些实现里仍算「属性存在」。
    // 若将来真要接跨域直链，必须同时让流代理回 ACAO 头，二者不可只改一边。
    audio.removeAttribute('crossorigin');
    if (typeof document !== 'undefined' && document.body) document.body.appendChild(audio);

    sourceNode = context.createMediaElementSource(audio);
    sourceNode.connect(gain);
    gain.connect(analyser);
    analyser.connect(context.destination);
    gain.gain.value = muted ? 0 : volume;

    bindAudioEvents();
    return context;
  }

  /**
   * 一次性绑定 audio 元素上的全部事件。用 on* 属性而不是 addEventListener：
   * 元素只建一次，属性赋值天然幂等，不存在重复绑定的可能。
   */
  function bindAudioEvents() {
    if (audio === null) return;

    audio.onloadedmetadata = () => {
      duration = Number.isFinite(audio.duration) ? audio.duration : null;
      if (duration !== null && current !== null) current.duration = duration;
      publishTime();
      publishState('metadata');
    };

    audio.oncanplay = () => {
      if (status === 'loading') {
        status = 'paused';
        publishState('canplay');
      }
    };

    audio.onplaying = () => {
      status = 'playing';
      autoplayBlocked = false;
      publishState('playing');
    };

    audio.onpause = () => {
      // 播完触发的 pause 交给 onended 处理，避免状态来回跳。
      if (status === 'ended') return;
      if (status === 'error') return;
      status = 'paused';
      publishState('paused');
    };

    audio.ontimeupdate = () => {
      currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      // 精确循环点：TimeRanges 级校验，audio.loop 只够整文件循环。
      enforceLoopPoint();
      // 原生 timeupdate 频率因浏览器而异（4~66Hz），频控到 250ms 一推。
      const now = Date.now();
      if (now - lastTimeEmit >= TIME_UPDATE_INTERVAL_MS) {
        lastTimeEmit = now;
        publishTime();
      }
    };

    audio.onended = () => {
      currentTime = 0;
      status = 'ended';
      publishState('ended');
      // 带精确循环点的音景：loopMode=one 才回卷。用户显式选了「播完停止」就尊重他，
      // 否则一个 5.6s 的音景在 mode=off 下会自己转圈，怎么点都停不下来。
      if (hasLoopPoint() && loopMode === 'one') {
        restartLoopPoint();
        return;
      }
      // 自动续播：单曲循环重播自己，其余交给 advance。
      if (loopMode === 'one') {
        seek(0);
        void play();
        return;
      }
      if (loopMode === 'off' && index >= queue.length - 1) {
        publishState('queue-end');
        return;
      }
      void next(true);
    };

    audio.onerror = () => {
      const code = audio && audio.error ? audio.error.code : 0;
      const text = code === 1 ? '播放被中止' : code === 2 ? '网络错误' : code === 3 ? '解码失败' : code === 4 ? '格式不支持' : '未知错误';
      // 带 embedUrl 的音源（B 站双轨）先试降级，降级成功就不进 error 状态。
      if (tryDegradeToEmbed(text) === true) return;
      lastError = { phase: 'media', message: text, at: Date.now() };
      status = 'error';
      emit(errorListeners, lastError);
      publishState('media-error');
    };

    audio.onstalled = () => {
      // 流代理卡住也算一次失败信号，但只降级、不改状态：卡顿可能是暂时的，
      // 改状态会让 UI 闪成 error 再闪回来。
      if (tryDegradeToEmbed('流中断') === true) return;
      if (status === 'playing') publishState('stalled');
    };
  }

  let lastTimeEmit = 0;

  /* ---------------- 精确循环点（预置音景） ---------------- */

  /**
   * 当前轨是否带可用的循环点。
   * 判据：loopEnd 有限且 > 0，且 loopEnd > loopStart（loopStart 视为 0 或正数）。
   * loopStart === 0 且 loopEnd 约等于文件时长的情形，走原生 audio.loop 更稳；
   * 但只要 loopEnd 明确小于文件末尾，就必须靠 timeupdate 守卫。
   */
  function hasLoopPoint() {
    if (current === null) return false;
    const start = typeof current.loopStart === 'number' ? current.loopStart : 0;
    const end = typeof current.loopEnd === 'number' ? current.loopEnd : null;
    if (end === null || Number.isFinite(end) === false || end <= 0) return false;
    return end > start;
  }

  /** 手动回卷到 loopStart：先设 currentTime 再 play，避免在暂停状态下设时间不生效。 */
  function restartLoopPoint() {
    if (audio === null) return;
    const start = typeof current.loopStart === 'number' ? current.loopStart : 0;
    try {
      audio.currentTime = start;
    } catch (_error) {
      /* 元数据还没到时 currentTime 可能抛，忽略，下次 timeupdate 再来 */
    }
    currentTime = start;
    void play();
  }

  /**
   * timeupdate 级的循环点守卫。
   * 三件事：
   *   1. 还没到 loopStart 就先跳进去（音景要求从循环段开始听，不是从头听）。
   *   2. 越过 loopEnd 立刻回卷到 loopStart。
   *   3. 允许误差 0.15s：timeupdate 是 4~66Hz 触发的，卡太死会在边界上抖。
   */
  function enforceLoopPoint() {
    if (audio === null || hasLoopPoint() === false) return;
    if (status !== 'playing') return;
    const start = typeof current.loopStart === 'number' ? current.loopStart : 0;
    const end = typeof current.loopEnd === 'number' ? current.loopEnd : null;
    if (end === null) return;
    const EPSILON = 0.15;
    if (audio.currentTime >= end - EPSILON) {
      try {
        audio.currentTime = start;
      } catch (_error) {
        /* 目标时间不可寻时忽略 */
      }
      currentTime = start;
      return;
    }
    // 起始点：用户 seek 到 loopStart 之前时，把播放头拉进循环段。
    if (start > 0 && audio.currentTime > 0 && audio.currentTime < start - EPSILON) {
      try {
        audio.currentTime = start;
      } catch (_error) {
        /* 同上 */
      }
      currentTime = start;
    }
  }

  /* ---------------- B 站双轨降级 ---------------- */

  /**
   * 流代理失败时降级到 iframe 播放器。只降一次。
   *
   * 为什么必须是「降级到 embed」而不是「重试 stream」：
   * stream 走的是我们自己的 host 代理，它失败通常意味着上游 playurl 拿不到、
   * Referer 校验被拦、或者地区限制 —— 这些都不会因为重试而好转，
   * 重试只会让用户听到一串失败音。
   *
   * @param {string} reason 失败原因，进 onError 让用户能看见
   * @returns {boolean} 真的降级了返回 true
   */
  function tryDegradeToEmbed(reason) {
    if (current === null) return false;
    if (typeof current.embedUrl !== 'string' || current.embedUrl === '') return false;
    if (current.kind === KIND_EXTERNAL_EMBED) return false;
    if (degradedTracks.has(current.id) === true) return false;
    degradedTracks.add(current.id);
    if (typeof current.revoke === 'function') {
      try {
        current.revoke();
      } catch (_error) {
        /* objectURL 已释放过 */
      }
    }
    // 注意：已经建过的 MediaElementSource 仍然绑在这个 audio 元素上，
    // 不能断开重连（重连会抛 InvalidStateError），只能把元素停掉、静音。
    detachAudio();
    clearSpectrum();
    try {
      if (gain !== null) gain.gain.value = 0;
    } catch (_error) {
      /* 图还没建，没有可静音的 */
    }
    mode = 'external';
    spectrumAvailable = false;
    currentTime = 0;
    duration = null;
    lastError = { phase: 'degrade', message: `流代理失败（${reason}），已切到内嵌播放器`, at: Date.now() };
    emit(errorListeners, lastError);
    publishTrack('degrade');
    publishTime();
    publishState('mode-external');
    return true;
  }

  /** 让 <audio> 与当前 track 解绑，但不销毁元素（它绑死了 MediaElementSource）。 */
  function detachAudio() {
    if (audio === null) return;
    try {
      audio.pause();
    } catch (_error) {
      /* 未加载时 pause 可能抛，忽略 */
    }
    audio.removeAttribute('src');
    audio.load();
  }

  /** 清空 analyser 里的残留频谱（外部播放器模式下必须做，否则会留一小段假数据）。 */
  function clearSpectrum() {
    if (analyser === null) return;
    const bins = analyser.frequencyBinCount;
    if (frequencyBin === null || frequencyBin.length !== bins) frequencyBin = new Uint8Array(bins);
    for (let i = 0; i < bins; i += 1) frequencyBin[i] = 0;
  }

  /**
   * 切到外部播放器模式。内部 audio 必须彻底停，否则两种声音会叠在一起。
   * 这里刻意不创建 MediaElementSource —— 它一旦创建就永久绑死那个元素，
   * 而外部模式根本不需要它。
   */
  function enterExternalMode(track) {
    detachAudio();
    clearSpectrum();
    mode = 'external';
    spectrumAvailable = false;
    status = 'playing';
    currentTime = 0;
    duration = null;
    lastError = null;
    void track;
    publishTime();
    publishState('mode-external');
  }

  /** 从外部模式回到内部模式：清掉 embedUrl 相关的 UI 状态，重建（或复用）音频图。 */
  function enterInternalMode(track, src) {
    mode = 'internal';
    spectrumAvailable = true;
    lastError = null;
    try {
      ensureGraph();
    } catch (error) {
      fail(error, 'graph');
      return false;
    }
    // 上个音源可能是降级路径把 gain 拧到 0 的，回内部模式必须恢复，否则「没声音」。
    if (gain !== null) gain.gain.value = muted ? 0 : volume;
    status = 'loading';
    currentTime = 0;
    duration = track && track.duration !== null ? track.duration : null;
    if (audio !== null && typeof src === 'string' && src !== '') {
      audio.src = src;
      // loopStart 从 0 起、loopEnd 恰好是文件时长的那种音景，用原生 loop 最稳；
      // 其余交给 timeupdate 守卫（enforceLoopPoint）。
      audio.loop = typeof track.loopStart !== 'number' || track.loopStart === 0 ? hasLoopPoint() : false;
      audio.load();
    }
    publishTime();
    publishState('mode-internal');
    return true;
  }

  /**
   * 由 track 解析出要喂给 <audio> 的地址。
   *
   * B 站音源是双轨的：streamUrl 优先（走我们自己的 /api 代理，同源、能进频谱），
   * embedUrl 是兜底。**绝不把 B 站 CDN 直链塞进 audio.src** —— 那个地址带 Referer
   * 校验，浏览器里必然 403，而且跨域后连 CORS 都过不了。
   *
   * @returns {{ src: string|null, external: boolean }}
   */
  function resolvePlayback(track) {
    if (track === null || track === undefined) return { src: null, external: false };
    if (track.kind === KIND_EXTERNAL_EMBED) {
      return { src: null, external: true };
    }
    const stream = typeof track.streamUrl === 'string' && track.streamUrl !== '' ? track.streamUrl : null;
    if (stream !== null) return { src: stream, external: false };
    return { src: null, external: false };
  }

  /**
   * 播放指定队列位置。
   * @param {number} position
   * @param {{ autoplay?: boolean, publishTrack?: boolean }} [options]
   * @returns {Promise<boolean>}
   */
  async function loadAt(position, options) {
    const opts = options || {};
    if (disposed) return false;
    if (position < 0 || position >= queue.length) {
      lastError = { phase: 'load', message: '队列位置越界', at: Date.now() };
      fail(lastError, 'load');
      return false;
    }

    // 先把上一条本地音源的 objectURL 收掉，防止长会话里 blob 泄漏。
    if (current !== null && current !== queue[position] && typeof current.revoke === 'function') {
      try {
        current.revoke();
      } catch (_error) {
        /* revoke 失败不影响切歌 */
      }
    }

    index = position;
    current = queue[position];
    status = 'loading';
    lastError = null;
    currentTime = 0;
    duration = current.duration !== null ? current.duration : null;
    if (opts.publishTrack !== false) publishTrack('load');
    publishQueue();

    if (current.kind === KIND_EXTERNAL_EMBED) {
      enterExternalMode(current);
      if (current.embedUrl === null) {
        fail(new Error(current.unavailableReason || '外部播放器地址无效'), 'embed');
        return false;
      }
      return true;
    }

    // 双轨 B 站音源：streamUrl 优先走内部音频图；拿不到就当场降到 embed，
    // 不做「先播失败再降级」——那会白等一次超时。
    const plan = resolvePlayback(current);
    let loaded = null;
    try {
      loaded = await current.load();
    } catch (error) {
      if (tryDegradeToEmbed('加载失败') === true) {
        if (opts.autoplay !== false) return await play();
        return true;
      }
      fail(error, 'load');
      return false;
    }
    if (disposed) return false;
    const src = plan.src !== null ? plan.src : loaded ? loaded.src : null;
    if (src === null && typeof current.embedUrl === 'string' && current.embedUrl !== '') {
      enterExternalMode(current);
      return true;
    }
    const ok = enterInternalMode(current, src);
    if (ok === false) return false;
    if (opts.autoplay !== false) return await play();
    status = 'paused';
    publishState('loaded');
    return true;
  }

  /* ---------------- 公开 API ---------------- */

  /**
   * 播放。首次调用一定是用户手势触发的（按钮 / drop / 键盘），
   * 所以在这里 resume AudioContext 是合规的。
   * @returns {Promise<boolean>} 是否真的开始了播放
   */
  async function play() {
    if (disposed) return false;
    if (current === null) {
      if (queue.length === 0) return false;
      return await loadAt(index >= 0 ? index : 0);
    }
    if (current.kind === KIND_EXTERNAL_EMBED) {
      // 外部播放器：引擎管不到 iframe 内部，只能把状态切成「播放中」，
      // 真实播放由 UI 的 iframe + 用户点击决定。
      mode = 'external';
      spectrumAvailable = false;
      status = 'playing';
      autoplayBlocked = false;
      publishState('play-external');
      return true;
    }
    // 降级过的音源：当前是外部模式，audio 元素已被停并静音，不能再调 play()。
    if (mode === 'external') {
      status = 'playing';
      autoplayBlocked = false;
      publishState('play-external');
      return true;
    }

    try {
      ensureGraph();
    } catch (error) {
      fail(error, 'graph');
      return false;
    }

    try {
      if (context !== null && context.state === 'suspended') {
        await context.resume();
      }
    } catch (_error) {
      /* resume 失败通常是无手势；下面 play() 也会失败，统一在 catch 里处理 */
    }

    if (audio === null) return false;
    try {
      await audio.play();
      status = 'playing';
      autoplayBlocked = false;
      publishState('play');
      return true;
    } catch (error) {
      const name = error && typeof error.name === 'string' ? error.name : '';
      if (name === 'NotAllowedError') {
        autoplayBlocked = true;
        status = 'paused';
        lastError = { phase: 'autoplay', message: '浏览器拦下了自动播放，点一下播放按钮即可', at: Date.now() };
        emit(errorListeners, lastError);
        publishState('autoplay-blocked');
        return false;
      }
      fail(error, 'play');
      return false;
    }
  }

  function pause() {
    if (disposed) return;
    if (mode === 'external') {
      status = 'paused';
      publishState('pause-external');
      return;
    }
    if (audio !== null) {
      try {
        audio.pause();
      } catch (_error) {
        /* 未加载时 pause 可能抛 */
      }
    }
    status = 'paused';
    publishState('pause');
  }

  function toggle() {
    if (status === 'playing') {
      pause();
      return Promise.resolve(false);
    }
    return play();
  }

  /**
   * 跳转。外部模式下没有可跳的时间轴，直接拒绝并说明。
   * @param {number} seconds
   * @param {{ relative?: boolean }} [options]
   */
  function seek(seconds, options) {
    if (disposed) return false;
    if (current !== null && current.seekable === false) return false;
    if (audio === null || duration === null) return false;
    const target = (options && options.relative ? currentTime : 0) + Number(seconds);
    if (Number.isFinite(target) === false) return false;
    const clamped = Math.min(duration, Math.max(0, target));
    try {
      audio.currentTime = clamped;
    } catch (_error) {
      return false;
    }
    currentTime = clamped;
    publishTime();
    return true;
  }

  /**
   * 下一首。
   * @param {boolean} [auto] true 表示是播完自动切的，此时 loopMode 已由 onended 判定
   */
  async function next(auto) {
    if (disposed) return false;
    if (queue.length === 0) return false;
    if (index < 0) return await loadAt(0);

    if (loopMode === 'one' && auto === true) {
      seek(0);
      return await play();
    }

    // 随机：从「不是当前这首」里挑，队列只有一首时就是它自己。
    if (loopMode === 'all' && queue.length > 1 && randomEnabled === true) {
      let pick = index;
      while (pick === index) pick = Math.floor(Math.random() * queue.length);
      return await loadAt(pick);
    }

    const atEnd = index >= queue.length - 1;
    if (atEnd) {
      if (loopMode === 'off') {
        status = 'ended';
        publishState('queue-end');
        return false;
      }
      return await loadAt(0);
    }
    return await loadAt(index + 1);
  }

  async function prev() {
    if (disposed) return false;
    if (queue.length === 0) return false;
    if (index <= 0) {
      if (loopMode === 'off') {
        seek(0);
        return true;
      }
      return await loadAt(queue.length - 1);
    }
    return await loadAt(index - 1);
  }

  /** 随机由 UI 决定是否开启；引擎只提供开关，避免把「循环三态」和「随机」混成一个状态。 */
  let randomEnabled = false;

  /* ---------------- 队列操作 ---------------- */

  /**
   * 批量入队。若当前没有在播，自动把第一首设为当前曲但**不自动播放**
   * （自动播放的策略由调用方通过 playAfterAdd 显式控制）。
   * @param {object[]} tracks
   * @param {{ playFirst?: boolean, startAt?: number }} [options]
   * @returns {Promise<number>} 返回第一首新曲在队列里的下标，没入队返回 -1
   */
  async function add(tracks, options) {
    if (disposed) return -1;
    const list = Array.isArray(tracks) ? tracks.filter((track) => track && typeof track === 'object') : [];
    if (list.length === 0) return -1;
    const opts = options || {};
    const startPosition = queue.length;
    for (const track of list) queue.push(track);
    publishQueue();

    const shouldStart = opts.playFirst === true && current === null;
    if (shouldStart) return (await loadAt(startPosition, { autoplay: true })) ? startPosition : -1;
    if (current === null) return startPosition;
    return -1;
  }

  /** 一次加入若干本地 File（拖拽 / 文件选择框）。返回被跳过的非音频数量。 */
  function addFiles(fileList, options) {
    const result = tracksFromFiles(fileList, options);
    const opts = options || {};
    void result.tracks;
    return add(result.tracks, { playFirst: opts.playFirst === true }).then((position) => ({
      position,
      added: result.tracks.length,
      skipped: result.skipped,
      total: result.total,
    }));
  }

  /** 加入一条直链音频。 */
  function addUrl(url, options) {
    const track = createUrlTrack({ url, title: options && options.title, artist: options && options.artist });
    return add([track], options);
  }

  /**
   * 加入一条外部嵌入（B 站）。地址解析不出来时仍然入队，
   * 但带着 unavailableReason，切到它时 engine 会走 error 分支并在 UI 说明原因。
   * @returns {Promise<number>}
   */
  function addEmbed(url, options) {
    const track = createEmbedTrack({ url, title: options && options.title, artist: options && options.artist });
    return add([track], options);
  }

  /** 从预置清单批量入队。 */
  function addManifest(items, options) {
    const tracks = tracksFromManifest(items, options);
    return add(tracks, options);
  }

  /**
   * 加入一条 B 站音源（双轨：流代理主路 + iframe 兜底）。
   * 需要 cid 才能走流代理；只有 bvid 时就只能落到 iframe。
   * @param {{ bvid?: string, cid?: string|number, aid?: string, page?: number,
   *           title?: string, artist?: string, duration?: number, embedUrl?: string }} spec
   * @param {{ playFirst?: boolean }} [options]
   * @returns {Promise<number>}
   */
  function addBilibili(spec, options) {
    const track = createBilibiliTrack(spec || {});
    return add([track], options);
  }

  /**
   * 加入一条平台曲目（网易云 / QQ 音乐）。
   *
   * 与 addEmbed 的关键区别：这里的地址是宿主签发的票据路径，**能进音频图**，
   * 频谱是真的；addEmbed 挂的是 iframe，频谱恒停。
   * 没有票据时（VIP 曲）仍然入队，但带着 unavailableReason，
   * 切到它时 engine 走 error 分支并在 UI 说明「需要会员，可跳原平台」。
   *
   * @param {{ streamPath?: string, pageUrl?: string, title?: string, artist?: string,
   *           duration?: number, platform?: string, id?: string, reason?: string,
   *           cover?: string, sourceUrl?: string }} spec
   * @param {{ playFirst?: boolean }} [options]
   * @returns {Promise<number>}
   */
  function addPlatform(spec, options) {
    const track = createPlatformTrack(spec || {});
    return add([track], options);
  }

  /**
   * 按 presets.play() 的结果入队。三条分支（audio / iframe / external）在这里收口，
   * UI 不需要知道 presets 的返回形状。
   *
   * external 分支不入队 —— 它只是「跳转」，队列里躺一条永远不会播的条目是噪音。
   * 调用方拿到 null 后自己去 openExternal。
   *
   * @param {object} played presets.play() 的返回值
   * @param {object} item 清单条目（提供标题 / loop 点等元数据）
   * @param {{ baseUrl?: string }} [options]
   * @returns {Promise<{ position: number|null, route: string, reason: string|null }>}
   */
  async function addPresetPlay(played, item, options) {
    const resolved = resolvePresetRoute(played);
    const meta = item || {};
    if (resolved.route === 'external') {
      return { position: null, route: 'external', reason: resolved.reason };
    }
    if (resolved.route === 'iframe') {
      const url = typeof meta.embedUrl === 'string' ? meta.embedUrl : '';
      const track = createEmbedTrack({
        url,
        title: meta.name,
        artist: '预置音景',
        id: typeof meta.id === 'string' ? `preset:${meta.id}:embed` : undefined,
      });
      track.loopStart = null;
      track.loopEnd = null;
      const position = await add([track], options);
      return { position, route: 'iframe', reason: resolved.reason };
    }
    // audio 分支：B 站的走双轨，其余走清单条目。
    if (typeof played.bvid === 'string' && played.bvid !== '') {
      const track = createBilibiliTrack({
        bvid: played.bvid,
        cid: played.cid,
        page: meta.page,
        title: meta.name,
        artist: '预置音景',
        duration: meta.duration,
        embedUrl: meta.embedUrl,
      });
      track.loopStart = typeof played.loopStart === 'number' ? played.loopStart : track.loopStart;
      track.loopEnd = typeof played.loopEnd === 'number' ? played.loopEnd : track.loopEnd;
      const position = await add([track], options);
      return { position, route: 'audio', reason: resolved.reason };
    }
    const track = createPresetTrack(
      {
        ...meta,
        url: typeof played.url === 'string' ? played.url : meta.url,
        file: typeof played.file === 'string' ? played.file : meta.file,
      },
      options,
    );
    const position = await add([track], options);
    return { position, route: 'audio', reason: resolved.reason };
  }

  /**
   * 移除某一项。
   * 移除正在播的那首时：停播并落到它后面的那一首；如果移除的是最后一首，退到前一首。
   * 之所以不继续播下一首：用户点的是「移除」，不是「跳过」。
   */
  function remove(position) {
    if (disposed) return -1;
    if (position < 0 || position >= queue.length) return -1;
    const removed = queue[position];
    const wasCurrent = position === index;

    if (removed !== queue.find((track) => track === removed)) {
      /* 上面这行在正常数组里永远为 false，仅用于防御重复引用导致的误删 */
    }

    queue.splice(position, 1);

    if (wasCurrent) {
      if (typeof removed.revoke === 'function') removed.revoke();
      detachAudio();
      clearSpectrum();
      current = null;
      index = -1;
      currentTime = 0;
      duration = null;
      status = 'idle';
      if (queue.length > 0) {
        const landing = Math.min(position, queue.length - 1);
        publishQueue();
        publishTrack('removed');
        publishState('removed-current');
        void loadAt(landing, { autoplay: false });
        return landing;
      }
      publishQueue();
      publishTrack('removed');
      publishState('queue-empty');
      return -1;
    }

    if (position < index) index -= 1;
    publishQueue();
    publishState('removed');
    return position;
  }

  /** 清空队列并停播。所有 objectURL 一并 revoke。 */
  function clear() {
    if (disposed) return;
    detachAudio();
    clearSpectrum();
    for (const track of queue) {
      if (track && typeof track.revoke === 'function') {
        try {
          track.revoke();
        } catch (_error) {
          /* 单条释放失败不阻断整体清理 */
        }
      }
    }
    queue = [];
    index = -1;
    current = null;
    currentTime = 0;
    duration = null;
    status = 'idle';
    lastError = null;
    mode = 'internal';
    spectrumAvailable = false;
    publishQueue();
    publishTrack('cleared');
    publishTime();
    publishState('cleared');
  }

  /* ---------------- 设置 ---------------- */

  function setVolume(value) {
    volume = clamp01(value);
    if (gain !== null && context !== null) {
      try {
        gain.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.01);
      } catch (_error) {
        gain.gain.value = muted ? 0 : volume;
      }
    }
    publishState('volume');
    return volume;
  }

  function setMuted(next) {
    muted = next === true;
    if (gain !== null && context !== null) {
      try {
        gain.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.01);
      } catch (_error) {
        gain.gain.value = muted ? 0 : volume;
      }
    }
    publishState('muted');
    return muted;
  }

  function setLoopMode(next) {
    loopMode = LOOP_ORDER.includes(next) ? next : 'all';
    publishState('loop');
    return loopMode;
  }

  /** UI 的按钮用这个：off -> all -> one -> off。 */
  function cycleLoopMode() {
    const at = LOOP_ORDER.indexOf(loopMode);
    return setLoopMode(LOOP_ORDER[(at + 1) % LOOP_ORDER.length]);
  }

  function setRandom(next) {
    randomEnabled = next === true;
    publishState('random');
    return randomEnabled;
  }

  function setAllowAutoplay(next) {
    allowAutoplay = next === true;
    publishState('autoplay-setting');
    return allowAutoplay;
  }

  /* ---------------- 订阅 ---------------- */

  /** 每次切换当前曲目推一次。 */
  function onTrackChange(listener) {
    if (typeof listener !== 'function') return () => {};
    trackListeners.add(listener);
    if (current !== null) {
      try {
        listener({ ...describeTrack(current), reason: 'subscribe', index });
      } catch (_error) {
        /* 首次回放失败不影响订阅 */
      }
    }
    return () => {
      trackListeners.delete(listener);
    };
  }

  /** 状态（播放/暂停/模式/音量/循环）变化推一次。 */
  function onStateChange(listener) {
    if (typeof listener !== 'function') return () => {};
    stateListeners.add(listener);
    try {
      listener({ ...snapshot(), reason: 'subscribe' });
    } catch (_error) {
      /* 同上 */
    }
    return () => {
      stateListeners.delete(listener);
    };
  }

  /** 播放进度推（频控 250ms），外部模式下不推。 */
  function onTimeUpdate(listener) {
    if (typeof listener !== 'function') return () => {};
    timeListeners.add(listener);
    return () => {
      timeListeners.delete(listener);
    };
  }

  function onQueueChange(listener) {
    if (typeof listener !== 'function') return () => {};
    queueListeners.add(listener);
    try {
      listener({
        items: queue.map((track, position) => ({ ...describeTrack(track), index: position, current: position === index })),
        currentIndex: index,
      });
    } catch (_error) {
      /* 同上 */
    }
    return () => {
      queueListeners.delete(listener);
    };
  }

  function onError(listener) {
    if (typeof listener !== 'function') return () => {};
    errorListeners.add(listener);
    return () => {
      errorListeners.delete(listener);
    };
  }

  /** 取消全部订阅：面板卸载时调用，不断音乐。 */
  function unsubscribeAll() {
    trackListeners.clear();
    stateListeners.clear();
    timeListeners.clear();
    queueListeners.clear();
    errorListeners.clear();
  }

  /* ---------------- 频谱出口（visuals 依赖） ---------------- */

  /**
   * 拿 AnalyserNode 给频谱组件用。
   * 外部播放器模式返回 null —— 不是返回一个静音的 analyser，
   * 让 visuals 用一次 null 判断就能同时处理「没有图」和「不该画」。
   * @returns {AnalyserNode | null}
   */
  function getAnalyser() {
    if (mode === 'external') return null;
    return analyser;
  }

  /**
   * 直接把当前频谱写进调用方给的缓冲，省掉 visuals 自己管 buffer。
   * 返回 false 表示这一帧没有可用数据（外部模式 / 未建图），
   * 调用方应画静止占位而不是画前一帧的残留。
   * @param {Uint8Array} target
   * @returns {boolean}
   */
  function readSpectrum(target) {
    if (analyser === null || target === null || typeof target === 'undefined') return false;
    if (mode === 'external') {
      target.fill(0);
      return false;
    }
    try {
      analyser.getByteFrequencyData(target);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /* ---------------- 双轨降级的公开入口 ---------------- */

  /**
   * 手动降级当前 B 站音源（UI 上给一个「切换播放器」按钮用）。
   * 自动降级由 onerror / onstalled 触发，这个方法只是把同一件事暴露出去。
   * @returns {boolean} 是否真的降级
   */
  function degradeCurrent() {
    return tryDegradeToEmbed('手动切换');
  }

  /* ---------------- 释放 ---------------- */

  /**
   * 销毁：只在页面卸载 / 插件停用时调用。
   *
   * 顺序很重要：先停元素、再断节点、最后 close context。
   * reverse 顺序会让 ensureGraph 之后的引用指向一个已关闭的 context。
   * @returns {Promise<void>}
   */
  async function dispose() {
    if (disposed) return;
    disposed = true;

    unsubscribeAll();

    for (const track of queue) {
      if (track && typeof track.revoke === 'function') {
        try {
          track.revoke();
        } catch (_error) {
          /* 逐条释放，单条失败继续 */
        }
      }
    }
    if (current !== null && typeof current.revoke === 'function') {
      try {
        current.revoke();
      } catch (_error) {
        /* 上面已经覆盖过同一对象，这里只是兜底 */
      }
    }
    queue = [];
    current = null;
    index = -1;

    if (audio !== null) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch (_error) {
        /* 元素已失效 */
      }
      try {
        if (audio.parentNode) audio.parentNode.removeChild(audio);
      } catch (_error) {
        /* 不在文档里 */
      }
      audio.onloadedmetadata = null;
      audio.oncanplay = null;
      audio.onplaying = null;
      audio.onpause = null;
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
      audio = null;
    }

    try {
      if (sourceNode !== null) sourceNode.disconnect();
    } catch (_error) {
      /* 已断开 */
    }
    try {
      if (gain !== null) gain.disconnect();
    } catch (_error) {
      /* 已断开 */
    }
    try {
      if (analyser !== null) analyser.disconnect();
    } catch (_error) {
      /* 已断开 */
    }
    sourceNode = null;
    gain = null;
    analyser = null;
    frequencyBin = null;

    const closing = context;
    context = null;
    if (closing !== null) {
      try {
        await closing.close();
      } catch (_error) {
        /* 已关闭 */
      }
    }
    status = 'idle';
    mode = 'internal';
    spectrumAvailable = false;
  }

  /** 只读快照，给 UI 首屏同步用（不需要先订阅一次）。 */
  function getState() {
    return snapshot();
  }

  function getQueue() {
    return queue.map((track, position) => ({ ...describeTrack(track), index: position, current: position === index }));
  }

  function getCurrent() {
    return current === null ? null : describeTrack(current);
  }

  /** 是否真的有过音频图（调试用；不参与业务判断）。 */
  function hasGraph() {
    return context !== null;
  }

  /**
   * 频谱组件（ui/Spectrum.jsx）直接读 `engine.analyser`，那是属性不是方法。
   * 用 getter 维持属性形态：既能读出当前 AnalyserNode，又天然反映模式切换
   * （外部播放器模式自动变 null），且不需要 UI 每次 state 变化后重新取值。
   */
  return {
    get analyser() {
      return getAnalyser();
    },
    /** visuals 判断「该不该画」的第二个出口，与 state.spectrumAvailable 同源。 */
    get spectrumAvailable() {
      return mode !== 'external' && spectrumAvailable;
    },
    get mode() {
      return mode;
    },
    // 播放控制
    play,
    pause,
    toggle,
    seek,
    next,
    prev,
    // 队列
    add,
    addFiles,
    addUrl,
    addEmbed,
    addBilibili,
    addPlatform,
    addPresetPlay,
    addManifest,
    remove,
    clear,
    loadAt,
    // 设置
    setVolume,
    setMuted,
    setLoopMode,
    cycleLoopMode,
    setRandom,
    setAllowAutoplay,
    // 订阅
    onTrackChange,
    onStateChange,
    onTimeUpdate,
    onQueueChange,
    onError,
    unsubscribeAll,
    // 频谱出口
    getAnalyser,
    readSpectrum,
    degradeCurrent,
    // 只读
    getState,
    getQueue,
    getCurrent,
    hasGraph,
    // 生命周期
    dispose,
    // 常量
    LOOP_MODES,
  };
}

/* ---------------- 单例 ---------------- */

/** @type {ReturnType<typeof createEngine> | null} */
let singleton = null;

/**
 * 取全局引擎。
 *
 * 用 window 上的 Symbol 兜底而不是裸模块变量：
 * 插件被重复 materialize（HMR / 双份 bundle）时，两次 import 会拿到两个模块实例，
 * 单例也就成了两个，表现为「切面板后有两路声音」。
 * 挂在 window 上能以极低成本消除这个整类故障。
 * @returns {object}
 */
export function getEngine() {
  if (typeof window !== 'undefined') {
    const key = '__dsh_music_on_engine__';
    const existing = window[key];
    if (existing && typeof existing.play === 'function') return existing;
    const created = createEngine();
    window[key] = created;
    return created;
  }
  if (singleton === null) singleton = createEngine();
  return singleton;
}

/**
 * 显式销毁全局引擎并从 window 上摘掉引用。
 * 用于插件停用 / 页面卸载；测试里也用它保证用例之间不串味。
 * @returns {Promise<void>}
 */
export async function disposeEngine() {
  if (typeof window !== 'undefined') {
    const key = '__dsh_music_on_engine__';
    const existing = window[key];
    if (existing && typeof existing.dispose === 'function') await existing.dispose();
    try {
      delete window[key];
    } catch (_error) {
      window[key] = null;
    }
  }
  if (singleton !== null) {
    await singleton.dispose();
    singleton = null;
  }
}

export { createEngine };
