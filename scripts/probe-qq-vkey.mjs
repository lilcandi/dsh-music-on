/**
 * 探针四：QQ 音乐为什么拿不到直链，以及外链播放器的正确参数。
 *
 * 已知：CgiGetVkey 匿名请求返回 purl="" + result=104003。
 * 要区分两种情况：
 *   a) 104003 = 这首歌本身要 VIP/无版权 → 换免费的 mid 再试
 *   b) 104003 = 匿名请求一律不给 → 这条路整体死掉，只能走外链播放器
 */
import https from 'node:https';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// 1) 拿一批真实 songmid（从排行榜歌单里取，尽量是免费曲）
const list = await get('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7004765952&format=json', { referer: 'https://y.qq.com/' });
const cd = JSON.parse(list.body).cdlist[0];
const mids = cd.songlist.slice(0, 8).map((s) => ({ mid: s.songmid, name: s.songname, pay: s.pay?.pay_play, vip: s.pay?.pay_down }));
console.log('=== 候选 songmid（含付费标记）===');
for (const m of mids) console.log(`  ${m.mid}  ${m.name}  pay_play=${m.pay} pay_down=${m.vip}`);

// 2) 逐个试 vkey
console.log('');
console.log('=== CgiGetVkey 逐个试 ===');
for (const m of mids) {
  const payload = JSON.stringify({
    req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: [m.mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' } },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  });
  const r = await get(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
  const info = JSON.parse(r.body).req_0?.data?.midurlinfo?.[0];
  console.log(`  ${m.mid} ${m.name.slice(0, 12).padEnd(14)} purl=${info?.purl ? 'YES' : 'no '} result=${info?.result}`);
}

// 3) QQ 外链播放器：正确参数是什么？抓 JS 看它读哪些 query
console.log('');
console.log('=== QQ outchain 参数契约 ===');
const page = await get('https://i.y.qq.com/n2/m/outchain/player/index.html?songid=0039MnYb0qxYhV&songtype=0', { referer: 'https://y.qq.com/' });
const scripts = [...page.body.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
console.log('  JS 列表:');
for (const s of scripts) console.log(`    ${s}`);
const main = scripts.find((s) => /outchain|player/i.test(s) && !/react|polyfill|fqm|music-react/.test(s));
if (main) {
  const js = await get(main.startsWith('//') ? `https:${main}` : main, { referer: 'https://y.qq.com/' });
  console.log(`  ${main} → ${js.body.length} bytes`);
  const hits = [...js.body.matchAll(/(songid|songtype|disstid|songmid|type|id)\s*[=:]/g)].map((m) => m[1]);
  console.log('  出现的参数名:', [...new Set(hits)].join(', '));
  const ctx = js.body.match(/.{0,140}(songid|disstid).{0,140}/g);
  if (ctx) for (const c of ctx.slice(0, 6)) console.log(`    …${c.replace(/\s+/g, ' ')}…`);
}
