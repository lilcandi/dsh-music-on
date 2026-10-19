import { createElement as h, useEffect, useMemo, useState } from 'react';
import { SETTINGS_SCHEMA, createSettingsStore, normalizeSettings, useSettings } from '../settings.js';
import LibrarySection from './LibrarySection.jsx';

/**
 * 设置页区块。props = { settings, onChange }
 * - settings: 当前设置快照（由 settings store 提供，与主面板同一份真相）。
 * - onChange(key, value): 写回 store 并持久化；同步返回，UI 立刻回显。
 *
 * 若宿主没传 settings（只挂了组件、没接线），退化为自持 store：
 * 仍然是同一个 localStorage 命名空间 dsh-music-on:settings，
 * 且订阅同一份数据，所以永远不存在两份真相。
 *
 * 注意：本宿主对插件客户端代码是零转译静态投递，本文件必须是纯 createElement，
 * 不能出现任何 JSX 标签。
 */

function textBlock(label, help, keyPrefix) {
  const parts = [
    h('span', { key: `${keyPrefix}-label`, className: 'dmo-setting-label' }, label),
  ];
  if (help) {
    parts.push(h('span', { key: `${keyPrefix}-help`, className: 'dmo-setting-help' }, help));
  }
  return h('span', { key: `${keyPrefix}-text`, className: 'dmo-setting-text' }, parts);
}

