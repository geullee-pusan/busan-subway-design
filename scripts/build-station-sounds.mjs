// 승강장 소리를 게임 자료로 만든다(data/build/station-sounds.json).
//
// 원본: 공공데이터포털 3033578 부산교통공사_부산도시철도 역사 안내방송_20250831(이용허락범위 제한 없음)
//  - "1. 열차진입 알림음": 상행선(갈매기, 파도 소리), 하행선(뱃고동, 파도 소리)
//  - "2. 열차진입방송": 호선·행선지별 방송(한국어와 영어). 짧게 도는 열차(신평행, 광안행 등)는 뺀다.
// 파일 이름은 .MP4지만 속은 MP3(ID3)다. 게임 한 파일에 넣으려고 base64 글자로 바꾼다.
//
// 대구 도시철도 열차 안 소리: 공공데이터포털 15063230 대구교통공사_열차 안내방송 음원_20260331(이용허락범위 제한 없음)
//  - 노선마다 도착역 BGM, 출발역 BGM, 환승역 시그널송, 출입문 닫힘 방송. 대구에는 승강장 진입 안내음 자료가 없다.
//  - BGM(WAV, 40~70초)은 앞 6초만 잘라 16kHz 모노 8비트 WAV로 줄인다(게임 파일 크기 때문). MP3는 그대로 쓴다.
//  - 2026년 7월부터 대구 열차 방송은 AI 음성으로 바뀌었고 그 음성은 공개하지 않는다. 이 묶음은 그 전 녹음이다.
//
// 어느 방향이 상행인지: 운행 정보(15082980)에 상행·하행 칸이 없다. 우리나라 철도에서 흔히 쓰는
// "열차 번호가 홀수면 하행" 규칙으로 정했다. TODO(확인 필요): 부산 도시철도의 상행·하행 방향.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ZIP에서 이름이 맞는 파일만 꺼낸다(이름은 UTF-8 표시가 없으면 EUC-KR). */
function unzip(buffer, want) {
  const files = {};
  let end = buffer.length - 22;
  while (buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const flag = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const raw = buffer.subarray(at + 46, at + 46 + nameLength);
    const name = flag & 0x800 ? raw.toString('utf8') : new TextDecoder('euc-kr').decode(raw);
    at += 46 + nameLength + extraLength + commentLength;
    if (!want(name)) continue;
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(start, start + packed);
    files[name] = method === 0 ? Buffer.from(body) : inflateRawSync(body);
  }
  return files;
}

// 1. 어느 끝 역 쪽이 하행인지(열차 번호가 홀수인 열차가 가는 끝 역)
const csv = new TextDecoder('euc-kr').decode(readFileSync(resolve(ROOT, 'data/raw/datagokr/15082980.csv')));
const rows = csv.split(/\r?\n/).filter(Boolean);
const head = rows.shift().split(',');
const col = (name) => head.indexOf(name);
const [cNo, cLine, cEnd] = ['열차번호', '노선명', '운행구간종점명'].map(col);
const downEnds = {};
for (const row of rows) {
  const cells = row.split(',');
  const line = /(\d)호선/.exec(cells[cLine])?.[1];
  if (!line || Number(cells[cNo]) % 2 !== 1) continue;
  downEnds[line] ??= {};
  downEnds[line][cells[cEnd]] = (downEnds[line][cells[cEnd]] ?? 0) + 1;
}
// 호선마다 홀수 열차가 가장 많이 가는 끝 역
const down = Object.fromEntries(
  Object.entries(downEnds).map(([line, ends]) => [line, Object.entries(ends).sort((a, b) => b[1] - a[1])[0][0]]),
);

// 2. 알림음과 진입 방송
const zip = unzip(readFileSync(resolve(ROOT, 'data/raw/datagokr/3033578.zip')), (name) => {
  if (name.startsWith('1. 열차진입 알림음/') && name.endsWith('.MP4')) return true;
  return name.startsWith('2. 열차진입방송/') && (name.includes('(한국어)') || name.includes('(영어)'));
});
/** 긴 노선 끝 역(짧게 도는 열차의 행선지는 뺀다) */
const MAIN_ENDS = { 1: ['노포', '다대포해수욕장'], 2: ['장산', '양산'], 3: ['수영', '대저'], 4: ['미남', '안평'] };
const chimes = {};
const approach = {};
const approachEnglish = {};
for (const [name, body] of Object.entries(zip)) {
  if (body.subarray(0, 3).toString('latin1') !== 'ID3') throw new Error(`MP3가 아니에요: ${name}`);
  const base64 = body.toString('base64');
  if (name.includes('상행선')) chimes.up = base64;
  else if (name.includes('하행선')) chimes.down = base64;
  else {
    const match = /(\d)호선 (.+)행\((한국어|영어)\)/.exec(name);
    if (!match) continue;
    const [, line, end, language] = match;
    if (!MAIN_ENDS[line]?.includes(end)) continue;
    (language === '영어' ? approachEnglish : approach)[`${line}|${end}`] = base64;
  }
}
if (!chimes.up || !chimes.down) throw new Error('알림음을 찾지 못했어요');

