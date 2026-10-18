/**
 * dsh-music-on · host 侧流代理单测（node --test，零依赖）
 *
 * 设计原则：
 *   1) 全部离线。上游用 node:https 的假实现注入（options.request），
 *      不碰真实 B 站接口，也不受本机代理环境影响。
 *   2) 测「行为」不测「实现」：Range 是否真透传、Content-Type 是否真被强制成
 *      audio/mp4、284MB 是否真的分块流式而不是整块 buffer —— 这三点是线上会炸的地方。
 *   3) 安全边界逐条打：每个拒绝理由都有独立用例，任何一个被放宽都会红。
 *
 * 运行：
 *   node --test test/stream.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import {
  STREAM_PATH,
  ERROR_CODES,
  STATUS_BY_CODE,
  RECOVERY_BY_CODE,
  DEFAULTS,
  BVID_PATTERN,
  parseStreamQuery,
  parseRangeHeader,
  planUpstreamRange,
  checkStreamUrl,
  isAllowedCdnHostname,
  isWellFormedHostname,
  isPublicAddress,
  createPinnedLookup,
  createCache,
  manifestCacheKey,
  pickAudioStream,
  buildPlayurlUrl,
  passthroughResponse,
  createStreamApi,
  registerStreamRoute,
  statusForCode,
  recoveryForCode,
  checkPlatformUrl,
  refererForHost,
  PLATFORM_CDN_DOMAINS,
} from '../src/host/stream.js';
import { createMediaTokenStore, buildMediaStreamPath, TOKEN_ERRORS } from '../src/host/mediatoken.js';

/* ------------------------------------------------------------------ *
 * 假上游
 * ------------------------------------------------------------------ */

/**
 * 造一个假的 https.request 实现。签名与 node:https.request 一致：
 *   request(options, onResponse) -> ClientRequest（.end() / .destroy() / .on('error')）
 *
 * 每个 handler 收到 { options, respond(upstreamResponse), fail(error) }。
 *
 * 【两条硬约束，改之前先读，都是实测踩出来的】
 *
 * 1) respond 里**不能**覆盖 stream.destroy。undici（Response 构造器）内部依赖
 *    IncomingMessage 的真实 destroy 结束管道；桩成空函数会让 Response.body
 *    永远不 done、`for await` 静默挂死。
 *
 * 2) 必须给 206 响应补 content-length。passthroughResponse 遇到
 *    「206 且既无 content-length 也无 content-range」时会走
 *    `new Response(upstream.body, …)`，而经典 Readable 不是 ReadableStream，
 *    这一步抛 TypeError；更糟的是 pipeTo 内部派生的那个 promise 无人 catch，
 *    Node 24 默认 --unhandled-rejections=throw，测试进程直接猝死。
 *    症状不是「用例失败」，而是 `node --test` 父进程刷完进度后**永远不退出**，
 *    极难定位。真实 CDN 在 206 里一定会给长度，所以这里补上更贴近真实。
 *
 * 3) fail() 的 rejection 走 end() 之后的 queueMicrotask 投递，保证
 *    openUpstream 已经挂好 `upstream.on('error')`，不会变成 unhandled rejection。
 */
function createFakeHttps(handlers) {
  const calls = [];
  const queue = Array.isArray(handlers) ? [...handlers] : [handlers];
  function request(options, onResponse) {
    calls.push(options);
    const handler = queue.length > 1 ? queue.shift() : queue[0];
    const req = new EventEmitter();
    req.destroyed = false;
    /** 待投递的上游失败；end() 时若有则 emit('error')。 */
    let pendingFailure = null;

    function respond(spec) {
      const body = spec && spec.body !== undefined ? spec.body : Buffer.alloc(0);
      const stream =
        body instanceof Readable ? body : Readable.from([typeof body === 'function' ? body() : body]);
      stream.statusCode = (spec && spec.status) || 200;
      stream.headers = { ...((spec && spec.headers) || {}) };
      if (stream.headers['content-length'] === undefined && Buffer.isBuffer(body)) {
        stream.headers['content-length'] = String(body.length);
      }
      // 不碰 stream.destroy —— 保持原生实现，见上方约束 1。
      onResponse(stream);
    }

    function fail(error) {
      pendingFailure = error;
    }

    req.end = () => {
      if (handler && typeof handler.then === 'function') {
        handler.then((fn) => fn({ options, respond, fail }), (error) => fail(error));
        return;
      }
      try {
        if (typeof handler === 'function') handler({ options, respond, fail });
      } catch (error) {
        fail(error);
      }
      if (pendingFailure !== null) {
        const error = pendingFailure;
        pendingFailure = null;
        queueMicrotask(() => req.emit('error', error));
      }
    };
    req.destroy = () => {
      req.destroyed = true;
    };
    return req;
  }
  return { request, calls };
}

const UA_TEST = 'test-agent/1.0';
const CDN_URL = 'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/12/34/567890.mp4?deadline=1700000000&eid=abc&orderid=0';

