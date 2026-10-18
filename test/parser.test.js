/**
 * dsh-music-on · 解析层单测
 *
 * 覆盖四块：
 * 1) 客户端 parser.js：平台识别、id 提取、结果归一（正反例各 ≥15）
 * 2) 拒绝表：SSRF 全谱（协议 / IP / 内网段 / userinfo / 编码绕过 / 白名单外域名）
 * 3) host resolve.js：同一拒绝表 + 出口 IP 策略 + 钉死 lookup
 * 4) host 路由适配：handleResolveRequest 用注入的假 fetch，全程零网络
 *
 * 铁律：本文件不发任何真实网络请求。所有 host 侧网络路径用例都注入 stub。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as P from '../src/client/parser.js';
import * as R from '../src/host/resolve.js';
import { makeStubRequest, makeHangingRequest, bilibiliViewPayload, neteasePlaylistPayload } from './fixtures.mjs';

/* ================================================================== *
 * 1. 拒绝表（客户端与 host 两侧必须同结果）
 * ================================================================== */

/** SSRF 拒绝表：每一条都必须在两侧判 false。 */
export const REJECT_TABLE = Object.freeze([
  // —— 协议 ——
  'file:///etc/passwd',
  'file://C:/Windows/win.ini',
  'data:audio/mp3;base64,AAAA',
  'javascript:alert(1)',
  'blob:https://www.bilibili.com/abc',
  'ftp://www.bilibili.com/a.mp3',
  'gopher://127.0.0.1:6379/_INFO',
  'dict://127.0.0.1:11211/',
  // —— 回环与本地 ——
  'http://127.0.0.1/',
  'http://127.0.0.1:3080/api/dsh-music-on/resolve',
  'http://127.1/',
  'http://0.0.0.0/',
  'http://[::1]/',
  'http://[::]/',
  'http://[::ffff:127.0.0.1]/',
  'http://localhost/',
  'http://localhost:3080/',
  'http://foo.localhost/',
  'http://intranet/',
  // —— 内网与保留段 ——
  'http://10.0.0.1/',
  'http://10.255.255.254/',
  'http://172.16.0.1/',
  'http://172.31.255.255/',
  'http://192.168.1.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://100.64.0.1/',
  'http://192.0.2.10/',
  'http://198.18.0.1/',
  'http://224.0.0.1/',
  'http://240.0.0.1/',
  'http://[fe80::1]/',
  'http://[fc00::1]/',
  'http://[fd12:3456::1]/',
  // —— 任意公网 IP 直连 ——
  'http://8.8.8.8/',
  'https://1.1.1.1/a.mp3',
  'http://2130706433/', // 十进制写法的 127.0.0.1
  'http://0x7f000001/',
  // —— userinfo 混淆 ——
  'http://www.bilibili.com@evil.example.com/video/BV1xx411c7mD',
  'http://user:pass@www.bilibili.com/video/BV1xx411c7mD',
  'http://evil.example.com#@www.bilibili.com/',
  'http://www.bilibili.com%40evil.example.com/',
  // —— 编码绕过 ——
  'http%3A%2F%2F127.0.0.1%2F',
  'http://127.0.0.1%2F@www.bilibili.com/',
  'http%253A%252F%252F169.254.169.254%252F',
  'http://evil.example.com/%2f%2fwww.bilibili.com',
  // —— 白名单外真域名（子串包含不可命中） ——
  'https://evilbilibili.com/video/BV1xx411c7mD',
  'https://bilibili.com.evil.example.com/video/BV1xx411c7mD',
  'https://music.163.com.evil.example.com/playlist?id=1',
  'https://fake-y.qq.com/n/ryqq/playlist/1',
  'https://youtube.com.evil.example.com/watch?v=abc',
  'https://b23.tv.evil.example.com/abc',
  'https://www.bilibili.com./video/BV1xx411c7mD'.replace('www.bilibili.com.', 'www.bilibili.com.evil.tld'),
  // —— 非法输入 ——
  '',
  '   ',
  'not a url',
  'bilibili',
]);

