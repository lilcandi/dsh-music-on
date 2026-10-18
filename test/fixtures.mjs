/**
 * dsh-music-on · 解析层测试夹具（零网络）
 *
 * 两个用途：
 * 1) 假 HTTP 工厂：把 URL → 响应写死，供 host 侧 fetchWithRedirects / createResolveApi 注入。
 * 2) 平台响应样本：从真实 API 形状裁出最小可用字段，不要塞整包数据。
 *
 * 铁律：本文件不 import 任何网络模块，不被产品代码引用，只在 test/ 下流通。
 */

import { EventEmitter } from 'node:events';

/**
 * 造一个与 node:http(s).request 同形的假函数。
 *
 * 注意：resolve.js 的 httpGet 传的是**选项对象**（{ protocol, hostname, port, path … }），
 * 不是 URL 字符串。这里两种入参都接受，统一拼成 `protocol//host[:port]/path` 再去表里查。
 *
 * @param {Record<string, {status?: number, headers?: Record<string,string>, body?: string}>} table
 *   键为归一化后的 URL；空表命中一律 404。
 * @param {Array<string>} [seen] 若传入，会按调用顺序记录实际请求过的 URL。
 * @returns {(target: object | string, onResponse: Function) => object}
 */
export function makeStubRequest(table, seen) {
  return (target, onResponse) => {
    const key = typeof target === 'string' ? target : urlOfOptions(target);
    if (seen) seen.push(key);

    const request = new EventEmitter();
    let finished = false;

    // 用 setImmediate 模拟真实异步，同时保证体积上限与超时逻辑都能被触发。
    const fire = () => {
      if (finished) return;
      finished = true;

      const hit = lookup(table, key);
      if (!hit) {
        const error = new Error(`stub 未命中: ${key}`);
        error.code = 'ENOTFOUND';
        request.emit('error', error);
        return;
      }

      const response = new EventEmitter();
      response.statusCode = hit.status === undefined ? 200 : hit.status;
      response.headers = hit.headers || {};
      response.complete = true;
      response.destroy = () => {};

      onResponse(response);

      // 先让消费方挂好监听器，再吐 body。
      setImmediate(() => {
        const body = hit.body === undefined ? '' : hit.body;
        const chunk = Buffer.from(body, 'utf8');
        const limit = hit.chunkSize || 0;
        if (limit > 0 && chunk.length > limit) {
          for (let offset = 0; offset < chunk.length; offset += limit) {
            response.emit('data', chunk.subarray(offset, Math.min(offset + limit, chunk.length)));
          }
        } else if (chunk.length > 0) {
          response.emit('data', chunk);
        }
        response.emit('end');
      });
    };

    setImmediate(fire);

    const api = {
      on(event, handler) {
        request.on(event, handler);
        return this;
      },
      once(event, handler) {
        request.once(event, handler);
        return this;
      },
      setTimeout(ms, handler) {
        api._timeout = ms;
        api._onTimeout = handler;
        return this;
      },
      end() {
        return this;
      },
      destroy() {
        finished = true;
      },
      abort() {
        finished = true;
      },
    };
    return api;
  };
}

/** 把 node:http 的 options 对象还原成可查表的 URL 字符串。 */
export function urlOfOptions(options) {
  if (!options || typeof options !== 'object') return String(options);
  const protocol = options.protocol || 'https:';
  const secure = protocol === 'https:';
  const host = String(options.hostname || options.host || '').replace(/^\[|\]$/g, '');
  const port = options.port && Number(options.port) !== (secure ? 443 : 80) ? `:${options.port}` : '';
  const path = options.path || '/';
  return `${protocol}//${host}${port}${path}`;
}

/** 表内查找：先精确命中，再按去掉查询串的路径命中。 */
function lookup(table, target) {
  if (Object.prototype.hasOwnProperty.call(table, target)) return table[target];
  const bare = target.split('?')[0];
  if (Object.prototype.hasOwnProperty.call(table, bare)) {
    const hit = table[bare];
    if (hit && hit.matchAllQueries) return hit;
  }
  return undefined;
}

/** 造一个永远不响应的 request，用于超时用例。 */
export function makeHangingRequest(seen) {
  return (target) => {
    if (seen) seen.push(typeof target === 'string' ? target : urlOfOptions(target));
    const request = new EventEmitter();
    const api = {
      on(event, handler) {
        request.on(event, handler);
        return this;
      },
      once(event, handler) {
        request.once(event, handler);
        return this;
      },
      setTimeout() {
        return this;
      },
      end() {
        return this;
      },
      destroy() {
        return this;
      },
      abort() {
        return this;
      },
    };
    return api;
  };
}

/** bilibili `/x/web-interface/view` 最小响应样本（BV1GJ411x7h7）。 */
export function bilibiliViewPayload() {
  return {
    code: 0,
    message: '0',
    ttl: 1,
    data: {
      bvid: 'BV1GJ411x7h7',
      aid: 370297692,
      cid: 1056867809,
      videos: 1,
      pic: 'https://i0.hdslb.com/bfs/archive/abc123.jpg',
      title: '测试用视频标题',
      pubdate: 1586357422,
      desc: '描述文本',
      duration: 213,
      owner: { mid: 8, name: 'UP 主', face: '' },
      pages: [
        { cid: 1056867809, page: 1, part: 'P1', duration: 213 },
        { cid: 1056867810, page: 2, part: 'P2', duration: 180 },
      ],
      staff: null,
    },
  };
}

/** 网易云 `/api/v6/playlist/detail` 最小响应样本。 */
export function neteasePlaylistPayload() {
  return {
    code: 200,
    playlist: {
      id: 24381616,
      name: '测试歌单',
      coverImgUrl: 'https://p1.music.126.net/cover.jpg',
      trackCount: 2,
      creator: { userId: 1, nickname: '创建者' },
      tracks: [
        {
          id: 186016,
          name: '晴天',
          ar: [{ id: 6452, name: '周杰伦' }],
          al: { id: 18875, name: '叶惠美', picUrl: 'https://p1.music.126.net/al.jpg' },
          dt: 269000,
        },
        {
          id: 186017,
          name: '七里香',
          ar: [{ id: 6452, name: '周杰伦' }],
          al: { id: 18876, name: '七里香', picUrl: '' },
          dt: 299000,
        },
      ],
    },
  };
}
