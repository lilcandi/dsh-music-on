#!/usr/bin/env node
// 种子音景离线合成器 —— 生成 source:"embedded" 层的真实 WAV 文件并回写 manifest.json
//
// 用法：node presets/generate-seeds.mjs
//
// 设计要点
// - 只用 Node 内置模块（node:crypto / node:fs / node:path / node:url），零 npm 依赖。
// - 输出 44.1kHz / 16bit / 单声道 WAV，固定 8.000s 循环。
// - 循环接缝：所有正弦/谐波都按「时间轴绝对相位」计算（相位由全局样本索引决定，
//   不是局部重启），叠加尾部「折返」+ 首尾 0.25s 互补交叉淡化，so 循环点无爆音。
// - 噪声类使用固定种子 xorshift PRNG，脚本可重复执行得到字节级一致的文件。
// - 每跑一次都用真实字节重算 sha256 / sizeBytes / duration 写回 manifest.json，
//   绝不写占位值。非 embedded 条目一律保持 null。
//
// 音色说明（全部为原创合成，非采样、非第三方素材）
// - white-noise  均匀白噪声，去直流
// - rain         双级低通雨幕 + 带通随机雨滴瞬态（衰减 25-70ms）
// - cafe         粉噪声底 + 1.2-3.2kHz 人声共振带随机音节包络 + 稀疏杯碟叮声
// - beat         80BPM，正弦扫频 kick(110→48Hz) / 带通噪声 snare / 高通噪声 hihat
// - jazz         Dm9-G13-Cmaj9-A7b9，三角波加性合成 + 微 detune + 走路贝斯，88BPM 精确 8s
// - lofi         Fmaj9-Em7-Dm9-Cmaj7，正弦谐波 + 黑胶嘶声 + 极轻鼓点，80BPM 精确 8s

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, 'manifest.json');

const SR = 44100;
const BITS = 16;
const CHANNELS = 1;
const TAU = Math.PI * 2;
const XFADE_SEC = 0.25;
const LOOP_SEC = 5.6; // 5.600s @ 44.1k/16bit/单声道 ≈ 494KB，压在上限 500KB 以内

// ===========================================================================
// PRNG：xorshift64*，由 sha256(seed) 初始化，输出 [0,1)
// ===========================================================================
const MASK64 = (1n << 64n) - 1n;

function makeRng(...seedParts) {
  const digest = createHash('sha256').update(seedParts.join('\u0000')).digest();
  let state = 0n;
  for (let i = 0; i < 8; i++) state = (state << 8n) | BigInt(digest[i]);
  if (state === 0n) state = 0x9e3779b97f4a7c15n;
  return () => {
    state ^= (state >> 12n) & MASK64;
    state = (state ^ (state << 25n)) & MASK64;
    state ^= (state >> 27n) & MASK64;
    state &= MASK64;
    const out = (state * 2685821657736338717n) & MASK64;
    return Number(out >> 11n) / 9007199254740992;
  };
}

/** 取一段双极性噪声 [-1,1)。每次调用新建独立 RNG，确定性可复现。 */
function noiseArray(seed, count) {
  const rnd = makeRng('dsh-music-on', seed);
  const arr = new Float32Array(count);
  for (let i = 0; i < count; i++) arr[i] = rnd() * 2 - 1;
  return arr;
}

// ===========================================================================
// DSP 基元
// ===========================================================================

function lowpass1(x, cutoffHz) {
  const a = 1 - Math.exp((-TAU * cutoffHz) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = y;
  }
  return x;
}

function highpass1(x, cutoffHz) {
  const a = 1 - Math.exp((-TAU * cutoffHz) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] -= y;
  }
  return x;
}

/** Chamberlin 状态变量滤波器，返回 band（带通）与 low（低通）两路。 */
function svf(x, cutoffHz, q = 0.9) {
  const f = 2 * Math.sin((Math.PI * Math.min(Math.abs(cutoffHz), SR / 6)) / SR);
  const damp = 1 / q;
  let low = 0;
  let band = 0;
  const outBand = new Float32Array(x.length);
  const outLow = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const high = x[i] - low - damp * band;
    band += f * high;
    low += f * band;
    outBand[i] = band;
    outLow[i] = low;
  }
  return { band: outBand, low: outLow };
}

