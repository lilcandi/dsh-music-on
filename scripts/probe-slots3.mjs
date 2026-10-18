// 穷举宿主所有 client 插件注册过的插槽名。
// 宿主每个 UI 插件的 lib/client.js 里都有 slots.register / slots.inject({ name: "..." })。
// 用法: node scripts/probe-slots3.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'C:\\Users\\candi\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai';
const pkgs = readdirSync(ROOT);
const found = new Map(); // slotName -> [pkg...]

for (const pkg of pkgs) {
  const clientPath = join(ROOT, pkg, 'lib', 'client.js');
  let src;
  try {
    if (!statSync(clientPath).isFile()) continue;
    src = readFileSync(clientPath, 'utf8');
  } catch { continue; }

  // slots.register({ name: "x.y" ... }) 与 slots.inject("x.y", ...) 两种形态
  const add = (name) => {
    if (!name || name.includes(' ')) return;
    if (!found.has(name)) found.set(name, []);
    found.get(name).push(pkg);
  };
  for (const m of src.matchAll(/name:\s*["'`]([a-zA-Z][\w.-]*\.[\w.-]+)["'`]/g)) add(m[1]);
  for (const m of src.matchAll(/(?:slots\.)?inject\(\s*["'`]([a-zA-Z][\w.-]*\.[\w.-]+)["'`]/g)) add(m[1]);
  for (const m of src.matchAll(/slot\(\s*["'`]([a-zA-Z][\w.-]*\.[\w.-]+)["'`]/g)) add(m[1]);
}

console.log(`共发现 ${found.size} 个插槽名\n`);
for (const [name, users] of [...found].sort()) {
  console.log(`${name.padEnd(34)} <- ${[...new Set(users)].slice(0, 3).join(', ')}`);
}
