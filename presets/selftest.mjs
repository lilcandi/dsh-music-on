#!/usr/bin/env node
// 冒烟测试：node presets/selftest.mjs
//
// 在 Node 里用桩件替掉浏览器 API，把 src/client/presets.js 的完整链路跑一遍：
//   清单解析 → settings 容错 → 下载 → sha256/sizeBytes 校验 → 缓存命中 → 分流决策 → 不可用原因。
// 真正出声（AudioContext）和 iframe 渲染无法在 Node 内验证，这里只验证决策与数据正确性。
// 不写任何文件。

import { readFileSync, existsSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLIENT = join(ROOT, 'src', 'client', 'presets.js');
const MANIFEST = join(HERE, 'manifest.json');

// ---- 浏览器 API 桩件 -------------------------------------------------------
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
globalThis.location = { href: pathToFileURL(ROOT + '\\').href };
globalThis.Blob = globalThis.Blob ?? class Blob {
  constructor(parts, opts) {
    this.parts = parts;
    this.type = opts?.type ?? '';
    this.size = parts.reduce((sum, p) => sum + (p.byteLength ?? p.length ?? 0), 0);
  }
  async arrayBuffer() {
    const [part] = this.parts;
    return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength);
  }
};

const manifestRaw = JSON.parse(readFileSync(MANIFEST, 'utf8'));

/** 一个能拿到真实文件字节的 fetch 桩：把 presets/*.wav 读成 Response。 */
const fetchStub = async (url) => {
  const u = String(url);
  if (u.endsWith('manifest.json')) {
    return { ok: true, status: 200, json: async () => manifestRaw };
  }
  // file:// 的 pathname 形如 /J:/plugin/... —— 去掉盘符前的斜杠再按平台分隔符还原
  const decoded = decodeURIComponent(new URL(u).pathname);
  const filePath = decoded.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, sep);
  if (!existsSync(filePath)) return { ok: false, status: 404 };
  const buf = readFileSync(filePath);
  const bytes = new Uint8Array(buf);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

/** 宿主缓存桩：Map<key, {bytes, size}>。 */
function makeCacheStore() {
  const map = new Map();
  return {
    kind: 'host-stub',
    async get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      return { size: hit.size, arrayBuffer: async () => hit.bytes };
    },
    async set(key, blob) {
      map.set(key, { size: blob.size, bytes: await blob.arrayBuffer() });
    },
    async delete(key) {
      map.delete(key);
    },
    async list() {
      return [...map.entries()].map(([key, v]) => ({ key, sizeBytes: v.size }));
    },
    async clear() {
      map.clear();
    },
  };
}

// ---- 断言基座 -------------------------------------------------------------
let pass = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

const mod = await import(pathToFileURL(CLIENT).href);
const { createPresets, parseManifest, buildBilibiliEmbedUrl, resolvePlatformUrl, sha256Hex, readSettings, SOURCE, STATUS } = mod;

// ---- 1. settings 容错 ------------------------------------------------------
console.log('\n[1] settings 容错读取');
const s1 = await readSettings(undefined);
check('undefined settings 退回默认 storageDir', s1.storageDir === 'dsh-music-on/presets-cache', s1.storageDir);
check('undefined settings 退回默认 cacheLimitMb=64', s1.cacheLimitMb === 64, String(s1.cacheLimitMb));
const s2 = await readSettings({ cacheDir: '/tmp/x', cacheLimit: '128' });
check('别名 cacheDir 生效', s2.storageDir === '/tmp/x', s2.storageDir);
check('别名 cacheLimit 生效且转数字', s2.cacheLimitMb === 128, String(s2.cacheLimitMb));
const s3 = await readSettings({ cacheLimitMb: 'oops' });
check('非法 cacheLimitMb 退回默认', s3.cacheLimitMb === 64, String(s3.cacheLimitMb));
const s4 = await readSettings(async () => ({ storageDir: 'async-dir', maxCacheMb: 32 }));
check('async settings + maxCacheMb 别名', s4.storageDir === 'async-dir' && s4.cacheLimitMb === 32, JSON.stringify(s4));
const s5 = await readSettings(() => { throw new Error('boom'); });
check('settings 抛错时不崩、退回默认', s5.cacheLimitMb === 64 && s5.storageDir === 'dsh-music-on/presets-cache');