/** 造一份 playurl JSON。 */
function playurlPayload(overrides = {}) {
  return JSON.stringify({
    code: 0,
    message: '0',
    data: {
      dash: {
        audio: [
          {
            id: 30232,
            bandwidth: 123756,
            mimeType: 'audio/mp4',
            codecs: 'mp4a.40.2',
            baseUrl: 'https://upos-sz-mirrorcos.bilivideo.com/a-low.m4a?x=1',
          },
          {
            id: 30280,
            bandwidth: 209347,
            mimeType: 'audio/mp4',
            codecs: 'mp4a.40.2',
            baseUrl: CDN_URL,
            backupUrl: ['https://upos-sz-mirrorcoso1.bilivideo.com/a-backup.m4a?x=1'],
          },
        ],
        duration: 300,
      },
    },
    ...overrides,
  });
}

/** 造一个管理 playurl + 媒体请求的假上游控制器。 */
function createUpstream({ payload = playurlPayload(), manifestStatus = 200, media } = {}) {
  const state = { manifest: 0, media: 0, mediaHeaders: [] };
  const { request, calls } = createFakeHttps(({ options, respond }) => {
    const host = String(options.hostname || '');
    if (host.endsWith('bilibili.com') && String(options.path || '').startsWith('/x/player/playurl')) {
      state.manifest += 1;
      respond({
        status: manifestStatus,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: Buffer.from(payload, 'utf8'),
      });
      return;
    }
    if (host.endsWith('bilibili.com') && String(options.path || '').startsWith('/x/web-interface/view')) {
      respond({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ code: 0, data: { pages: [{ page: 1, cid: 36737517327 }] } })),
      });
      return;
    }
    state.media += 1;
    state.mediaHeaders.push(options.headers);
    const spec = typeof media === 'function' ? media({ options, index: state.media }) : media;
    respond(spec || { status: 206, headers: {}, body: Buffer.alloc(0) });
  });
  return { state, request, calls };
}

function makeRequest(query, { range, signal } = {}) {
  const url = `http://127.0.0.1:3080${STREAM_PATH}?${query}`;
  const headers = new Headers();
  if (range !== undefined) headers.set('range', range);
  headers.set('host', '127.0.0.1:3080');
  return new Request(url, { method: 'GET', headers, ...(signal ? { signal } : {}) });
}

async function readAll(response) {
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/* ------------------------------------------------------------------ *
 * 1. 常量与路径一致性
 * ------------------------------------------------------------------ */

test('路径与 shared.js 的 STREAM_PATH 逐字相等', async () => {
  const shared = await import('../src/shared.js');
  assert.equal(STREAM_PATH, shared.STREAM_PATH);
  assert.equal(STREAM_PATH, '/api/dsh-music-on/stream');
});

test('错误码表完整：每个码都有状态码与恢复动作', () => {
  for (const code of Object.values(ERROR_CODES)) {
    assert.equal(typeof STATUS_BY_CODE[code], 'number', `${code} 缺状态码`);
    assert.equal(typeof RECOVERY_BY_CODE[code], 'string', `${code} 缺恢复动作`);
  }
  assert.equal(statusForCode(ERROR_CODES.EXPIRED), 410);
  assert.equal(statusForCode(ERROR_CODES.BLOCKED), 403);
  assert.equal(recoveryForCode(ERROR_CODES.NO_AUDIO), 'degrade-embed');
  assert.equal(recoveryForCode(ERROR_CODES.EXPIRED), 'refresh-once');
  assert.equal(statusForCode('E_NOT_EXIST'), 500);
});

test('缓存 TTL 硬上限 60 秒（B 站直链有时效）', () => {
  assert.equal(DEFAULTS.cacheTtlMs, 60_000);
  const api = createStreamApi();
  assert.equal(api.settings.cacheTtlMs, 60_000);
});

/* ------------------------------------------------------------------ *
 * 2. 参数校验
 * ------------------------------------------------------------------ */

test('bvid 正则 ^BV[0-9A-Za-z]{10}$ 逐条钉死', () => {
  assert.equal(BVID_PATTERN.test('BV1Lyw7zPEeo'), true);
  assert.equal(BVID_PATTERN.test('BV1234567890'), true);
  assert.equal(BVID_PATTERN.test('BV123456789'), false, '少一位');
  assert.equal(BVID_PATTERN.test('BV12345678901'), false, '多一位');
  assert.equal(BVID_PATTERN.test('bv1Lyw7zPEeo'), false, '小写 bv 不接受');
  assert.equal(BVID_PATTERN.test('BV1Lyw7zPEe!'), false, '非法字符');
  assert.equal(BVID_PATTERN.test('<script>'), false);
});

test('parseStreamQuery：正常参数', () => {
  const q = parseStreamQuery(new URLSearchParams('bvid=BV1Lyw7zPEeo&cid=36737517327'));
  assert.deepEqual(q, { bvid: 'BV1Lyw7zPEeo', aid: null, cid: '36737517327', page: 1 });
});

test('parseStreamQuery：cid 非纯数字一律 400', () => {
  for (const bad of ['abc', '12a', '-1', '1.5', '0x10', ' 123', '１２３']) {
    assert.throws(
      () => parseStreamQuery(new URLSearchParams(`bvid=BV1Lyw7zPEeo&cid=${encodeURIComponent(bad)}`)),
      (error) => error.code === ERROR_CODES.BAD_REQUEST,
      `cid=${bad} 应被拒`,
    );
  }
});

test('parseStreamQuery：缺 bvid/aid、非法 page 都被拒', () => {
  assert.throws(() => parseStreamQuery(new URLSearchParams('cid=1')), /bvid|aid/);
  assert.throws(() => parseStreamQuery(new URLSearchParams('bvid=BV1Lyw7zPEeo&page=x')), (e) => e.code === ERROR_CODES.BAD_REQUEST);
  const q = parseStreamQuery(new URLSearchParams('aid=170001&page=3'));
  assert.equal(q.aid, '170001');
  assert.equal(q.page, 3);
  assert.equal(q.cid, null);
});

/* ------------------------------------------------------------------ *
 * 3. Range 解析与分片规划
 * ------------------------------------------------------------------ */

test('parseRangeHeader：四种输入形态', () => {
  assert.deepEqual(parseRangeHeader(undefined), { kind: 'none' });
  assert.deepEqual(parseRangeHeader(''), { kind: 'none' });
  assert.deepEqual(parseRangeHeader('bytes=0-2047'), { kind: 'range', start: 0, end: 2047 });
  assert.deepEqual(parseRangeHeader('bytes=100-'), { kind: 'range', start: 100, end: null });
  assert.deepEqual(parseRangeHeader('bytes=-500'), { kind: 'range', start: null, end: 500 });
  assert.deepEqual(parseRangeHeader('bytes=0-1,5-9'), { kind: 'multi' });
  assert.deepEqual(parseRangeHeader('bytes=10-5'), { kind: 'invalid' });
  assert.deepEqual(parseRangeHeader('bytes=-'), { kind: 'invalid' });
  assert.deepEqual(parseRangeHeader('items=0-1'), { kind: 'invalid' });
});

test('planUpstreamRange：闭区间原样透传，开区间补默认分片', () => {
  const chunk = 1024;
  assert.deepEqual(planUpstreamRange({ kind: 'range', start: 0, end: 2047 }, -1, chunk), {
    header: 'bytes=0-2047', start: 0, end: 2047, suffix: false,
  });
  assert.deepEqual(planUpstreamRange({ kind: 'range', start: 100, end: null }, -1, chunk), {
    header: 'bytes=100-1123', start: 100, end: 1123, suffix: false,
  });
  assert.equal(planUpstreamRange({ kind: 'none' }, -1, chunk).header, 'bytes=0-1023');
  assert.equal(planUpstreamRange({ kind: 'none' }, 284_325_961, chunk).header, 'bytes=0-1023');
  assert.equal(planUpstreamRange({ kind: 'multi' }, -1, chunk).header, 'bytes=0-1023');
});

/* ------------------------------------------------------------------ *
 * 4. 安全边界：src 白名单（本路由不是任意 URL 代理的唯一理由）
 * ------------------------------------------------------------------ */

test('checkStreamUrl：放行 B 站 CDN 真实直链', () => {
  const verdict = checkStreamUrl(CDN_URL);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.hostname, 'upos-sz-mirrorcos.bilivideo.com');
});

