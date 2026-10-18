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

  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);

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

  function measureCache() {
    setBusy(true);
    const finish = (mb) => {
      setCacheInfo({ mb });
      setBusy(false);
    };
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.storage &&
        typeof navigator.storage.estimate === 'function'
      ) {
        navigator.storage.estimate().then(
          (estimate) => {
            const bytes = estimate && typeof estimate.usage === 'number' ? estimate.usage : 0;
            finish(Math.round((bytes / (1024 * 1024)) * 10) / 10);
          },
          () => finish(null),
        );
        return;
      }
      finish(null);
    } catch (_error) {
      finish(null);
    }
  }

  function clearCache() {
    setBusy(true);
    let keys = [];
    try {
      if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
        // caches.keys() 是 Promise；这里用 then 链，函数本身不声明 async 也能闭环。
        caches
          .keys()
          .then((list) => {
            keys = Array.isArray(list) ? list : [];
            return Promise.all(
              keys.map((key) =>
                Promise.resolve()
                  .then(() => caches.delete(key))
                  .catch(() => false),
              ),
            );
          })
          .then((results) => {
            const cleared = results.filter(Boolean).length;
            setStatus(cleared > 0 ? `已清空 ${cleared} 个缓存桶` : '缓存已是最新状态');
          })
          .catch(() => {
            setStatus('清空缓存失败，详见控制台');
          })
          .then(() => {
            setBusy(false);
            setCacheInfo(null);
          });
        return;
      }
      setStatus('当前环境无缓存可清');
    } catch (_error) {
      setStatus('清空缓存失败，详见控制台');
    }
    setBusy(false);
    setCacheInfo(null);
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
    { id: 'playback', title: '播放', keys: ['volume', 'loopMode', 'allowAutoplay', 'autoplayTarget', 'crossfadeSec', 'fadeOnPause', 'rememberQueue'] },
    { id: 'intake', title: '链接与歌单', keys: ['platformTrackLimit'] },
    { id: 'spectrum', title: '频谱', keys: ['spectrumStyle', 'spectrumPlacement', 'spectrumBars', 'spectrumGain', 'spectrumGlow', 'spectrumHeight', 'spectrumFps'] },
    { id: 'network', title: '网络与缓存', keys: ['proxyEnabled', 'cacheLimitMB'] },
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
      { key: 'measure', type: 'button', className: 'dmo-btn', onClick: measureCache, disabled: busy },
      '查看缓存占用',
    ),
    h(
      'button',
      { key: 'clear', type: 'button', className: 'dmo-btn', onClick: clearCache, disabled: busy },
      '清空缓存',
    ),
    h(
      'button',
      { key: 'reset', type: 'button', className: 'dmo-btn', onClick: resetAll, disabled: busy },
      '恢复默认值',
    ),
  ];
  if (cacheInfo) {
    actions.push(
      h(
        'span',
        { key: 'cacheinfo', className: 'dmo-settings-meta' },
        cacheInfo.mb === null ? '缓存占用不可读' : `当前占用 ${cacheInfo.mb} MB`,
      ),
    );
  }
  if (status) {
    actions.push(h('span', { key: 'status', className: 'dmo-settings-status' }, status));
  }

  return h(
    'div',
    { className: 'dmo-settings', 'data-plugin': 'dsh-music-on' },
    h(
      'div',
      { className: 'dmo-settings-head' },
      h('div', { className: 'dmo-settings-title' }, '音景播放器'),
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
    // 与上面那 19 项「播放器怎么表现」是两类东西，不该混进同一张表里。
    h(LibrarySection, { key: 'library', engine, t }),
    h('div', { className: 'dmo-settings-actions' }, actions),
  );
}

export default Settings;