/** 按环形缓冲叠加：超出末尾的部分回绕到开头，循环点能量连续。 */
function addWrapped(dst, src, offset) {
  const n = dst.length;
  const off = ((Math.round(offset) % n) + n) % n;
  for (let i = 0; i < src.length; i++) {
    dst[(off + i) % n] += src[i];
  }
}

/** 一阶直流阻断。 */
function dcBlock(x) {
  const r = 1 - (TAU * 8) / SR;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - x1 + r * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y;
  }
  return x;
}

function peakOf(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > p) p = a;
  }
  return p;
}

/** 循环接缝跳变 / 内部平均相邻跳变。≤1 表示接缝比内部还平滑（理想）。 */
function seamRatio(x) {
  const n = x.length;
  const jump = Math.abs(x[0] - x[n - 1]);
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const d = x[i] - x[i - 1];
    acc += d < 0 ? -d : d;
  }
  const avg = acc / (n - 1);
  return avg > 0 ? jump / avg : jump;
}

function normalize(x, target = 0.89) {
  const p = peakOf(x);
  if (p < 1e-9) return x;
  const g = target / p;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/**
 * 环形首尾交叉淡化：在头部 `[0, fade)` 与尾部 `[n-fade, n)` 之间做互补加权。
 *
 * 数学：把尾部视为「循环中实际先播放」的一段，头部第 i 个样本应等于
 * `x[i]*w + x[n-fade+i]*(1-w)`，w 由 0 升到 1。
 * 但仅此还不够——真正决定接缝的是 out[n-1] → out[0] 这一跳，
 * 而 out[n-1] 属于尾巴末样本，两者在时间轴上相距 fade。要让这一步等于
 * 「正常的相邻样本差」，必须让头部前若干样本完全由尾巴支配（w≈0 区间足够长），
 * 因此 fade 取 0.25s 时，从 i=0 到 i≈fade/2 的样本都几乎等于尾巴对应位置。
 *
 * 踩过的坑：
 *  1. 曾把尾部也回填成混合值 → out[n-1] 变成头部内容，接缝恶化到 99×。
 *  2. 曾用 `x[(n-fade+i-1+n)%n]` 取尾巴 → 尾部末样本直接对齐头部末样本，99×。
 *  3. 曾把权重写成 1→0 → 同上。
 *
 * 所以真正的病灶不在权重方向，而在 `addWrapped` 之后的信号本身：
 * 尾巴末样本与头部首样本来自不同时间段，单纯头部混叠无法消除。
 * 折中方案：用环形平滑，把接缝附近的样本朝两侧均值收敛。
 */
function makeSeamless(x, fadeSec = XFADE_SEC) {
  const n = x.length;
  const fade = Math.min(Math.round(fadeSec * SR), Math.floor(n / 4));
  if (fade < 2) return new Float32Array(x);
  const out = new Float32Array(x);

  // 1) 标准头部环回混叠：让内容平滑过渡，避免听感上的「突兀」
  for (let i = 0; i < fade; i++) {
    const w = i / (fade - 1);
    out[i] = x[i] * w + x[n - fade + i] * (1 - w);
  }

  // 2) 接缝硬对齐：把最后 RAMP 个样本线性收拢到 out[0]，把前 RAMP 个样本
  //    线性从 out[n-1] 拉起。RAMP 取 1/4 淡化区，跨度足够覆盖低频周期。
  const ramp = Math.max(1, Math.round(fade / 4));
  for (let k = 0; k < ramp; k++) {
    const t = (k + 1) / (ramp + 1);          // (0,1)
    // 尾部：越靠末越贴近 out[0]
    const idxT = n - ramp + k;
    out[idxT] = out[idxT] * (1 - t) + out[0] * t;
    // 头部：越靠首越贴近 out[n-1]（用未改动的原值锚定）
    out[k] = out[k] * t + x[n - 1] * (1 - t);
  }
  return out;
}

/** Float32 → 44.1kHz/16bit/单声道 WAV（44 字节标准 PCM 头）。 */
function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(CHANNELS, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE((SR * CHANNELS * BITS) / 8, 28);
  h.writeUInt16LE((CHANNELS * BITS) / 8, 32);
  h.writeUInt16LE(BITS, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(dataBytes, 40);
  const body = Buffer.alloc(dataBytes);
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i];
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    const s = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
    body.writeInt16LE(s < -32768 ? -32768 : s > 32767 ? 32767 : s, i * 2);
  }
  return Buffer.concat([h, body]);
}

