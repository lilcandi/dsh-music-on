/**
 * 探针八：直链能否升级成 https？以及真实 CDN 域名清单。
 *
 * 这决定 stream 代理的安全策略：
 *   若 https 可用 → 白名单只放 https，不碰明文
 *   若只有 http → 必须放开 http（并说明这是平台强制的）
 */
import https from 'node:https';
import http from 'node:http';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const getJson = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
  });
  req.on('error', reject);
  req.setTimeout(15000, () => req.destroy(new Error('timeout')));
});

function head(url, redirect = 0) {
  const mod = url.startsWith('http:') ? http : https;
  return new Promise((resolve) => {
    const req = mod.get(url, { headers: { 'user-agent': UA, range: 'bytes=0-1023' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirect < 5) {
        res.resume();
        resolve(head(new URL(res.headers.location, url).href, redirect + 1));
        return;
      }
      res.resume();
      resolve({ status: res.statusCode, type: res.headers['content-type'], final: url });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
  });
}

// 收集网易云直链
const pl = await getJson('https://music.163.com/api/v6/playlist/detail?id=24381616&n=30', { referer: 'https://music.163.com/' });
const ids = (pl.playlist.tracks || []).map((t) => t.id);
const nr = await getJson(`https://music.163.com/api/song/enhance/player/url?ids=[${ids.join(',')}]&br=128000`, { referer: 'https://music.163.com/' });
const neUrls = (nr.data || []).filter((d) => d.url).map((d) => d.url);
console.log(`网易云拿到 ${neUrls.length} 条直链`);
const neHosts = [...new Set(neUrls.map((u) => new URL(u).hostname.replace(/^m\d+\./, 'm###.')))];
console.log(`  域名: ${neHosts.join(', ')}`);

console.log('');
console.log('=== 网易云 http 直链 → 尝试 https ===');
for (const u of neUrls.slice(0, 3)) {
  const httpsVersion = u.replace(/^http:/, 'https:');
  const a = await head(u);
  const b = await head(httpsVersion);
  console.log(`  ${new URL(u).hostname}: http=${a.status}(${a.type}) | https=${b.status}${b.error ? ' ERR ' + b.error : `(${b.type})`}`);
}

// QQ 直链
const list = await getJson('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7004765952&format=json', { referer: 'https://y.qq.com/' });
const mids = list.cdlist[0].songlist.slice(0, 5).map((s) => s.songmid);
const payload = JSON.stringify({
  req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: mids, songtype: mids.map(() => 0), uin: '0', loginflag: 1, platform: '20' } },
  comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
});
const qq = await getJson(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
const sip = qq.req_0.data.sip[0];
const qqUrl = sip + qq.req_0.data.midurlinfo[0].purl;
console.log('');
console.log(`=== QQ sip 域名: ${sip} ===`);
const qqHttps = qqUrl.replace(/^http:/, 'https:');
const a = await head(qqUrl);
const b = await head(qqHttps);
console.log(`  http=${a.status}(${a.type}) | https=${b.status}${b.error ? ' ERR ' + b.error : `(${b.type})`}`);

// 网易云 302 落点域名统计（真正需要代理的是这个）
console.log('');
console.log('=== 网易云 302 最终落点域名 ===');
const seen = new Set();
for (const u of neUrls.slice(0, 8)) {
  const r = await head(u);
  if (r.final) seen.add(new URL(r.final).hostname.replace(/^m\d+\./, 'm###.'));
}
console.log(`  ${[...seen].join(', ')}`);
