// 공공데이터포털 3033578 "부산교통공사_부산도시철도 역사 안내방송" ZIP에서
// 시승 모드에 쓰는 것을 만든다.
//  1. 열차 진입 알림음 두 개(상행선, 하행선)만 꺼내 data/build/sounds/에 둔다. 소리는 고치지 않는다.
// 확장자는 .MP4지만 속은 MP3(ID3 머리)라서 .mp3로 내보낸다.
// 시승 모드에서 열차가 승강장에 들어올 때 튼다. 이용허락범위: 제한 없음(data/SOURCES.md).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZIP = resolve(ROOT, 'data/raw/datagokr/3033578.zip');
const OUT = resolve(ROOT, 'data/build/sounds');

/** ZIP 안 이름 → 내보낼 파일 이름 */
const WANTED = {
  '1. 열차진입 알림음/상행선(갈매기,파도소리).MP4': 'arrival-up.mp3',
  '1. 열차진입 알림음/하행선(뱃고동,파도소리).MP4': 'arrival-down.mp3',
};

/** 파일 이름 글자: UTF-8 표시가 없으면 EUC-KR로 읽는다. */
function decodeName(raw, flags) {
  return flags & 0x800 ? raw.toString('utf8') : new TextDecoder('euc-kr').decode(raw);
}

const zip = readFileSync(ZIP);
let end = zip.length - 22;
while (zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
const count = zip.readUInt16LE(end + 10);
let at = zip.readUInt32LE(end + 16);
mkdirSync(OUT, { recursive: true });
const found = [];
for (let i = 0; i < count; i++) {
  const flags = zip.readUInt16LE(at + 8);
  const method = zip.readUInt16LE(at + 10);
  const packed = zip.readUInt32LE(at + 20);
  const size = zip.readUInt32LE(at + 24);
  const nameLength = zip.readUInt16LE(at + 28);
  const extraLength = zip.readUInt16LE(at + 30);
  const commentLength = zip.readUInt16LE(at + 32);
  const local = zip.readUInt32LE(at + 42);
  const name = decodeName(zip.subarray(at + 46, at + 46 + nameLength), flags);
  at += 46 + nameLength + extraLength + commentLength;
  const target = WANTED[name];
  if (!target) continue;
  const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const body = zip.subarray(dataStart, dataStart + packed);
  const data = method === 0 ? body : inflateRawSync(body);
  if (data.length !== size) throw new Error(`${name}: 크기가 달라요(${data.length} ≠ ${size})`);
  writeFileSync(resolve(OUT, target), data);
  const sha = createHash('sha256').update(data).digest('hex');
  found.push(target);
  console.log(`${target}  ${data.length.toLocaleString()} B  sha256 ${sha.slice(0, 16)}…  ← ${name}`);
}
const missing = Object.values(WANTED).filter((file) => !found.includes(file));
if (missing.length > 0) throw new Error(`ZIP에서 못 찾음: ${missing.join(', ')}`);

// 역명판 글꼴(프리텐다드)의 이용 허락 글. OFL은 글꼴과 함께 저작권 표시와 이용 허락 전문을 주어야 한다.
// 게임 파일에는 바깥 주소를 넣지 않으므로(CLAUDE.md) 머리글의 주소만 빼고 전문을 그대로 둔다.
// 원문은 data/raw/fonts/Pretendard-LICENSE.txt에 그대로 있다.
{
  const license = readFileSync(resolve(ROOT, 'data/raw/fonts/Pretendard-LICENSE.txt'), 'utf8');
  const clean = license
    .replace(/\s*\(https?:\/\/[^)]*\)/g, '')
    .replace(/This license is copied below, and is also available with a FAQ at:\s*\n\s*https?:\/\/\S+/, 'This license is copied below.');
  if (/https?:\/\//.test(clean)) throw new Error('글꼴 이용 허락 글에 주소가 남았어요');
  const fonts = resolve(ROOT, 'data/build/fonts');
  mkdirSync(fonts, { recursive: true });
  writeFileSync(resolve(fonts, 'Pretendard-OFL.txt'), clean);
  console.log(`Pretendard-OFL.txt  ${clean.length.toLocaleString()} 글자`);
}