// ===========================================================================
// 六类音景合成
// ===========================================================================

function synthWhiteNoise(seconds) {
  const n = Math.round(SR * seconds);
  const nz = noiseArray('white-noise', n + SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = nz[i] * 0.85;
  return makeSeamless(dcBlock(out));
}

function synthRain(seconds) {
  const n = Math.round(SR * seconds);
  const nz = noiseArray('rain-bed', n + SR);

  // 雨幕：两级低通压暗，再加一点原始高频残留作为「雨丝」
  const bed = new Float32Array(n + SR);
  bed.set(nz);
  lowpass1(bed, 2600);
  lowpass1(bed, 5200);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bed[i] * 0.8 + nz[i] * 0.1;

  // 雨滴：稀疏瞬态，带通 1.4-4.0kHz，指数衰减
  const rnd = makeRng('dsh-music-on', 'rain-drops');
  const hits = Math.round(seconds * 110);
  for (let k = 0; k < hits; k++) {
    const start = Math.floor(rnd() * n);
    const len = Math.round(SR * (0.025 + rnd() * 0.045));
    const decay = 0.05 + rnd() * 0.07;
    const raw = new Float32Array(len);
    const inner = makeRng('drop', k, len);
    for (let i = 0; i < len; i++) raw[i] = (inner() * 2 - 1) * Math.exp(-i / (SR * decay));
    const bp = svf(raw, 1400 + rnd() * 2600, 2.4).band;
    const amp = 0.35 + rnd() * 1.1;
    for (let i = 0; i < len; i++) bp[i] *= amp;
    addWrapped(out, bp, start);
  }
  return makeSeamless(normalize(dcBlock(out), 0.88));
}

function synthCafe(seconds) {
  const n = Math.round(SR * seconds);
  const nz = noiseArray('cafe-bed', n + SR);

  // 粉噪近似（两级低通）+ 人声共振带
  const bed = new Float32Array(n + SR);
  bed.set(nz);
  lowpass1(bed, 700);
  lowpass1(bed, 900);

  const voiceSrc = new Float32Array(n + SR);
  for (let i = 0; i < voiceSrc.length; i++) voiceSrc[i] = nz[i] * 0.55 + bed[i] * 1.6;
  const voiceBand = svf(voiceSrc, 1900, 1.05).band;

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bed[i] * 1.1;

  // 随机「说话」段：0.4-1.4s，音节颤 1.5-3.5Hz
  const rnd = makeRng('dsh-music-on', 'cafe-voices');
  const segments = Math.round(seconds * 2.2);
  for (let s = 0; s < segments; s++) {
    const start = Math.floor(rnd() * n);
    const span = Math.round(SR * (0.4 + rnd() * 1.0));
    const amp = 0.35 + rnd() * 0.85;
    const rate = 1.5 + rnd() * 2.0;
    const phase = rnd() * TAU;
    for (let i = 0; i < span; i++) {
      const t = i / SR;
      const env = Math.sin((Math.PI * i) / span) ** 1.5;
      const syl = 0.45 + 0.55 * Math.abs(Math.sin(TAU * rate * t + phase));
      out[(start + i) % n] += voiceBand[start + i] * amp * env * syl * 0.55;
    }
  }

  // 杯碟叮声：2.6-4.0kHz 双正弦衰减
  const cupRnd = makeRng('dsh-music-on', 'cafe-cups');
  const cups = Math.max(2, Math.round(seconds * 0.9));
  for (let c = 0; c < cups; c++) {
    const start = Math.floor(cupRnd() * n);
    const len = Math.round(SR * 0.35);
    const f = 2600 + cupRnd() * 1400;
    const amp = 0.18 + cupRnd() * 0.32;
    const snd = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 14);
      snd[i] = (Math.sin(TAU * f * t) * 0.7 + Math.sin(TAU * f * 2.02 * t) * 0.3) * env * amp;
    }
    addWrapped(out, snd, start);
  }
  return makeSeamless(normalize(dcBlock(out), 0.82));
}

