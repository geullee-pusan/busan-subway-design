// npm run metro-sudogwon: 국토교통부 TAGO 지하철정보(공공데이터포털 15098554)로 수도권 도시철도 역 목록과
// 역마다 평일 시각표(상·하행)를 받아 data/raw/tago-subway/에 둔다(수도권 넓히기 1단계, 2026-11-21).
//  - stations.json: 전체 역 목록(GetKwrdFndSubwaySttnList). 역 이름으로 찾으면 0건이 나와서 이름을 비우고 모두 받는다.
//  - schedules-weekday.json: 수도권 역마다 GetSubwaySttnAcctoSchdulList(dailyTypeCode=01 평일, upDownTypeCode=U/D).
//    열차 번호는 없고 [방향, 도착(HHMMSS), 출발(HHMMSS), 종착역 이름]만 준다.
// 인증키(npm run api-key로 저장한 것)를 쓰고, 원본 파일과 raw-lock.json에는 인증키를 적지 않는다.
// 받은 역은 바로 파일에 적어 두어, 멈췄다가 다시 돌리면 이어서 받는다. 하루에 부를 수 있는 수를 넘으면 멈춘다.
//   npm run metro-sudogwon -- --force   역 목록과 시각표를 처음부터 다시 받는다
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';
import { isSudogwonStation } from './build/sudogwon.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://apis.data.go.kr/1613000/SubwayInfo';
const OUT = resolve(ROOT, 'data/raw/tago-subway');
const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
let calls = 0;

async function call(op, params) {
  const qs = new URLSearchParams({ serviceKey: key, _type: 'json', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls += 1;
    try {
      const res = await fetch(`${BASE}/${op}?${qs}`, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(text)) {
        console.log('오늘 부를 수 있는 수를 넘었어요. 내일 다시 돌리면 이어서 받아요.');
        return 'limit';
      }
      if (res.ok && text.startsWith('{')) {
        const body = JSON.parse(text).response?.body;
        if (body) return { total: Number(body.totalCount ?? 0), items: [].concat(body.items?.item ?? []) };
      }
      console.log(`  ${op}: 알 수 없는 응답(${res.status}). 다시 해요.`);
    } catch (error) {
      console.log(`  ${op}: ${error.message}. 다시 해요.`);
    }
    await sleep(attempt * 3000);
  }
  return null;
}

function lock(name, file, url, note) {
  const text = readFileSync(file, 'utf8');
  const lockPath = resolve(ROOT, 'data/raw-lock.json');
  const all = JSON.parse(readFileSync(lockPath, 'utf8'));
  all[name] = {
    file: file.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '').replaceAll('\\', '/'),
    url,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    fetched: today,
    note,
  };
  writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
}

// 1. 역 목록
const stationsFile = resolve(OUT, 'stations.json');
if (force || !existsSync(stationsFile)) {
  const items = [];
  for (let page = 1; ; page++) {
    const got = await call('GetKwrdFndSubwaySttnList', { numOfRows: '1000', pageNo: String(page), subwayStationName: '' });
    if (!got || got === 'limit') process.exit(2);
    items.push(...got.items.map((i) => [i.subwayStationId, i.subwayStationName, i.subwayRouteName]));
    if (items.length >= got.total || !got.items.length) break;
  }
  writeFileSync(stationsFile, JSON.stringify({ source: '공공데이터포털 15098554 국토교통부_(TAGO)_지하철정보 GetKwrdFndSubwaySttnList', fetched: today, fields: ['id', 'name', 'route'], rows: items }));
  lock('tago-subway-stations', stationsFile, `${BASE}/GetKwrdFndSubwaySttnList`, '인증키가 필요한 API(npm run metro-sudogwon). 이름을 비우고 전체 역을 받는다. 주소에는 인증키를 적지 않는다.');
  console.log(`역 목록 ${items.length}곳`);
}
const stations = JSON.parse(readFileSync(stationsFile, 'utf8')).rows.filter(([id]) => isSudogwonStation(id));
console.log(`수도권 역 ${stations.length}곳`);

// 2. 역마다 평일 시각표(상·하행)
const schedFile = resolve(OUT, 'schedules-weekday.json');
const sched = !force && existsSync(schedFile) ? JSON.parse(readFileSync(schedFile, 'utf8')) : { source: '공공데이터포털 15098554 GetSubwaySttnAcctoSchdulList 평일(dailyTypeCode=01)', fetched: today, fields: ['dir', 'arr', 'dep', 'end'], stations: {} };
let done = 0;
let stopped = false;
for (const [id, name] of stations) {
  if (sched.stations[id]) continue;
  const rows = [];
  for (const dir of ['U', 'D']) {
    for (let page = 1; ; page++) {
      const got = await call('GetSubwaySttnAcctoSchdulList', { numOfRows: '1000', pageNo: String(page), subwayStationId: id, dailyTypeCode: '01', upDownTypeCode: dir });
      if (got === 'limit') {
        stopped = true;
        break;
      }
      if (!got) {
        console.log(`  ${name}(${id}) ${dir}: 받지 못했어요.`);
        break;
      }
      rows.push(...got.items.map((i) => [dir, String(i.arrTime ?? '0'), String(i.depTime ?? '0'), i.endSubwayStationNm ?? '']));
      if (page * 1000 >= got.total || !got.items.length) break;
    }
    if (stopped) break;
  }
  if (stopped) break;
  sched.stations[id] = rows;
  done += 1;
  if (done % 25 === 0) {
    writeFileSync(schedFile, JSON.stringify(sched));
    console.log(`  시각표 ${Object.keys(sched.stations).length}/${stations.length}역`);
  }
  await sleep(120);
}
sched.fetched = today;
writeFileSync(schedFile, JSON.stringify(sched));
lock('tago-subway-schedules', schedFile, `${BASE}/GetSubwaySttnAcctoSchdulList`, '인증키가 필요한 API(npm run metro-sudogwon). 수도권 역마다 평일 상·하행. 주소에는 인증키를 적지 않는다.');
console.log(`시각표 ${Object.keys(sched.stations).length}/${stations.length}역. API를 ${calls}번 불렀어요.${stopped ? ' 다 받지 못했어요(내일 이어서).' : ''}`);