test('checkStreamUrl：白名单逐条拒绝', () => {
  const cases = [
    ['http://upos-sz-mirrorcos.bilivideo.com/a', 'http 不允许'],
    ['https://169.254.169.254/latest/meta-data/', '云元数据 IP'],
    ['https://127.0.0.1:7897/upgcxcode/a', '回环'],
    ['https://10.0.0.1/a', '内网'],
    ['https://[::1]/a', 'v6 回环'],
    ['https://0x7f.0.0.1/a', '十六进制 IP'],
    ['https://2130706433/a', '十进制 IP'],
    ['https://evil.example.com/a', '非 B 站域'],
    ['https://bilivideo.com.evil.com/a', '后缀伪装'],
    ['https://user:pass@upos-sz-mirrorcos.bilivideo.com/a', '带凭据'],
    ['https://upos-sz-mirrorcos.bilivideo.com/a%2f..%2fb', '百分号编码'],
    ['file:///etc/passwd', '非 http'],
    [`https://upos-sz-mirror${'a'.repeat(53)}.bilivideo.com/a`, '子域超长'],
    ['https://upos..bilivideo.com/a', '空标签'],
    ['https://-bad.bilivideo.com/a', '标签以连字符开头'],
    ['https://bilivideo.com/a', '根域本身要放行?'],
  ];
  for (const [input, label] of cases) {
    const verdict = checkStreamUrl(input);
    if (label === '根域本身要放行?') {
      assert.equal(verdict.ok, true, `${label} 应放行根域`);
      continue;
    }
    assert.equal(verdict.ok, false, `${label} 应被拒：${input}`);
    assert.equal(typeof verdict.message, 'string');
  }
  assert.equal(checkStreamUrl('').ok, false);
  assert.equal(checkStreamUrl(12345).ok, false);
  assert.equal(checkStreamUrl('https://upos-sz-mirrorcos.bilivideo.com/a\u0000b').ok, false);
});

test('isAllowedCdnHostname 覆盖 szbdyd / akamaized / hdslb', () => {
  assert.equal(isAllowedCdnHostname('upos-sz-mirrorcos.bilivideo.com'), true);
  assert.equal(isAllowedCdnHostname('cn-hk-eq-bcache-01.szbdyd.com'), true);
  assert.equal(isAllowedCdnHostname('upos-hz-mirrorakam.akamaized.net'), true);
  assert.equal(isAllowedCdnHostname('i0.hdslb.com'), true);
  assert.equal(isAllowedCdnHostname('evil.com'), false);
  assert.equal(isAllowedCdnHostname('bilivideo.com.evil.com'), false);
  assert.equal(isAllowedCdnHostname(''), false);
  assert.equal(isWellFormedHostname('a'.repeat(64) + '.bilivideo.com'), false, '单标签 >63');
});

