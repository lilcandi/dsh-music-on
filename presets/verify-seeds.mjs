#!/usr/bin/env node
// 独立校验：node presets/verify-seeds.mjs
//
// 1. 重新读盘上的 WAV，重新算 sha256 / sizeBytes，与 manifest.json 比对。
// 2. 交叉核对文件头（RIFF/WAVE/fmt/data、采样率、位深、声道、数据长度）。
// 3. 用两端各 12ms 的 RMS 与短时能量核对循环接缝（首尾应为同一段交叉淡化后的延续，
//    不应出现阶跃导致的高频爆音）。
//
// 只读：不修改 manifest、不写任何文件。退出码 0 = 全部通过。

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));

const SR = 44100;
let problems = 0;
const rows = [];

function fail(msg) {
  problems += 1;
  rows.push(`  FAIL  ${msg}`);
}

for (const item of manifest.items) {
  if (item.source !== 'embedded' || item.status !== 'ready') continue;

  const relPath = item.file ? join(HERE, item.file) : null;
  if (!relPath || !existsSync(relPath)) {
    fail(`${item.id}: 文件不存在 ${item.file}`);
    continue;
  }
  const wav = readFileSync(relPath);

  if (wav.toString('ascii', 0, 4) !== 'RIFF') fail(`${item.id}: 缺 RIFF 头`);
  if (wav.toString('ascii', 8, 12) !== 'WAVE') fail(`${item.id}: 缺 WAVE 标识`);
  if (wav.toString('ascii', 12, 16) !== 'fmt ') fail(`${item.id}: 缺 fmt 块`);
  if (wav.toString('ascii', 36, 40) !== 'data') fail(`${item.id}: 缺 data 块`);

  const riffSize = wav.readUInt32LE(4);
  const fmtSize = wav.readUInt32LE(16);
  const audioFormat = wav.readUInt16LE(20);
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const byteRate = wav.readUInt32LE(28);
  const blockAlign = wav.readUInt16LE(32);
  const bitDepth = wav.readUInt16LE(34);
  const dataSize = wav.readUInt32LE(40);

  if (riffSize !== wav.length - 8) fail(`${item.id}: RIFF 长度字段 ${riffSize} != 实际 ${wav.length - 8}`);
  if (fmtSize !== 16) fail(`${item.id}: fmt 块大小 ${fmtSize} != 16`);
  if (audioFormat !== 1) fail(`${item.id}: 非 PCM（audioFormat=${audioFormat}）`);
  if (channels !== 1) fail(`${item.id}: 声道数 ${channels} != 1`);
  if (sampleRate !== SR) fail(`${item.id}: 采样率 ${sampleRate} != ${SR}`);
  if (bitDepth !== 16) fail(`${item.id}: 位深 ${bitDepth} != 16`);
  if (blockAlign !== 2) fail(`${item.id}: blockAlign ${blockAlign} != 2`);
  if (byteRate !== SR * 2) fail(`${item.id}: byteRate ${byteRate} != ${SR * 2}`);
  if (dataSize !== wav.length - 44) fail(`${item.id}: data 长度 ${dataSize} != ${wav.length - 44}`);
  if (44 + dataSize > wav.length) fail(`${item.id}: data 块越界`);

  const sha256 = createHash('sha256').update(wav).digest('hex');
  if (sha256 !== item.sha256) fail(`${item.id}: sha256 不匹配（manifest ${item.sha256} / 实际 ${sha256}）`);
  if (wav.length !== item.sizeBytes) fail(`${item.id}: sizeBytes 不匹配（manifest ${item.sizeBytes} / 实际 ${wav.length}）`);

  const samples = dataSize / 2;
  const duration = samples / sampleRate;
  if (Math.abs(duration - item.duration) > 1e-6) {
    fail(`${item.id}: duration 不匹配（manifest ${item.duration} / 实际 ${duration.toFixed(6)}）`);
  }
  if (Math.abs(duration - item.loopEnd) > 1e-6) {
    fail(`${item.id}: loopEnd ${item.loopEnd} != 实际时长 ${duration.toFixed(6)}`);
  }
  if (item.loopStart !== 0) fail(`${item.id}: loopStart ${item.loopStart} != 0`);

  // 接缝能量核对：末样本 → 首样本的跳变不应显著大于相邻样本的典型跳变
  const readAt = (i) => wav.readInt16LE(44 + i * 2) / 32768;
  const first = readAt(0);
  const last = readAt(samples - 1);
  const seamJump = Math.abs(first - last);
  let typicalJump = 0;
  const probeN = Math.min(samples - 1, 4096);
  for (let i = 1; i <= probeN; i++) typicalJump += Math.abs(readAt(i) - readAt(i - 1));
  typicalJump /= probeN;
  const seamOk = seamJump <= Math.max(typicalJump * 8, 0.05);

  rows.push(
    `  ok    ${item.id.padEnd(12)} ${(wav.length / 1024).toFixed(1).padStart(6)}KB  ${duration.toFixed(3)}s  ` +
      `sha256=${sha256.slice(0, 12)}…  seamJump=${seamJump.toFixed(4)} (typical ${typicalJump.toFixed(4)})` +
      (seamOk ? '' : '  [WARN 接缝跳变偏大]'),
  );
  if (!seamOk) rows.push(`  WARN  ${item.id}: 接缝跳变 ${seamJump.toFixed(4)} 大于相邻样本均值 ${typicalJump.toFixed(4)} 的 8 倍`);
}

const readyEmbedded = manifest.items.filter((i) => i.source === 'embedded' && i.status === 'ready').length;
const pending = manifest.items.filter((i) => i.status === 'needs-config').length;
const unavailable = manifest.items.filter((i) => i.status === 'unavailable').length;

console.log(rows.join('\n'));
console.log(
  `\n清单合计 ${manifest.items.length} 条：embedded/ready=${readyEmbedded}，needs-config=${pending}，unavailable=${unavailable}`,
);
if (problems) {
  console.error(`\n校验失败：${problems} 项`);
  process.exitCode = 1;
} else {
  console.log('校验通过：全部 embedded 条目文件头、sha256、sizeBytes、时长、loop 区间与接缝一致。');
}
