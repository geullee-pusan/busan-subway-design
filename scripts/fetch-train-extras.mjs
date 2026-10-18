// npm run train-fares(node scripts/fetch-train-extras.mjs): 열차 시각표에 덧붙일 원본을 받는다(네트워크와 인증키를 쓴다).
//  - 한국철도공사 열차운행정보(15125762)의 여객열차 운행계획: 그날 열차마다 처음 출발역과 마지막 도착역(지도 밖이어도).
//  - 국토교통부 TAGO 열차정보(15098552): 지도 안에서 열차가 이어 주는 역 쌍마다 열차 종류별 어른 운임.
// 먼저 npm run trains(열차운행정보)와 npm run rail(trains.json)이 있어야 한다. 인증키는 저장하지 않는다.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KORAIL_DATE = '20261014';
// 역 번호는 열차 2단계에서 받은 2026-10-21 자료에서 찾는다. 운임은 TAGO가 받아 주는 날(2026-10-20, 화)로 부른다.
// (2026-10-19 밤에 10-21로 부르면 UNKNOWN_ERROR만 돌아왔다.)
const TAGO_STATIONS_DATE = '20261021';
const TAGO_DATE = '20261020';
// 받는 중에 멈춰도 처음부터 다시 부르지 않도록 받은 역 쌍을 임시 파일에 적어 둔다.
const PARTIAL = resolve(tmpdir(), `busan-subway-tago-fares-${TAGO_DATE}.json`);
const PLAN_CACHE = resolve(tmpdir(), `busan-subway-run-plan-${KORAIL_DATE}.json`);
const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const encodedKey = encodeURIComponent(key);
const query = (params) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
let calls = 0;
/** 여러 번 해도 안 되면 allowFail이면 null, 아니면 멈춘다. */
async function getJson(url, allowFail = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) {
        const json = JSON.parse(await res.text());
        const code = json?.response?.header?.resultCode ?? json?.header?.resultCode ?? '00';
        if (['00', '03'].includes(String(code).padStart(2, '0'))) return json;
        if (String(code) === '22') {
          // 하루에 부를 수 있는 수를 넘었다. 받은 것은 임시 파일에 있으니 내일 다시 돌리면 이어서 받는다.
          console.log('오늘 부를 수 있는 수를 넘었어요. 내일 다시 돌리면 이어서 받아요.');
          process.exit(2);
        }
        console.log(`  결과 코드 ${code}. ${attempt * 5}초 뒤 다시 해요.`);
      } else console.log(`  HTTP ${res.status}. ${attempt * 5}초 뒤 다시 해요.`);
    } catch (error) {
      console.log(`  ${error.message}. ${attempt * 5}초 뒤 다시 해요.`);
    }
    await sleep(attempt * 5000);
  }
  if (allowFail) return null;
  throw new Error('여러 번 해도 받지 못했어요.');
}
const items = (json) => {
  const list = json?.response?.body?.items?.item;
  return Array.isArray(list) ? list : list ? [list] : [];
};

// 1. 운행계획(그날 모든 여객열차의 처음 출발역과 마지막 도착역)
console.log(`코레일 운행계획(${KORAIL_DATE})을 받아요.`);
const plans = existsSync(PLAN_CACHE) ? JSON.parse(readFileSync(PLAN_CACHE, 'utf8')) : [];
for (let page = 1; !plans.length || page > 1; page++) {
  const json = await getJson(`https://apis.data.go.kr/B551457/run/v2/travelerTrainRunPlan2?serviceKey=${encodedKey}&returnType=JSON&numOfRows=1000&pageNo=${page}&${query({ 'cond[run_ymd::EQ]': KORAIL_DATE })}`);
  const list = items(json);
  plans.push(...list);
  if (plans.length >= Number(json?.response?.body?.totalCount ?? 0) || list.length === 0) break;
}
writeFileSync(PLAN_CACHE, JSON.stringify(plans));
console.log(`  열차 ${plans.length}개`);