/**
 * 深夜酒吧：低频房间嗡鸣 + 极稀疏人声（远处交谈）+ 远处钢琴残响 + 偶发杯碟。
 * 与 cafe 白天的区别：更暗（低通 2.2k）、人声段密度降到 1/3、尾音更短、钢琴放在远处。
 */
function synthCafeNight(seconds) {
  const n = Math.round(SR * seconds);
  const nz = noiseArray('cafe-night-bed', n + SR);

  // 房间嗡鸣：两级低通压到 220Hz 附近，是「房间」而不是「人群」
  const rumble = new Float32Array(n + SR);
  rumble.set(nz);
  lowpass1(rumble, 220);
  lowpass1(rumble, 320);

  // 远处人声：共振带压到 1.2kHz 并大幅衰减，像隔着一堵墙
  const voiceSrc = new Float32Array(n + SR);
  for (let i = 0; i < voiceSrc.length; i++) voiceSrc[i] = nz[i] * 0.5 + rumble[i] * 2.0;
  const voiceBand = svf(voiceSrc, 1200, 0.85).band;

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rumble[i] * 2.2;

  // 稀疏人声：密度只有 cafe 的 1/3，单段更长、更轻
  const rnd = makeRng('dsh-music-on', 'cafe-night-voices');
  const segments = Math.max(1, Math.round(seconds * 0.75));
  for (let s = 0; s < segments; s++) {
    const start = Math.floor(rnd() * n);
    const span = Math.round(SR * (0.7 + rnd() * 1.6));
    const amp = 0.12 + rnd() * 0.22;
    const rate = 0.9 + rnd() * 1.2;
    const phase = rnd() * TAU;
    for (let i = 0; i < span; i++) {
      const t = i / SR;
      const env = Math.sin((Math.PI * i) / span) ** 2;
      const syl = 0.5 + 0.5 * Math.abs(Math.sin(TAU * rate * t + phase));
      // 源索引必须也回绕：voiceBand 只有 n+SR 长，start+i 越界会读出 undefined → NaN
      out[(start + i) % n] += voiceBand[(start + i) % n] * amp * env * syl * 0.4;
    }
  }

  // 远处钢琴：两小节 Am9 → Fmaj9，慢速、砍掉 2.4kHz 以上、无槌击，像从另一间房传来
  const bpm = 85.71428571428571;
  const barSec = (60 / bpm) * 4;
  const chords = [
    [57, 60, 64, 67], // A C E G
    [53, 57, 60, 64], // F A C E
  ];
  for (let bar = 0; bar * barSec < seconds - 1e-9; bar++) {
    const t0 = bar * barSec;
    const voicing = chords[bar % chords.length];
    addChord(out, t0, Math.min(barSec * 1.1, seconds - t0), voicing, 0.085, 9, {
      harmonics: 6,
      tilt: 0.42,
      cutoffHz: 2400,
      decaySec: 1.2,
    });
  }

  // 偶发杯碟：一把，音量压低、位置随机
  const cupRnd = makeRng('dsh-music-on', 'cafe-night-cups');
  const cupStart = Math.floor(cupRnd() * n);
  const cupLen = Math.round(SR * 0.45);
  const cupF = 2400 + cupRnd() * 600;
  const cup = new Float32Array(cupLen);
  for (let i = 0; i < cupLen; i++) {
    const t = i / SR;
    cup[i] = (Math.sin(TAU * cupF * t) * 0.6 + Math.sin(TAU * cupF * 2.01 * t) * 0.4) * Math.exp(-t * 9) * 0.09;
  }
  addWrapped(out, cup, cupStart);

  // 整体压暗：夜间没有明亮反射
  lowpass1(out, 2200);
  return makeSeamless(normalize(dcBlock(out), 0.78));
}

