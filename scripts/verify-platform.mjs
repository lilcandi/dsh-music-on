/**
 * 端到端实网自检：网易云 / QQ音乐链接 → 宿主解析 → 签发票据 → 客户端入队 → 票据取流取到真实字节。
 *
 * 为什么非要有这个脚本：单测用假 fetch，永远测不出「解析契约不匹配」「票据签不出」
 * 「两个 store 密钥不同」这类接缝错误。这三类错误在浏览器里的表现全都是
 * 「提示已加入，但没声音」，没有任何报错。
 *
 * 跑法：node scripts/verify-platform.mjs [网易云歌单ID] [QQ歌单ID]
 * 需要能直连外网（本机若挂着 127.0.0.1:7897 代理而它已死，先清空 *_PROXY 环境变量）。
 */
import { createResolveApi, handleResolveRequest } from '../src/host/resolve.js';
import { createStreamApi } from '../src/host/stream.js';
import { createMediaTokenStore } from '../src/host/mediatoken.js';
import { intakeLinks } from '../src/client/linkintake.js';

const NETEASE_URL = `https://music.163.com/#/playlist?id=${process.argv[2] || '24381616'}`;
const QQ_URL = `https://y.qq.com/n/ryqq/playlist/${process.argv[3] || '7004765952'}`;

const failures = [];
const check = (name, cond, detail) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail === undefined ? '' : ` — ${detail}`}`);
  if (!cond) failures.push(name);
};

/* ---------------- 共用票据表（必须两边同一个 store） ---------------- */
const mediaTokens = createMediaTokenStore();
const resolveApi = createResolveApi({ mediaTokens });
const streamApi = createStreamApi({ mediaTokens });

const resolve = async (url) => {
  const res = await handleResolveRequest(
    new Request(`http://127.0.0.1:3080/api/dsh-music-on/resolve?url=${encodeURIComponent(url)}`),
    resolveApi,
  );
  return { status: res.status, body: await res.json() };
};

/** 拿票据路径取流，返回前若干字节。 */
const pull = async (streamPath, bytes = 8191) => {
  const res = await streamApi.handle(
    new Request(`http://127.0.0.1:3080${streamPath}`, { headers: { range: `bytes=0-${bytes}` } }),
  );
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type'), range: res.headers.get('content-range'), buf };
};

/* ---------------- 1) 网易云 ---------------- */
console.log('=== 网易云 ===');
const netease = await resolve(NETEASE_URL);
check('resolve HTTP 200', netease.status === 200, String(netease.status));
check('ok=true', netease.body.ok === true, JSON.stringify(netease.body.code || ''));
const nres = netease.body.result || {};
const ntracks = Array.isArray(nres.tracks) ? nres.tracks : [];
console.log('  歌单:', nres.title, '| 曲目数:', ntracks.length, '| platform:', nres.platform);
const signed = ntracks.filter((t) => typeof t.streamPath === 'string' && t.streamPath !== '');
const vip = ntracks.filter((t) => t.streamOnly === true);
console.log('  已签票据:', signed.length, '| 需会员(VIP)降级:', vip.length);
check('解析出曲目', ntracks.length > 0, String(ntracks.length));
check('至少一首签出票据', signed.length > 0, String(signed.length));
check('票据路径是同源 /api 路径', signed.length > 0 && signed.every((t) => t.streamPath.startsWith('/api/dsh-music-on/stream?')), signed[0] && signed[0].streamPath);
check('票据里不含百分号（stream 路由拒绝 % 编码）', signed.length > 0 && signed.every((t) => !t.streamPath.includes('%')));

if (signed.length > 0) {
  const picked = signed[0];
  console.log('  取流曲目:', picked.title, '/', picked.artist || '—');
  const got = await pull(picked.streamPath);
  console.log('  status', got.status, '| type', got.type, '| range', got.range, '| bytes', got.buf.length, '| head', got.buf.subarray(0, 4).toString('ascii').replace(/[^\x20-\x7e]/g, '.'));
  check('票据取流 206', got.status === 206, String(got.status));
  check('content-type 是 audio/*', String(got.type).startsWith('audio/'), String(got.type));
  check('取到真实音频字节', got.buf.length > 1000, String(got.buf.length));
}

