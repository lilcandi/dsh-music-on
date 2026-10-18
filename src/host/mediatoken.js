/**
 * 媒体令牌：把「宿主解析出来的真实音频直链」换成一张不透明票据。
 *
 * 为什么必须有这一层：
 *   网易云与 QQ 音乐的直链域名（m701.music.126.net / aqqmusic.tc.qq.com）
 *   不在 B 站 CDN 白名单里。若让客户端把 `src=<直链>` 直接交给 stream 路由，
 *   就得把白名单扩到「任意第三方 CDN」—— 那条路由会立刻退化成开放代理。
 *
 *   令牌方案把授权与寻址分离：
 *     宿主解析 → 校验域名 → 签发 token（内含真实 URL，HMAC 签名）
 *     客户端     → 只拿到 token，拿不到 URL，也无从构造 URL
 *     流路由     → 验签 → 取出 URL → 再走一遍域名/协议校验 → 代理
 *
 *   客户端因此不可能请求任何一个未经宿主解析过的地址。白名单不必放宽。
 *
 * 令牌形态：`<base64url(payload)>.<base64url(hmac)>`
 *   字符集只含 A-Za-z0-9-_ 与 `.`，**不含 %** —— 这一点是硬要求：
 *   stream 路由的 checkStreamUrl 拒绝任何百分号编码，token 若需转义就会自相矛盾。
 *   同理不带 `=` padding。
 *
 * 生命周期：TTL 10 分钟，短于两个平台直链自身的有效期。
 *   宿主重启即换密钥 → 旧 token 全部失效 → 客户端取流拿 401 后应重新解析。
 *   这是**有意的**：宁可让客户端重解析，也不让一张票据在重启后仍然可用。
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 流路由上承载令牌的查询参数名。 */
export const MEDIA_TOKEN_PARAM = 'mt';

/** 默认有效期。网易云直链 URL 内含时间戳（约 20 分钟有效），QQ vkey 有 expi，10 分钟都盖得住。 */
export const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** 已签发票据的内存表上限。只为 LRU 与去重，验证**不依赖**它（验签是自足的）。 */
export const DEFAULT_MAX_ENTRIES = 512;

/** 令牌载荷版本。改动载荷结构时必须升版本，否则旧票据会被当成新结构解析。 */
export const TOKEN_VERSION = 1;

export const TOKEN_ERRORS = Object.freeze({
  MISSING: 'E_MEDIA_TOKEN_MISSING',
  MALFORMED: 'E_MEDIA_TOKEN_MALFORMED',
  BAD_SIGNATURE: 'E_MEDIA_TOKEN_BAD_SIGNATURE',
  EXPIRED: 'E_MEDIA_TOKEN_EXPIRED',
});