describe('拒绝表：客户端 parser.isUrlAllowed', () => {
  for (const url of REJECT_TABLE) {
    it(`拒绝 ${url === '' ? '<空串>' : url}`, () => {
      assert.equal(P.isUrlAllowed(url), false, `${url} 必须被拒绝`);
    });
  }
});

describe('拒绝表：客户端 detectPlatform 一律 unknown', () => {
  for (const url of REJECT_TABLE) {
    it(`unknown ${url === '' ? '<空串>' : url}`, () => {
      assert.equal(P.detectPlatform(url), 'unknown');
    });
  }
});

describe('拒绝表：host resolve.isUrlAllowed', () => {
  for (const url of REJECT_TABLE) {
    it(`拒绝 ${url === '' ? '<空串>' : url}`, () => {
      assert.equal(R.isUrlAllowed(url), false, `${url} 必须被拒绝`);
    });
  }
});

/* ================================================================== *
 * 2. 白名单正例：六个域名的各种写法都必须识别对
 * ================================================================== */

const ACCEPT_TABLE = Object.freeze([
  ['https://www.bilibili.com/video/BV1GJ411x7h7', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  ['https://bilibili.com/video/BV1GJ411x7h7', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  ['https://m.bilibili.com/video/BV1GJ411x7h7?p=2', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  ['https://www.bilibili.com/video/av170001/', 'bilibili-video', { aid: '170001' }],
  ['https://www.bilibili.com/video/AV170001', 'bilibili-video', { aid: '170001' }],
  ['https://b23.tv/BV1GJ411x7h7', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  ['https://b23.tv/av170001', 'bilibili-video', { aid: '170001' }],
  ['https://b23.tv/AbCdEf9', 'bilibili-video', { shortCode: 'AbCdEf9' }],
  ['https://space.bilibili.com/1234567/favlist?fid=98765&ftype=create', 'bilibili-favlist', { fid: '98765', mid: '1234567' }],
  ['https://www.bilibili.com/bangumi/play/ep123456', 'bilibili-video', { epid: 'ep123456' }],
  ['https://music.163.com/#/playlist?id=24381616', 'netease-playlist', { playlistId: '24381616' }],
  ['https://music.163.com/playlist/24381616/1234567', 'netease-playlist', { playlistId: '24381616' }],
  ['https://music.163.com/#/song?id=186016', 'netease-track', { trackId: '186016' }],
  ['https://music.163.com/song?id=186016', 'netease-track', { trackId: '186016' }],
  ['https://y.qq.com/n/ryqq/playlist/7253106297', 'qq-playlist', { playlistId: '7253106297' }],
  ['https://y.qq.com/n/yqq/playlist/7253106297.html', 'qq-playlist', { playlistId: '7253106297' }],
  ['https://y.qq.com/n/ryqq/songDetail/001hs89m3C5p3g', 'qq-track', { songmid: '001hs89m3C5p3g' }],
  ['https://youtu.be/dQw4w9WgXcQ', 'youtube-video', { videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube-video', { videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube-video', { videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube-video', { videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/playlist?list=PLabcdef123456', 'youtube-playlist', { listId: 'PLabcdef123456' }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdef123456', 'youtube-playlist', { listId: 'PLabcdef123456' }],
  // 缺协议、带空白、全角空格等真实粘贴形态
  ['www.bilibili.com/video/BV1GJ411x7h7', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  ['   https://music.163.com/#/playlist?id=24381616   ', 'netease-playlist', { playlistId: '24381616' }],
  ['https://bilibili.com/video/BV1GJ411x7h7\r\n', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  // 大写主机名必须照样命中白名单
  ['https://WWW.BILIBILI.COM/video/BV1GJ411x7h7', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
  // 带尾点的主机名（DNS 合法写法）必须归一后命中
  ['https://www.bilibili.com./video/BV1GJ411x7h7', 'bilibili-video', { bvid: 'BV1GJ411x7h7' }],
]);

describe('正例表：客户端识别与 id 提取', () => {
  for (const [url, platform, ids] of ACCEPT_TABLE) {
    it(`${platform} ← ${url.trim()}`, () => {
      assert.equal(P.isUrlAllowed(url), true, `${url} 应放行`);
      assert.equal(P.detectPlatform(url), platform);
      assert.deepEqual(P.extractId(url), ids);
    });
  }
});

describe('正例表：host 侧同样放行', () => {
  for (const [url] of ACCEPT_TABLE) {
    it(`放行 ${url.trim()}`, () => {
      assert.equal(R.isUrlAllowed(url), true);
    });
  }
});

/* ================================================================== *
 * 3. IP / 私网判定（纯文本策略，host 侧连接时使用）
 * ================================================================== */

describe('host 出口 IP 策略', () => {
  it('私网 IPv4 全部判 false', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '172.31.0.1', '192.168.0.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '224.0.0.9', '255.255.255.255']) {
      assert.equal(R.isPublicAddress(ip, 4), false, `${ip} 应判非公网`);
    }
  });

  it('公网 IPv4 判 true', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '157.148.134.13', '211.97.92.149']) {
      assert.equal(R.isPublicAddress(ip, 4), true, `${ip} 应判公网`);
    }
  });

  it('IPv6 私网/本地段判 false', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '2001:db8::1', '64:ff9b::1']) {
      assert.equal(R.isPublicAddress(ip, 6), false, `${ip} 应判非公网`);
    }
  });

  it('公网 IPv6 判 true', () => {
    for (const ip of ['2408:8756:d0fe:300::12', '2408:875c:3000:5:8000:0:b00:22']) {
      assert.equal(R.isPublicAddress(ip, 6), true, `${ip} 应判公网`);
    }
  });

  it('family 推断：含冒号当 v6，点分当 v4', () => {
    assert.equal(R.isPublicAddress('8.8.8.8'), true);
    assert.equal(R.isPublicAddress('::1'), false);
    assert.equal(R.isPublicAddress('not-an-ip'), false);
  });
});

describe('钉死 lookup：DNS 结果混入内网必须整条拒绝', () => {
  const baseLookup = (answers) => (host, opts, cb) => cb(null, answers);

  it('全部公网 → 放行并按 family 选择', (t, done) => {
    const lookup = R.createPinnedLookup(baseLookup([
      { address: '157.148.134.13', family: 4 },
      { address: '2408:8756::12', family: 6 },
    ]));
    lookup('www.bilibili.com', { family: 4 }, (error, address, family) => {
      assert.ifError(error);
      assert.equal(address, '157.148.134.13');
      assert.equal(family, 4);
      done();
    });
  });

  it('混入 10.x → 报 RESOLVE_BLOCKED', (t, done) => {
    const lookup = R.createPinnedLookup(baseLookup([
      { address: '157.148.134.13', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]));
    lookup('evil.example.com', {}, (error) => {
      assert.ok(error, '必须报错');
      assert.equal(error.code, R.ERROR_CODES.RESOLVE_BLOCKED);
      done();
    });
  });

  it('空结果 → ENOTFOUND', (t, done) => {
    const lookup = R.createPinnedLookup(baseLookup([]));
    lookup('nx.example.com', {}, (error) => {
      assert.ok(error);
      assert.equal(error.message, 'ENOTFOUND');
      done();
    });
  });

  it('自定义策略可整体替换（证明校验点只有一个）', (t, done) => {
    const lookup = R.createPinnedLookup(baseLookup([{ address: '10.0.0.5', family: 4 }]), () => true);
    lookup('internal.example.com', {}, (error, address) => {
      assert.ifError(error);
      assert.equal(address, '10.0.0.5');
      done();
    });
  });
});

/* ================================================================== *
 * 4. normalizeResult：Lead 对齐过的 track 契约
 * ================================================================== */

describe('normalizeResult 契约', () => {
  it('streamOnly 平台结果：url 字段整体省略，pageUrl 必在', () => {
    const out = P.normalizeResult({
      platform: 'netease-playlist',
      title: '测试歌单',
      cover: 'https://p1.music.126.net/a.jpg',
      pageUrl: 'https://music.163.com/#/playlist?id=1',
      tracks: [{ title: '晴天', artist: '周杰伦', pageUrl: 'https://music.163.com/#/song?id=1', streamOnly: true }],
    });
    assert.equal(out.platform, 'netease-playlist');
    assert.equal(out.tracks.length, 1);
    assert.equal('url' in out.tracks[0], false, 'streamOnly 时不允许出现 url 字段');
    assert.equal(out.tracks[0].streamOnly, true);
    assert.equal(out.tracks[0].pageUrl, 'https://music.163.com/#/song?id=1');
  });

  it('有直链时 streamOnly=false 且 url 保留', () => {
    const out = P.normalizeResult({
      platform: 'direct-audio',
      title: 'x',
      tracks: [{ title: 'a', url: 'https://y.gtimg.cn/a.mp3', streamOnly: false }],
    });
    assert.equal(out.tracks[0].streamOnly, false);
    assert.equal(out.tracks[0].url, 'https://y.gtimg.cn/a.mp3');
  });

  it('没声明 streamOnly 也没 url → 自动判 streamOnly:true', () => {
    const out = P.normalizeResult({ platform: 'qq-playlist', title: 't', tracks: [{ title: 'a' }] });
    assert.equal(out.tracks[0].streamOnly, true);
    assert.equal('url' in out.tracks[0], false);
  });

  it('bilibili track 必须带出 bvid', () => {
    const out = P.normalizeResult({
      platform: 'bilibili-video',
      title: 'mv',
      tracks: [{ title: 'mv', bvid: 'BV1GJ411x7h7', streamOnly: true, pageUrl: 'https://www.bilibili.com/video/BV1GJ411x7h7/' }],
    });
    assert.equal(out.tracks[0].bvid, 'BV1GJ411x7h7');
  });

  it('非法 bvid 不写进结果', () => {
    const out = P.normalizeResult({ platform: 'bilibili-video', title: 'mv', tracks: [{ title: 'mv', bvid: 'XX1' }] });
    assert.equal('bvid' in out.tracks[0], false);
  });

  it('空 tracks 抛 E_NO_STREAM', () => {
    assert.throws(() => P.normalizeResult({ platform: 'netease-playlist', tracks: [] }), (error) => {
      assert.equal(error.code, P.ERROR_CODES.NO_STREAM);
      return true;
    });
  });

  it('缺 tracks 抛 E_DECODE_FAILED', () => {
    assert.throws(() => P.normalizeResult({ platform: 'netease-playlist' }), (error) => {
      assert.equal(error.code, P.ERROR_CODES.DECODE_FAILED);
      return true;
    });
  });

  it('非对象输入抛 E_DECODE_FAILED', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      assert.throws(() => P.normalizeResult(bad), (error) => error.code === P.ERROR_CODES.DECODE_FAILED);
    }
  });

  it('未知 platform 归一为 unknown 而不是原样透传', () => {
    const out = P.normalizeResult({ platform: 'evil-platform', tracks: [{ title: 'a' }] });
    assert.equal(out.platform, 'unknown');
  });
});

describe('错误对象与 describeError', () => {
  it('createResolveError 带 code 且可被 isResolveError 认出', () => {
    const error = P.createResolveError(P.ERROR_CODES.NO_STREAM, '没曲目');
    assert.equal(error.code, 'E_NO_STREAM');
    assert.equal(P.isResolveError(error), true);
  });

  it('普通 Error 不被误判', () => {
    assert.equal(P.isResolveError(new Error('x')), false);
    assert.equal(P.isResolveError({ code: 'E_NO_STREAM', message: 'x', name: 'Error' }), false);
  });

  it('describeError 只对超时与阻塞给 retryable', () => {
    assert.equal(P.describeError(P.createResolveError(P.ERROR_CODES.RESOLVE_TIMEOUT, 't')).retryable, true);
    assert.equal(P.describeError(P.createResolveError(P.ERROR_CODES.RESOLVE_BLOCKED, 'b')).retryable, true);
    assert.equal(P.describeError(P.createResolveError(P.ERROR_CODES.NO_STREAM, 'n')).retryable, false);
    assert.equal(P.describeError(null).code, 'E_DECODE_FAILED');
  });
});

/* ================================================================== *
 * 5. host：重定向逐跳校验（长链、跳到内网、跳到 IP 都必须断）
 * ================================================================== */

describe('重定向逐跳校验', () => {
  it('短链 302 到合法 bilibili 页面 → 放行并返回最终 URL', async () => {
    const request = makeStubRequest({
      'https://b23.tv/BV1GJ411x7h7': { status: 302, headers: { location: 'https://www.bilibili.com/video/BV1GJ411x7h7/' } },
      'https://www.bilibili.com/video/BV1GJ411x7h7/': { status: 200, body: '<html>ok</html>' },
    });
    const out = await R.fetchWithRedirects('https://b23.tv/BV1GJ411x7h7', { request, timeoutMs: 500 });
    assert.equal(out.status, 200);
    assert.equal(out.finalUrl, 'https://www.bilibili.com/video/BV1GJ411x7h7/');
    assert.equal(out.hops.length, 2);
  });

  it('302 到 169.254.169.254 → RESOLVE_BLOCKED，且不会真的发第二次请求', async () => {
    const seen = [];
    const request = makeStubRequest({
      'https://b23.tv/x': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
    }, seen);
    await assert.rejects(
      () => R.fetchWithRedirects('https://b23.tv/x', { request, timeoutMs: 500 }),
      (error) => {
        assert.equal(error.code, R.ERROR_CODES.RESOLVE_BLOCKED);
        return true;
      },
    );
    assert.equal(seen.length, 1, '内网跳转必须在第二跳前就被拦下');
    assert.ok(!seen.some((url) => url.includes('169.254')), '绝不允许对 169.254.169.254 发起连接');
  });

  it('302 到 IP 直连 → 拒绝', async () => {
    const seen = [];
    const request = makeStubRequest({
      'https://b23.tv/y': { status: 302, headers: { location: 'http://93.184.216.34/a.mp3' } },
    }, seen);
    await assert.rejects(() => R.fetchWithRedirects('https://b23.tv/y', { request, timeoutMs: 500 }), (error) => {
      assert.equal(error.code, R.ERROR_CODES.RESOLVE_BLOCKED);
      return true;
    });
    assert.equal(seen.length, 1);
  });

  it('302 到非白名单域名 → 拒绝', async () => {
    const seen = [];
    const request = makeStubRequest({
      'https://b23.tv/z': { status: 302, headers: { location: 'https://evil.example.com/x' } },
    }, seen);
    await assert.rejects(() => R.fetchWithRedirects('https://b23.tv/z', { request, timeoutMs: 500 }), (error) => {
      assert.equal(error.code, R.ERROR_CODES.RESOLVE_BLOCKED);
      return true;
    });
    assert.ok(!seen.some((url) => url.includes('evil.example.com')));
  });

  it('超过 maxRedirects → 拒绝', async () => {
    const request = makeStubRequest({
      'https://b23.tv/a': { status: 302, headers: { location: 'https://b23.tv/b' } },
      'https://b23.tv/b': { status: 302, headers: { location: 'https://b23.tv/c' } },
      'https://b23.tv/c': { status: 302, headers: { location: 'https://b23.tv/d' } },
    });
    await assert.rejects(
      () => R.fetchWithRedirects('https://b23.tv/a', { request, timeoutMs: 500, maxRedirects: 2 }),
      (error) => error.code === R.ERROR_CODES.RESOLVE_BLOCKED,
    );
  });

  it('超时 → E_RESOLVE_TIMEOUT', async () => {
    await assert.rejects(
      () => R.fetchWithRedirects('https://b23.tv/slow', { request: makeHangingRequest(), timeoutMs: 30 }),
      (error) => error.code === R.ERROR_CODES.RESOLVE_TIMEOUT,
    );
  });
});

/* ================================================================== *
 * 6. host：完整解析链路（全程 stub 网络）
 * ================================================================== */

describe('host 解析链路（stub 网络）', () => {
  it('bilibili BV → 归一结果，track 必带 bvid 且 streamOnly', async () => {
    const request = makeStubRequest({
      'https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7': { status: 200, body: JSON.stringify(bilibiliViewPayload()) },
    });
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    const outcome = await api.resolve('https://www.bilibili.com/video/BV1GJ411x7h7');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.platform, 'bilibili-video');
    assert.equal(outcome.result.tracks[0].bvid, 'BV1GJ411x7h7');
    assert.equal(outcome.result.tracks[0].streamOnly, true);
    assert.equal('url' in outcome.result.tracks[0], false);
  });

  it('同 URL 第二次命中缓存（不再发请求）', async () => {
    const seen = [];
    const request = makeStubRequest({
      'https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7': { status: 200, body: JSON.stringify(bilibiliViewPayload()) },
    }, seen);
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    await api.resolve('https://www.bilibili.com/video/BV1GJ411x7h7');
    const count = seen.length;
    const second = await api.resolve('https://www.bilibili.com/video/BV1GJ411x7h7');
    assert.equal(second.cached, true);
    assert.equal(seen.length, count, '缓存命中不允许再打网络');
  });

  it('失败结果不进缓存（同一 URL 两次失败都真的请求）', async () => {
    const seen = [];
    const request = makeStubRequest({
      'https://music.163.com/api/v6/playlist/detail?id=1&n=1000': { status: 500, body: 'boom' },
    }, seen);
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    const first = await api.resolve('https://music.163.com/#/playlist?id=1');
    const second = await api.resolve('https://music.163.com/#/playlist?id=1');
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
    assert.equal(seen.length, 2);
  });

  it('网易云歌单：没有票据表时报 E_NO_STREAM，且不去问 enhance 接口', async () => {
    const seen = [];
    const request = makeStubRequest({
      'https://music.163.com/api/v6/playlist/detail?id=24381616&n=1000': { status: 200, body: JSON.stringify(neteasePlaylistPayload()) },
    }, seen);
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    const outcome = await api.resolve('https://music.163.com/#/playlist?id=24381616');
    // 没有 mediaTokens 就签不出票据，能播的曲目数为 0 → 报 E_NO_STREAM。
    // 这不是缺陷：没票据的曲目入队后点了必然报错，不如当场如实报失败。
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, R.ERROR_CODES.NO_STREAM);
    assert.ok(outcome.message.includes('没有一首能拿到直链'));
    // 关键：没有票据时**一次 enhance 请求都不该发**（白拿一批直链只增加失败面）。
    assert.equal(seen.filter((u) => u.includes('enhance/player/url')).length, 0);
  });

  it('网易云歌单：有票据表时逐首签票据，且绝不回明文直链', async () => {
    const request = makeStubRequest({
      'https://music.163.com/api/v6/playlist/detail?id=24381616&n=1000': { status: 200, body: JSON.stringify(neteasePlaylistPayload()) },
      // enhance 的 query 带 ids 与 br，精确键写不出来，靠裸路径 + matchAllQueries 命中。
      'https://music.163.com/api/song/enhance/player/url': {
        matchAllQueries: true,
        status: 200,
        body: JSON.stringify({
          code: 200,
          data: [
            { id: 186016, url: 'http://m801.music.126.net/a.mp3', type: 'mp3', size: 1024 },
            // 第二首刻意给 url:null —— 模拟会员曲，必须被筛掉而不是入队。
            { id: 186017, url: null, type: 'mp3', code: -110, fee: 1 },
          ],
        }),
      },
    });
    const { createMediaTokenStore } = await import('../src/host/mediatoken.js');
    const api = R.createResolveApi({ request, timeoutMs: 500, mediaTokens: createMediaTokenStore() });
    const outcome = await api.resolve('https://music.163.com/#/playlist?id=24381616');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.platform, 'netease-playlist');
    // 两首候选里只有第一首拿到直链，所以只应返回一首。
    assert.equal(outcome.result.tracks.length, 1);
    const track = outcome.result.tracks[0];
    assert.equal(track.id, '186016');
    // 有票据时 streamOnly 必须为 false，且 streamPath 必须是不透明票据路径。
    assert.equal(track.streamOnly, false);
    assert.ok(track.streamPath.startsWith('/api/dsh-music-on/stream?mt='));
    // 关键：明文直链绝不能出现。一旦泄漏，平台 CDN 白名单就形同虚设。
    assert.equal('url' in track, false);
    // 只断言「音频直链」没泄漏。不能笼统禁 music.126.net —— 封面图也在这个域下，
    // 那种断言会把合法的 album picUrl 一起判成泄漏（曾经就这么误伤过一次）。
    assert.equal(JSON.stringify(track).includes('.mp3'), false);
    assert.equal(track.streamPath.includes('m801'), false);
    assert.ok(track.pageUrl.startsWith('https://music.163.com/'));
  });

  it('非白名单 URL → E_RESOLVE_BLOCKED，连请求都不发', async () => {
    const seen = [];
    const request = makeStubRequest({}, seen);
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    const outcome = await api.resolve('http://169.254.169.254/latest/meta-data/');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, R.ERROR_CODES.RESOLVE_BLOCKED);
    assert.equal(seen.length, 0);
  });

  it('平台返回 code 非 0 → E_DECODE_FAILED', async () => {
    const request = makeStubRequest({
      'https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7': { status: 200, body: JSON.stringify({ code: -404, message: '啥都木有' }) },
    });
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    const outcome = await api.resolve('https://www.bilibili.com/video/BV1GJ411x7h7');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, R.ERROR_CODES.DECODE_FAILED);
  });

  it('返回非 JSON → E_DECODE_FAILED', async () => {
    const request = makeStubRequest({
      'https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7': { status: 200, body: '<html>拦截</html>' },
    });
    const api = R.createResolveApi({ request, timeoutMs: 500 });
    const outcome = await api.resolve('https://www.bilibili.com/video/BV1GJ411x7h7');
    assert.equal(outcome.code, R.ERROR_CODES.DECODE_FAILED);
  });
});

