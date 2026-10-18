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
export const KORAIL_DATE = '20261014'; // 수요일
export const TAGO_DATE = '20261021'; // 다음 수요일
const OUT = resolve(ROOT, 'data/raw/korail');
const KORAIL = 'https://apis.data.go.kr/B551457/run/v2';
const TAGO = 'https://apis.data.go.kr/1613000/TrainInfo';
/** TAGO 시·도 코드: 지도 안 부산, 대구, 울산, 경북, 경남 */
const TAGO_CITIES = ['21', '22', '26', '37', '38'];

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
const wanted = new Set([...rail.stations.map((s) => nameKey(s.name)), ...metro.filter((s) => s.line === 'DH' || s.line === 'DK').map((s) => nameKey(s.name))]);

// 2. 코레일 역 코드
console.log('코레일 역 코드를 받아요.');
const stationCodes = await korailAll('codes2', { 'cond[type::EQ]': 'stn_cd' });
const codeOf = new Map();
for (const c of stationCodes) if (wanted.has(nameKey(c.value)) && !codeOf.has(nameKey(c.value))) codeOf.set(nameKey(c.value), { code: c.code, name: c.value });
const missing = [...wanted].filter((n) => !codeOf.has(n));
console.log(`역 ${wanted.size}곳 가운데 코드를 찾은 역 ${codeOf.size}곳${missing.length ? `, 못 찾은 역: ${missing.join(', ')}` : ''}`);

// 3. 역마다 그날 지나간 열차
console.log(`코레일 열차운행정보(${KORAIL_DATE})를 역마다 받아요.`);
const runs = {};
for (const [name, { code }] of codeOf) {
  runs[code] = await korailAll('travelerTrainRunInfo2', { 'cond[run_ymd::EQ]': KORAIL_DATE, 'cond[stn_cd::EQ]': code });
  process.stdout.write(`  ${name} ${runs[code].length}건\n`);
  await sleep(100);
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

// 6. 저장(인증키는 넣지 않는다)과 잠금 기록
mkdirSync(OUT, { recursive: true });
const files = {
  'korail-run-info': {
    file: `data/raw/korail/run-info-${KORAIL_DATE}.json`,
    data: { source: '공공데이터포털 15125762 한국철도공사_열차운행정보 travelerTrainRunInfo2', runDate: KORAIL_DATE, stations: [...codeOf.values()], runs },
  },
  'tago-train-info': {
    file: `data/raw/korail/tago-trains-${TAGO_DATE}.json`,
    data: { source: '공공데이터포털 15098552 국토교통부_(TAGO)_열차정보 GetStrtpntAlocFndTrainInfo', runDate: TAGO_DATE, stations: tagoStations, pairs: tago },
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