function synthBeat(seconds) {
  const n = Math.round(SR * seconds);
  const out = new Float32Array(n);
  const bpm = 80;
  const beatSec = 60 / bpm;

  const kickAt = (t0, vel = 1) => {
    const len = Math.round(SR * 0.34);
    const snd = new Float32Array(len);
    const base = Math.round(t0 * SR);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = 48 + 62 * Math.exp(-t * 26);
      phase += (TAU * f) / SR;
      const env = Math.exp(-t * 9.5);
      const click = t < 0.006 ? (1 - t / 0.006) * 0.45 : 0;
      snd[i] = (Math.sin(phase) * 0.95 + click) * env * vel;
    }
    addWrapped(out, snd, base);
  };

  const snareAt = (t0, vel = 1) => {
    const len = Math.round(SR * 0.22);
    const nz = noiseArray(`snare-${t0.toFixed(3)}`, len);
    const body = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 22);
      const tone = Math.sin(TAU * 186 * t) * Math.exp(-t * 30) * 0.5;
      body[i] = (nz[i] * 0.85 + tone) * env * vel;
    }
    const shaped = svf(body, 1500, 0.8).band;
    for (let i = 0; i < len; i++) shaped[i] *= 1.9;
    addWrapped(out, shaped, Math.round(t0 * SR));
  };

  const hatAt = (t0, vel = 1, open = false) => {
    const len = Math.round(SR * (open ? 0.26 : 0.06));
    const nz = noiseArray(`hat-${open ? 'o' : 'c'}-${t0.toFixed(3)}`, len);
    const hp = new Float32Array(nz);
    highpass1(hp, 7200);
    highpass1(hp, 5200);
    for (let i = 0; i < len; i++) {
      hp[i] *= Math.exp((-i / SR) * (open ? 12 : 55)) * 0.5 * vel;
    }
    addWrapped(out, hp, Math.round(t0 * SR));
  };

  const beats = Math.floor(seconds / beatSec);
  for (let b = 0; b < beats; b++) {
    const t = b * beatSec;
    if (b % 2 === 0) kickAt(t, 1.0);
    if (b % 2 === 0) kickAt(t + beatSec * 0.75, 0.28);
    if (b % 2 === 1) snareAt(t, 0.9);
    hatAt(t, 0.5);
    hatAt(t + beatSec / 2, 0.38);
    if (b % 4 === 3) hatAt(t + beatSec * 0.75, 0.32, true);
  }
  return makeSeamless(normalize(dcBlock(out), 0.9));
}

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * 加性和弦：谐波相位一律按「全局样本索引」计算 → 段落起点与循环点相位连续。
 * startSec 与 durSec 均以时间轴绝对值为准。
 *
 * options 用于做「远处钢琴」这类音色：tilt 控制奇偶谐波倾斜，cutoff 极高频封顶，
 * hammer 给 30ms 的槌击噪声，decaySec 控制衰减速度。
 */
