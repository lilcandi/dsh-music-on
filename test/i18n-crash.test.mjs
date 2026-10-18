/**
 * 锁死「设置页整块白屏」这类事故的根因。
 *
 * 事故链（真实发生过）：
 *   1. 我们习惯写 `t('lib.playsCount', '播放 {count} 次')`，把兜底文案放第二参；
 *   2. 宿主 dsh-client-locale/lib/client.js:1423-1427 的 translate 把第二参**当插值对象**：
 *        if (!params) return template;
 *        return template.replace(/\{(\w+)\}/g, (m, name) => name in params ? ... : m);
 *   3. 字典值含 `{count}` 时执行 `'count' in '播放 {count} 次'`，字符串不能作为 in 的右操作数；
 *   4. TypeError 冒泡到 React → 设置分区整棵子树被卸载 → 用户看到无声白屏。
 *
 * 所以这里既断言「宿主原文实现会抛错」，也断言「我们包一层之后不抛且文案正确」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { DICTS, createTranslator } from '../src/client/locale.js';
import { safeTranslate, interpolate } from '../src/client/i18n.js';

/** 逐字复刻宿主 dsh-client-locale 的 translate（含 fallbackChain 到 common 的行为）。 */
function makeHostTranslate(dicts, active = 'zh') {
  const lookup = (ns, key) => {
    const table = dicts[ns];
    if (!table) return undefined;
    return table[key];
  };
  return (ns, key, params) => {
    const template = lookup(ns, key) ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}

test('宿主 translate 原文实现：第二参传字符串且字典含占位符时会抛 TypeError', () => {
  const hostTranslate = makeHostTranslate({ dsh: { 'lib.playsCount': '播放 {count} 次' } });
  assert.throws(() => hostTranslate('dsh', 'lib.playsCount', '播放 {count} 次'), TypeError);
});

test('safeTranslate：第二参是字符串且字典含占位符时不抛，返回字典模板', () => {
  const hostTranslate = makeHostTranslate({ dsh: { 'lib.playsCount': '播放 {count} 次' } });
  const t = safeTranslate((key, params) => hostTranslate('dsh', key, params));
  assert.doesNotThrow(() => t('lib.playsCount', '播放 {count} 次'));
  assert.equal(t('lib.playsCount', '播放 {count} 次'), '播放 {count} 次');
});

test('safeTranslate：有插值参数时委托宿主完成替换', () => {
  const hostTranslate = makeHostTranslate({ dsh: { 'lib.playsCount': '播放 {count} 次' } });
  const t = safeTranslate((key, params) => hostTranslate('dsh', key, params));
  assert.equal(t('lib.playsCount', { count: 7 }), '播放 7 次');
});

test('safeTranslate：宿主抛错时退回本地字典，仍能插值', () => {
  const broken = () => {
    throw new TypeError("Cannot use 'in' operator to search for 'count' in 播放 {count} 次");
  };
  const t = safeTranslate(broken);
  assert.doesNotThrow(() => t('lib.playsCount', '播放 {count} 次'));
  assert.equal(t('lib.playsCount', '播放 {count} 次'), '播放 {count} 次');
  assert.equal(t('lib.playsCount', { count: 3 }), '播放 3 次');
});

test('safeTranslate：key 不在任何字典里时回落兜底文案，再回落 key', () => {
  const hostTranslate = makeHostTranslate({});
  const t = safeTranslate((key, params) => hostTranslate('dsh', key, params));
  assert.equal(t('dock.noSuchKey', '兜底'), '兜底');
  assert.equal(t('dock.noSuchKey'), 'dock.noSuchKey');
});

test('safeTranslate：字典命中的 key 优先于兜底文案（兜底只是降级手段）', () => {
  const hostTranslate = makeHostTranslate({ dsh: { 'dock.play': '播放' } });
  const t = safeTranslate((key, params) => hostTranslate('dsh', key, params));
  assert.equal(t('dock.play', '播放（兜底）'), '播放');
});

test('safeTranslate：没有宿主翻译器时用本地字典，不崩', () => {
  const t = safeTranslate(null);
  assert.equal(t('lib.favTitle', '收藏播放链接'), DICTS.zh['lib.favTitle']);
  assert.equal(t('dock.noSuchKey', '兜底'), '兜底');
});

test('safeTranslate：模板缓存只问宿主一次', () => {
  let calls = 0;
  const hostTranslate = (key) => {
    calls += 1;
    return DICTS.zh[key] ?? key;
  };
  const t = safeTranslate(hostTranslate);
  for (let i = 0; i < 50; i += 1) t('dock.play', '播放');
  assert.equal(calls, 1, '同一 key 反复取文案不该反复问宿主');
});

test('interpolate：缺参时原样保留占位符', () => {
  assert.equal(interpolate('播放 {count} 次', { count: 2 }), '播放 2 次');
  assert.equal(interpolate('播放 {count} 次', {}), '播放 {count} 次');
});

test('locales 里所有含占位符的字典值，都能被 safeTranslate 安全取出', () => {
  const hostTranslate = makeHostTranslate({ dsh: DICTS.zh });
  const t = safeTranslate((key, params) => hostTranslate('dsh', key, params));
  const withPlaceholder = Object.keys(DICTS.zh).filter((key) => /\{\w+\}/.test(DICTS.zh[key]));
  assert.ok(withPlaceholder.length > 0, '应至少有一条含占位符的文案，否则这条测试没有意义');
  for (const key of withPlaceholder) {
    assert.doesNotThrow(() => t(key, DICTS.zh[key]), `key=${key} 取文案时抛错`);
  }
});

test('createTranslator 自身对含占位符的字典也安全（第二参给字符串）', () => {
  const tr = createTranslator('zh');
  assert.doesNotThrow(() => tr('lib.playsCount', '播放 {count} 次'));
  assert.equal(tr('lib.playsCount', { count: 9 }), '播放 9 次');
});
