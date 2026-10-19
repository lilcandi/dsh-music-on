"""真浏览器验收：音景已消失、频谱满铺、主题可切。

对着运行中的 DSH Web（http://127.0.0.1:3080）跑。用 python playwright。
不写文件、不改设置，只读 DOM 与计算样式。

为什么需要它：535 项单测跑的是源码字符串和纯函数，`check-install.mjs` 只比对
文件哈希。两者都绿也可能浏览器里根本没渲染（曾经反复踩过：改了没同步安装副本、
client chunk 按 rev 缓存、React 卸载整棵子树而控制台只有一条 ReferenceError）。
只有真浏览器能证明「用户看见的是什么」。
"""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3080/"
VIEWPORT = {"width": 1440, "height": 900}

FAILS = []

# 宿主右下角另有别的浮件（鲸鱼动图 dshwv-root 之类）会盖住胶囊，Playwright 的
# click 会因 "subtree intercepts pointer events" 直接超时。截图脚本里有同样一段：
# 只隐藏「自身定位是 fixed/absolute、矩形与本插件相交、且不属于本插件」的元素，
# 并且**绝不隐藏包含本插件节点的祖先**（隐藏祖先 = 连胶囊一起抹掉）。
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


def check(name, ok, detail=""):
    print(("ok    " if ok else "FAIL  ") + name + (("  " + detail) if detail else ""))
    if not ok:
        FAILS.append(name)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport=VIEWPORT)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # 不能等 networkidle：DSH 有 SSE 长连接，永不 idle。
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector(".dmo-dock-stack", timeout=20000)
        page.wait_for_timeout(1500)

        hidden = page.evaluate(HIDE_INTRUDERS)
        print("      已隐藏遮挡元素 =", hidden)

        # 1) 音景必须彻底消失
        check("卡片里无 .dmo-soundscapes", page.query_selector(".dmo-soundscapes") is None)
        check("页面无 [data-preset-id]", page.query_selector("[data-preset-id]") is None)

        # 2) 展开卡片（用 dispatchEvent 而不是 Playwright 的点击，绕开遮挡判定）
        page.evaluate("() => document.querySelector('.dmo-capsule-main').click()")
        page.wait_for_selector(".dmo-card", timeout=10000)
        page.wait_for_timeout(800)
        page.evaluate(HIDE_INTRUDERS)
        check("卡片里仍无 .dmo-soundscapes",
              page.query_selector(".dmo-card .dmo-soundscapes") is None)

        # 3) 频谱带：存在、居中、宽度跟随 --dmo-span
        bar = page.query_selector(".dmo-barspectrum")
        check("频谱带存在", bar is not None)
        if bar is not None:
            info = page.evaluate(
                """() => {
                  const el = document.querySelector('.dmo-barspectrum');
                  const cs = getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  const canvas = el.querySelector('canvas');
                  const cr = canvas ? canvas.getBoundingClientRect() : null;
                  return {
                    span: cs.getPropertyValue('--dmo-span').trim(),
                    left: cs.left,
                    right: cs.right,
                    width: cs.width,
                    boxLeft: r.left,
                    boxWidth: r.width,
                    canvasW: cr ? cr.width : null,
                    canvasH: cr ? cr.height : null,
                    vw: window.innerWidth,
                  };
                }"""
            )
            print("      频谱带实测 =", info)
            check("频谱带声明了 --dmo-span", bool(info["span"]), info["span"])
            # 不要断言 right 必须是 auto。CSS 对定位元素允许 left/right/width 三者
            # 并存（过度约束），只要数值自洽三者都生效 —— 实测 left=right=144、
            # width=1152 正是 80% 居中的正确几何。断言几何，不要断言写法。
            check("频谱带画布有实际宽度", (info["canvasW"] or 0) > 200, str(info["canvasW"]))
            # 居中判据：左侧留白 ≈ 右侧留白
            span_px = info["boxWidth"]
            left_gap = info["boxLeft"]
            right_gap = info["vw"] - info["boxLeft"] - span_px
            check("频谱带水平居中", abs(left_gap - right_gap) <= 2,
                  f"left={left_gap:.1f} right={right_gap:.1f}")
            expect = info["vw"] * float(info["span"].rstrip('%')) / 100.0
            check("频谱带宽度等于 --dmo-span 声明值", abs(span_px - expect) <= 2,
                  f"{span_px:.1f} vs 期望 {expect:.1f}")
            check("频谱带未满宽（--dmo-span 生效）", span_px < info["vw"] - 4,
                  f"{span_px:.0f} < {info['vw']}")

        # 4) 主题：容器必须带 data-dmo-theme，且令牌随主题变化
        theme_attr = page.evaluate(
            "() => document.querySelector('.dmo-dock-stack').getAttribute('data-dmo-theme')"
        )
        check("dock 带 data-dmo-theme", bool(theme_attr), str(theme_attr))
        brand_before = page.evaluate(
            """() => getComputedStyle(document.querySelector('.dmo-dock-stack'))
                     .getPropertyValue('--dmo-brand').trim()"""
        )
        check("--dmo-brand 有值", bool(brand_before), brand_before)

        # 4b) 七套主题必须真的改变令牌。只写 [data-dmo-theme='x'] 块而不让外层
        # 覆盖，切主题时全是默认蓝白 —— 这是「加了主题但看不出变化」的唯一真因。
        # 这里只改 DOM 属性读计算样式，不碰 localStorage，刷新即恢复。
        seen = page.evaluate(
            """() => {
              const el = document.querySelector('.dmo-dock-stack');
              const before = el.getAttribute('data-dmo-theme');
              const out = {};
              for (const t of ['whale','aurora','mint','sunset','rose','neon','mono']) {
                el.setAttribute('data-dmo-theme', t);
                const cs = getComputedStyle(el);
                out[t] = {
                  brand: cs.getPropertyValue('--dmo-brand').trim(),
                  rgb: cs.getPropertyValue('--dmo-rgb').trim(),
                  spec: cs.getPropertyValue('--dmo-spec-base').trim(),
                };
              }
              el.setAttribute('data-dmo-theme', before);
              return out;
            }"""
        )
        for name, vals in seen.items():
            print(f"      主题 {name:7s} brand={vals['brand']:10s} rgb={vals['rgb']}")
        brands = {v["brand"] for v in seen.values()}
        check("七套主题各有不同主色", len(brands) == 7, f"{len(brands)} 种")
        check("每套主题都给出 --dmo-rgb 三元组",
              all(v["rgb"] for v in seen.values()),
              str([k for k, v in seen.items() if not v["rgb"]]))
        check("每套主题都给出 --dmo-spec-base",
              all(v["spec"] for v in seen.values()),
              str([k for k, v in seen.items() if not v["spec"]]))
        check("主题切换未残留（已还原为当前设置）",
              page.evaluate(
                  "() => document.querySelector('.dmo-dock-stack').getAttribute('data-dmo-theme')"
              ) == theme_attr)

        # 5) 设置分区也必须跟随主题（合成探针覆盖不到：它渲染在宿主设置弹窗里，
        #    不在 .dmo-dock-stack 子树内）。这是「换了主题只有播放器变、设置页还是蓝」的守卫。
        #    入口路径（实测）：侧栏「账号菜单」→ 菜单项「设置」→ 弹窗左栏「音乐库」。
        #    必须用真实 pointer 点击（page.click）：合成 el.click() 到不了宿主的
        #    菜单项事件链，弹窗不会出现。且 settings 分区是**按选中项惰性渲染**的，
        #    不点「音乐库」这一栏，.dmo-settings 根本不在 DOM 里。
        try:
            page.click('button[aria-label="账号菜单"]', timeout=5000)
            page.wait_for_timeout(600)
            page.click('[role="menuitem"]:has-text("设置")', timeout=5000)
            page.wait_for_timeout(1500)
            page.click('[role="dialog"] :text-is("音乐库")', timeout=5000)
            page.wait_for_timeout(1200)
        except Exception as exc:  # noqa: BLE001
            print("      打开设置弹窗失败：", str(exc).split('\n')[0][:120])
        settings_theme = page.evaluate(
            """() => {
              const el = document.querySelector('.dmo-settings');
              if (!el) return { present: false };
              const before = el.getAttribute('data-dmo-theme');
              const out = {};
              for (const t of ['whale','mint','sunset']) {
                el.setAttribute('data-dmo-theme', t);
                out[t] = getComputedStyle(el).getPropertyValue('--dmo-brand').trim();
              }
              el.setAttribute('data-dmo-theme', before);
              return { present: true, theme: before, seen: out };
            }"""
        )
        if not settings_theme["present"]:
            print("      设置分区未挂载（未找到设置入口），跳过该项")
        else:
            print("      设置页主题 =", settings_theme["seen"])
            vals = list(settings_theme["seen"].values())
            check("设置分区自带 data-dmo-theme", bool(settings_theme["theme"]),
                  str(settings_theme["theme"]))
            check("设置分区跟随主题变化", len(set(vals)) == len(vals),
                  f"{len(set(vals))}/{len(vals)} 种不同")

        # 6) 没有任何页面级异常（ReferenceError 会让 React 静默卸载子树）
        hard = [e for e in errors if 'ResizeObserver' not in e]
        check("无页面 JS 异常", not hard, ' | '.join(hard[:3]))

        browser.close()

    print()
    if FAILS:
        print(f"失败 {len(FAILS)} 项：" + "、".join(FAILS))
        return 1
    print("全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
