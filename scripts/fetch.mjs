// npm run fetch: scripts/sources.mjs 목록대로 원본을 data/raw/에 내려받는다.
// 받은 파일의 크기, SHA-256, 받은 날짜는 data/raw-lock.json에 적는다.
//
//   npm run fetch                 없는 파일만 받는다
//   npm run fetch -- --only=a,b   이 key만 받는다
//   npm run fetch -- --force      있어도 다시 받는다
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = resolve(ROOT, 'data/raw-lock.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'busan-subway-design/0.1 (offline educational game; data build script)';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeLock(lock) {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(LOCK_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

async function download(source) {
  const init = source.overpass
    ? {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: source.overpass }),
      }
    : { headers: { 'User-Agent': USER_AGENT } };
  const url = source.overpass ? OVERPASS_URL : source.url;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(600_000) });
    if (res.status === 429 || res.status === 504) {
      const wait = 30 * attempt;
      console.log(`  서버가 바빠요(${res.status}). ${wait}초 뒤 다시 시도해요.`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') ?? '';
    const head = buf.subarray(0, 200).toString('utf8').trimStart().toLowerCase();
    // 공공데이터포털은 막히면 파일 대신 HTML(보안 문자 등)을 돌려준다.
    if (!source.overpass && (type.includes('text/html') || head.startsWith('<!doctype') || head.startsWith('<html'))) {
      throw new Error('파일 대신 웹 페이지가 왔어요. 직접 내려받아 주세요.');
    }
    if (source.overpass && head.includes('"remark"') && head.includes('runtime error')) {
      throw new Error('Overpass 쿼리가 실패했어요: ' + head);
    }
    return buf;
  }
  throw new Error('여러 번 시도했지만 받지 못했어요.');
}

const lock = readLock();
const failed = [];
let lastHost = null;

for (const source of SOURCES) {
  if (only && !only.has(source.key)) continue;
  const path = resolve(ROOT, source.file);
  const prev = lock[source.key];

  if (existsSync(path) && !force) {
    const buf = readFileSync(path);
    const hash = sha256(buf);
    if (prev && prev.sha256 !== hash) {
      console.log(`! ${source.key}: 파일이 raw-lock.json의 해시와 달라요.`);
      failed.push(source.key);
    } else {
      console.log(`- ${source.key}: 이미 있어요 (${buf.length.toLocaleString()} B)`);
    }
    continue;
  }

  const host = source.overpass ? 'overpass' : new URL(source.url).host;
  if (lastHost === host) await sleep(source.overpass ? 10_000 : 2_000);
  lastHost = host;

  console.log(`↓ ${source.key}`);
  try {
    const buf = await download(source);
    if (source.size && buf.length !== source.size) {
      throw new Error(`크기가 달라요: 받은 것 ${buf.length}, 목록 ${source.size}`);
    }
    const hash = sha256(buf);
    if (prev && prev.sha256 !== hash) {
      console.log(`  해시가 전과 달라요. 새 판으로 바뀌었을 수 있어요.`);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    lock[source.key] = {
      file: source.file,
      url: source.overpass ? OVERPASS_URL : source.url,
      bytes: buf.length,
      sha256: hash,
      fetched: new Date().toISOString().slice(0, 10),
    };
    writeLock(lock);
    console.log(`  ${buf.length.toLocaleString()} B  sha256 ${hash.slice(0, 16)}…`);
  } catch (err) {
    console.log(`  실패: ${err.message}`);
    failed.push(source.key);
  }
}

if (failed.length) {
  console.log(`\n확인이 필요한 항목: ${failed.join(', ')}`);
  process.exitCode = 1;
}
