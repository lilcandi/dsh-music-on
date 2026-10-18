/**
 * 翻译器的安全收口层。
 *
 * ## 为什么需要这一层（真实事故，不是防御性编程）
 * 宿主 `dsh-client-locale/lib/client.js:1423-1427` 的 translate 实现是：
 * ```js
 * translate(ns, key, params) {
 *   const template = this.lookup(ns, key, chain) ?? key;
 *   if (!params) return template;
 *   return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
 * }
 * ```
 * 第二个参数 `params` 是**插值对象**，`name in params` 要求右侧是可作 `in` 右操作数的对象。
 *
 * 我们的调用习惯是把兜底文案放在第二参：`t('lib.playsCount', '播放 {count} 次')`。
 * 一旦该 key 命中字典且字典值含 `{count}` → 执行 `'count' in '播放 {count} 次'`
 * → `TypeError: Cannot use 'in' operator to search for 'count' in 播放 {count} 次`
 * → 异常冒泡进 React 渲染期 → 整棵子树被卸载 → 用户看到「设置页一片空白」且没有任何提示。
 *
 * 本模块把两种语义收进同一函数：第二参是字符串就按兜底文案用，是对象就按插值参数用。
 * 任何异常一律吞掉并降级，一个文案拼错不该让整块 UI 消失。
 *
 * 之所以单独成文件：register.js 会 import `.jsx`，Node 侧测试无法直接加载它；
 * 而这一层必须能被单测直接盯住（见 test/i18n-crash.test.mjs）。
 */
import { DICTS } from './locale.js';

/**
 * 与宿主同一套插值语法，缺参时原样保留占位符。
 * @param {string} template 含 `{name}` 占位符的模板。
 * @param {object} params 插值参数。
 * @returns {string} 替换后的文案。
 */
export function interpolate(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * 从本地字典取模板（中文优先，再回落英文，都没有则 null）。
 * @param {string} key 文案 key。
 * @returns {string|null} 模板或 null。
 */
function localTemplate(key) {
  for (const lang of ['zh', 'en']) {
    const dict = DICTS[lang];
    if (dict && typeof dict[key] === 'string' && dict[key] !== '') return dict[key];
  }
  return null;
}

/**
 * 把宿主 bind 出来的翻译器改造成「第二参双义」的安全版本。
 * @param {Function|null} hostT 宿主 `ctx.locale.bind(ns)` 的返回值。
 * @param {{lang?: string}} [options] lang 仅用于无宿主时的本地字典选择，默认 zh。
 * @returns {Function} 双义翻译器 `(key, paramsOrFallback)`，附 `.clearCache()`。
 */
export function safeTranslate(hostT, options) {
  const lang = (options && options.lang) || 'zh';
  /**
   * key → 模板（未命中记 null）。只缓存「有无」与模板本身，不缓存插值结果。
   * 卡片每帧几十次 t() 调用只会在首帧问一次宿主；语言切换时整棵子树会重渲染，
   * 届时由调用方 clearCache() 清空即可。
   */
  const templates = new Map();

  const templateOf = (key) => {
    if (templates.has(key)) return templates.get(key);
    let value = null;
    if (typeof hostT === 'function') {
      try {
        // params 传空对象：宿主找不到 key 时回落成 key 原文本身，据此判断命中与否。
        const probe = hostT(key, {});
        if (typeof probe === 'string' && probe !== key) value = probe;
      } catch (_error) {
        value = null;
      }
    }
    if (value === null) {
      const own = localTemplate(key);
      // 只有极少数场景会真的拿 lang 分派（宿主侧通常已按当前语言给出模板），
      // 但无宿主时（单测、SSR 探针）必须尊重调用方语言，否则断言会飘。
      if (own !== null && lang !== 'zh') {
        const localized = DICTS[lang] && DICTS[lang][key];
        value = typeof localized === 'string' && localized !== '' ? localized : own;
      } else {
        value = own;
      }
    }
    templates.set(key, value);
    return value;
  };

  const translate = (key, paramsOrFallback) => {
    const fallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : undefined;
    const params = paramsOrFallback && typeof paramsOrFallback === 'object' ? paramsOrFallback : undefined;

    if (params !== undefined) {
      // 有插值参数：先交给宿主（它最清楚当前语言），出错再退回本地模板自行拼装。
      if (typeof hostT === 'function') {
        try {
          const out = hostT(key, params);
          if (typeof out === 'string') return out;
        } catch (_error) {
          // 落到下面统一处理。
        }
      }
      const template = templateOf(key);
      return interpolate(template !== null ? template : fallback !== undefined ? fallback : key, params);
    }

    const template = templateOf(key);
    if (template !== null) return template;
    return fallback !== undefined ? fallback : key;
  };

  translate.clearCache = () => templates.clear();
  return translate;
}