function addChord(out, startSec, durSec, midiNotes, amp = 0.2, detuneCents = 6, options = {}) {
  const { harmonics = 8, tilt = 0.62, cutoffHz = SR / 2.2, hammer = 0, decaySec = 0.6 } = options;
  const len = Math.round(SR * durSec);
  const start = Math.round(startSec * SR);
  const voice = new Float32Array(len);
  const rnd = makeRng('dsh-music-on', 'chord', midiNotes.join(','), startSec.toFixed(4), String(tilt), String(harmonics));
  const attack = Math.max(1, Math.round(SR * 0.012));
  const release = Math.max(1, Math.round(SR * 0.09));

  for (const note of midiNotes) {
    const dCents = (rnd() * 2 - 1) * detuneCents;
    const f = midiHz(note) * Math.pow(2, dCents / 1200);
    const phase0 = rnd() * TAU;
    // 相位必须按「段内序号 i」计算，不能按全局样本索引 start+i。
    // 原因：addWrapped 会把越过末尾的部分回绕到开头，全局相位在回绕后不连续，
    // 循环接缝会出现巨大跳变（实测 79×）。按段内序号算，段尾与段头的相位差
    // 恰好等于 2π·f·len/SR 的整数化残差，交给 makeSeamless 的 0.25s 交叉淡化收口。
    const emit = (w, phaseBase, gain) => {
      for (let i = 0; i < len; i++) {
        voice[i] += Math.sin((w * i) / SR + phaseBase) * gain;
      }
    };
    let any = false;
    for (let h = 1; h <= harmonics; h++) {
      const hf = f * h;
      if (hf > cutoffHz) break;
      any = true;
      const hAmp = (h % 2 === 1 ? 1 : tilt) / Math.pow(h, 1.35);
      emit(TAU * hf, phase0 * h, hAmp * 0.42);
    }
    // 防御：远处/闷音色下基频可能已高于 cutoff，此时只保留基频，绝不留空段
    if (!any) emit(TAU * f, phase0, 0.42);
  }

  // 槌击噪声：只在起音 30ms 内，给「钢琴」一点实体感
  if (hammer > 0) {
    const hitLen = Math.min(len, Math.round(SR * 0.03));
    const nz = noiseArray(`hammer-${startSec.toFixed(4)}`, hitLen);
    const bp = svf(nz, 3200, 1.4).band;
    for (let i = 0; i < hitLen; i++) {
      voice[i] += bp[i] * Math.exp((-i / SR) * 90) * hammer;
    }
  }

  for (let i = 0; i < len; i++) {
    let env;
    if (i < attack) env = i / attack;
    else env = 0.55 + 0.45 * Math.exp(-(i - attack) / (SR * decaySec));
    if (i > len - release) env *= (len - i) / release;
    voice[i] *= env * amp;
  }
  addWrapped(out, voice, start);
}

function synthJazz(seconds) {
  const n = Math.round(SR * seconds);
  const out = new Float32Array(n);
  const bpm = 85.71428571428571; // 8 拍 @ 约 85.7BPM，使 2 小节 = 5.6s 精确成立
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;
  const bars = Math.round(seconds / barSec);
  if (Math.abs(bars * barSec - seconds) > 1e-6) {
    throw new Error(`jazz 循环长度须为 ${barSec.toFixed(4)}s 的整数倍，当前 ${seconds}s`);
  }

  const progression = [
    { bass: 38, voicing: [53, 57, 60, 64], label: 'Dm9' }, // D F A C E
    { bass: 31, voicing: [47, 53, 57, 60], label: 'G13' }, // G B F A C
    { bass: 36, voicing: [52, 55, 59, 62], label: 'Cmaj9' }, // C E G B D
    { bass: 33, voicing: [49, 55, 58, 61], label: 'A7b9' }, // A C# G Bb
  ];

  for (let i = 0; i < bars; i++) {
    const chord = progression[i % progression.length];
    const t0 = i * barSec;
    // 主和弦切两下（每小节两拍一次）
    addChord(out, t0, barSec * 0.48, chord.voicing, 0.19, 7);
    addChord(out, t0 + beatSec * 1.9, barSec * 0.5, chord.voicing, 0.155, 7);
    // 走路贝斯：每小节两拍
    const bassLen = Math.round(SR * beatSec * 0.95);
    const bass = new Float32Array(bassLen);
    const bf = midiHz(chord.bass - 12);
    for (let k = 0; k < bassLen; k++) {
      const t = k / SR;
      const env = Math.exp(-t * 2.6) * (1 - Math.exp(-t * 90));
      bass[k] = (Math.sin(TAU * bf * t) * 0.85 + Math.sin(TAU * bf * 2 * t) * 0.2) * env;
    }
    addWrapped(out, bass, Math.round(t0 * SR));
    addWrapped(out, bass, Math.round((t0 + beatSec * 2) * SR));
    // 刷镲
    const len = Math.round(SR * 0.22);
    const nz = noiseArray(`jazz-brush-${i}`, len);
    const hp = new Float32Array(nz);
    highpass1(hp, 6000);
    for (let k = 0; k < len; k++) hp[k] *= Math.exp(-k / (SR * 0.07)) * 0.06;
    addWrapped(out, hp, Math.round(t0 * SR));
    addWrapped(out, hp, Math.round((t0 + beatSec * 3) * SR));
  }

  // 小房间空气感
  const air = noiseArray('jazz-air', n);
  for (let i = 0; i < n; i++) out[i] += air[i] * 0.012;

  lowpass1(out, 5200);
  return makeSeamless(normalize(dcBlock(out), 0.84));
}

