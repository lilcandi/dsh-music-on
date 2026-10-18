/**
 * 探针四：把「平台 CDN 白名单」和「批量取直链的确切参数」钉死。
 *
 * 需要输出的事实：
 *   1) 网易云 enhance/player/url 批量返回的每条 url 的真实 host 与 scheme
 *   2) QQ CgiGetVkey 批量拿 purl 的确切 payload（含是否需要第二趟补 filename）
 *   3) 两者的 https 升级是否可行、是否需要 Referer
 *   4) 真实取流（Range 0-1023）的 status / content-type
 */
import https from 'node:https';
import http from 'node:http';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchRaw(url, headers = {}, redirect = 0) {
  const mod = url.startsWith('http:') ? http : https;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirect < 6) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        resolve(fetchRaw(next, headers, redirect + 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => {
        chunks.push(c);
        if (chunks.reduce((n, b) => n + b.length, 0) > 256 * 1024) res.destroy();
      });
      res.on('end', () => resolve({ status, url, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

const hostsOf = (u) => { try { return new URL(u).host; } catch { return '<bad>'; } };

/* ---------------- 网易云 ---------------- */
console.log('===== 网易云 enhance/player/url 批量 =====');
// 从一个公开歌单取 20 首，实测批量能力与失败比例
const pl = await fetchRaw('https://music.163.com/api/v6/playlist/detail?id=24381616&n=20', { referer: 'https://music.163.com/' });
const pj = JSON.parse(pl.body.toString('utf8'));
const ids = (pj.playlist?.tracks || []).map((t) => t.id).slice(0, 20);
console.log(`  取到 ${ids.length} 首，ids=${ids.slice(0, 5).join(',')}...`);
const t0 = Date.now();
const enh = await fetchRaw(`https://music.163.com/api/song/enhance/player/url?ids=[${ids.join(',')}]&br=320000`, { referer: 'https://music.163.com/' });
const ms = Date.now() - t0;
const ej = JSON.parse(enh.body.toString('utf8'));
console.log(`  status=${enh.status} 耗时=${ms}ms code=${ej.code} data 条数=${(ej.data || []).length}`);
let okCount = 0;
const seenHosts = new Set();
const seenSchemes = new Set();
for (const d of (ej.data || [])) {
  if (d.url) {
    okCount += 1;
    seenHosts.add(hostsOf(d.url));
    seenSchemes.add(new URL(d.url).protocol);
  } else {
    console.log(`    id=${d.id} url=null code=${d.code} fee=${d.fee}`);
  }
}
console.log(`  有直链 ${okCount}/${ids.length}`);
console.log(`  真实 host: ${[...seenHosts].join(', ')}`);
console.log(`  scheme: ${[...seenSchemes].join(', ')}`);
console.log(`  顶层 key: ${Object.keys(ej).join(',')}${ej.data?.[0] ? ' | 单条 key: ' + Object.keys(ej.data[0]).join(',') : ''}`);

// https 升级 + 取流
const first = (ej.data || []).find((d) => d.url);
if (first) {
  const up = first.url.replace(/^http:/, 'https:');
  console.log(`  https 升级后 host=${hostsOf(up)}`);
  for (const [label, hdrs] of [['带 Referer', { referer: 'https://music.163.com/' }], ['无 Referer', {}]]) {
    try {
      const r = await fetchRaw(up, { ...hdrs, range: 'bytes=0-1023' });
      console.log(`    [${label}] status=${r.status} type=${r.headers['content-type']} len=${r.body.length} magic=${r.body.subarray(4, 8).toString('ascii')}`);
    } catch (e) { console.log(`    [${label}] ERR ${e.message}`); }
  }
}

/* ---------------- QQ 音乐 ---------------- */
console.log('');
console.log('===== QQ 音乐 CgiGetVkey 批量 =====');
const qpl = await fetchRaw('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7004765952&format=json', { referer: 'https://y.qq.com/' });
const qj = JSON.parse(qpl.body.toString('utf8'));
const songlist = (qj.cdlist?.[0]?.songlist || []).slice(0, 10);
const mids = songlist.map((s) => s.songmid);
const filenames = songlist.map((s) => s.file?.media_mid).filter(Boolean);
console.log(`  歌单曲目 ${songlist.length} 首，mids=${mids.slice(0, 3).join(',')}`);
console.log(`  media_mid(用于拼 filename): ${filenames.slice(0, 3).join(',')}`);

const vkeyCall = async (label, param) => {
  const payload = JSON.stringify({
    req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0, platform: 'yqq' },
  });
  const r = await fetchRaw(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
  const j = JSON.parse(r.body.toString('utf8'));
  const info = j.req_0?.data?.midurlinfo || [];
  const withPurl = info.filter((i) => i.purl);
  console.log(`  [${label}] status=${r.status} req_0.code=${j.req_0?.code} 返回 ${info.length} 条，有 purl ${withPurl.length} 条`);
  if (info[0]) console.log(`    首条: purl="${String(info[0].purl).slice(0, 60)}" result=${info[0].result} filename=${info[0].filename}`);
  console.log(`    sip: ${JSON.stringify(j.req_0?.data?.sip)}`);
  return { j, info, withPurl };
};

// A) 只给 songmid
const a = await vkeyCall('只给 songmid', { guid: '10000', songmid: mids, songtype: mids.map(() => 0), uin: '0', loginflag: 1, platform: '20' });
// B) 给 songmid + filename（用 media_mid 拼 C400xxx.m4a）
if (filenames.length === mids.length) {
  const fn = filenames.map((m) => `C400${m}.m4a`);
  console.log(`    拼出的 filename 样例: ${fn[0]}`);
  await vkeyCall('songmid + filename', { guid: '10000', songmid: mids, songtype: mids.map(() => 0), filename: fn, uin: '0', loginflag: 1, platform: '20' });
}
// C) 加 guid 变化
await vkeyCall('guid 随机 10 位', { guid: String(Math.floor(Math.random() * 1e10)), songmid: mids, songtype: mids.map(() => 0), uin: '0', loginflag: 1, platform: '20' });

// 取流
const purlHit = (a.info || []).find((i) => i.purl);
if (purlHit) {
  const sip = a.j.req_0.data.sip[0];
  const full = (sip + purlHit.purl).replace(/^http:/, 'https:');
  console.log(`  https 化后 host=${hostsOf(full)}`);
  try {
    const r = await fetchRaw(full, { referer: 'https://y.qq.com/', range: 'bytes=0-1023' });
    console.log(`    取流 status=${r.status} type=${r.headers['content-type']} len=${r.body.length} magic=${r.body.subarray(4, 8).toString('ascii')}`);
  } catch (e) { console.log(`    取流 ERR ${e.message}`); }
}
