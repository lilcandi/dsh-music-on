import { createElement as h, useCallback, useEffect, useState } from 'react';
import {
  clearFavorites,
  clearHistory,
  loadFavorites,
  loadHistory,
  platformLabel,
  relativeTime,
  removeFavorite,
  removeHistory,
  subscribeLibrary,
} from '../library.js';
import { intakeLinks, summarizeReport } from '../linkintake.js';

/**
 * 设置页里的「收藏播放链接」与「历史播放链接」两张表。
 *
 * 为什么放在设置页而不是右下角卡片：右下角是「正在听什么」的操作台，
 * 空间窄、随时收起；收藏和历史是「我攒过什么」的长期资产，需要能扫、
 * 能一条条删、能一次清空 —— 那是设置页这种宽版面的活。
 *
 * 两个必须遵守的约定：
 *  1) 行是 div 不是 button。行里有两个按钮（播放 / 删除），button 套 button
 *     在 HTML 里非法，浏览器会把内层按钮拆到外层之外，点删除会误触发播放。
 *     这条已经在本插件的播放列表里踩过一次。
 *  2) 本宿主对插件客户端代码零转译，本文件必须是纯 createElement，不能出现 JSX 标签。
 */

/** 折叠状态键。与收藏/历史的数据键分开：折叠是纯界面偏好，清空列表不该影响它。 */
const COLLAPSE_KEY = 'dsh-music-on:lib.collapsed';
/** 提示条自动消失时间。失败信息给久一点，否则用户还没读完就没了。 */
const STATUS_MS = 4000;

function readCollapsed() {
  const fallback = { fav: false, hist: true };
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return fallback;
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (typeof raw !== 'string' || raw === '') return fallback;
    const parsed = JSON.parse(raw);
    return {
      fav: parsed && parsed.fav === true,
      hist: parsed && parsed.hist === true,
    };
  } catch (_error) {
    return fallback;
  }
}

function writeCollapsed(next) {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return;
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify({ fav: next.fav === true, hist: next.hist === true }));
  } catch (_error) {
    // 隐私模式：折叠状态存不下不影响列表本身。
  }
}

/** 条目标题兜底：没有标题时给链接本身，绝不显示 "undefined"。 */
function entryName(entry) {
  const title = entry && typeof entry.title === 'string' ? entry.title.trim() : '';
  if (title !== '') return title;
  const url = entry && typeof entry.url === 'string' ? entry.url : '';
  if (url === '') return '未命名链接';
  return url.length > 72 ? `${url.slice(0, 69)}…` : url;
}

/** 播放次数的显示。只播过一次不显示，免得每行都挂个「1 次」的噪音。 */
function playsLabel(entry, tr) {
  const plays = entry && Number.isFinite(entry.plays) ? entry.plays : 1;
  if (plays <= 1) return '';
  return tr('lib.playsCount', '播放 {count} 次').replace('{count}', String(plays));
}

/**
 * 设置页的收藏 / 历史区块。
 * @param {{ t?: Function, engine?: object }} props t 为宿主注入的翻译器；engine 用于点「播放」时入队。
 * @returns {object} React 元素。
 */