export function Settings(props) {
  const { settings, onChange, engine, t } = props || {};
  // 无条件调用 hook：hook 顺序必须稳定，是否使用结果由下面决定。
  const fallbackStore = useMemo(() => createSettingsStore(), []);
  // useSettings(react, store, preloaded)：把 useMemo 里刚建好的 store 一起交给它，
  // 免得它在 effect 阶段才拿到 undefined。前两个参数保持原签名不变。
  const fallbackSettings = useSettings({ useState, useEffect }, fallbackStore);
  const current = settings || fallbackSettings;
  /** 主题名跟着设置走，只作为 data 属性交给 CSS 选令牌。 */
  const theme = current.theme || 'whale';

  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(
    () => () => {
      fallbackStore.dispose();
    },
    [fallbackStore],
  );

  function emit(key, value) {
    if (typeof onChange === 'function') {
      onChange(key, value);
      return;
    }
    fallbackStore.patch(key, value);
    setStatus('已保存到本机');
  }

  function resetAll() {
    setBusy(true);
    const defaults = normalizeSettings(undefined);
    for (const spec of SETTINGS_SCHEMA) emit(spec.key, defaults[spec.key]);
    setBusy(false);
    setStatus('已恢复默认值');
  }

  const rows = SETTINGS_SCHEMA.map((spec) => {
    const value = current && current[spec.key] !== undefined ? current[spec.key] : spec.default;
    const labelNode = textBlock(spec.label, spec.help, spec.key);

    if (spec.kind === 'boolean') {
      return h(
        'div',
        { key: spec.key, className: 'dmo-setting-row' },
        labelNode,
        h(
          'span',
          { className: 'dmo-setting-control' },
          h('input', {
            type: 'checkbox',
            className: 'dmo-switch',
            role: 'switch',
            checked: value === true,
            disabled: busy,
            'aria-label': spec.label,
            onChange: (event) => emit(spec.key, event.target.checked === true),
          }),
        ),
      );
    }

    if (spec.kind === 'select') {
      const options = spec.options.map((item) =>
        h('option', { key: String(item.value), value: String(item.value) }, item.label),
      );
      return h(
        'div',
        { key: spec.key, className: 'dmo-setting-row' },
        labelNode,
        h(
          'span',
          { className: 'dmo-setting-control' },
          h(
            'select',
            {
              className: 'dmo-select',
              value: String(value),
              disabled: busy,
              'aria-label': spec.label,
              onChange: (event) => {
                const raw = event.target.value;
                const picked = spec.options.find((item) => String(item.value) === raw);
                // 数值型选项（spectrumFps）必须还原成 number，否则 store 会当成字符串。
                emit(spec.key, picked ? picked.value : spec.default);
              },
            },
            options,
          ),
        ),
      );
    }

    const display = spec.key === 'volume' ? `${Math.round(Number(value) * 100)}%` : String(value);
    return h(
      'div',
      { key: spec.key, className: 'dmo-setting-row' },
      labelNode,
      h(
        'span',
        { className: 'dmo-setting-control' },
        h('input', {
          type: 'range',
          className: 'dmo-range',
          min: spec.min,
          max: spec.max,
          step: spec.step,
          value: Number(value),
          disabled: busy,
          'aria-label': spec.label,
          onChange: (event) => emit(spec.key, Number(event.target.value)),
        }),
        h('span', { className: 'dmo-range-value' }, display),
      ),
    );
  });

  // 分组：按用途把各项切开，每块独立成表。key 必须与 SETTINGS_SCHEMA 的 key 一一对应，
  // 漏掉或写错的项会被下面的 ungrouped 兜底捕获（漏项在设置页就是「看不见的死设置」）。
  const GROUPS = [
    { id: 'layout', title: '界面', keys: ['startCollapsed', 'dockSize', 'showTitles'] },
    { id: 'theme', title: '外观主题', keys: ['theme'] },
    { id: 'playback', title: '播放', keys: ['volume', 'loopMode', 'allowAutoplay', 'autoplayTarget', 'crossfadeSec', 'fadeOnPause', 'rememberQueue'] },
    { id: 'intake', title: '链接与歌单', keys: ['platformTrackLimit'] },
    { id: 'spectrum', title: '频谱', keys: ['spectrumStyle', 'spectrumPlacement', 'spectrumSpan', 'spectrumBars', 'spectrumGain', 'spectrumGlow', 'spectrumHeight', 'spectrumFps', 'spectrumDepth'] },
  ];
  const groupedKeys = new Set(GROUPS.reduce((all, group) => all.concat(group.keys), []));
  // 将来往 schema 加项却忘了放进分组时，自动兜底到「其他」，绝不静默消失。
  const ungrouped = SETTINGS_SCHEMA.map((spec) => spec.key).filter((key) => !groupedKeys.has(key));
  if (ungrouped.length > 0) GROUPS.push({ id: 'other', title: '其他', keys: ungrouped });

  const byKey = new Map();
  SETTINGS_SCHEMA.forEach((spec, index) => {
    byKey.set(spec.key, rows[index]);
  });

  const groups = GROUPS.map((group) => {
    const children = group.keys.map((key) => byKey.get(key)).filter(Boolean);
    if (children.length === 0) return null;
    return h(
      'section',
      { key: group.id, className: 'dmo-settings-group', 'data-group': group.id },
      h('div', { className: 'dmo-settings-group-title' }, group.title),
      children,
    );
  }).filter(Boolean);

  const actions = [
    h(
      'button',
      { key: 'reset', type: 'button', className: 'dmo-btn', onClick: resetAll, disabled: busy },
      '恢复默认值',
    ),
  ];
  if (status) {
    actions.push(h('span', { key: 'status', className: 'dmo-settings-status' }, status));
  }

  return h(
    'div',
    {
      className: 'dmo-settings',
      'data-plugin': 'dsh-music-on',
      // 主题令牌作用域：设置分区不在 .dmo-dock-stack 里，必须自己挂一份，
      // 否则用户切了主题、卡片变了色，设置页还是旧的蓝白。
      'data-dmo-theme': theme,
    },
    h(
      'div',
      { className: 'dmo-settings-head' },
      h('div', { className: 'dmo-settings-title' }, '音乐播放器'),
      h(
        'div',
        { className: 'dmo-settings-sub' },
        '设置即时生效并持久化在 ',
        h('code', { className: 'dmo-code' }, 'dsh-music-on:settings'),
        '，刷新后保留。',
      ),
    ),
    h('div', { className: 'dmo-settings-body' }, groups),
    // 收藏与历史放在设置项之后、操作按钮之前：它们是「我攒下来的链接」，
    // 与上面那些「播放器怎么表现」是两类东西，不该混进同一张表里。
    h(LibrarySection, { key: 'library', engine, t }),
    h('div', { className: 'dmo-settings-actions' }, actions),
  );
}

export default Settings;
