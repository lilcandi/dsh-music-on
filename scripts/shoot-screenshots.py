"""为 README 与插件市场抓取真实界面截图。

不是插件产物：只在本机对着运行中的 DSH Web（http://127.0.0.1:3080）跑一次。
用 python playwright，因为本机只装了 python 侧的 playwright（1.62.0）。

三张图：
  docs/screenshot-capsule.png  收起态胶囊 + 底部蓝白频谱
  docs/screenshot-dock.png     展开态播放卡片（含播放列表）
  docs/screenshot-settings.png 设置页的音乐台分区
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3080/"
OUT = Path(__file__).resolve().parent.parent / "docs"
VIEWPORT = {"width": 1440, "height": 900}

# 右下角另有别的插件挂件会盖住音乐台，截图前把它按位置隐藏掉。
# 判据：fixed/absolute 定位、贴着视口右下、且不是我们自己的 dmo- 节点。
HIDE_INTRUDERS = """
() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const hidden = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.dmo-dock-stack') || el.closest('.dmo-settings')) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    if (r.right > vw - 8 && r.bottom > vh - 8 && r.top > vh * 0.55) {
      el.style.setProperty('visibility', 'hidden', 'important');
      hidden.push(el.className || el.tagName);
    }
  }
  return hidden;
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

        # 1) 收起态：先让胶囊固定在右下角，再抓整屏
        page.screenshot(path=str(OUT / "screenshot-capsule.png"))
        print("wrote", OUT / "screenshot-capsule.png")

        # 2) 展开态：点胶囊正文
        page.click(".dmo-capsule-main")
        wait_for(page, ".dmo-card")
        page.wait_for_timeout(600)
        page.evaluate(HIDE_INTRUDERS)

        # 放一首内置音景，让频谱与封面有东西可画
        try:
            page.click("text=白噪音", timeout=4000)
            page.wait_for_timeout(2500)
        except Exception as exc:  # noqa: BLE001 - 找不到就截静态态，不影响交付
            print("预置曲目未点到:", exc)

        card = page.query_selector(".dmo-card")
        if card is None:
            print("没找到 .dmo-card", file=sys.stderr)
            return 1
        card.screenshot(path=str(OUT / "screenshot-dock.png"))
        print("wrote", OUT / "screenshot-dock.png")

        # 3) 设置分区：直接滚到它
        section = page.query_selector(".dmo-settings")
        if section is None:
            print("设置分区未渲染，跳过第三张", file=sys.stderr)
        else:
            section.scroll_into_view_if_needed()
            page.wait_for_timeout(500)
            section.screenshot(path=str(OUT / "screenshot-settings.png"))
            print("wrote", OUT / "screenshot-settings.png")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
