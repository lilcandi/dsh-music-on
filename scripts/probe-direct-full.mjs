/**
 * 探针七：把「批量拿直链 + 真取到字节」这条完整链路走通，作为落地依据。
 *
 * 网易云 enhance/player/url 支持 ids 数组批量；QQ CgiGetVkey 支持 songmid 数组批量。
 * 两边都返回 http:// 直链（不是 https），这一点直接决定 stream 路由要不要放开 http。
 */
import https from 'node:https';
import http from 'node:http';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const getJson = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      try { resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
      catch (e) { reject(e); }
    });
  });
  req.on('error', reject);
  req.setTimeout(15000, () => req.destroy(new Error('timeout')));
});

function probe(url, headers = {}, redirect = 0) {
  const mod = url.startsWith('http:') ? http : https;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { headers: { 'user-agent': UA, range: 'bytes=0-2047', ...headers } }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirect < 6) {
        res.resume();
        resolve(probe(new URL(res.headers.location, url).href, headers, redirect + 1));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', (c) => { chunks.push(c); total += c.length; if (total > 8192) res.destroy(); });
      res.on('close', () => resolve({ status, url, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// ---- 网易云：真实歌单前 5 首，批量拿直链 ----
console.log('===== 网易云 歌单批量拿直链 =====');
{
  const pl = await getJson('https://music.163.com/api/v6/playlist/detail?id=24381616&n=5', { referer: 'https://music.163.com/' });
  const ids = (pl.json.playlist.tracks || []).map((t) => t.id);
  console.log(`  歌单「${pl.json.playlist.name}」前 ${ids.length} 首: ${ids.join(',')}`);
  const t0 = Date.now();
  const r = await getJson(`https://music.163.com/api/song/enhance/player/url?ids=[${ids.join(',')}]&br=128000`, { referer: 'https://music.163.com/' });
  console.log(`  批量请求耗时 ${Date.now() - t0}ms, 返回 ${r.json.data?.length} 条`);
  for (const d of r.json.data || []) {
    console.log(`    id=${d.id} code=${d.code} fee=${d.fee} url=${d.url ? d.url.slice(0, 62) + '…' : 'null'}`);
  }
  const playable = (r.json.data || []).find((d) => d.url);
  if (playable) {
    const p = await probe(playable.url, { referer: 'https://music.163.com/' });
    console.log(`  取流: status=${p.status} type=${p.headers['content-type']} cr=${p.headers['content-range']} magic=${p.body.subarray(0, 4).toString('hex')}`);
  }
}

// ---- QQ：真实歌单 5 首，批量拿直链 ----
console.log('');
console.log('===== QQ 歌单批量拿直链 =====');
{
  const list = await getJson('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7004765952&format=json', { referer: 'https://y.qq.com/' });
  const cd = list.json.cdlist[0];
  const mids = cd.songlist.slice(0, 5).map((s) => s.songmid);
  const payload = JSON.stringify({
    req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: mids, songtype: mids.map(() => 0), uin: '0', loginflag: 1, platform: '20' } },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  });
  const t0 = Date.now();
  const r = await getJson(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
  const data = r.json.req_0.data;
  console.log(`  批量请求耗时 ${Date.now() - t0}ms, 返回 ${data.midurlinfo.length} 条, sip=${data.sip[0]}`);
  for (const i of data.midurlinfo) console.log(`    mid=${i.songmid} purl=${i.purl ? 'YES' : 'no'} result=${i.result}`);
  const first = data.midurlinfo.find((i) => i.purl);
  if (first) {
    const p = await probe(data.sip[0] + first.purl, { referer: 'https://y.qq.com/' });
    console.log(`  取流: status=${p.status} type=${p.headers['content-type']} cr=${p.headers['content-range']} magic=${p.body.subarray(4, 8).toString('ascii')}`);
    console.log(`  最终域名: ${new URL(p.url).hostname}`);
  }
}

// ---- 直链是否 https ----
console.log('');
console.log('===== 直链协议统计（决定 stream 路由要不要放开 http）=====');
{
  const pl = await getJson('https://music.163.com/api/v6/playlist/detail?id=24381616&n=20', { referer: 'https://music.163.com/' });
  const ids = (pl.json.playlist.tracks || []).map((t) => t.id);
  const r = await getJson(`https://music.163.com/api/song/enhance/player/url?ids=[${ids.join(',')}]&br=128000`, { referer: 'https://music.163.com/' });
  const hosts = new Map();
  let httpsCount = 0, httpCount = 0, nullCount = 0;
  for (const d of r.json.data || []) {
    if (!d.url) { nullCount += 1; continue; }
    const u = new URL(d.url);
    if (u.protocol === 'https:') httpsCount += 1; else httpCount += 1;
    hosts.set(u.hostname.replace(/^m\d+\./, 'm*.') , (hosts.get(u.hostname.replace(/^m\d+\./, 'm*.') ) || 0) + 1);
  }
  console.log(`  网易云 20 首: 有直链 ${httpsCount + httpCount}, 无直链 ${nullCount}; https=${httpsCount} http=${httpCount}`);
  console.log(`  域名分布: ${[...hosts.entries()].map(([h, n]) => `${h}×${n}`).join(', ')}`);
}
