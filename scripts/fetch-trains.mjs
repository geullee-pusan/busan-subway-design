// npm run trains: 열차 시각표 원본을 API로 받아 data/raw/korail/에 저장한다(네트워크와 인증키를 쓴다).
//
//  - 한국철도공사 열차운행정보(15125762): 정한 날(KORAIL_DATE, 지난 평일) 하루 동안 지도 안 기차역마다 지나간 열차의
//    번호, 도착·출발 시각, 정차 구분, 상·하행. 이 API는 어제까지 3개월치만 준다.
//  - 국토교통부 TAGO 열차정보(15098552): 열차 종류(KTX, KTX-산천, ITX-마음, 무궁화호 등)와 운임.
//    출발역·도착역 쌍으로만 부를 수 있고 지난날은 주지 않아서, 다가오는 같은 요일(TAGO_DATE)로 받아 열차번호로 잇는다.
// 인증키는 저장하지 않는다(scripts/lib/api-key.mjs). 받은 파일의 크기와 SHA-256은 data/raw-lock.json에 적는다.
// 같은 원본이면 npm run data가 언제나 같은 게임 자료를 만든다(받는 날이 바뀌면 원본도 바뀐다).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { KORAIL_DATE, TAGO_DATE } from './lib/train-dates.mjs';
export { KORAIL_DATE, TAGO_DATE };
const OUT = resolve(ROOT, 'data/raw/korail');
const KORAIL = 'https://apis.data.go.kr/B551457/run/v2';
const TAGO = 'https://apis.data.go.kr/1613000/TrainInfo';
/** TAGO 시·도 코드: 지도 안 서울(11, 서울·용산·청량리), 부산, 대구, 광주, 대전, 울산, 세종(12), 경기(31, 서해선 안중·향남과 경부선 평택 쪽), 충북, 충남, 전북, 전남, 경북, 경남 */
const TAGO_CITIES = ['11', '12', '21', '22', '24', '25', '26', '31', '32', '33', '34', '35', '36', '37', '38'];

const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const encodedKey = encodeURIComponent(key);
const query = (params) => Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
let calls = 0;
async function getJson(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    calls += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      console.log(`  HTTP ${res.status}. ${attempt * 5}초 뒤 다시 해요.`);
    } catch (error) {
      console.log(`  ${error.message}. ${attempt * 5}초 뒤 다시 해요.`);
    }
    await sleep(attempt * 5000);
  }
  throw new Error('여러 번 해도 받지 못했어요.');
}
const items = (json) => {
  const list = json?.response?.body?.items?.item;
  return Array.isArray(list) ? list : list ? [list] : [];
};
/** 코레일 API: 쪽마다 받아 모두 모은다. */
async function korailAll(path, params) {
  const out = [];
  for (let page = 1; ; page++) {
    const json = await getJson(`${KORAIL}/${path}?serviceKey=${encodedKey}&returnType=JSON&numOfRows=1000&pageNo=${page}&${query(params)}`);
    const list = items(json);
    out.push(...list);
    const total = Number(json?.response?.body?.totalCount ?? 0);
    if (out.length >= total || list.length === 0) break;
    await sleep(100);
  }
  return out;
}

/** 이름 견주기 */
const nameKey = (name) => String(name ?? '').replace(/\s+/g, '').replace(/[()]/g, '').replace(/역$/, '');

// 1. 지도 안 기차역 이름: 일반·고속 철도(rail.json)와 코레일이 운영하는 광역전철(동해선, 대경선)
const rail = JSON.parse(readFileSync(resolve(ROOT, 'data/build/rail.json'), 'utf8'));
const metro = JSON.parse(readFileSync(resolve(ROOT, 'data/build/stations.json'), 'utf8')).stations;
// candidates: 여객역 목록에 없어 아직 넣지 않은 지도 안 역(열차가 서는지 보려고 함께 받는다)
const wanted = new Set([...rail.stations.map((s) => nameKey(s.name)), ...(rail.candidates ?? []).map(nameKey), ...metro.filter((s) => s.line === 'DH' || s.line === 'DK').map((s) => nameKey(s.name))]);

// 2. 코레일 역 코드
console.log('코레일 역 코드를 받아요.');
const stationCodes = await korailAll('codes2', { 'cond[type::EQ]': 'stn_cd' });
// 같은 이름에 코드가 여럿일 수 있다(안동: 옛 역 3900172, 2020년에 옮긴 새 역 3901102). 코드마다 받아 기록이 있는 것을 모두 쓴다.
const codesOf = new Map();
for (const c of stationCodes) {
  if (!wanted.has(nameKey(c.value))) continue;
  const list = codesOf.get(nameKey(c.value)) ?? [];
  if (!list.some((x) => x.code === c.code)) list.push({ code: c.code, name: c.value });
  codesOf.set(nameKey(c.value), list);
}
const codeOf = new Map([...codesOf].map(([name, list]) => [name, list[0]]));
const missing = [...wanted].filter((n) => !codeOf.has(n));
console.log(`역 ${wanted.size}곳 가운데 코드를 찾은 역 ${codeOf.size}곳${missing.length ? `, 못 찾은 역: ${missing.join(', ')}` : ''}`);

// 3. 역마다 그날 지나간 열차
console.log(`코레일 열차운행정보(${KORAIL_DATE})를 역마다 받아요.`);
const runs = {};
for (const [name, list] of codesOf) {
  for (const { code } of list) {
    const got = await korailAll('travelerTrainRunInfo2', { 'cond[run_ymd::EQ]': KORAIL_DATE, 'cond[stn_cd::EQ]': code });
    if (got.length || list.length === 1) runs[code] = got;
    process.stdout.write(`  ${name}(${code}) ${got.length}건\n`);
    await sleep(100);
  }
}

