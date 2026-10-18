/**
 * 端到端实网自检：B站链接 → 宿主解析 → intakLinks → 引擎参数 → 流代理取真实字节。
 *
 * 这是唯一能证明「粘贴 B 站链接真的能出声」的检查：
 * 单测用假 fetch，永远测不出 resolve 契约不匹配、cid 丢失这类接缝错误。
 */
import { intakeLinks } from '../src/client/linkintake.js';
import { createResolveApi, handleResolveRequest } from '../src/host/resolve.js';
import { createStreamApi } from '../src/host/stream.js';

const url = 'https://www.bilibili.com/video/BV1Lyw7zPEeo/?spm_id_from=333.337.search-card.all.click';
const failures = [];
const check = (name, cond, detail) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail === undefined ? '' : ` — ${detail}`}`);
  if (!cond) failures.push(name);
};

// ---- 1) 真实解析（走宿主 resolve 本体，与浏览器同源语义一致）----
const resolveApi = createResolveApi();
const resolveRes = await handleResolveRequest(
  new Request(`http://127.0.0.1:3080/api/dsh-music-on/resolve?url=${encodeURIComponent(url)}`),
  resolveApi,
);
const body = await resolveRes.json();
console.log('--- 解析 ---');
check('resolve HTTP 200', resolveRes.status === 200, String(resolveRes.status));
check('ok=true', body.ok === true, JSON.stringify(body.code || ''));
const result = body.result || {};
const track = (result.tracks || [])[0] || {};
console.log('  title:', track.title);
console.log('  bvid:', track.bvid, ' cid:', track.cid, ' duration:', track.duration);
check('返回 cid', track.cid !== undefined && track.cid !== null, String(track.cid));
check('返回 bvid', /^BV[0-9A-Za-z]{10}$/.test(String(track.bvid || '')), String(track.bvid));

// ---- 2) 客户端入队：引擎收到的参数必须带 cid ----
const calls = [];
const fakeEngine = {
  addUrl: async (u, o) => calls.push({ m: 'addUrl', u, o }),
  addBilibili: async (t, o) => calls.push({ m: 'addBilibili', t, o }),
  addEmbed: async (u, o) => calls.push({ m: 'addEmbed', u, o }),
};
// 模拟浏览器：同源 fetch 打的是真实响应体，这里直接把上面拿到的 body 喂回去。
const fakeFetch = async () => ({ ok: true, status: 200, json: async () => body });
const report = await intakeLinks(fakeEngine, url, { fetchImpl: fakeFetch, playFirst: true });
console.log('--- 入队 ---');
console.log('  report:', JSON.stringify({ added: report.added, cid: report.items[0] && report.items[0].cid }));
const addBili = calls.find((c) => c.m === 'addBilibili');
check('走了 addBilibili', Boolean(addBili));
check('cid 已传给引擎', Boolean(addBili && addBili.t.cid), String(addBili && addBili.t.cid));
check('embedUrl 已生成', Boolean(addBili && /^https:\/\/player\.bilibili\.com\/player\.html\?bvid=BV/.test(String(addBili.t.embedUrl))));
check('playFirst=true', Boolean(addBili && addBili.o && addBili.o.playFirst === true));

// ---- 3) 用真实参数驱动流代理，必须取到 fMP4 字节 ----
const streamApi = createStreamApi();
const streamUrl = `/api/dsh-music-on/stream?bvid=${addBili.t.bvid}&cid=${addBili.t.cid}`;
const streamRes = await streamApi.handle(
  new Request(`http://127.0.0.1:3080${streamUrl}`, { headers: { range: 'bytes=0-8191' } }),
);
const buf = Buffer.from(await streamRes.arrayBuffer());
console.log('--- 流代理 ---');
console.log('  status', streamRes.status, '| type', streamRes.headers.get('content-type'), '| range', streamRes.headers.get('content-range'));
console.log('  bytes', buf.length, '| magic', buf.subarray(4, 8).toString('ascii'));
check('stream status 206', streamRes.status === 206, String(streamRes.status));
check('content-type audio/mp4', streamRes.headers.get('content-type') === 'audio/mp4', String(streamRes.headers.get('content-type')));
check('取到 fMP4 (ftyp)', buf.subarray(4, 8).toString('ascii') === 'ftyp');
check('content-range 带总长', /^bytes 0-8191\/\d+$/.test(String(streamRes.headers.get('content-range'))));

// ---- 4) 无 cid 时宿主应能自愈（lookupCid）----
const noCidRes = await streamApi.handle(
  new Request(`http://127.0.0.1:3080/api/dsh-music-on/stream?bvid=${addBili.t.bvid}`, { headers: { range: 'bytes=0-1023' } }),
);
console.log('--- 无 cid 自愈 ---');
check('缺 cid 时仍能取流（宿主自己查）', noCidRes.status === 206, String(noCidRes.status));
if (noCidRes.body) await noCidRes.arrayBuffer();

console.log('');
if (failures.length === 0) {
  console.log('全部通过：这条 B 站链接可以解析 → 拿到 cid → 代取到真实音频字节。');
} else {
  console.log(`失败 ${failures.length} 项：${failures.join(' / ')}`);
  process.exitCode = 1;
}