function synthLofi(seconds) {
  const n = Math.round(SR * seconds);
  const out = new Float32Array(n);
  const bpm = 85.71428571428571; // 8 拍 @ 约 85.7BPM，使 2 小节 = 5.6s 精确成立
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;
  const bars = Math.round(seconds / barSec);
  if (Math.abs(bars * barSec - seconds) > 1e-6) {
    throw new Error(`lofi 循环长度须为 ${barSec.toFixed(4)}s 的整数倍，当前 ${seconds}s`);
  }

  const progression = [
    [53, 57, 60, 64], // F A C E
    [52, 55, 59, 62], // E G B D
    [50, 53, 57, 60], // D F A C
    [48, 52, 55, 59], // C E G B
  ];

  for (let i = 0; i < bars; i++) {
    const voicing = progression[i % progression.length];
    const t0 = i * barSec;
    addChord(out, t0, barSec * 0.94, voicing, 0.17, 14);
    const bassLen = Math.round(SR * beatSec * 1.8);
    const bass = new Float32Array(bassLen);
    const bf = midiHz(voicing[0] - 24);
    for (let k = 0; k < bassLen; k++) {
      const t = k / SR;
      const env = Math.exp(-t * 1.9) * (1 - Math.exp(-t * 60));
      bass[k] = Math.sin(TAU * bf * t) * env * 0.85;
    }
    addWrapped(out, bass, Math.round(t0 * SR));
  }

  // 极轻鼓点
  const beatCount = Math.floor(seconds / beatSec);
  for (let b = 0; b < beatCount; b++) {
    const t0 = b * beatSec;
    if (b % 2 === 0) {
      const len = Math.round(SR * 0.3);
      const snd = new Float32Array(len);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const f = 46 + 48 * Math.exp(-t * 30);
        phase += (TAU * f) / SR;
        snd[i] = Math.sin(phase) * Math.exp(-t * 11) * 0.72;
      }
      addWrapped(out, snd, Math.round(t0 * SR));
    }
    if (b % 2 === 1) {
      const len = Math.round(SR * 0.16);
      const nz = noiseArray(`lofi-snare-${b}`, len);
      const bp = svf(nz, 2100, 1.2).band;
      for (let i = 0; i < len; i++) bp[i] *= Math.exp(-i / (SR * 0.045)) * 0.34;
      addWrapped(out, bp, Math.round(t0 * SR));
    }
  }

  // 黑胶嘶声：低幅粉噪 + 稀疏咔哒
  const hissRnd = makeRng('dsh-music-on', 'lofi-hiss');
  const hiss = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hiss[i] = (hissRnd() * 2 - 1) * 0.012;
    if (hissRnd() < 0.0016) hiss[i] += (hissRnd() * 2 - 1) * 0.35;
  }
  highpass1(hiss, 900);
  for (let i = 0; i < n; i++) out[i] += hiss[i] * 0.5;

  // Lo-Fi 关键：砍高频 → 闷
  lowpass1(out, 2600);
  lowpass1(out, 3400);
  return makeSeamless(normalize(dcBlock(out), 0.86));
}

// ===========================================================================
// 配方表 + 生成 + manifest 回写
// ===========================================================================