export function LibrarySection(props) {
  const { t, engine } = props || {};
  const tr = typeof t === 'function' ? t : (key, fallback) => (fallback !== undefined ? fallback : key);

  // 初值直接同步读一次，避免首帧渲染出空列表再跳成有内容的闪动。
  const [favorites, setFavorites] = useState(() => loadFavorites());
  const [history, setHistory] = useState(() => loadHistory());
  const [folded, setFolded] = useState(() => readCollapsed());
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // 本页写入与其它标签页写入都会走这里，列表永远跟存储同源。
  useEffect(
    () =>
      subscribeLibrary(() => {
        setFavorites(loadFavorites());
        setHistory(loadHistory());
      }),
    [],
  );

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    writeCollapsed(folded);
  }, [folded]);

  const toggleFold = useCallback((which) => {
    setFolded((prev) => ({ ...prev, [which]: !prev[which] }));
  }, []);

  /**
   * 播放入口。绝不能直接 engine.addUrl —— B站页面地址会被当成音频文件塞进
   * audio.src，浏览器随即报 "no supported source was found"。必须走 intakeLinks
   * 先判类型再分流，与右下角卡片里的粘贴走同一条通道。
   */
  const play = useCallback(
    (entry) => {
      if (!engine || typeof engine.addUrl !== 'function') {
        setStatus(tr('lib.noEngine', '播放器还没就绪，稍后再点'));
        return;
      }
      setBusy(true);
      Promise.resolve()
        .then(() => intakeLinks(engine, entry.url, { playFirst: true }))
        .then((report) => {
          if (report && report.added > 0) {
            // 这里**不再**自己写一次历史：intakeLinks 内部已经在入队成功后统一记过一笔。
            // 两处都写会让同一次播放把次数累加两次，「播放 N 次」立刻失真。
            setStatus(`${tr('lib.playing', '已加入播放列表')} · ${entryName(entry)}`);
          } else {
            setStatus(`${tr('lib.failed', '这条链接现在解析不了')}：${summarizeReport(report)}`);
          }
        })
        .catch((error) => {
          setStatus(error && error.message ? error.message : String(error));
        })
        .then(() => {
          setBusy(false);
        });
    },
    [engine, tr],
  );

  const dropFavorite = useCallback((entry) => {
    removeFavorite(entry.id);
  }, []);

  const dropHistory = useCallback((entry) => {
    removeHistory(entry.id);
  }, []);

  const wipeFavorites = useCallback(() => {
    clearFavorites();
    setStatus(tr('lib.favCleared', '收藏已清空'));
  }, [tr]);

  const wipeHistory = useCallback(() => {
    clearHistory();
    setStatus(tr('lib.histCleared', '历史已清空'));
  }, [tr]);

  /**
   * 渲染一张表。
   * @param {string} id 分组 id（fav / hist），折叠状态按它区分。
   * @param {string} title 表标题。
   * @param {string} help 标题下的说明。
   * @param {object[]} list 条目数组。
   * @param {Function} onDrop 删除一条。
   * @param {Function} onWipe 清空。
   * @param {string} empty 空态文案。
   * @returns {object} React 元素。
   */
  function table(id, title, help, list, onDrop, onWipe, empty) {
    const isFolded = folded[id] === true;
    const head = h(
      'div',
      { className: 'dmo-lib-head' },
      h('span', { className: 'dmo-lib-title' }, title),
      h('span', { className: 'dmo-lib-count' }, String(list.length)),
      h(
        'button',
        {
          type: 'button',
          className: 'dmo-lib-toggle',
          'aria-expanded': !isFolded,
          title: isFolded ? tr('lib.expand', '展开列表') : tr('lib.collapse', '收起列表'),
          onClick: () => toggleFold(id),
        },
        isFolded ? '▸' : '▾',
      ),
      list.length > 0
        ? h(
          'button',
          {
            type: 'button',
            className: 'dmo-lib-clear',
            disabled: busy,
            onClick: onWipe,
          },
          tr('lib.clearAll', '清空'),
        )
        : null,
    );

    const rows = list.map((entry) =>
      h(
        'div',
        { key: entry.id, className: 'dmo-lib-row', title: entry.url },
        h('span', { className: `dmo-lib-chip dmo-lib-chip--${entry.platform || 'other'}` }, platformLabel(entry.platform)),
        h(
          'span',
          { className: 'dmo-lib-main' },
          h('span', { className: 'dmo-lib-name' }, entryName(entry)),
          h(
            'span',
            { className: 'dmo-lib-meta' },
            relativeTime(entry.playedAt || entry.addedAt),
            playsLabel(entry, tr) === '' ? null : ` · ${playsLabel(entry, tr)}`,
          ),
        ),
        h(
          'span',
          { className: 'dmo-lib-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dmo-lib-btn dmo-lib-btn--play',
              disabled: busy,
              title: tr('lib.play', '播放'),
              'aria-label': `${tr('lib.play', '播放')} ${entryName(entry)}`,
              onClick: () => play(entry),
            },
            '▶',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dmo-lib-btn dmo-lib-btn--del',
              title: tr('lib.del', '删除'),
              'aria-label': `${tr('lib.del', '删除')} ${entryName(entry)}`,
              onClick: () => onDrop(entry),
            },
            '✕',
          ),
        ),
      ),
    );

    return h(
      'section',
      { key: id, className: 'dmo-lib-group', 'data-group': id },
      head,
      help ? h('div', { className: 'dmo-lib-help' }, help) : null,
      isFolded ? null : (rows.length > 0 ? h('div', { className: 'dmo-lib-list' }, rows) : h('div', { className: 'dmo-lib-empty' }, empty)),
    );
  }

  return h(
    'div',
    { className: 'dmo-lib', 'data-plugin': 'dsh-music-on' },
    table(
      'fav',
      tr('lib.favTitle', '收藏播放链接'),
      tr('lib.favHelp', '长期保留的链接。点「播放」直接入队开播，刷新与重启都不会丢。'),
      favorites,
      dropFavorite,
      wipeFavorites,
      tr('lib.favEmpty', '还没有收藏。播放时点卡片右上角的 ☆ 就能收藏当前这条。'),
    ),
    table(
      'hist',
      tr('lib.histTitle', '历史播放链接'),
      tr('lib.histHelp', '凡粘贴进来解析过的链接自动记一笔，最多保留最近 100 条，重复播放只累加次数。'),
      history,
      dropHistory,
      wipeHistory,
      tr('lib.histEmpty', '还没有历史。粘贴过的链接会自动记在这里。'),
    ),
    status ? h('div', { className: 'dmo-lib-status' }, status) : null,
  );
}

export default LibrarySection;
