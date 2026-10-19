"""为 README 与插件市场抓取真实界面截图。

不是插件产物：只在本机对着运行中的 DSH Web（http://127.0.0.1:3080）跑一次。
用 python playwright，因为本机只装了 python 侧的 playwright（1.62.0）。

四张图：
  docs/screenshot-capsule.png    收起态胶囊 + 底部蓝白频谱
  docs/screenshot-dock.png       展开态播放卡片（含播放列表）
  docs/screenshot-spectrum.png   底部频谱带特写
  docs/screenshot-settings.png   设置页的音乐台分区

第三张存在理由：频谱是本插件最显眼的视觉特征，但它在整屏里只是底部一条细带，
卡片截图与胶囊截图都只能看到它的一小段。单独裁一条特写，评审才知道那是什么。
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3080/"
OUT = Path(__file__).resolve().parent.parent / "docs"
VIEWPORT = {"width": 1440, "height": 900}

# 现场合成一段有「音乐形状」的 WAV 再拖进插件，而不是空跑截图。
#
# 两个理由：
#   1. 频谱特写如果没在播放，画出来的只是底噪基线 —— 一张看不出频谱能力的频谱图。
#      用户要的「蓝白频谱特效」必须靠真音频驱动才拍得到。
#   2. 顺带端到端验证「拖入音频即自动播放」这条核心交互：脚本能拍到波形，
#      就说明 File → objectURL → AudioContext → analyser 整条链是通的。
#
# 音频内容刻意做得有结构：120BPM 的鼓点脉冲（低频）、持续和弦（中频）、
# 每半拍一记噪声（高频）。这样频谱上低频段有规律跳动、中高频持续发亮，
# 一眼能看出它不是随机噪点。
DROP_AUDIO = """
async () => {
  const sr = 44100, secs = 24, n = sr * secs;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * 2, true);
  const beat = 0.5;
  // 确定性噪声：截图是视觉回归，每次跑出来的波形应当一致。
  let seed = 0x2545f491;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ph = (t % beat) / beat;
    const kick = Math.exp(-ph * 18) * Math.sin(2 * Math.PI * 55 * t);
    const pad = 0.06 * Math.sin(2 * Math.PI * 330 * t)
              + 0.045 * Math.sin(2 * Math.PI * 440 * t)
              + 0.03 * Math.sin(2 * Math.PI * 660 * t)
              + 0.022 * Math.sin(2 * Math.PI * 1320 * t)
              + 0.015 * Math.sin(2 * Math.PI * 2640 * t);
    const hat = (ph > 0.5 && ph < 0.56) ? 0.20 * rnd() : 0;
    // 持续宽带噪声床。Spectrum 用对数分频，48 根柱的后 28 根覆盖约
    // 700Hz-22kHz；只给低频内容时这半边会全平，拍出来像一条直线。
    // 一阶差分把噪声能量推向高频，谱更接近平坦。
    const raw = rnd();
    const air = 0.42 * (raw - prev * 0.66);
    prev = raw;
    // tanh 软限幅：既能压住峰值不硬切，又保留鼓点的动态起伏。
    const mix = kick * 0.85 + 0.16 * Math.sin(2 * Math.PI * 110 * t) + pad + hat + air;
    const s = Math.tanh(mix * 1.15);
    dv.setInt16(44 + i * 2, s * 32767, true);
  }
  const file = new File([buf], '夜航 · 小鲸鱼 mix.wav', { type: 'audio/wav' });
  const dt = new DataTransfer();
  dt.items.add(file);
  // 只往 .dmo-card 派发一次。早前把 .dmo-card 与 .dmo-dock 各派一遍，
  // 同一个 drop 被 React 收了两次，队列里出现两条一模一样的曲目。
  const targets = [document.querySelector('.dmo-card')].filter(Boolean);
  for (const t of targets) {
    for (const type of ['dragenter', 'dragover', 'drop']) {
      t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }
  return targets.length;
}
"""

# 拖入后读回插件自己的状态：曲名进胶囊、列表多一条、进度走起来。
# 选择器取插件真实类名（.dmo-queue-list 的每个直接子节点就是一条曲目）。
READ_PLAYING = """
() => {
  const list = document.querySelector('.dmo-queue-list');
  const name = document.querySelector('.dmo-capsule-name');
  const note = document.querySelector('.dmo-note, .dmo-capsule-note');
  const meta = document.querySelector('.dmo-capsule-meta');
  const canvas = document.querySelector('.dmo-spectrum-canvas');
  return {
    queue: list ? list.children.length : 0,
    name: name ? (name.textContent || '').trim() : null,
    meta: meta ? (meta.textContent || '').trim() : null,
    note: note ? (note.textContent || '').trim() : null,
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
  };
}
"""

# 右下角另有别的插件挂件（圆形按钮、角标之类）会盖住音乐台，截图前按几何位置隐藏掉。
# 判据：自身定位是 fixed/absolute、矩形与「胶囊 + 底部频谱带」相交、且不属于本插件。
#
# 两个必须排除的坑（都实测踩过）：
#   1. 宿主把 overlay 槽位包在 `.pI_x6G_overlayLayer`（position:absolute; inset:0）里，
#      而那是**我们自己的祖先**。只判 `el.closest('.dmo-dock-stack')` 排除不掉它，
#      把祖先隐藏 = 连胶囊一起从画面上抹掉，后续 click 直接 "element is not visible"。
#      必须再排除「包含本插件节点的元素」。
#   2. 只按「贴着视口右下」判会漏掉一批圆形浮件，截出来一片杂乱。
HIDE_INTRUDERS = """
() => {
  const dock = document.querySelector('.dmo-dock-stack');
  const bar = document.querySelector('.dmo-barspectrum');
  const mine = [dock, bar].filter(Boolean);
  const boxes = mine.map((n) => n.getBoundingClientRect());
  const overlaps = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  const hidden = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.dmo-dock-stack') || el.closest('.dmo-settings') || el.closest('.dmo-seat')) continue;
    // 祖先不能动：隐藏祖先等于隐藏我们自己
    if (mine.some((node) => el.contains(node))) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) continue;
    if (!boxes.some((b) => overlaps(r, b))) continue;
    el.style.setProperty('visibility', 'hidden', 'important');
    hidden.push((typeof el.className === 'string' && el.className) || el.tagName);
  }
  return hidden;
}
"""

# 胶囊 + 它周围一圈留白，用来裁剪出干净的交付图。
# 不要按整条频谱带的宽度截：那是通栏的，截出来的图会变成一条又宽又扁的长条，
# 主体（胶囊）反而缩成一个小角。
# 留白用 14 而不是 28：收起态胶囊正下方紧贴页面底边，留太多会把页面底色也裁进来，
# 图底出现一条说不清来路的灰带。
CAPSULE_CLIP = """
() => {
  const dock = document.querySelector('.dmo-dock-stack');
  if (!dock) return null;
  const r = dock.getBoundingClientRect();
  const pad = 14;
  const x = Math.max(0, r.left - pad);
  const y = Math.max(0, r.top - pad);
  return {
    x,
    y,
    width: Math.min(window.innerWidth - x, r.width + pad * 2),
    height: Math.min(window.innerHeight - y, r.height + pad * 2),
  };
}
"""


def wait_for(page, selector, timeout=15000):
    page.wait_for_selector(selector, state="attached", timeout=timeout)


def main() -> int:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=2)
        # 不能等 networkidle：DSH 页面有长连接 SSE，永远不会 idle。
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        wait_for(page, ".dmo-dock-stack")
        page.wait_for_timeout(1200)

        hidden = page.evaluate(HIDE_INTRUDERS)
        print("已隐藏的遮挡元素:", hidden)

        # 2) 展开态：点胶囊正文
        page.click(".dmo-capsule-main")
        wait_for(page, ".dmo-card")
        page.wait_for_timeout(600)
        page.evaluate(HIDE_INTRUDERS)

        # 2.5) 拖入一段现场合成的音频，让它真的播起来。
        # 频谱特写必须有真音频驱动，否则拍到的只是底噪基线（一张证明不了任何事的图）。
        # 同时这一步就是「拖入即自动播放」的端到端验证。
        dropped = page.evaluate(DROP_AUDIO)
        page.wait_for_timeout(2600)
        state = page.evaluate(READ_PLAYING)
        print("拖放目标:", dropped, "→", state)
        # 判据只看队列：.dmo-capsule-name 是**收起态**的节点，展开态本来就没有它，
        # 早前拿它当判据，每条都误报「拖入后没有曲目」。
        if state.get("queue", 0) < 1:
            print("拖入后没有曲目，频谱特写只能是空基线", file=sys.stderr)
        # 让频谱多积累几帧再拍，否则拍到刚起步的一瞬间。
        page.wait_for_timeout(1200)
        # 再清一遍遮挡物：宿主/别的插件会在这两秒里弹通知气泡
        # （实测左下角会冒出一枚「18:00 转平价」，正好压进频谱带里）。
        page.evaluate(HIDE_INTRUDERS)

        # 频谱带本身是半透明的（底沿只有 6%-12% 的同色雾），背后的东西会透出来。
        # 这是真实效果，但截图里透出宿主侧栏的项目列表与底部进度条就会显得脏。
        # 只在拍这张时藏掉侧栏与卡片，拍完**立刻恢复** —— 后面还要点侧栏的「账号菜单」进设置，
        # 藏着的元素点不动，早前就是在这里超时 8s。
        #
        # 卡片也必须藏：层级上卡片就压住频谱右端（展开态是右下角浮层叠在频谱带之上），
        # 这是真实的，但这张图只该展示频谱画法本身。
        page.evaluate(
            """() => {
              window.__dmoHidden = [];
              const sels = [
                '.pI_x6G_sidebarCol', '[class*="sidebarCol"]', '.hHd-Xa_root',
                '.dmo-card',
              ];
              for (const sel of sels) {
                for (const el of document.querySelectorAll(sel)) {
                  el.style.setProperty('visibility', 'hidden', 'important');
                  window.__dmoHidden.push(el);
                }
              }
            }"""
        )
        # 插件自己的绿色提示条（「已加入并开始播放」）也压在带上，等它自己淡出。
        # 它一般 3 秒内消失；等不到就手动藏掉这张图里的那一枚。
        try:
            page.wait_for_selector(".dmo-note, .dmo-capsule-note", state="detached", timeout=6000)
        except Exception:  # noqa: BLE001
            page.evaluate(
                """() => {
                  for (const el of document.querySelectorAll('.dmo-note, .dmo-capsule-note')) {
                    el.style.setProperty('visibility', 'hidden', 'important');
                  }
                }"""
            )
        page.wait_for_timeout(300)

        # 第二张：底部频谱带特写。频谱在整屏里只是细长一条，混在整屏里看不清画法。
        #
        # 必须用 element.screenshot 而不是自己算 clip：带子是 80% 宽居中的（x≈132），
        # 早前用 clip + 左右各 12px 内边距去截，把左侧栏也框了进去 ——
        # 左侧栏底部有张「18:00 转平价」的进度条，就那样压进了频谱图左上角。
        bar = page.query_selector(".dmo-barspectrum")
        if bar is not None:
            bar.screenshot(path=str(OUT / "screenshot-spectrum.png"))
            print("wrote", OUT / "screenshot-spectrum.png")
        else:
            print("没找到 .dmo-barspectrum，跳过频谱特写", file=sys.stderr)

        # 侧栏立刻恢复：下一步要点「账号菜单」。
        page.evaluate(
            """() => {
              for (const el of (window.__dmoHidden || [])) {
                el.style.removeProperty('visibility');
              }
              window.__dmoHidden = [];
            }"""
        )
        page.wait_for_timeout(200)

        card = page.query_selector(".dmo-card")
        if card is None:
            print("没找到 .dmo-card", file=sys.stderr)
            return 1
        card.screenshot(path=str(OUT / "screenshot-dock.png"))
        print("wrote", OUT / "screenshot-dock.png")

        # 1) 收起态胶囊 —— 必须放在播放之后拍，否则截到的是「未播放 0:00 / --:--」的空态，
        # 一张证明不了任何事的图。收起用卡片头上的「▾」按钮（title/aria-label = 收起）。
        try:
            # 用 evaluate 直接点，不走真实指针：宿主的壁纸浮层（.dshwv-root）会拦
            # pointer 事件，page.click 会报 "subtree intercepts pointer events" 超时 30s。
            page.evaluate(
                """() => {
                  const btn = document.querySelector('.dmo-icon[aria-label="收起"]');
                  if (!btn) throw new Error('找不到收起按钮');
                  btn.click();
                }"""
            )
            page.wait_for_timeout(700)
            page.evaluate(HIDE_INTRUDERS)
            # 底部频谱带紧贴胶囊下沿，裁剪框的下 pad 会把它的上沿切进图里，
            # 看起来像一条来路不明的蓝边。这张图的主角是胶囊本身，先藏掉频谱带。
            # （频谱有自己的特写图，不靠这张。）
            page.evaluate(
                "() => { const s = document.querySelector('.dmo-barspectrum'); if (s) s.style.visibility = 'hidden'; }"
            )
            clip = page.evaluate(CAPSULE_CLIP)
            print("胶囊裁剪框:", clip)
            # 阈值别设成 80：收起态胶囊本身只有约 75px 高，判太严会掉进 else
            # 拍出一张整屏图（而整屏图里胶囊只占右下一个小角，等于没拍）。
            if clip and clip["width"] > 40 and clip["height"] > 24:
                page.screenshot(path=str(OUT / "screenshot-capsule.png"), clip=clip)
            else:
                page.screenshot(path=str(OUT / "screenshot-capsule.png"))
            print("wrote", OUT / "screenshot-capsule.png", page.evaluate(READ_PLAYING))
            # 收回展开态，后面还要用卡片定位跑设置那一步的前提。
            page.evaluate(
                "() => { const b = document.querySelector('.dmo-capsule-main'); if (b) b.click(); }"
            )
            page.wait_for_timeout(600)
        except Exception as exc:  # noqa: BLE001
            print("胶囊截图失败:", str(exc).split("\n")[0][:160], file=sys.stderr)

        # 3) 设置分区：它不在页面默认 DOM 里，必须走「账号菜单 → 设置 → 音乐库」三步。
        #
        # 三个实测坑：
        #   a. 必须用 page.click（真实 pointer），合成 el.click() 到不了宿主菜单项
        #      的事件链，弹窗不出现。
        #   b. 设置弹窗左栏是**按选中项惰性渲染**的，不点「音乐库」那一栏，
        #      .dmo-settings 根本不在 DOM 里 —— 这是「设置页截图一直空白/缺失」的真因。
        #   c. 弹窗会盖住音乐台，所以必须放在最后拍。
        if page.query_selector(".dmo-card") is not None:
            page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        try:
            page.click('button[aria-label="账号菜单"]', timeout=8000)
            page.wait_for_timeout(600)
            page.click('[role="menuitem"]:has-text("设置")', timeout=8000)
            page.wait_for_timeout(1500)
            page.click('[role="dialog"] :text-is("音乐库")', timeout=8000)
            page.wait_for_timeout(1500)
        except Exception as exc:  # noqa: BLE001
            print("打开设置弹窗失败:", str(exc).split("\n")[0][:160], file=sys.stderr)

        section = page.query_selector(".dmo-settings")
        if section is None:
            print("设置分区未渲染，跳过设置截图", file=sys.stderr)
        else:
            # 音乐台本身要藏掉：设置弹窗不是全屏遮罩，右下角会透出胶囊/卡片的一角。
            # 这是「设置页截图右下角总有个奇怪圆角框」的真因。
            page.evaluate(
                """() => {
                  const dock = document.querySelector('.dmo-dock-stack');
                  if (dock) dock.style.setProperty('visibility', 'hidden', 'important');
                }"""
            )
            # 设置分区实测 564x1945，躺在宿主的滚动容器里（可视高只有 746）。
            # 直接 element.screenshot() 让 Playwright 去「拼接」超出视口的部分 —— 实测拼不出来：
            # 上半截正常，下半截全白，右下角还透出音乐台卡片。抬视口高度也一样，因为
            # 真正的限制是那个 `overflow:auto` 的祖先，不是 window。
            # 唯一稳的做法：沿祖先链把滚动容器改成 overflow:visible + height:auto，
            # 让整个分区一次性铺开在 DOM 里，再按元素截图。这也顺带解释了历史现象
            # 「设置页截图总是半截空白」。
            page.evaluate(
                """() => {
                  const sec = document.querySelector('.dmo-settings');
                  if (!sec) return;
                  let n = sec.parentElement;
                  while (n && n !== document.documentElement) {
                    const cs = getComputedStyle(n);
                    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll'
                        || cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
                      n.style.setProperty('overflow', 'visible', 'important');
                      n.style.setProperty('max-height', 'none', 'important');
                      n.style.setProperty('height', 'auto', 'important');
                    }
                    n = n.parentElement;
                  }
                  const dlg = document.querySelector('[role="dialog"]');
                  if (dlg) {
                    dlg.style.setProperty('height', 'auto', 'important');
                    dlg.style.setProperty('max-height', 'none', 'important');
                  }
                }"""
            )
            page.wait_for_timeout(700)
            box = section.bounding_box() or {}
            need_h = int((box.get("height") or 0)) + 240
            if need_h > page.viewport_size["height"]:
                page.set_viewport_size({"width": VIEWPORT["width"], "height": min(4200, need_h)})
                page.wait_for_timeout(700)
            section.scroll_into_view_if_needed()
            page.wait_for_timeout(500)
            section.screenshot(path=str(OUT / "screenshot-settings.png"))
            print("wrote", OUT / "screenshot-settings.png",
                  f"(section {int(box.get('width') or 0)}x{int(box.get('height') or 0)},"
                  f" viewport h={page.viewport_size['height']})")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