// 2. 역 쌍마다 운임(TAGO). 지도 안 기차역 이름 → TAGO 역 번호는 받아 둔 TAGO 자료에서 찾는다.
const nameKey = (name) =>
  String(name ?? '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/역$/, '');
const tago = JSON.parse(readFileSync(resolve(ROOT, `data/raw/korail/tago-trains-${TAGO_STATIONS_DATE}.json`), 'utf8'));
const tagoId = new Map(tago.stations.map((s) => [nameKey(s.nodename), s.nodeid]));
const rail = JSON.parse(readFileSync(resolve(ROOT, 'data/build/rail.json'), 'utf8'));
const nameOf = new Map(rail.stations.map((s) => [s.id, s.name]));
const trains = JSON.parse(readFileSync(resolve(ROOT, 'data/build/trains.json'), 'utf8'));
const pairs = new Map();
for (const train of trains.trains) {
  const ids = train.stops.map((s) => s[0]);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const from = tagoId.get(nameKey(nameOf.get(ids[i])));
      const to = tagoId.get(nameKey(nameOf.get(ids[j])));
      if (from && to)
        pairs.set(`${from}|${to}`, {
          from,
          to,
          fromName: nameOf.get(ids[i]),
          toName: nameOf.get(ids[j]),
        });
    }
  }
}
console.log(`TAGO 운임: 역 쌍 ${pairs.size}개를 받아요.`);
const saved = existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, 'utf8')) : [];
const fares = saved.filter((f) => pairs.has(`${f.from}|${f.to}`));
const have = new Set(fares.map((f) => `${f.from}|${f.to}`));
if (fares.length) console.log(`  앞서 받은 역 쌍 ${fares.length}개는 다시 부르지 않아요.`);
let done = fares.length;
const missing = [];
// API가 한 번에 몇 초씩 걸려서 네 개씩 함께 부른다.
const queue = [...pairs.values()].filter((pair) => !have.has(`${pair.from}|${pair.to}`));
async function worker() {
  while (queue.length) {
    const pair = queue.shift();
    const json = await getJson(
      `https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo?serviceKey=${encodedKey}&_type=json&numOfRows=500&pageNo=1&depPlaceId=${pair.from}&arrPlaceId=${pair.to}&depPlandTime=${TAGO_DATE}`,
      true,
    );
    if (!json) {
      missing.push(`${pair.fromName}→${pair.toName}`);
      console.log(`  ${pair.fromName}→${pair.toName}은 받지 못해서 건너뛰어요.`);
      continue;
    }
    fares.push({
      ...pair,
      trains: items(json).map((t) => ({
        no: Number(t.trainno),
        grade: t.traingradename,
        fare: Number(t.adultcharge) || null,
        dep: t.depplandtime,
        arr: t.arrplandtime,
      })),
    });
    done += 1;
    writeFileSync(PARTIAL, JSON.stringify(fares));
    if (done % 25 === 0) console.log(`  ${done}/${pairs.size}`);
    await sleep(60);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

// 3. 저장(인증키는 넣지 않는다)과 잠금 기록
const files = {
  'korail-run-plan': {
    file: `data/raw/korail/run-plan-${KORAIL_DATE}.json`,
    url: 'https://apis.data.go.kr/B551457/run/v2/travelerTrainRunPlan2',
    data: {
      source: '공공데이터포털 15125762 한국철도공사_열차운행정보 travelerTrainRunPlan2(여객열차 운행계획)',
      runDate: KORAIL_DATE,
      plans,
    },
  },
  'tago-train-fares': {
    file: `data/raw/korail/tago-fares-${TAGO_DATE}.json`,
    url: 'https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo',
    data: {
      source: '공공데이터포털 15098552 국토교통부_(TAGO)_열차정보 GetStrtpntAlocFndTrainInfo(역 쌍별 열차와 어른 운임)',
      runDate: TAGO_DATE,
      missing,
      pairs: fares,
    },
  },
};
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
// 받은 날은 한국 시각으로 적는다(UTC로 적으면 새벽에 받은 것이 전날이 된다)
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
for (const [lockKey, { file, url, data }] of Object.entries(files)) {
  const text = JSON.stringify(data);
  writeFileSync(resolve(ROOT, file), text);
  lock[lockKey] = {
    file,
    url,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    fetched: today,
    note: '인증키가 필요한 API(npm run train-fares). 주소에는 인증키를 적지 않는다.',
  };
  console.log(`저장: ${file} ${(Buffer.byteLength(text) / 1024).toFixed(0)}KB`);
}
writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
if (missing.length) console.log(`받지 못한 역 쌍 ${missing.length}개가 있어요. 다시 돌리면 그것만 불러요.`);
else rmSync(PARTIAL, { force: true });
rmSync(PLAN_CACHE, { force: true });
console.log(`API를 ${calls}번 불렀어요.`);