test('createPinnedLookup：DNS 结果里混一个内网就整条拒绝（防 rebinding）', () => {
  const base = (host, opts, cb) => cb(null, [
    { address: '203.0.113.9', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  const lookup = createPinnedLookup(base);
  let failure = null;
  lookup('upos-sz-mirrorcos.bilivideo.com', {}, (error) => { failure = error; });
  assert.ok(failure, '应报错');
  assert.equal(failure.code, ERROR_CODES.BLOCKED);

  const okBase = (host, opts, cb) => cb(null, [{ address: '223.5.5.5', family: 4 }]);
  const good = createPinnedLookup(okBase);
  let address = null;
  good('upos-sz-mirrorcos.bilivideo.com', {}, (error, ip) => { address = ip; });
  assert.equal(address, '223.5.5.5');
});

test('isPublicAddress 判定内网/公网', () => {
  assert.equal(isPublicAddress('223.5.5.5'), true);
  assert.equal(isPublicAddress('10.1.2.3'), false);
  assert.equal(isPublicAddress('192.168.1.1'), false);
  assert.equal(isPublicAddress('::1'), false);
  assert.equal(isPublicAddress('fe80::1'), false);
  assert.equal(isPublicAddress('not-an-ip'), false);
});

/* ------------------------------------------------------------------ *
 * 5. playurl 清单：挑流 / 构建 URL
 * ------------------------------------------------------------------ */

test('buildPlayurlUrl：bvid+cid 走 fnval=16 的 DASH 接口', () => {
  const url = new URL(buildPlayurlUrl({ bvid: 'BV1Lyw7zPEeo', aid: null, cid: '36737517327', page: 1 }));
  assert.equal(url.hostname, 'api.bilibili.com');
  assert.equal(url.pathname, '/x/player/playurl');
  assert.equal(url.searchParams.get('bvid'), 'BV1Lyw7zPEeo');
  assert.equal(url.searchParams.get('cid'), '36737517327');
  assert.equal(url.searchParams.get('fnval'), '16');
  assert.equal(url.searchParams.get('qn'), '64');
});

test('buildPlayurlUrl：只有 aid 时用 avid，多 P 带 p', () => {
  const url = new URL(buildPlayurlUrl({ bvid: null, aid: '170001', cid: null, page: 2 }));
  assert.equal(url.searchParams.get('avid'), '170001');
  assert.equal(url.searchParams.get('p'), '2');
  assert.equal(url.searchParams.get('cid'), null);
});

test('pickAudioStream：默认取 bandwidth 最大的一条（30280/209347）', () => {
  const picked = pickAudioStream(JSON.parse(playurlPayload()));
  assert.equal(picked.id, 30280);
  assert.equal(picked.bandwidth, 209347);
  assert.equal(picked.mimeType, 'audio/mp4');
  assert.equal(picked.hostname, 'upos-sz-mirrorcos.bilivideo.com');
  assert.equal(picked.backupUrls.length, 1);
});

test('pickAudioStream：quality 指定档位时优先命中', () => {
  const picked = pickAudioStream(JSON.parse(playurlPayload()), { quality: 30232 });
  assert.equal(picked.id, 30232);
});

test('pickAudioStream：没有 dash.audio → NO_AUDIO', () => {
  const payload = JSON.parse(playurlPayload());
  payload.data.dash.audio = [];
  assert.throws(() => pickAudioStream(payload), (e) => e.code === ERROR_CODES.NO_AUDIO);
  assert.throws(() => pickAudioStream({ code: 0, data: {} }), (e) => e.code === ERROR_CODES.NO_AUDIO);
});

test('pickAudioStream：直链全不在白名单 → BLOCKED（不是静默放行）', () => {
  const payload = JSON.parse(playurlPayload());
  payload.data.dash.audio = [
    { id: 30280, bandwidth: 1, mimeType: 'audio/mp4', baseUrl: 'https://evil.com/a.m4a' },
  ];
  assert.throws(() => pickAudioStream(payload), (e) => e.code === ERROR_CODES.BLOCKED);
});

test('manifestCacheKey：不同 cid 必须是不同 key', () => {
  const a = manifestCacheKey({ bvid: 'BV1Lyw7zPEeo', aid: null, cid: '1' });
  const b = manifestCacheKey({ bvid: 'BV1Lyw7zPEeo', aid: null, cid: '2' });
  assert.notEqual(a, b);
  assert.equal(a.length, 32);
});

test('createCache：TTL 过期即删，LRU 淘汰最旧', () => {
  let clock = 0;
  const cache = createCache(60_000, 2, () => clock);
  cache.set('a', 1);
  clock = 59_000;
  assert.equal(cache.get('a'), 1);
  clock = 60_001;
  assert.equal(cache.get('a'), undefined, '过期必须失效');
  cache.set('x', 1);
  cache.set('y', 2);
  cache.set('z', 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('x'), undefined, '最旧被淘汰');
});

/* ------------------------------------------------------------------ *
 * 6. 响应改写：Content-Type 强制 audio/mp4（实测坑）
 * ------------------------------------------------------------------ */

test('passthroughResponse：application/octet-stream 必须被改写成 audio/mp4', async () => {
  const body = Buffer.from('FAKE-AUDIO-BYTES');
  const upstream = {
    status: 206,
    headers: {
      'content-type': 'application/octet-stream',
      'content-range': 'bytes 0-15/284325961',
      'content-length': String(body.length),
      'set-cookie': 'x=1',
      'content-encoding': 'gzip',
    },
    body: Readable.from([body]),
    destroy() {},
  };
  const response = passthroughResponse(upstream);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-type'), 'audio/mp4');
  assert.equal(response.headers.get('content-range'), 'bytes 0-15/284325961');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-encoding'), null, '不能把上游编码透给浏览器');
  assert.deepEqual(Buffer.from(await readAll(response)), body);
});

test('passthroughResponse：上游 200 整文件时按 content-length 补 206 + content-range', () => {
  const upstream = {
    status: 200,
    headers: { 'content-type': 'audio/mp4', 'content-length': '284325961' },
    body: Readable.from([Buffer.alloc(4)]),
    destroy() {},
  };
  const response = passthroughResponse(upstream);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-284325960/284325961');
  assert.equal(response.headers.get('content-length'), '284325961');
});

test('passthroughResponse：上游回 HTML/JSON 错误页 → EXPIRED，不伪造媒体', () => {
  let destroyed = false;
  const upstream = {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: Readable.from([Buffer.from('<html>403</html>')]),
    destroy() { destroyed = true; },
  };
  assert.throws(() => passthroughResponse(upstream), (e) => e.code === ERROR_CODES.EXPIRED);
  assert.equal(destroyed, true, '非媒体响应必须销毁上游连接');
});

/* ------------------------------------------------------------------ *
 * 7. 端到端（假上游）：流式透传、Range、缓存、失效
 * ------------------------------------------------------------------ */

test('handle：206 透传 + Range 转发 + Content-Type 改写（不整块 buffer）', async () => {
  // 造一个 8MiB 的「大文件」分块流：若实现偷懒整块 buffer，内存与切片数都会露馅。
  const CHUNKS = 8;
  const CHUNK = 1024 * 1024;
  let produced = 0;
  const media = {
    status: 206,
    headers: {
      'content-type': 'application/octet-stream',
      'content-range': `bytes 0-${CHUNKS * CHUNK - 1}/284325961`,
      'content-length': String(CHUNKS * CHUNK),
    },
    body: Readable.from(
      (function* generate() {
        for (let i = 0; i < CHUNKS; i += 1) {
          produced += 1;
          yield Buffer.alloc(CHUNK, i & 0xff);
        }
      })(),
    ),
  };
  const upstream = createUpstream({ media });
  const api = createStreamApi({ request: upstream.request, lookup: null });

  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=0-8388607' }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-type'), 'audio/mp4');
  assert.equal(response.headers.get('content-range'), 'bytes 0-8388607/284325961');

  let received = 0;
  for await (const chunk of response.body) received += chunk.length;
  assert.equal(received, CHUNKS * CHUNK, '字节数必须与上游完全一致');
  assert.equal(produced, CHUNKS, '上游必须被逐块消费，不能一次性读满');
  assert.equal(upstream.state.mediaHeaders[0].range, 'bytes=0-8388607', 'Range 必须原样转发');
});

test('handle：没有 Range 时自造 4MiB 分片，避免拖整个 284MB', async () => {
  const upstream = createUpstream({
    media: { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-4194303/284325961' }, body: Buffer.alloc(16) },
  });
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327'));
  assert.equal(response.status, 206);
  assert.equal(upstream.state.mediaHeaders[0].range, 'bytes=0-4194303');
});

test('handle：清单缓存 60 秒内复用，只问一次 playurl', async () => {
  const upstream = createUpstream({
    media: { status: 206, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(8) },
  });
  const api = createStreamApi({ request: upstream.request });
  await readAll(await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=0-7' })));
  await readAll(await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=8-15' })));
  await readAll(await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=16-23' })));
  assert.equal(upstream.state.manifest, 1, '3 次 Range 请求只应触发 1 次 playurl');
  assert.equal(upstream.state.media, 3);
});

test('handle：直链 403 → 410 EXPIRED，并清掉该条缓存', async () => {
  let mediaCalls = 0;
  const upstream = createUpstream({
    media: () => {
      mediaCalls += 1;
      return mediaCalls === 1
        ? { status: 403, headers: { 'content-type': 'text/html' }, body: Buffer.from('denied') }
        : { status: 206, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(4) };
    },
  });
  const api = createStreamApi({ request: upstream.request });
  const first = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=0-3' }));
  assert.equal(first.status, 410);
  const payload = JSON.parse(await first.text());
  assert.equal(payload.code, ERROR_CODES.EXPIRED);
  assert.equal(payload.recovery, 'refresh-once');
  assert.equal(api.cache.size, 0, '过期必须清缓存');

  // 第二次：重新问 playurl，拿到新直链后成功。
  const second = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=0-3' }));
  assert.equal(second.status, 206);
  assert.equal(upstream.state.manifest, 2, '失效后必须重新取清单');
});

test('handle：主直链拒绝时切 backupUrl', async () => {
  const upstream = createUpstream({
    media: ({ options }) => {
      const host = String(options.hostname || '');
      if (host.startsWith('upos-sz-mirrorcos.')) {
        return { status: 503, headers: { 'content-type': 'text/plain' }, body: Buffer.from('busy') };
      }
      return { status: 206, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(4) };
    },
  });
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=0-3' }));
  assert.equal(response.status, 206);
  assert.equal(upstream.state.media, 2, '主链 + 备份链各一次');
});

test('handle：playurl 返回 code=-400 → 502 且带 apiMessage', async () => {
  const upstream = createUpstream({
    payload: JSON.stringify({ code: -400, message: '请求错误', data: null }),
  });
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327'));
  assert.equal(response.status, 502);
  const payload = JSON.parse(await response.text());
  assert.equal(payload.code, ERROR_CODES.UPSTREAM_BAD);
  assert.equal(payload.recovery, 'degrade-embed');
  assert.equal(payload.detail.apiMessage, '请求错误');
});

test('handle：dash.audio 为空 → 404 NO_AUDIO（客户端据此降级 iframe）', async () => {
  const payload = JSON.parse(playurlPayload());
  payload.data.dash.audio = [];
  const upstream = createUpstream({ payload: JSON.stringify(payload) });
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327'));
  assert.equal(response.status, 404);
  const body = JSON.parse(await response.text());
  assert.equal(body.code, ERROR_CODES.NO_AUDIO);
  assert.equal(body.recovery, 'degrade-embed');
});

test('handle：参数畸形 → 400，且一次上游请求都不发', async () => {
  const upstream = createUpstream({});
  const api = createStreamApi({ request: upstream.request });
  for (const query of [
    'bvid=not-a-bvid&cid=1',
    'bvid=BV1Lyw7zPEeo&cid=abc',
    'cid=1',
    'bvid=BV1Lyw7zPEeo&cid=1&page=x',
  ]) {
    const response = await api.handle(makeRequest(query));
    assert.equal(response.status, 400, query);
    const body = JSON.parse(await response.text());
    assert.equal(body.code, ERROR_CODES.BAD_REQUEST);
    assert.equal(body.recovery, 'no-retry');
  }
  assert.equal(upstream.state.manifest, 0);
  assert.equal(upstream.state.media, 0);
});

test('handle：src 白名单外的 URL → 403 BLOCKED，绝不发起请求', async () => {
  const upstream = createUpstream({});
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(
    makeRequest('bvid=BV1Lyw7zPEeo&cid=1&src=https%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F'),
  );
  assert.equal(response.status, 403);
  assert.equal(upstream.state.media, 0, 'SSRF 尝试不能产生任何上游连接');
});

test('handle：显式 src 在白名单内时直接透传（不碰 playurl）', async () => {
  const upstream = createUpstream({
    media: { status: 206, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from('OK') },
  });
  const api = createStreamApi({ request: upstream.request });
  const src = encodeURIComponent(CDN_URL);
  const response = await api.handle(makeRequest(`bvid=BV1Lyw7zPEeo&cid=1&src=${src}`, { range: 'bytes=0-1' }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-type'), 'audio/mp4');
  assert.equal(upstream.state.manifest, 0, '显式 src 不应再问 playurl');
});

test('handle：缺 cid 时先查 view 接口拿 cid', async () => {
  const upstream = createUpstream({
    media: { status: 206, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(4) },
  });
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&page=1', { range: 'bytes=0-3' }));
  assert.equal(response.status, 206);
  const describe = await api.describe({ bvid: 'BV1Lyw7zPEeo', cid: '36737517327' });
  assert.equal(describe.audioId, 30280);
  assert.equal(describe.bandwidth, 209347);
});

test('handle：客户端断连 → 499 ABORTED，不拖住上游', async () => {
  const controller = new AbortController();
  const upstream = createUpstream({
    media: { status: 206, headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(4) },
  });
  const api = createStreamApi({ request: upstream.request });
  // 先预热清单，确保 Abort 只影响媒体请求。
  await api.describe({ bvid: 'BV1Lyw7zPEeo', cid: '36737517327' });
  const request = makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327', { range: 'bytes=0-3', signal: controller.signal });
  controller.abort();
  const response = await api.handle(request);
  assert.equal(response.status, 499);
  const body = JSON.parse(await response.text());
  assert.equal(body.code, ERROR_CODES.ABORTED);
});

/* ------------------------------------------------------------------ *
 * 8. 路由注册
 * ------------------------------------------------------------------ */

test('registerStreamRoute：走 ctx.connection.fetch.register，方法 GET/HEAD', () => {
  const registered = [];
  const ctx = {
    connection: {
      fetch: {
        register(route) {
          registered.push(route);
          return Promise.resolve(() => {});
        },
      },
    },
  };
  const dispose = registerStreamRoute(ctx, { request: createUpstream({}).request });
  assert.equal(typeof dispose, 'function');
  assert.equal(registered.length, 1);
  assert.equal(registered[0].path, STREAM_PATH);
  assert.deepEqual(registered[0].methods, ['GET', 'HEAD']);
  assert.equal(registered[0].requestBody, 'buffered');
  assert.equal(typeof registered[0].fetch, 'function');
  dispose();
});

test('registerStreamRoute：缺少 connection 服务时显式报错，不静默失败', () => {
  assert.throws(() => registerStreamRoute({}), /connection\.fetch\.register/);
  assert.throws(() => registerStreamRoute(null), /connection\.fetch\.register/);
});

/* ------------------------------------------------------------------ *
 * 9. 错误响应头
 * ------------------------------------------------------------------ */

test('streamErrorResponse：JSON 头齐全且带 no-store', async () => {
  const api = createStreamApi({ request: createUpstream({}).request });
  const response = await api.handle(makeRequest('bvid=BAD'));
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
});

/*
 * CORS 头是「有进度没声音」的防线，必须常驻。
 *
 * 事故链：客户端 <audio> 曾设 crossOrigin='anonymous'，而本路由不回
 * Access-Control-Allow-Origin。按规范，MediaElementAudioSourceNode 在元素处于
 * CORS 模式且校验不过时必须输出静音 —— 进度条照走、play() 照常 resolve，
 * 唯独没有声音。两边各留一条断言，防止任何一侧被悄悄改回去。
 */
test('流响应必须带 access-control-allow-origin', async () => {
  const upstream = createUpstream({});
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327'));
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  if (response.body) await response.arrayBuffer();
});

test('错误响应也必须带 access-control-allow-origin', async () => {
  const api = createStreamApi({ request: createUpstream({}).request });
  const response = await api.handle(makeRequest('bvid=BAD'));
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

/* ------------------------------------------------------------------ *
 * 8. token 通道（网易云 / QQ 音乐直链）
 *
 * 存在的理由：这两个平台的 CDN 不在 B 站白名单里，若让客户端把明文直链交给
 * `src=` 通道，那条路由立刻变成开放代理。所以宿主签发 HMAC 票据，
 * 客户端只拿票据，域名白名单换成 PLATFORM_CDN_DOMAINS。
 * ------------------------------------------------------------------ */

/** 造一个平台 CDN 的假上游：只认网易云/QQ 的媒体域。 */
function createPlatformUpstream({ media = null } = {}) {
  const state = { media: 0, hosts: [], headers: [] };
  const { request, calls } = createFakeHttps(({ options, respond }) => {
    state.media += 1;
    state.hosts.push(String(options.hostname || ''));
    state.headers.push(options.headers);
    const spec = typeof media === 'function' ? media({ options, index: state.media }) : media;
    respond(spec || {
      status: 206,
      headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-1023/4096' },
      body: Buffer.alloc(1024, 1),
    });
  });
  return { state, request, calls };
}

/** 造一张指向平台 CDN 的票据路径。 */
function makeTokenPath(store, overrides = {}) {
  return buildMediaStreamPath(store.sign({
    url: 'https://m701.music.126.net/obj/a.mp3',
    mime: 'audio/mpeg',
    platform: 'netease',
    id: '123',
    title: '测试曲',
    source: 'netease',
    ...overrides,
  }));
}

function makeTokenRequest(tokenPath, range) {
  const headers = new Headers();
  if (range !== undefined) headers.set('range', range);
  headers.set('host', '127.0.0.1:3080');
  return new Request(`http://127.0.0.1:3080${tokenPath}`, { method: 'GET', headers });
}

test('checkPlatformUrl：只认平台 CDN，B 站域名反而不在白名单', () => {
  assert.deepEqual([...PLATFORM_CDN_DOMAINS], ['music.126.net', 'tc.qq.com', 'stream.qqmusic.qq.com']);
  for (const good of [
    'https://m701.music.126.net/obj/a.mp3',
    'https://aqqmusic.tc.qq.com/C400.m4a',
    'https://sjy6.stream.qqmusic.qq.com/C400.m4a',
  ]) {
    assert.equal(checkPlatformUrl(good).ok, true, good);
  }
  // B站 CDN 与任意第三方域名都必须被拒 —— 这张表只在 token 通道生效。
  for (const bad of [
    'https://upos-sz-mirrorcos.bilivideo.com/x.m4s',
    'https://api.bilibili.com/x/player/playurl',
    'https://evil.com/a.mp3',
    'http://m701.music.126.net/a.mp3',
    'https://user:pass@m701.music.126.net/a.mp3',
    'https://127.0.0.1/a.mp3',
    'https://m701.music.126.net/a%2Fb.mp3',
  ]) {
    assert.equal(checkPlatformUrl(bad).ok, false, bad);
  }
});

test('refererForHost：平台 CDN 给对应平台的来源，其余回落默认', () => {
  assert.equal(refererForHost('m701.music.126.net'), 'https://music.163.com/');
  assert.equal(refererForHost('aqqmusic.tc.qq.com'), 'https://y.qq.com/');
  assert.equal(refererForHost('sjy6.stream.qqmusic.qq.com'), 'https://y.qq.com/');
  assert.equal(refererForHost('upos-sz-mirrorcos.bilivideo.com'), DEFAULTS.referer);
});

test('token 通道：合法票据 → 206 透传，content-type 用票据里的 mime', async () => {
  const store = createMediaTokenStore({ secret: Buffer.alloc(32, 7) });
  const upstream = createPlatformUpstream({});
  const api = createStreamApi({ request: upstream.request, mediaTokens: store });
  const response = await api.handle(makeTokenRequest(makeTokenPath(store), 'bytes=0-1023'));
  assert.equal(response.status, 206);
  // 网易云是 mp3，绝不能因为 DEFAULTS.contentType 是 audio/mp4 就把它标成 mp4。
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(upstream.state.hosts[0], 'm701.music.126.net');
  const body = await readAll(response);
  assert.equal(body.length, 1024);
});

test('token 通道：每一跳重定向都用平台白名单校验（B 站白名单会误杀平台直链）', async () => {
  const store = createMediaTokenStore({ secret: Buffer.alloc(32, 7) });
  // 第一跳 302 到另一个网易云子域。若 stream() 内部退回 checkStreamUrl，
  // 第一跳就被拒 —— 症状是「解析成功却一声不响」，报 403 E_STREAM_BLOCKED。
  const upstream = createPlatformUpstream({
    media: ({ index }) => (index === 1
      ? { status: 302, headers: { location: 'https://m801.music.126.net/obj/b.mp3' }, body: Buffer.alloc(0) }
      : { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-511/1024' }, body: Buffer.alloc(512, 2) }),
  });
  const api = createStreamApi({ request: upstream.request, mediaTokens: store });
  const response = await api.handle(makeTokenRequest(makeTokenPath(store), 'bytes=0-511'));
  assert.equal(response.status, 206, '平台 CDN 之间的 302 必须能跟随');
  assert.equal(upstream.state.hosts[1], 'm801.music.126.net');
  await readAll(response);
});

test('token 通道：票据里的直链若不在平台白名单 → 403（密钥泄漏也不放开）', async () => {
  const store = createMediaTokenStore({ secret: Buffer.alloc(32, 7) });
  const upstream = createPlatformUpstream({});
  const api = createStreamApi({ request: upstream.request, mediaTokens: store });
  const path = makeTokenPath(store, { url: 'https://evil.example.com/a.mp3' });
  const response = await api.handle(makeTokenRequest(path));
  assert.equal(response.status, 403);
  assert.equal(upstream.state.media, 0, '被拒时一次上游请求都不该发');
});

test('token 通道：篡改签名 → 403，且绝不解析载荷', async () => {
  const store = createMediaTokenStore({ secret: Buffer.alloc(32, 7) });
  const api = createStreamApi({ request: createPlatformUpstream({}).request, mediaTokens: store });
  const good = makeTokenPath(store);
  const tampered = `${good.slice(0, -3)}AAA`;
  const response = await api.handle(makeTokenRequest(tampered));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, ERROR_CODES.BLOCKED);
  assert.equal(body.detail.tokenCode, TOKEN_ERRORS.BAD_SIGNATURE);
});

test('token 通道：过期票据 → 410，恢复动作是重新解析', async () => {
  let clock = 1_000_000;
  const store = createMediaTokenStore({ secret: Buffer.alloc(32, 7), ttlMs: 1000, now: () => clock });
  const api = createStreamApi({ request: createPlatformUpstream({}).request, mediaTokens: store });
  const path = makeTokenPath(store);
  clock += 2000;
  const response = await api.handle(makeTokenRequest(path));
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.detail.tokenCode, TOKEN_ERRORS.EXPIRED);
  assert.equal(body.recovery, 'refresh-once');
});

test('token 通道：形态不合法的票据 → 400', async () => {
  const store = createMediaTokenStore({ secret: Buffer.alloc(32, 7) });
  const api = createStreamApi({ request: createPlatformUpstream({}).request, mediaTokens: store });
  for (const bad of ['nodot', '.onlysig', 'body.']) {
    const response = await api.handle(makeTokenRequest(`/api/dsh-music-on/stream?mt=${bad}`));
    assert.equal(response.status, 400, bad);
    await response.arrayBuffer();
  }
});

test('加了平台白名单也绝不放松 src= 通道：裸 src 指向网易云仍 403', async () => {
  const upstream = createPlatformUpstream({});
  const api = createStreamApi({ request: upstream.request });
  // 带上合法 bvid/cid 让 parseStreamQuery 通过 —— 否则会先被 400 拦下，
  // 测不到「src 通道自己也不认平台域名」这条边界。
  const response = await api.handle(makeRequest(
    `bvid=BV1Lyw7zPEeo&cid=36737517327&src=${encodeURIComponent('https://m701.music.126.net/obj/a.mp3')}`,
  ));
  assert.equal(response.status, 403, 'src 是客户端可控明文，一旦放行就是开放代理');
  assert.equal(upstream.state.media, 0, '被拒时一次上游请求都不该发');
  await response.arrayBuffer();
});

test('src= 通道：只有 bvid/cid 缺失时才是 400，被拒同样不发上游', async () => {
  const upstream = createPlatformUpstream({});
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest(`src=${encodeURIComponent('https://m701.music.126.net/obj/a.mp3')}`));
  assert.equal(response.status, 400);
  assert.equal(upstream.state.media, 0);
  await response.arrayBuffer();
});

test('token 通道：无票据时行为不变，仍走 B 站 playurl 路径', async () => {
  const upstream = createUpstream({});
  const api = createStreamApi({ request: upstream.request });
  const response = await api.handle(makeRequest('bvid=BV1Lyw7zPEeo&cid=36737517327'));
  assert.equal(response.status, 206);
  assert.equal(upstream.state.manifest, 1);
  await readAll(response);
});
