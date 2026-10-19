/**
 * Node 环境下的引擎烟测（无浏览器）。
 *
 * 目的：验证「不需要 AudioContext 也能验的逻辑」——
 * 队列、外部模式切换、双轨降级只降一次、循环点判定、dispose。
 * 真正出声的部分必须手工在浏览器里听，这里不假装验证过。
 *
 * 跑法：node --input-type=module < scripts/smoke.mjs
 * 或：node scripts/smoke.mjs
 *
 * 注意：本脚本用最小 DOM/AudioContext 桩件，不是 jsdom，也不进产品代码。
 */

const log = [];
const ok = (name) => log.push(`PASS ${name}`);
const bad = (name, detail) => log.push(`FAIL ${name} :: ${detail}`);

/* ---------------- 桩件 ---------------- */

const createdAudios = [];

function makeAudioStub() {
  const el = {
    src: '',
    currentTime: 0,
    duration: 100,
    loop: false,
    preload: '',
    style: {},
    paused: true,
    error: null,
    _handlers: {},
    setAttribute() {},
    removeAttribute() {},
    load() {},
    play() {
      el.paused = false;
      return Promise.resolve();
    },
    pause() {
      el.paused = true;
    },
  };
  el.addEventListener = () => {};
  for (const key of ['loadedmetadata', 'canplay', 'playing', 'pause', 'timeupdate', 'ended', 'error', 'stalled']) {
    Object.defineProperty(el, `on${key}`, {
      get() {
        return el._handlers[key] || null;
      },
      set(fn) {
        el._handlers[key] = fn;
      },
      configurable: true,
    });
  }
  createdAudios.push(el);
  return el;
}

class FakeAnalyser {
  constructor() {
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0.8;
    this.frequencyBinCount = 1024;
  }
  connect() {}
  disconnect() {}
  getByteFrequencyData(target) {
    target.fill(0);
  }
}

class FakeGain {
  constructor() {
    this.gain = { value: 1 };
  }
  connect() {}
  disconnect() {}
}

