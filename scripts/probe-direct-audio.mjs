/**
 * 探针三：真去拿「能出声的东西」。
 *
 * 网易云 outer/url 会 302 到 http 的 CDN；node:https 不跟 http，必须手动两段跳。
 * QQ 的 vkey 接口要凑齐参数（guid/uin/platform）才给 purl。
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
        resolve(fetchRaw(new URL(res.headers.location, url).href, headers, redirect + 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status, url, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

console.log('===== 网易云 outer/url 直链 =====');
for (const id of ['347230', '2097170103']) {
  try {
    const r = await fetchRaw(`https://music.163.com/song/media/outer/url?id=${id}.mp3`, { referer: 'https://music.163.com/' });
    console.log(`  id=${id}: status=${r.status} final=${r.url.slice(0, 90)}`);
    console.log(`    type=${r.headers['content-type']} len=${r.body.length}`);
    if (r.body.length > 8) {
      const magic = r.body.subarray(0, 4);
      console.log(`    magic=${magic.toString('hex')} (${magic.toString('ascii').replace(/[^\x20-\x7e]/g, '.')})`);
    }
  } catch (e) { console.log(`  id=${id}: ERR ${e.message}`); }
}

console.log('');
console.log('===== QQ vkey 参数组合尝试 =====');
const combos = [
  { name: 'guid=10000 uin=0 platform=20', param: { guid: '10000', songmid: ['0039MnYb0qxYhV'], songtype: [0], uin: '0', loginflag: 1, platform: '20' } },
  { name: 'guid=10000 uin=0 platform=20 songtype 单值', param: { guid: '10000', songmid: '0039MnYb0qxYhV', songtype: 0, uin: '0', loginflag: 1, platform: '20' } },
  { name: 'platform=yqq 带 filename', param: { guid: '10000', songmid: ['0039MnYb0qxYhV'], songtype: [0], uin: '0', loginflag: 1, platform: 'yqq', filename: ['C400003Qui1q2u1Zho.m4a'] } },
];
for (const c of combos) {
  try {
    const payload = JSON.stringify({
      req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: c.param },
      comm: { uin: 0, format: 'json', ct: 24, cv: 0, platform: 'yqq' },
    });
    const r = await fetchRaw(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
    const j = JSON.parse(r.body.toString('utf8'));
    const info = j.req_0?.data?.midurlinfo?.[0];
    console.log(`  [${c.name}] code=${j.req_0?.code} purl="${info?.purl}" result=${info?.result} filename=${info?.filename}`);
    if (info?.purl) {
      const sip = j.req_0.data.sip[0];
      const full = sip + info.purl;
      const probe = await fetchRaw(full, { referer: 'https://y.qq.com/' });
      console.log(`    → 取流 status=${probe.status} type=${probe.headers['content-type']} len=${probe.body.length}`);
      if (probe.body.length > 8) console.log(`    magic=${probe.body.subarray(4, 8).toString('ascii')}`);
    }
  } catch (e) { console.log(`  [${c.name}] ERR ${e.message}`); }
}