// ---- 2. 清单解析 ----------------------------------------------------------
console.log('\n[2] 清单结构 / 就绪判定');
const parsed = parseManifest(manifestRaw);
check('条目数 14', parsed.items.length === 14, String(parsed.items.length));
check('解析无结构性问题', parsed.issues.length === 0, JSON.stringify(parsed.issues));

const embedded = parsed.items.filter((i) => i.source === SOURCE.EMBEDDED && i.playable);
check('embedded 可播 7 条', embedded.length === 7, String(embedded.length));

const bili = parsed.items.filter((i) => i.source === SOURCE.BILIBILI);
check('bilibili-embed 5 条', bili.length === 5, String(bili.length));
const biliReady = bili.filter((i) => i.status === STATUS.READY);
check('bilibili 1 条 ready（BV1Lyw7zPEeo）+ 4 条 needs-config',
  biliReady.length === 1 && biliReady[0].bvid === 'BV1Lyw7zPEeo' && bili.filter((i) => i.status === STATUS.NEEDS_CONFIG).length === 4,
  `ready=${biliReady.length}`);
check('未配置的 bilibili 条目 bvid 全为 null，未编造',
  bili.filter((i) => i.status === STATUS.NEEDS_CONFIG).every((i) => i.bvid === null));

const plat = parsed.items.filter((i) => i.source === SOURCE.PLATFORM);
check('platform-link 2 条且全部 needs-config', plat.length === 2 && plat.every((i) => i.status === STATUS.NEEDS_CONFIG));
check('platform pageUrl 全为 null，未编造', plat.every((i) => i.pageUrl === null));

const night = parsed.items.find((i) => i.id === 'cafe-night');
check('cafe-night 已升级为 embedded/ready', night?.status === STATUS.READY && night?.playable === true && !night?.unavailableReason);
const mix = parsed.items.find((i) => i.id === 'jazz-lofi-mix-bili');
check('jazz-lofi-mix-bili 命中 jazz/lofi/cafe 三类',
  ['jazz', 'lofi', 'cafe'].every((t) => mix?.tags?.includes(t)) && mix?.category === 'jazz' && mix?.duration === 10865);

check('伪造 ready 会被降级', (() => {
  const forged = parseManifest({
    version: 2,
    items: [{ id: 'fake', source: 'embedded', status: 'ready', url: 'x.wav', sha256: null, sizeBytes: null, category: 'rain' }],
  });
  return forged.items[0].status === STATUS.NEEDS_CONFIG && forged.issues.length === 1;
})());

check('bvid 格式校验（拒绝伪造短号）', (() => {
  const forged = parseManifest({
    version: 2,
    items: [{ id: 'b', source: 'bilibili-embed', status: 'ready', bvid: 'BV123', category: 'jazz' }],
  });
  return forged.items[0].status === STATUS.NEEDS_CONFIG;
})());

// ---- 3. 端到端：下载 / 校验 / 缓存命中 -------------------------------------
console.log('\n[3] 下载 + 校验 + 缓存（embedded）');
const cacheStore = makeCacheStore();
const presets = await createPresets({
  settings: { storageDir: 'test-cache', cacheLimitMb: 8 },
  cacheStore,
  baseUrl: './',
  fetchImpl: fetchStub,
  manifest: manifestRaw,
});

const events = [];
presets.onChange((e) => events.push(e));

const first = await presets.prepare('white-noise');
check('首次下载 fromCache=false', first.fromCache === false);
check('缓存后端是宿主注入的', (await presets.cacheStats()).backend === 'host-stub');
const second = await presets.prepare('white-noise');
check('二次 prepare 命中缓存', second.fromCache === true);

// 直接对齐磁盘真值
const wavPath = join(HERE, 'white-noise.wav');
const wavBytes = readFileSync(wavPath);
const realSha = createHash('sha256').update(wavBytes).digest('hex');
check('WebCrypto sha256 与 node crypto 一致', (await sha256Hex(wavBytes)) === realSha);
check('清单里的 sha256 就是磁盘真值', parsed.items.find((i) => i.id === 'white-noise').sha256 === realSha);

