/**
 * 探针二：网易云 / QQ 外链播放器的**参数契约**。
 *
 * 目标：搞清楚 type / id 各代表什么，以及播放器初始化时到底读了哪些 query 参数。
 * 不猜——直接把返回的 HTML 尾部 JS 打出来看。
 */
import https from 'node:https';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, referer: 'https://music.163.com/', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// 1) 网易云：先把 HTML 里所有 query 参数名挖出来
const page = await get('https://music.163.com/outchain/player?type=0&id=24381616&auto=0&height=430');
console.log(`=== 163 outchain HTML (${page.body.length} bytes) ===`);
const paramHits = [...page.body.matchAll(/[?&]([a-zA-Z_]+)=/g)].map((m) => m[1]);
console.log('  HTML 中出现的参数名:', [...new Set(paramHits)].join(', '));
const scripts = [...page.body.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
console.log('  外链 JS:', scripts.join(' | '));
const inline = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1].trim());
for (const s of inline) if (s.length > 40) console.log('  内联 JS 尾部:', s.slice(-600));

// 2) 网易云歌单元数据（确认 id 有效、歌单名、曲目数）
const meta = await get('https://music.163.com/api/v6/playlist/detail?id=24381616&n=3');
const mj = JSON.parse(meta.body);
console.log('');
console.log(`=== 163 playlist 24381616 ===`);
console.log(`  code=${mj.code} name=${mj.playlist && mj.playlist.name} trackCount=${mj.playlist && mj.playlist.trackCount}`);
console.log(`  tracks 返回条数=${(mj.playlist && mj.playlist.tracks || []).length}`);
console.log(`  首曲: ${JSON.stringify((mj.playlist?.tracks || [])[0]?.name)} / id=${(mj.playlist?.tracks || [])[0]?.id}`);

// 3) 网易云 type 语义：分别取 type=0/1/2 的 HTML，看 title 差异
console.log('');
console.log('=== 163 type 语义 ===');
for (const t of [0, 1, 2, 3]) {
  const r = await get(`https://music.163.com/outchain/player?type=${t}&id=347230&auto=0&height=66`);
  const hasList = /player-bg|list/i.test(r.body);
  console.log(`  type=${t}: status=${r.status} len=${r.body.length} 含列表模板=${hasList}`);
}

// 4) QQ：真实歌单 id 从哪来 —— 用推荐/搜索接口拿一个
console.log('');
console.log('=== QQ 真实歌单 id 获取 ===');
try {
  const rec = await get('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7004765952&format=json', { referer: 'https://y.qq.com/' });
  const rj = JSON.parse(rec.body);
  const cd = rj.cdlist && rj.cdlist[0];
  console.log(`  disstid=7004765952 → code=${rj.code} name=${cd && cd.dissname} songnum=${cd && cd.songnum} songlist=${(cd && cd.songlist || []).length}`);
  if (cd && cd.songlist && cd.songlist[0]) {
    const s = cd.songlist[0];
    console.log(`  首曲: ${s.songname} / songmid=${s.songmid}`);
    const qq = await get(`https://i.y.qq.com/n2/m/outchain/player/index.html?disstid=7004765952&songtype=0`, { referer: 'https://y.qq.com/' });
    const err = qq.body.match(/__ssrFirstPageData__\s*=\s*(\{[\s\S]{0,200})/);
    console.log(`  QQ outchain(disstid) → status=${qq.status} len=${qq.body.length}`);
    console.log(`  SSR 首屏数据: ${err ? err[1].slice(0, 200) : '<无>'}`);
  }
} catch (e) { console.log(`  ERR ${e.message}`); }
