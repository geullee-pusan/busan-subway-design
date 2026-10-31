// npm run tago-bus: 국토교통부 TAGO 버스노선정보(공공데이터포털 15098529)로 지도 안 도시들의
// 시내버스 노선과 노선마다 서는 정류장 차례(좌표 포함)를 받아 data/raw/tago-bus/<도시 번호>.json에 둔다.
// 인증키(npm run api-key로 저장한 것)를 쓰고, 원본 파일과 raw-lock.json에는 인증키를 적지 않는다.
// 노선마다 한 번 부르므로 오래 걸린다. 받은 노선은 임시 파일에 적어 두어, 멈췄다가 다시 돌리면 이어서 받는다.
// 하루에 부를 수 있는 수를 넘으면(결과 코드 22) 멈추고, 다음 날 다시 돌리면 이어서 받는다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://apis.data.go.kr/1613000/BusRouteInfoInqireService';
/** 지도 범위에 걸친 도시(TAGO 도시 번호, getCtyCodeList로 2026-10-31에 확인). 진주·김천·거제·통영은 지도 밖이라 뺐다. */
export const CITIES = [
  { code: 26, name: '울산광역시' },
  { code: 38010, name: '창원시' },
  { code: 38070, name: '김해시' },
  { code: 38100, name: '양산시' },
  { code: 38080, name: '밀양시' },
  { code: 37050, name: '구미시' },
  { code: 37100, name: '경산시' },
  { code: 37390, name: '칠곡군' },
  { code: 37070, name: '영천시' },
  { code: 37360, name: '청도군' },
  { code: 37370, name: '고령군' },
  { code: 37380, name: '성주군' },
  { code: 38320, name: '함안군' },
  { code: 38330, name: '창녕군' },
  { code: 22, name: '대구광역시' },
];

const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const encodedKey = encodeURIComponent(key);
let calls = 0;
async function getJson(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls += 1;
    try {
      const res = await fetch(`${BASE}/${path}&serviceKey=${encodedKey}&_type=json`, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) {
        const json = JSON.parse(await res.text());
        const code = String(json?.response?.header?.resultCode ?? json?.header?.resultCode ?? '00').padStart(2, '0');
        if (code === '00' || code === '03') return json;
        if (code === '22') {
          console.log('오늘 부를 수 있는 수를 넘었어요. 내일 다시 돌리면 이어서 받아요.');
          process.exit(2);
        }
        console.log(`  결과 코드 ${code}. 다시 해요.`);
      } else console.log(`  HTTP ${res.status}. 다시 해요.`);
    } catch (error) {
      console.log(`  ${error.message}. 다시 해요.`);
    }
    await sleep(attempt * 4000);
  }
  return null;
}
const items = (json) => [].concat(json?.response?.body?.items?.item ?? []);

const outDir = resolve(ROOT, 'data/raw/tago-bus');
mkdirSync(outDir, { recursive: true });
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

for (const city of CITIES) {
  const file = resolve(outDir, `${city.code}.json`);
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.log(`${city.name}: 이미 받았어요.`);
    continue;
  }
  const partialPath = resolve(tmpdir(), `busan-subway-tago-bus-${city.code}.json`);
  const partial = existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, 'utf8')) : { routes: null, stops: {} };
  if (!partial.routes) {
    const list = await getJson(`getRouteNoList?cityCode=${city.code}&numOfRows=2000&pageNo=1`);
    if (!list) {
      console.log(`${city.name}: 노선 목록을 받지 못했어요.`);
      continue;
    }
    partial.routes = items(list);
    writeFileSync(partialPath, JSON.stringify(partial));
  }
  console.log(`${city.name}: 노선 ${partial.routes.length}개`);
  let missing = 0;
  for (const route of partial.routes) {
    if (partial.stops[route.routeid]) continue;
    const json = await getJson(`getRouteAcctoThrghSttnList?cityCode=${city.code}&routeId=${encodeURIComponent(route.routeid)}&numOfRows=1000&pageNo=1`);
    if (!json) {
      missing += 1;
      continue;
    }
    partial.stops[route.routeid] = items(json).map((s) => [s.nodeord, s.nodeid, s.nodenm, s.gpslati, s.gpslong, s.updowncd]);
    writeFileSync(partialPath, JSON.stringify(partial));
    await sleep(80);
  }
  if (missing) {
    console.log(`${city.name}: 받지 못한 노선 ${missing}개. 다시 돌리면 그것만 불러요.`);
    continue;
  }
  const data = {
    source: '공공데이터포털 15098529 국토교통부_(TAGO)_버스노선정보 getRouteNoList, getRouteAcctoThrghSttnList',
    city: city.name,
    cityCode: city.code,
    fetched: today,
    stopFields: ['정류장 차례', '정류장 번호', '정류장 이름', '위도', '경도', '상하행(0 상행, 1 하행)'],
    routes: partial.routes.map((r) => ({ ...r, stops: partial.stops[r.routeid] ?? [] })),
  };
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock[`tago-bus-${city.code}`] = {
    file: `data/raw/tago-bus/${city.code}.json`,
    url: `${BASE}/getRouteAcctoThrghSttnList`,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    fetched: today,
    note: '인증키가 필요한 API(npm run tago-bus). 주소에는 인증키를 적지 않는다.',
  };
  writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  console.log(`${city.name}: 저장 ${(text.length / 1024).toFixed(0)}KB`);
}
console.log(`API를 ${calls}번 불렀어요.`);