/* ================================================================== *
 * 7. host 路由适配：handleResolveRequest
 * ================================================================== */

describe('handleResolveRequest 协议适配', () => {
  const api = { resolve: async (url) => (url.includes('bad') ? { ok: false, code: 'E_RESOLVE_BLOCKED', message: 'no' } : { ok: true, result: { platform: 'x', tracks: [] }, ms: 1 }) };

  it('缺 url 参数 → 400', async () => {
    const response = await R.handleResolveRequest(new Request('http://127.0.0.1/api/dsh-music-on/resolve'), api);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'E_UNSUPPORTED_URL');
  });

  it('ok → 200 且 no-store', async () => {
    const response = await R.handleResolveRequest(new Request('http://127.0.0.1/api/dsh-music-on/resolve?url=x'), api);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).ok, true);
  });

  it('失败 → 按错误码给状态码', async () => {
    const response = await R.handleResolveRequest(new Request('http://127.0.0.1/api/dsh-music-on/resolve?url=bad'), api);
    assert.equal(response.status, 403);
  });

  it('非 GET/HEAD → 405 + allow', async () => {
    const response = await R.handleResolveRequest(new Request('http://127.0.0.1/api/dsh-music-on/resolve?url=x', { method: 'POST' }), api);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });
});

describe('registerResolveRoute 挂载契约', () => {
  it('缺 connection 服务时明确抛错（不静默失败）', () => {
    assert.throws(() => R.registerResolveRoute({}), /connection\.fetch\.register unavailable/);
  });

  it('用 ctx.connection.fetch.register 注册，路径与方法符合宿主约束', () => {
    const calls = [];
    const ctx = { connection: { fetch: { register: (route) => calls.push(route) } } };
    const dispose = R.registerResolveRoute(ctx, { request: makeStubRequest({}), timeoutMs: 100 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/api/dsh-music-on/resolve');
    assert.deepEqual(calls[0].methods, ['GET', 'HEAD']);
    assert.equal(calls[0].requestBody, 'buffered');
    assert.equal(typeof calls[0].fetch, 'function');
    assert.equal(typeof dispose, 'function');
  });

  it('路径满足宿主的 ENDPOINT_SEGMENT_PATTERN（/^[A-Za-z0-9_$.-]+$/）', () => {
    const endpoint = R.RESOLVE_PATH.slice('/api/'.length);
    const segments = endpoint.split('/');
    for (const segment of segments) {
      assert.match(segment, /^[A-Za-z0-9_$.-]+$/, `${segment} 不合法`);
      assert.notEqual(segment, '');
      assert.notEqual(segment, '.');
      assert.notEqual(segment, '..');
    }
  });
});

/* ================================================================== *
 * 8. URL 归一细节
 * ================================================================== */

describe('normalizeUrl 归一', () => {
  it('补协议', () => {
    assert.equal(P.normalizeUrl('www.bilibili.com/video/BV1GJ411x7h7'), 'https://www.bilibili.com/video/BV1GJ411x7h7');
    assert.equal(P.normalizeUrl('//b23.tv/abc'), 'https://b23.tv/abc');
  });

  it('去控制字符与零宽字符', () => {
    assert.equal(P.normalizeUrl('\u200bhttps://b23.tv/abc\n'), 'https://b23.tv/abc');
  });

  it('循环解码最多三轮，防二次编码', () => {
    assert.throws(() => P.normalizeUrl('http%253A%252F%252F127.0.0.1%252F'), (error) => error.code === 'E_RESOLVE_BLOCKED');
  });

  it('userinfo 直接判阻塞', () => {
    assert.throws(() => P.normalizeUrl('http://a:b@www.bilibili.com/'), (error) => error.code === 'E_RESOLVE_BLOCKED');
  });

  it('file: 协议判阻塞', () => {
    assert.throws(() => P.normalizeUrl('file:///C:/x'), (error) => error.code === 'E_RESOLVE_BLOCKED');
  });

  it('空与非法输入判 unsupported', () => {
    for (const bad of ['', '   ', 'not a url']) {
      assert.throws(() => P.normalizeUrl(bad), (error) => error.code === 'E_UNSUPPORTED_URL');
    }
  });
});

describe('isIpLiteral 文本判定', () => {
  it('识别所有 IP 写法', () => {
    for (const host of ['127.0.0.1', '8.8.8.8', '::1', 'fe80::1', '2130706433', '0x7f000001']) {
      assert.equal(P.isIpLiteral(host), true, host);
    }
  });
  it('域名字符串不误判', () => {
    for (const host of ['www.bilibili.com', 'b23.tv', 'music.163.com']) {
      assert.equal(P.isIpLiteral(host), false, host);
    }
  });
});
