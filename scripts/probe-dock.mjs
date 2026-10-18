// 查宿主里 composer dock 槽位的渲染侧：谁消费 "conversation.composer.dock"，容器长什么样。
// 用法: node scripts/probe-dock.mjs
import { readFileSync } from 'node:fs';

const R = 'C:\\Users\\candi\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai';
const targets = [
  ['dsh-client-ui-chat', 'lib/client.js'],
  ['dsh-client-ui-conversation', 'lib/client.js'],
  ['dsh-client-ui-input-trigger', 'lib/client.js'],
];

for (const [pkg, rel] of targets) {
  const p = `${R}\\${pkg}\\${rel}`;
  let s;
  try { s = readFileSync(p, 'utf8'); } catch { continue; }
  console.log(`\n########## ${pkg} ##########`);

  for (const key of ['conversation.composer.dock', 'conversation.composer.bar', 'conversation.composer']) {
    let idx = -1;
    const hits = [];
    while ((idx = s.indexOf(key, idx + 1)) !== -1) hits.push(idx);
    if (hits.length === 0) continue;
    console.log(`\n--- "${key}" 出现 ${hits.length} 次 ---`);
    // 逐个打印，但只保留像渲染侧（含 Slot/children/props）的上下文
    for (const h of hits) {
      const ctx = s.slice(Math.max(0, h - 300), h + 300).replace(/\s+/g, ' ');
      if (!/Slot|slot|children|props|render/.test(ctx)) continue;
      console.log(`  @${h}: ${ctx.slice(0, 520)}`);
    }
  }
}

// 找出宿主所有 .dock 类名的 CSS，判断容器布局
console.log('\n########## CSS: dock 相关规则 ##########');
for (const pkg of ['dsh-client-ui-chat', 'dsh-client-ui-conversation']) {
  const p = `${R}\\${pkg}\\lib\\client.js`;
  let s;
  try { s = readFileSync(p, 'utf8'); } catch { continue; }
  const rules = [...s.matchAll(/\.[A-Za-z0-9_]*[Dd]ock[A-Za-z0-9_]*\{[^}]{0,300}\}/g)].map((m) => m[0]);
  if (rules.length) {
    console.log(`--- ${pkg} ---`);
    for (const r of new Set(rules)) console.log('  ', r.replace(/\s+/g, ' ').slice(0, 240));
  }
}