/* ---------------- 2) QQ 音乐 ---------------- */
console.log('=== QQ音乐 ===');
const qq = await resolve(QQ_URL);
check('resolve HTTP 200', qq.status === 200, String(qq.status));
check('ok=true', qq.body.ok === true, JSON.stringify(qq.body.code || ''));
const qres = qq.body.result || {};
const qtracks = Array.isArray(qres.tracks) ? qres.tracks : [];
console.log('  歌单:', qres.title, '| 曲目数:', qtracks.length, '| platform:', qres.platform);
const qsigned = qtracks.filter((t) => typeof t.streamPath === 'string' && t.streamPath !== '');
console.log('  已签票据:', qsigned.length, '/', qtracks.length);
check('解析出曲目', qtracks.length > 0, String(qtracks.length));
check('至少一首签出票据', qsigned.length > 0, String(qsigned.length));

if (qsigned.length > 0) {
  const picked = qsigned[0];
  console.log('  取流曲目:', picked.title, '/', picked.artist || '—');
  const got = await pull(picked.streamPath);
  console.log('  status', got.status, '| type', got.type, '| range', got.range, '| bytes', got.buf.length, '| magic', got.buf.subarray(4, 8).toString('ascii'));
  check('票据取流 206', got.status === 206, String(got.status));
  check('content-type 是 audio/*', String(got.type).startsWith('audio/'), String(got.type));
  check('取到真实音频字节', got.buf.length > 1000, String(got.buf.length));
}

/* ---------------- 3) 客户端入队（引擎必须收到 addPlatform + 票据） ---------------- */
console.log('=== 客户端入队 ===');
const calls = [];
const fakeEngine = {
  addUrl: async (u, o) => calls.push({ m: 'addUrl', u, o }),
  addBilibili: async (t, o) => calls.push({ m: 'addBilibili', t, o }),
  addEmbed: async (u, o) => calls.push({ m: 'addEmbed', u, o }),
  addPlatform: async (t, o) => calls.push({ m: 'addPlatform', t, o }),
};
const fakeFetch = async (target) => {
  const inner = String(target).split('url=')[1] || '';
  const which = decodeURIComponent(inner).includes('y.qq.com') ? qq.body : netease.body;
  return { ok: true, status: 200, json: async () => which };
};
const report = await intakeLinks(fakeEngine, NETEASE_URL, { fetchImpl: fakeFetch, playFirst: true });
console.log('  report: added =', report.added, '| 引擎调用:', calls.map((c) => c.m).join(','));
const first = calls.find((c) => c.m === 'addPlatform');
check('走了 addPlatform（不再塞 iframe）', Boolean(first));
check('票据路径已传给引擎', Boolean(first && first.t.streamPath), String(first && first.t.streamPath));
check('第一首带 playFirst=true', Boolean(first && first.o && first.o.playFirst === true));
check('首条之后不再重复 playFirst', calls.filter((c) => c.o && c.o.playFirst === true).length === 1);
check('没有 addEmbed（平台页面 iframe 必白屏）', calls.filter((c) => c.m === 'addEmbed').length === 0);

/* ---------------- 4) 令牌防伪 ---------------- */
console.log('=== 令牌防伪 ===');
const tampered = signed.length > 0 ? `${signed[0].streamPath.slice(0, -3)}xxx` : null;
if (tampered) {
  const res = await streamApi.handle(new Request(`http://127.0.0.1:3080${tampered}`));
  const body = await res.json().catch(() => ({}));
  console.log('  篡改签名 →', res.status, body.code);
  check('篡改签名被拒（403）', res.status === 403, String(res.status));
}
const forged = '/api/dsh-music-on/stream?mt=Zm9yZ2Vk.AAAA';
const forgedRes = await streamApi.handle(new Request(`http://127.0.0.1:3080${forged}`));
check('伪造令牌被拒（403）', forgedRes.status === 403, String(forgedRes.status));
await forgedRes.arrayBuffer();

console.log('');
if (failures.length === 0) {
  console.log('全部通过：网易云与 QQ 音乐的歌单都能解析 → 签票据 → 取到真实音频字节。');
} else {
  console.log(`失败 ${failures.length} 项：${failures.join(' / ')}`);
  process.exitCode = 1;
}
