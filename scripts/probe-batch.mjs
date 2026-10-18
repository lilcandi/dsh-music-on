/**
 * 探针六：批量取直链的能力与成本。
 *
 * 决定「粘贴一个 30 首歌单」到底要发多少次请求：
 *   QQ 的 CgiGetVkey 支持 songmid 数组 → 一次拿多首？
 *   网易云 outer/url 只能一首一个 → 歌单只能取前 N 首。
 */
import https from 'node:https';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// 取一个真实歌单的 songmid 列表
const list = await get('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7004765952&format=json', { referer: 'https://y.qq.com/' });
const cd = JSON.parse(list.body).cdlist[0];
const mids = cd.songlist.map((s) => s.songmid);
console.log(`歌单「${cd.dissname}」共 ${mids.length} 首`);

for (const n of [1, 5, 30]) {
  const batch = mids.slice(0, n);
  const payload = JSON.stringify({
    req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: batch, songtype: batch.map(() => 0), uin: '0', loginflag: 1, platform: '20' } },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  });
  const t0 = Date.now();
  const r = await get(`https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(payload)}`, { referer: 'https://y.qq.com/' });
  const info = JSON.parse(r.body).req_0?.data?.midurlinfo || [];
  const ok = info.filter((i) => i.purl).length;
  console.log(`  批量 ${String(n).padStart(2)} 首 → 请求 ${Date.now() - t0}ms, 返回 ${info.length} 条, 有 purl ${ok} 条`);
}

// 网易云：单首成本
const t0 = Date.now();
for (const id of ['2097170103', '347230']) {
  await get(`https://music.163.com/song/media/outer/url?id=${id}.mp3`, { referer: 'https://music.163.com/' });
}
console.log(`网易云 outer/url 两首串行 → ${Date.now() - t0}ms（含 302 跟随）`);

// 网易云歌单：能不能用 enhance/player/url 批量拿到 url（换低码率试试）
for (const br of [128000, 192000, 320000, 999000]) {
  const r = await get(`https://music.163.com/api/song/enhance/player/url?ids=[2097170103]&br=${br}`, { referer: 'https://music.163.com/' });
  const d = JSON.parse(r.body).data?.[0];
  console.log(`  enhance br=${br} → code=${d?.code} url=${d?.url ? 'YES' : 'null'} fee=${d?.fee}`);
}
