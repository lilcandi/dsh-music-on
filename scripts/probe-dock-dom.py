"""探页面结构：预置列表、频谱节点、设置入口分别长什么样。

只为写 shoot-screenshots.py 提供准确的类名与文案，不是插件产物。
"""

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3080/"

PROBE = r"""
() => {
  const pick = (sel) => Array.from(document.querySelectorAll(sel));
  const info = (el) => ({
    tag: el.tagName.toLowerCase(),
    cls: (el.className && String(el.className)) || '',
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  });
  return {
    dockStack: pick('.dmo-dock-stack').map(info),
    barspectrum: pick('.dmo-barspectrum').map((el) => ({
      ...info(el),
      rect: el.getBoundingClientRect().toJSON(),
      canvas: el.querySelectorAll('canvas').length,
      canvasSize: Array.from(el.querySelectorAll('canvas')).map((c) => [c.width, c.height, c.style.width, c.style.height]),
    })),
    card: pick('.dmo-card').map(info),
    // 卡片里所有可点按钮的文案
    buttons: pick('.dmo-card button').map(info),
    presets: pick('[class*="preset"]').map(info),
    // 设置入口：侧栏或顶栏里带“设置”的按钮
    settingsTriggers: pick('button, [role="button"]')
      .filter((el) => /设置|Settings/.test(el.textContent || '') || /settings/i.test(String(el.className || '')))
      .slice(0, 12)
      .map(info),
    audios: pick('audio').map((a) => ({ src: (a.src || '').slice(0, 80), paused: a.paused })),
  };
}
"""


HIDE = """
() => {
  // 右下角另有鲸鱼娘挂件（.dshwv-root）会吃掉 pointer events，探测前先摘掉。
  const removed = [];
  for (const el of document.querySelectorAll('.dshwv-root')) {
    el.style.setProperty('display', 'none', 'important');
    removed.push(el.className);
  }
  return removed;
}
"""


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector(".dmo-dock-stack", state="attached", timeout=20000)
        page.wait_for_timeout(1500)
        print("移除的遮挡件:", page.evaluate(HIDE))
        page.click(".dmo-capsule-main")
        page.wait_for_selector(".dmo-card", state="attached", timeout=10000)
        page.wait_for_timeout(1200)

        data = page.evaluate(PROBE)
        for key, value in data.items():
            print(f"\n===== {key} =====")
            if isinstance(value, list):
                for item in value:
                    print(" ", item)
            else:
                print(" ", value)

        # 把卡片完整 DOM 结构打一份（帮助找预置区）
        print("\n===== 卡片 innerHTML 前 3000 字 =====")
        html = page.evaluate("() => (document.querySelector('.dmo-card') || {}).innerHTML || ''")
        print(html[:3000])

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