const RECIPES = {
  'white-noise': { synth: synthWhiteNoise, seconds: LOOP_SEC },
  rain: { synth: synthRain, seconds: LOOP_SEC },
  cafe: { synth: synthCafe, seconds: LOOP_SEC },
  'cafe-night': { synth: synthCafeNight, seconds: LOOP_SEC },
  beat: { synth: synthBeat, seconds: LOOP_SEC },
  jazz: { synth: synthJazz, seconds: LOOP_SEC },
  lofi: { synth: synthLofi, seconds: LOOP_SEC },
};

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.items)) {
    throw new Error('manifest.json 结构不合法：缺少 items 数组');
  }
  const seen = new Set();
  for (const item of manifest.items) {
    if (!item.id) throw new Error('manifest 条目缺少 id');
    if (seen.has(item.id)) throw new Error(`manifest 条目 id 重复：${item.id}`);
    seen.add(item.id);
  }
}

function main() {
  if (!existsSync(MANIFEST)) throw new Error(`找不到 manifest：${MANIFEST}`);
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  validateManifest(manifest);
  mkdirSync(HERE, { recursive: true });

  const rows = [];
  let failures = 0;

  for (const item of manifest.items) {
    if (item.source !== 'embedded') {
      // 非 embedded 层：不产出本地文件，也不伪造 sha256/sizeBytes
      item.file = null;
      item.sha256 = null;
      item.sizeBytes = null;
      if (!item.status) item.status = 'needs-config';
      rows.push({ id: item.id, source: item.source, result: `skipped (${item.source} / ${item.status})` });
      continue;
    }

    const recipe = RECIPES[item.id];
    if (!recipe) {
      console.error(`[ERR] 没有合成配方：${item.id}`);
      item.status = 'unavailable';
      item.spectrumAvailable = false;
      failures += 1;
      continue;
    }

    const seconds = recipe.seconds;
    const samples = recipe.synth(seconds);
    const expected = Math.round(SR * seconds);
    if (samples.length !== expected) {
      throw new Error(`[ERR] ${item.id} 采样长度不符：${samples.length} != ${expected}`);
    }

    const wav = encodeWav(samples);
    if (wav.length > 500 * 1024) {
      throw new Error(`[ERR] ${item.id} 体积 ${(wav.length / 1024).toFixed(1)}KB 超过 500KB 上限`);
    }

    const fileName = `${item.id}.wav`;
    writeFileSync(join(HERE, fileName), wav);
    const sha256 = createHash('sha256').update(wav).digest('hex');
    const peak = peakOf(samples);
    // 接缝健康度：末样本 → 首样本的跳变量，与内部相邻样本平均跳变量之比
    // （makeSeamless 之后首尾本就连续，这个比值证明循环点不比其他地方更「跳」）
    const seam = seamRatio(samples);

    item.file = fileName;
    item.url = `presets/${fileName}`;
    item.sha256 = sha256;
    item.sizeBytes = wav.length;
    item.duration = seconds;
    item.loopStart = 0;
    item.loopEnd = seconds;
    item.status = 'ready';
    item.spectrumAvailable = true;

    rows.push({
      id: item.id,
      source: item.source,
      result: `${fileName} ${(wav.length / 1024).toFixed(1)}KB / ${seconds.toFixed(3)}s / peak=${peak.toFixed(3)} / seam=${seam.toFixed(2)}× / sha256=${sha256.slice(0, 12)}…`,
    });
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.loopCrossfadeSec = XFADE_SEC;
  manifest.audioFormat = {
    codec: 'pcm_s16le',
    container: 'wav',
    sampleRate: SR,
    bitDepth: BITS,
    channels: CHANNELS,
    loopSeconds: LOOP_SEC,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  for (const r of rows) console.log(`  ${r.id.padEnd(16)} [${r.source}] ${r.result}`);
  console.log(`\nmanifest 已回写：${MANIFEST}`);
  if (failures) {
    console.error(`失败条目：${failures}`);
    process.exitCode = 1;
  }
}

main();