// 篡改校验：拿 rain 的字节冒充 white-noise 的清单
const tampered = JSON.parse(JSON.stringify(manifestRaw));
const wn = tampered.items.find((i) => i.id === 'white-noise');
wn.sha256 = createHash('sha256').update(readFileSync(join(HERE, 'rain.wav'))).digest('hex');
const tamperPresets = await createPresets({
  settings: {},
  cacheStore: makeCacheStore(),
  fetchImpl: fetchStub,
  manifest: tampered,
});
let tamperError = null;
try {
  await tamperPresets.prepare('white-noise');
} catch (error) {
  tamperError = error.message;
}
check('sha256 不匹配时报错且不落缓存', Boolean(tamperError?.includes('sha256 校验失败')), tamperError ?? 'no error');
check('校验失败后缓存为空', (await tamperPresets.cacheStats()).entries === 0);

// ---- 4. 三层分流决策 -------------------------------------------------------
console.log('\n[4] source 分流');
const embedDecision = await presets.play('rain').catch((e) => ({ error: e.message }));
// AudioContext 在 Node 里不存在，engine 会在 decodeAudioData 前抛错 —— 这是预期，确认错误来自播放而非缓存
check('embedded 走通到解码阶段（缓存成功，缺 AudioContext）', Boolean(embedDecision.error?.includes('AudioContext')), embedDecision.error ?? JSON.stringify(embedDecision));

let biliError = null;
try {
  await presets.play('jazz-bilibili');
} catch (error) {
  biliError = error.message;
}
check('bilibili 未配置时抛明确原因', Boolean(biliError?.includes('BV')), biliError ?? 'no error');

let platError = null;
try {
  await presets.play('jazz-netease');
} catch (error) {
  platError = error.message;
}
check('platform-link 未配置时抛明确原因', Boolean(platError?.includes('歌单页 URL')), platError ?? 'no error');

check('已配置 bvid 时能生成 embed URL（用格式合法的假值验证逻辑）', (() => {
  const url = buildBilibiliEmbedUrl({
    id: 't',
    source: 'bilibili-embed',
    bvid: 'BV1xx411c7mD',
  });
  return url.startsWith('https://player.bilibili.com/player.html?') && url.includes('bvid=BV1xx411c7mD') && url.includes('autoplay=1');
})());

check('platform-link 已配置时返回 pageUrl', resolvePlatformUrl({ id: 't', source: 'platform-link', playable: true, pageUrl: 'https://example.com/p' }) === 'https://example.com/p');

// ---- 5. 不可用报告 / 分类 --------------------------------------------------
console.log('\n[5] 不可用原因上报 + 分类入口');
const report = presets.unavailableReport();
check('不可用报告覆盖 6 条（4 bilibili needs-config + 2 platform-link）', report.length === 6, String(report.length));
check('就绪条目不出现在不可用报告', !report.some((r) => r.id === 'jazz-lofi-mix-bili' || r.id === 'cafe-night'));
check('每条都带 reason 与 hint，不静默', report.every((r) => Boolean(r.reason) && Boolean(r.hint)));
const cats = presets.categories();
check('六类分类入口齐全', cats.length === 6, cats.map((c) => c.id).join(','));
check('分类计数与清单一致', cats.reduce((s, c) => s + c.items.length, 0) === parsed.items.length);

// ---- 6. 缓存上限裁剪 -------------------------------------------------------
console.log('\n[6] 缓存容量上限');
const trimmed = await createPresets({
  settings: { cacheLimitMb: 1 },
  cacheStore: (() => {
    const inner = makeCacheStore();
    return inner;
  })(),
  fetchImpl: fetchStub,
  manifest: manifestRaw,
});
await trimmed.prepare('white-noise');
await trimmed.prepare('rain');
const stats = await trimmed.cacheStats();
check('1MB 上限下仍保留刚下载的条目', stats.entries >= 1 && stats.sizeMb <= 1.001, JSON.stringify(stats));

// ---- 汇总 -----------------------------------------------------------------
console.log(`\n通过 ${pass} 项，失败 ${failures.length} 项`);
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('冒烟测试全部通过（真实出声与 iframe 渲染需在浏览器里验证）');
}
