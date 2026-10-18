/**
 * 探针五：把两个平台的「直链」真正取到音频字节，并记录协议/头/长度。
 *
 * 关键待验证：
 *  1) QQ purl 拼 sip 后能否取到音频（sip 是 http://，宿主 stream 路由目前只放 https）
 *  2) 网易云 outer/url 302 到 http://m701.music.126.net，同样跨到 http
 *  3) 取流需不需要 Referer
 *  4) content-type 与 Range 支持（能不能做流式代理）
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
      let total = 0;
      res.on('data', (c) => { chunks.push(c); total += c.length; if (total > 64 * 1024) res.destroy(); });
      res.on('close', () => resolve({ status, url, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

const httpGet = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', reject);
  req.setTimeout(15000, () => req.destroy(new Error('timeout')));
});

console.log('===== QQ：免费曲 purl → 取流 =====');
{
  const mid = '000EPEhY2os1I0';
  const payload = JSON.stringify({
    req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' } },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  });
  const r = await httpGet(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
  const d = JSON.parse(r.body).req_0.data;
  const purl = d.midurlinfo[0].purl;
  console.log(`  sip=${JSON.stringify(d.sip)}`);
  console.log(`  purl=${purl.slice(0, 80)}…`);
  for (const sip of d.sip) {
    const full = sip + purl;
    for (const ref of [null, 'https://y.qq.com/']) {
      try {
        const p = await fetchRaw(full, ref ? { referer: ref, range: 'bytes=0-2047' } : { range: 'bytes=0-2047' });
        console.log(`  [${sip}] referer=${ref ? 'y.qq.com' : '<none>'} status=${p.status} type=${p.headers['content-type']} cr=${p.headers['content-range']} len=${p.body.length}`);
        if (p.body.length > 8) console.log(`    magic=${p.body.subarray(4, 8).toString('ascii')}`);
      } catch (e) { console.log(`  [${sip}] referer=${ref ? 'y.qq.com' : '<none>'} ERR ${e.message}`); }
    }
  }
}

console.log('');
console.log('===== 网易云：outer/url → 取流 =====');
{
  const id = '2097170103';
  for (const ref of ['https://music.163.com/', null]) {
    try {
      const p = await fetchRaw(`https://music.163.com/song/media/outer/url?id=${id}.mp3`, ref ? { referer: ref, range: 'bytes=0-2047' } : { range: 'bytes=0-2047' });
      console.log(`  referer=${ref ? 'music.163.com' : '<none>'} status=${p.status} type=${p.headers['content-type']}`);
      console.log(`    final=${p.url.slice(0, 100)}`);
      console.log(`    cr=${p.headers['content-range']} len=${p.body.length}`);
      if (p.body.length > 8) console.log(`    magic=${p.body.subarray(0, 4).toString('hex')}`);
    } catch (e) { console.log(`  referer=${ref ? 'music.163.com' : '<none>'} ERR ${e.message}`); }
  }
  // 404 判定：outer/url 对无版权歌返回什么
  const bad = await fetchRaw('https://music.163.com/song/media/outer/url?id=347230.mp3', { referer: 'https://music.163.com/' });
  console.log(`  无版权曲(347230): status=${bad.status} type=${bad.headers['content-type']} final=${bad.url.slice(0, 70)}`);
}

console.log('');
console.log('===== 网易云 song/detail 是否能拿 fee 标记（预判版权）=====');
{
  const r = await httpGet('https://music.163.com/api/song/detail/?ids=[347230,2097170103]', { referer: 'https://music.163.com/' });
  const j = JSON.parse(r.body);
  for (const s of j.songs || []) console.log(`  ${s.id} ${s.name} fee=${s.fee} st=${s.st} privilege=${JSON.stringify(s.privilege || null).slice(0, 120)}`);
}
