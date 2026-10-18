/**
 * 设置模块回归测试。
 *
 * 存在理由：设置项是「存起来但没接线」的高发区——字段加了、schema 加了、
 * 归一化忘了，值就会被静默丢弃，界面上表现为「调了没反应」。
 * 这里用断言把三件事钉死：
 *   1. SETTINGS_SCHEMA 的每个 key 都能被 normalizeSettings 接住（不落空）；
 *   2. 越界/非法值一定被夹回合法域，而不是原样穿透；
 *   3. DEFAULT_SETTINGS 与 schema 的 default 完全一致（两处漂移会让人调了没用）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTOPLAY_TARGETS,
  CACHE_LIMIT_MAX_MB,
  CACHE_LIMIT_MIN_MB,
  DEFAULT_SETTINGS,
  DOCK_SIZES,
  LOOP_MODES,
  SETTINGS_SCHEMA,
  SPECTRUM_GLOWS,
  SPECTRUM_PLACEMENTS,
  SPECTRUM_STYLES,
  defaultSettings,
  normalizeSettings,
} from '../src/client/settings.js';

test('schema 的每个 key 都在 DEFAULT_SETTINGS 里有值', () => {
  for (const spec of SETTINGS_SCHEMA) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, spec.key),
      `SETTINGS_SCHEMA 有 ${spec.key} 但 DEFAULT_SETTINGS 没有`,
    );
  }
});

test('schema 的 default 与 DEFAULT_SETTINGS 逐项一致', () => {
  for (const spec of SETTINGS_SCHEMA) {
    assert.deepEqual(
      spec.default,
      DEFAULT_SETTINGS[spec.key],
      `${spec.key} 的 schema.default 与 DEFAULT_SETTINGS 不一致`,
    );
  }
});

test('normalizeSettings 保留每一个 schema key（不许静默丢字段）', () => {
  const out = normalizeSettings({});
  for (const spec of SETTINGS_SCHEMA) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(out, spec.key),
      `normalizeSettings 返回里缺 ${spec.key}——该字段调了不会生效`,
    );
  }
  assert.equal(Object.keys(out).length, Object.keys(DEFAULT_SETTINGS).length);
});

test('空输入 / 垃圾输入退到默认值，不抛错', () => {
  for (const input of [undefined, null, 0, 'x', [], { a: 1 }]) {
    const out = normalizeSettings(input);
    assert.deepEqual(out, defaultSettings());
  }
});

test('频谱柱数按 8 对齐并夹在 16-96', () => {
  assert.equal(normalizeSettings({ spectrumBars: 50 }).spectrumBars, 48);
  assert.equal(normalizeSettings({ spectrumBars: 1 }).spectrumBars, 16);
  assert.equal(normalizeSettings({ spectrumBars: 999 }).spectrumBars, 96);
  assert.equal(normalizeSettings({ spectrumBars: '24' }).spectrumBars, 24);
});

test('频谱灵敏度夹在 0.5-4 并保留一位小数', () => {
  assert.equal(normalizeSettings({ spectrumGain: 9 }).spectrumGain, 4);
  assert.equal(normalizeSettings({ spectrumGain: 0 }).spectrumGain, 0.5);
  assert.equal(normalizeSettings({ spectrumGain: 2.34 }).spectrumGain, 2.3);
});

test('频谱高度按 8 对齐并夹在 32-160', () => {
  assert.equal(normalizeSettings({ spectrumHeight: 33 }).spectrumHeight, 32);
  assert.equal(normalizeSettings({ spectrumHeight: 100 }).spectrumHeight, 104);
  assert.equal(normalizeSettings({ spectrumHeight: 9999 }).spectrumHeight, 160);
});

test('枚举型设置遇到非法值一律回落默认', () => {
  const out = normalizeSettings({
    spectrumStyle: 'triangle',
    spectrumGlow: 'laser',
    spectrumPlacement: 'floating',
    loopMode: 'shuffle',
    dockSize: 'huge',
    autoplayTarget: 'never',
  });
  assert.equal(out.spectrumStyle, DEFAULT_SETTINGS.spectrumStyle);
  assert.equal(out.spectrumGlow, DEFAULT_SETTINGS.spectrumGlow);
  assert.equal(out.spectrumPlacement, DEFAULT_SETTINGS.spectrumPlacement);
  assert.equal(out.loopMode, DEFAULT_SETTINGS.loopMode);
  assert.equal(out.dockSize, DEFAULT_SETTINGS.dockSize);
  assert.equal(out.autoplayTarget, DEFAULT_SETTINGS.autoplayTarget);
});

test('枚举白名单本身没写错', () => {
  assert.deepEqual(SPECTRUM_STYLES, ['dots', 'bars', 'line', 'wave', 'off']);
  assert.deepEqual(SPECTRUM_GLOWS, ['off', 'soft', 'strong']);
  assert.deepEqual(SPECTRUM_PLACEMENTS, ['bar', 'panel']);
  assert.deepEqual(LOOP_MODES, ['all', 'one', 'off']);
  assert.deepEqual(DOCK_SIZES, ['compact', 'normal', 'wide']);
  assert.deepEqual(AUTOPLAY_TARGETS, ['both', 'link', 'file', 'off']);
});

test('布尔项的字符串写法能被识别', () => {
  assert.equal(normalizeSettings({ fadeOnPause: 'false' }).fadeOnPause, false);
  assert.equal(normalizeSettings({ fadeOnPause: 'true' }).fadeOnPause, true);
  assert.equal(normalizeSettings({ fadeOnPause: 1 }).fadeOnPause, true);
  assert.equal(normalizeSettings({ showTitles: 0 }).showTitles, false);
});

test('切歌淡入淡出夹在 0-12 秒且取整', () => {
  assert.equal(normalizeSettings({ crossfadeSec: 99 }).crossfadeSec, 12);
  assert.equal(normalizeSettings({ crossfadeSec: -5 }).crossfadeSec, 0);
  assert.equal(normalizeSettings({ crossfadeSec: 3.7 }).crossfadeSec, 4);
});

test('缓存上限夹在 64-4096', () => {
  assert.equal(normalizeSettings({ cacheLimitMB: 1 }).cacheLimitMB, CACHE_LIMIT_MIN_MB);
  assert.equal(normalizeSettings({ cacheLimitMB: 99999 }).cacheLimitMB, CACHE_LIMIT_MAX_MB);
});

test('音量夹在 0-1', () => {
  assert.equal(normalizeSettings({ volume: 5 }).volume, 1);
  assert.equal(normalizeSettings({ volume: -1 }).volume, 0);
});

test('归一化是幂等的（反复过一遍结果不变）', () => {
  const once = normalizeSettings({ spectrumBars: 50, spectrumGain: 2.34, crossfadeSec: 3.7 });
  const twice = normalizeSettings(once);
  assert.deepEqual(twice, once);
});

test('默认值默认开启自动播放（用户反馈「加入后要自动播」）', () => {
  assert.equal(DEFAULT_SETTINGS.allowAutoplay, true);
  assert.equal(DEFAULT_SETTINGS.autoplayTarget, 'both');
});