// 2. 대구 도시철도 열차 안 소리
/** WAV(PCM 16비트)를 읽어 앞 seconds초를 16kHz 모노 8비트 WAV로 줄인다. 앞의 조용한 부분은 떼고, 끝은 0.8초 동안 줄여 끝낸다. */
function shrinkWav(buffer, seconds) {
  let at = 12;
  let fmt = null;
  let data = null;
  while (at + 8 <= buffer.length) {
    const id = buffer.toString('ascii', at, at + 4);
    const size = buffer.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = { channels: buffer.readUInt16LE(at + 10), rate: buffer.readUInt32LE(at + 12), bits: buffer.readUInt16LE(at + 22) };
    if (id === 'data') data = buffer.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('16비트 PCM WAV가 아니에요');
  const frames = Math.floor(data.length / (2 * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += data.readInt16LE((i * fmt.channels + c) * 2);
    mono[i] = sum / fmt.channels / 32768;
  }
  let start = 0;
  while (start < frames && Math.abs(mono[start]) < 0.01) start++;
  const RATE = 16000;
  const step = fmt.rate / RATE;
  const count = Math.min(Math.floor(seconds * RATE), Math.floor((frames - start) / step));
  let peak = 0;
  const outF = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // 고르게 평균을 내서 줄인다(높은 소리가 갈라지지 않게).
    const from = start + Math.floor(i * step);
    const to = Math.min(frames, start + Math.floor((i + 1) * step));
    let sum = 0;
    for (let k = from; k < to; k++) sum += mono[k];
    outF[i] = sum / Math.max(1, to - from);
    peak = Math.max(peak, Math.abs(outF[i]));
  }
  const fade = Math.min(count, Math.floor(0.8 * RATE));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const pcm = Buffer.alloc(count);
  for (let i = 0; i < count; i++) {
    const tail = i >= count - fade ? (count - i) / fade : 1;
    pcm[i] = Math.max(0, Math.min(255, Math.round(128 + outF[i] * gain * tail * 127)));
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE, 28);
  head.writeUInt16LE(1, 32);
  head.writeUInt16LE(8, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

const daeguZip = unzip(readFileSync(resolve(ROOT, 'data/raw/datagokr/15063230.zip')), (name) => /^[123]호선\/[^/]+\.(wav|mp3)$/i.test(name));
/** 같은 소리는 한 번만 넣는다. 열쇠는 원본 파일 이름 */
const daeguClips = {};
const daeguLinesOut = {};
const KINDS = [
  ['arrive', /도착역 BGM/, 6],
  ['depart', /출발역 BGM/, 6],
  ['transfer', /환승역 시그널송/, 10],
  ['door', /출입문/, 10],
];
const seen = new Map();
for (const [name, body] of Object.entries(daeguZip)) {
  const line = `DG${name[0]}`;
  const kind = KINDS.find(([, pattern]) => pattern.test(name));
  if (!kind) continue;
  const mp3 = /\.mp3$/i.test(name);
  const clip = mp3 ? body : shrinkWav(body, kind[2]);
  const key = clip.toString('base64');
  if (!seen.has(key)) {
    seen.set(key, name);
    daeguClips[name] = { type: mp3 ? 'audio/mpeg' : 'audio/wav', data: key };
  }
  (daeguLinesOut[line] ??= {})[kind[0]] = seen.get(key);
}
for (const line of ['DG1', 'DG2', 'DG3']) {
  for (const [kind] of KINDS) if (!daeguLinesOut[line]?.[kind]) throw new Error(`대구 ${line} ${kind} 소리를 찾지 못했어요`);
}

const out = {
  _설명:
    '승강장 소리(부산교통공사 실제 녹음, MP3를 base64로). chimes: 열차진입 알림음(up = 상행선 갈매기·파도, down = 하행선 뱃고동·파도). approach: "호선|끝 역" → 열차진입 방송(한국어), approachEnglish: 같은 열차의 영어 방송. downEnds: 호선마다 하행으로 보는 끝 역(열차 번호가 홀수인 열차가 가는 끝 역, TODO 확인 필요). 만든 곳: scripts/build-station-sounds.mjs',
  source: '공공데이터포털 3033578 부산교통공사_부산도시철도 역사 안내방송_20250831',
  downEnds: down,
  chimes,
  approach,
  approachEnglish,
  daegu: {
    _설명:
      '대구 도시철도 열차 안 소리(대구교통공사 실제 녹음). lines: 노선 → {arrive: 도착역 BGM 앞 6초, depart: 출발역 BGM 앞 6초, transfer: 환승역 시그널송, door: 출입문 닫힘 방송} → clips의 열쇠. clips: {type, data(base64)}. BGM은 16kHz 모노 8비트로 줄였다.',
    source: '공공데이터포털 15063230 대구교통공사_열차 안내방송 음원_20260331',
    lines: daeguLinesOut,
    clips: daeguClips,
  },
};
writeFileSync(resolve(ROOT, 'data/build/station-sounds.json'), JSON.stringify(out));
const size = Buffer.byteLength(JSON.stringify(out));
console.log(`하행 끝 역: ${JSON.stringify(down)}`);
console.log(`진입 방송 한국어 ${Object.keys(approach).length}개, 영어 ${Object.keys(approachEnglish).length}개: ${Object.keys(approach).join(', ')}`);
console.log(`대구 열차 안 소리 ${Object.keys(daeguClips).length}개: ${Object.entries(daeguClips).map(([n, c]) => `${n} ${(c.data.length / 1024).toFixed(0)}KB`).join(', ')}`);
console.log(`station-sounds.json ${(size / 1024).toFixed(0)}KB`);