// 4. TAGO 기차역 번호
console.log('TAGO 기차역 번호를 받아요.');
const tagoStations = [];
for (const city of TAGO_CITIES) {
  const json = await getJson(`${TAGO}/GetCtyAcctoTrainSttnList?serviceKey=${encodedKey}&_type=json&numOfRows=500&pageNo=1&cityCode=${city}`);
  tagoStations.push(...items(json).map((s) => ({ ...s, cityCode: city })));
}
const tagoId = new Map(tagoStations.map((s) => [nameKey(s.nodename), s.nodeid]));

// 5. 열차마다 지도 안 첫 정차역과 끝 정차역 쌍으로 TAGO를 불러 열차 종류를 얻는다.
const STOP = new Set(['01', '02', '05', '11']); // 시발, 정차, 종착, 여객취급
const byTrain = new Map();
for (const [code, list] of Object.entries(runs)) {
  for (const r of list) {
    if (!STOP.has(r.stop_se_cd)) continue;
    const time = r.trn_dptre_dt ?? r.trn_arvl_dt;
    if (!byTrain.has(r.trn_no)) byTrain.set(r.trn_no, []);
    byTrain.get(r.trn_no).push({ code, name: nameKey(r.stn_nm), time });
  }
}
const pairs = new Map();
for (const [, stops] of byTrain) {
  stops.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const from = tagoId.get(stops[0].name);
  const to = tagoId.get(stops.at(-1).name);
  if (from && to && from !== to) pairs.set(`${from}|${to}`, { from, to, fromName: stops[0].name, toName: stops.at(-1).name });
}
console.log(`열차 ${byTrain.size}개, TAGO에 물어볼 역 쌍 ${pairs.size}개`);
const tago = [];
for (const pair of pairs.values()) {
  const json = await getJson(
    `${TAGO}/GetStrtpntAlocFndTrainInfo?serviceKey=${encodedKey}&_type=json&numOfRows=500&pageNo=1&depPlaceId=${pair.from}&arrPlaceId=${pair.to}&depPlandTime=${TAGO_DATE}`,
  );
  tago.push({ ...pair, trains: items(json) });
  await sleep(100);
}

// 5-2. 코레일 역 코드 목록에 없는 기차역(중앙선 군위처럼 새로 생긴 역)은 코레일 기록에 빠진다.
// 그 역과 노선 위 이웃 역 사이를 두 방향으로 TAGO에 물어, 그 역에 서는 열차의 시각을 받는다(build-trains가 열차번호로 끼워 넣는다).
const extraStops = [];
for (const s of rail.stations) {
  const name = nameKey(s.name);
  // 코레일 코드가 있어도 그날 기록이 0건이면(문경: 옛 역 코드만 있다) TAGO에 묻는다.
  const korailRuns = (codesOf.get(name) ?? []).some(({ code }) => runs[code]?.length);
  if (korailRuns || !tagoId.has(name)) continue;
  const neighbors = new Set();
  for (const line of rail.lines) {
    const i = line.stations.indexOf(s.id);
    if (i < 0) continue;
    for (const j of [i - 1, i + 1]) if (line.stations[j]) neighbors.add(nameKey(rail.stations.find((o) => o.id === line.stations[j]).name));
  }
  for (const other of neighbors) {
    for (const [from, to] of [[name, other], [other, name]]) {
      if (!tagoId.has(other)) continue;
      const json = await getJson(
        `${TAGO}/GetStrtpntAlocFndTrainInfo?serviceKey=${encodedKey}&_type=json&numOfRows=500&pageNo=1&depPlaceId=${tagoId.get(from)}&arrPlaceId=${tagoId.get(to)}&depPlandTime=${TAGO_DATE}`,
      );
      extraStops.push({ station: name, fromName: from, toName: to, trains: items(json) });
      await sleep(100);
    }
  }
}
if (extraStops.length) console.log(`코레일 코드가 없는 역의 TAGO 시각: ${[...new Set(extraStops.map((e) => e.station))].join(', ')}, 열차 ${extraStops.reduce((n, e) => n + e.trains.length, 0)}건`);

// 6. 저장(인증키는 넣지 않는다)과 잠금 기록
mkdirSync(OUT, { recursive: true });
const files = {
  'korail-run-info': {
    file: `data/raw/korail/run-info-${KORAIL_DATE}.json`,
    data: { source: '공공데이터포털 15125762 한국철도공사_열차운행정보 travelerTrainRunInfo2', runDate: KORAIL_DATE, stations: [...codeOf.values()], runs },
  },
  'tago-train-info': {
    file: `data/raw/korail/tago-trains-${TAGO_DATE}.json`,
    data: { source: '공공데이터포털 15098552 국토교통부_(TAGO)_열차정보 GetStrtpntAlocFndTrainInfo', runDate: TAGO_DATE, stations: tagoStations, pairs: tago, extraStops },
  },
};
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
for (const [lockKey, { file, data }] of Object.entries(files)) {
  const text = JSON.stringify(data);
  writeFileSync(resolve(ROOT, file), text);
  lock[lockKey] = {
    file,
    url: lockKey === 'korail-run-info' ? `${KORAIL}/travelerTrainRunInfo2` : `${TAGO}/GetStrtpntAlocFndTrainInfo`,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    fetched: today,
    note: '인증키가 필요한 API(npm run trains). 주소에는 인증키를 적지 않는다.',
  };
  console.log(`저장: ${file} ${(Buffer.byteLength(text) / 1024).toFixed(0)}KB`);
}
writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
console.log(`API를 ${calls}번 불렀어요.`);