class FakeContext {
  constructor() {
    this.state = 'running';
    this.destination = {};
  }
  createGain() {
    return new FakeGain();
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
  createMediaElementSource() {
    return { connect() {}, disconnect() {} };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

globalThis.window = {
  AudioContext: FakeContext,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  body: { appendChild() {} },
  createElement(tag) {
    if (tag === 'audio') return makeAudioStub();
    return { style: {}, appendChild() {}, setAttribute() {} };
  },
};
let blobSeq = 0;
const revokedBlobs = [];
// 只覆盖两个静态方法，不能整个替换 globalThis.URL：
// sources.toEmbedUrl 里用的是 new URL(...) 做地址解析，换掉构造函数会把它一起打死。
globalThis.URL.createObjectURL = function createObjectURL() {
  blobSeq += 1;
  return `blob:fake/${blobSeq}`;
};
globalThis.URL.revokeObjectURL = function revokeObjectURL(u) {
  revokedBlobs.push(u);
};

/* ---------------- 被测模块 ---------------- */

const sources = await import('../src/client/sources.js');
const { createEngine } = await import('../src/client/engine.js');

/* ---------------- 用例 ---------------- */

// 1. 三种 kind 的 Track 形状
{
  const local = sources.createLocalTrack({ name: 'a.mp3', type: 'audio/mpeg', size: 1024 });
  const url = sources.createUrlTrack({ url: 'https://x.test/a.mp3', title: 'T' });
  const embed = sources.createEmbedTrack({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo' });
  if (local && local.kind === 'local-file') ok('local-file kind');
  else bad('local-file kind', String(local && local.kind));
  if (url.kind === 'url-audio' && url.seekable === true) ok('url-audio kind/seekable');
  else bad('url-audio', 'kind or seekable wrong');
  if (embed.kind === 'external-embed' && embed.duration === null && embed.seekable === false) ok('embed null duration/not seekable');
  else bad('embed shape', `duration=${embed.duration} seekable=${embed.seekable}`);
}

// 2. B 站双轨：streamUrl 走自家代理，绝不塞 CDN 直链
{
  const track = sources.createBilibiliTrack({ bvid: 'BV1Lyw7zPEeo', cid: '36737517327', title: 'Jazz' });
  const okStream = typeof track.streamUrl === 'string' && track.streamUrl.startsWith('/api/dsh-music-on/stream?');
  if (okStream) ok('bilibili streamUrl 同源代理');
  else bad('bilibili streamUrl', String(track.streamUrl));
  if (typeof track.embedUrl === 'string' && track.embedUrl.includes('player.bilibili.com')) ok('bilibili embedUrl 兜底');
  else bad('bilibili embedUrl', String(track.embedUrl));
  const loaded = await track.load();
  if (loaded.src === track.streamUrl) ok('bilibili load 优先 streamUrl');
  else bad('bilibili load', String(loaded.src));
}

// 3. 循环点：loopStart=0 必须被保住（不能被归一成 null）
{
  const track = sources.createUrlTrack({ url: 'https://example.invalid/a.wav', title: '雨声', loopStart: 0, loopEnd: 5.6 });
  if (track.loopStart === 0 && track.loopEnd === 5.6) ok('loopStart=0 保住');
  else bad('loopStart=0', `start=${track.loopStart} end=${track.loopEnd}`);
  const mid = sources.createUrlTrack({ url: 'https://example.invalid/b.wav', title: '中段', loopStart: 1.2, loopEnd: 4.4 });
  if (mid.loopStart === 1.2 && mid.loopEnd === 4.4) ok('mid 循环段保住');
  else bad('mid loop', `start=${mid.loopStart} end=${mid.loopEnd}`);
}

// 4. 引擎：外部模式让 spectrumAvailable=false、getAnalyser()=null、duration=null
{
  const engine = createEngine();
  await engine.add([sources.createEmbedTrack({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo' })], { playFirst: true });
  const state = engine.getState();
  if (state.spectrumAvailable === false) ok('external: spectrumAvailable=false');
  else bad('external spectrum', String(state.spectrumAvailable));
  if (engine.getAnalyser() === null) ok('external: getAnalyser()=null');
  else bad('external analyser', 'not null');
  if (state.duration === null && state.seekable === false) ok('external: duration=null seekable=false');
  else bad('external time', `duration=${state.duration} seekable=${state.seekable}`);
  await engine.dispose();
}

// 5. 降级链：只降一次，降完 mode=external、频谱关、analyser 为 null
{
  const engine = createEngine();
  const bili = sources.createBilibiliTrack({ bvid: 'BV1Lyw7zPEeo', cid: '36737517327', title: 'Jazz' });
  await engine.add([bili], { playFirst: true });
  const before = engine.getState();
  if (before.mode === 'internal' && before.spectrumAvailable === true) ok('stream 主路: internal + 频谱开');
  else bad('main path', `mode=${before.mode} spectrum=${before.spectrumAvailable}`);
  const first = engine.degradeCurrent();
  const after = engine.getState();
  if (first === true) ok('首次降级成功');
  else bad('degrade first', 'returned false');
  if (after.mode === 'external' && after.spectrumAvailable === false && engine.getAnalyser() === null) ok('降级后 external + 无频谱 + analyser=null');
  else bad('degrade state', JSON.stringify({ mode: after.mode, s: after.spectrumAvailable }));
  const second = engine.degradeCurrent();
  if (second === false) ok('二次降级被拒（不循环重试）');
  else bad('degrade twice', 'returned true');
  await engine.dispose();
}

// 6. dispose：关闭 context、revoke 所有 objectURL
{
  const engine = createEngine();
  // File 是只读属性集合，这里用带 name/type/size 的普通对象顶替：
  // sources.collectFiles 只要求 name 是字符串，createLocalTrack 只读 name/type/size。
  const fileA = { name: 'a.mp3', type: 'audio/mpeg', size: 8 };
  const fileB = { name: 'b.mp3', type: 'audio/mpeg', size: 8 };
  const beforeRevoke = revokedBlobs.length;
  await engine.addFiles([fileA, fileB], { playFirst: true });
  await engine.dispose();
  if (revokedBlobs.length > beforeRevoke) ok('dispose 释放了 objectURL');
  else bad('dispose revoke', `revoked=${revokedBlobs.length - beforeRevoke}`);
}

/* ---------------- 输出 ---------------- */

const failed = log.filter((line) => line.startsWith('FAIL'));
console.log(log.join('\n'));
console.log(`\n${log.length - failed.length}/${log.length} passed`);
if (failed.length > 0) process.exitCode = 1;