/** base64url 编码，去 padding。 */
function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url 解码。Node 的 base64 解码器容忍缺失 padding，故不必补回。 */
function fromBase64Url(text) {
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * @param {object} [options]
 * @param {Buffer|string} [options.secret] 签名密钥；缺省用 crypto 随机 32 字节
 * @param {number} [options.ttlMs]
 * @param {number} [options.maxEntries]
 * @param {() => number} [options.now] 单测注入时钟
 */
export function createMediaTokenStore(options = {}) {
  const secret = options.secret ?? randomBytes(32);
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS;
  const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : DEFAULT_MAX_ENTRIES;
  const now = typeof options.now === 'function' ? options.now : Date.now;

  /** token → { payload, at }。Map 保持插入序，超限时删最旧。 */
  const issued = new Map();

  function prune() {
    while (issued.size > maxEntries) {
      const oldest = issued.keys().next();
      if (oldest.done) break;
      issued.delete(oldest.value);
    }
  }

  /**
   * 签发一张票据。
   *
   * @param {{url:string, mime?:string|null, platform?:string|null, id?:string|null,
   *          title?:string|null, artist?:string|null, duration?:number|null,
   *          pageUrl?:string|null, source?:string|null}} spec
   * @returns {string} token
   */
  function sign(spec) {
    if (!spec || typeof spec.url !== 'string' || spec.url === '') {
      throw new Error('dsh-music-on: media token 需要 url');
    }
    const issuedAt = now();
    // 载荷字段名压到一个字母：token 要塞进 URL query，越短越不容易被中间层截断。
    const payload = {
      v: TOKEN_VERSION,
      u: spec.url,
      m: spec.mime ?? null,
      p: spec.platform ?? null,
      i: spec.id ?? null,
      n: spec.title ?? null,
      a: spec.artist ?? null,
      d: spec.duration ?? null,
      g: spec.pageUrl ?? null,
      s: spec.source ?? null,
      t: issuedAt,
      e: issuedAt + ttlMs,
    };
    const body = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = toBase64Url(createHmac('sha256', secret).update(body).digest());
    const token = `${body}.${signature}`;
    issued.set(token, { payload, at: issuedAt });
    prune();
    return token;
  }

  /**
   * 验签并解出载荷。**永不抛错**，失败一律返回 `{ok:false, code}`。
   *
   * 顺序有讲究：先比签名再解 JSON。签名不过时绝不解析攻击者提供的字节。
   *
   * @param {unknown} token
   * @returns {{ok:true, payload:object} | {ok:false, code:string}}
   */
  function verify(token) {
    if (typeof token !== 'string' || token === '') return { ok: false, code: TOKEN_ERRORS.MISSING };
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return { ok: false, code: TOKEN_ERRORS.MALFORMED };
    const body = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    // 点号只能有一个，多出来的会被当成载荷的一部分，签名必然不过 —— 但仍要显式拒绝，
    // 避免有人拿它去撞别的解析路径。
    if (signature.includes('.')) return { ok: false, code: TOKEN_ERRORS.MALFORMED };

    let expected;
    try {
      expected = toBase64Url(createHmac('sha256', secret).update(body).digest());
    } catch (_error) {
      return { ok: false, code: TOKEN_ERRORS.MALFORMED };
    }
    const left = Buffer.from(signature, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return { ok: false, code: TOKEN_ERRORS.BAD_SIGNATURE };
    }

    let payload;
    try {
      payload = JSON.parse(fromBase64Url(body).toString('utf8'));
    } catch (_error) {
      return { ok: false, code: TOKEN_ERRORS.MALFORMED };
    }
    if (!payload || payload.v !== TOKEN_VERSION || typeof payload.u !== 'string' || payload.u === '') {
      return { ok: false, code: TOKEN_ERRORS.MALFORMED };
    }
    if (typeof payload.e !== 'number' || !Number.isFinite(payload.e)) {
      return { ok: false, code: TOKEN_ERRORS.MALFORMED };
    }
    if (payload.e <= now()) return { ok: false, code: TOKEN_ERRORS.EXPIRED };
    return { ok: true, payload };
  }

  /** 已签发票据条数（诊断用）。 */
  function size() {
    return issued.size;
  }

  /** 清空已签发表。宿主重启/测试隔离用；不影响已发出的票据能否验签。 */
  function clear() {
    issued.clear();
  }

  return { sign, verify, size, clear, ttlMs, maxEntries };
}

/**
 * 把票据拼成客户端可直接交给 <audio> 的相对路径。
 * 与 engine 的 createBilibiliTrack 保持同一形态：都是本插件的同源 API 路径。
 *
 * @param {string} token
 * @returns {string}
 */
export function buildMediaStreamPath(token) {
  return `/api/dsh-music-on/stream?${MEDIA_TOKEN_PARAM}=${token}`;
}

/**
 * 从查询参数里取票据。URLSearchParams 与普通对象两种入参都吃。
 *
 * @param {URLSearchParams|Record<string,string>|null|undefined} input
 * @returns {string|null}
 */
export function readMediaToken(input) {
  if (!input) return null;
  if (typeof input.get === 'function') {
    const value = input.get(MEDIA_TOKEN_PARAM);
    return typeof value === 'string' && value !== '' ? value : null;
  }
  const value = input[MEDIA_TOKEN_PARAM];
  return typeof value === 'string' && value !== '' ? value : null;
}
