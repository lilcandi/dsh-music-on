/**
 * 探针：网易云 / QQ音乐 到底能不能拿到可播放的东西。
 *
 * 结论决定插件该走哪条路：
 *   A) 拿到音频直链 → 走 /api/dsh-music-on/stream 代理，接进 AudioContext，有真频谱
 *   B) 只能 iframe 外链播放器 → 有声音，但频谱不可用（跨域 iframe 摸不到媒体元素）
 *   C) 什么都拿不到 → 只能跳转
 *
 * 本脚本只读不写，任何一条失败都如实打印，不吞。
 */
import https from 'node:https';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, headers = {}, redirect = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirect < 5) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        resolve(get(next, headers, redirect + 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => {
        chunks.push(c);
        if (chunks.reduce((n, b) => n + b.length, 0) > 512 * 1024) res.destroy();
      });
      res.on('end', () => resolve({
        status,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        location: res.headers.location || null,
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

const line = (s) => console.log(s);

line('===== 网易云 =====');
try {
  const r = await get('https://music.163.com/song/media/outer/url?id=347230.mp3', {
    referer: 'https://music.163.com/',
  });
  line(`outer/url(.mp3)  status=${r.status}`);
  line(`  content-type: ${r.headers['content-type']}`);
  line(`  location: ${r.location}`);
  if (r.status === 200) {
    const head = Buffer.from(r.body, 'binary').subarray(0, 8);
    line(`  first bytes: ${head.toString('hex')}`);
  }
} catch (e) { line(`outer/url ERR ${e.message}`); }

try {
  const r = await get('https://music.163.com/api/song/enhance/player/url?ids=[347230]&br=320000', {
    referer: 'https://music.163.com/',
  });
  line(`enhance/player/url status=${r.status} len=${r.body.length}`);
  line(`  body: ${r.body.slice(0, 400)}`);
} catch (e) { line(`enhance ERR ${e.message}`); }

line('');
line('===== QQ音乐 =====');
try {
  const payload = JSON.stringify({
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: '10000',
        songmid: ['0039MnYb0qxYhV'],
        songtype: [0],
        uin: '0',
        loginflag: 1,
        platform: '20',
      },
    },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  });
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`;
  const r = await get(url, { referer: 'https://y.qq.com/' });
  line(`vkey CgiGetVkey status=${r.status} len=${r.body.length}`);
  const json = JSON.parse(r.body);
  const data = json.req_0 && json.req_0.data;
  line(`  code: ${json.code}  req_0.code: ${json.req_0 && json.req_0.code}`);
  if (data) {
    line(`  sip: ${JSON.stringify(data.sip)}`);
    line(`  midurlinfo: ${JSON.stringify(data.midurlinfo).slice(0, 300)}`);
  } else {
    line(`  body: ${r.body.slice(0, 300)}`);
  }
} catch (e) { line(`vkey ERR ${e.message}`); }

line('');
line('===== 外链播放器可嵌入性 =====');
for (const [name, url] of [
  ['163 song', 'https://music.163.com/outchain/player?type=2&id=347230&auto=0&height=66'],
  ['163 playlist', 'https://music.163.com/outchain/player?type=0&id=24381616&auto=0&height=430'],
  ['qq song', 'https://i.y.qq.com/n2/m/outchain/player/index.html?songid=0039MnYb0qxYhV&songtype=0'],
  ['qq list', 'https://i.y.qq.com/n2/m/outchain/player/index.html?disstid=1234567890'],
]) {
  try {
    const r = await get(url);
    line(`${name}: status=${r.status} xfo=${r.headers['x-frame-options'] || '<none>'} csp=${(r.headers['content-security-policy'] || '<none>').slice(0, 60)}`);
  } catch (e) { line(`${name}: ERR ${e.message}`); }
}
