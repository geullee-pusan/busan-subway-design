// npm run molit-bus: 국토교통부_버스노선별 경유정류장(공공데이터포털 15142031)으로 TAGO 버스노선정보에 없는
// 강원 시·군의 시내·농어촌버스 노선과 노선마다 서는 정류장 차례를 받아 data/raw/molit-bus/<시군구 코드>.json에 둔다.
// 이 자료에는 정류장 좌표가 없다. 좌표는 scripts/build-bus.mjs가 국토교통부 전국 버스정류장 위치정보(15067528)와
// OpenStreetMap 버스 정류장(osm-bus-stops-gangwon)에서 이름으로 찾는다.
// 한 시·군을 부르면 그 시·군 안에 있는 정류장 줄만 온다. 그래서 시·군을 넘는 노선은 build-bus가 노선 번호(rte_id)로 다시 잇는다.
// 인증키(npm run api-key로 저장한 것)를 쓰고, 원본 파일과 raw-lock.json에는 인증키를 적지 않는다.
//   npm run molit-bus -- --date=20261001   운행일(기본 20261001. 2026-11-21에 11월 운행일은 자료가 없었다)
//   npm run molit-bus -- --force           이미 받은 시·군도 다시 받는다
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';
import { MOLIT_CITIES } from './lib/molit-bus.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://apis.data.go.kr/1613000/BusRoutespecificStopInformation/getBusRoutespecificStopInformation';
const CTPV = '51';

const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const dateArg = process.argv.find((a) => a.startsWith('--date='));
const OPR_YMD = dateArg ? dateArg.slice('--date='.length) : '20261001';
if (!/^\d{8}$/.test(OPR_YMD)) {
  console.log('--date는 20261001 꼴로 적어요.');
  process.exit(1);
}
const encodedKey = encodeURIComponent(key);
let calls = 0;
async function getPage(sgg, pageNo) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls += 1;
    try {
      const url = `${BASE}?serviceKey=${encodedKey}&pageNo=${pageNo}&numOfRows=1000&dataType=JSON&opr_ymd=${OPR_YMD}&ctpv_cd=${CTPV}&sgg_cd=${sgg}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (res.ok) {
        const json = JSON.parse(text);
        if (json?.Error?.code === '50') return { totalCount: 0, items: [] };
        const body = json?.Response?.body;
        if (body) return { totalCount: Number(body.totalCount), items: [].concat(body.items?.item ?? []) };
        if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(text)) {
          console.log('오늘 부를 수 있는 수를 넘었어요. 내일 다시 돌리면 이어서 받아요.');
          process.exit(2);
        }
        console.log(`  알 수 없는 응답: ${text.slice(0, 120)}. 다시 해요.`);
      } else console.log(`  HTTP ${res.status}. 다시 해요.`);
    } catch (error) {
      console.log(`  ${error.message}. 다시 해요.`);
    }
    await sleep(attempt * 4000);
  }
  return null;
}

const outDir = resolve(ROOT, 'data/raw/molit-bus');
mkdirSync(outDir, { recursive: true });
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const FIELDS = ['rte_id', 'rte_no', 'rte_nm', 'sttn_seq', 'sttn_id', 'sttn_nm', 'emd_nm'];

for (const city of MOLIT_CITIES) {
  const file = resolve(outDir, `${city.sgg}.json`);
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.log(`${city.name}: 이미 받았어요.`);
    continue;
  }
  const rows = [];
  let total = null;
  let ok = true;
  for (let page = 1; total === null || rows.length < total; page++) {
    const got = await getPage(city.sgg, page);
    if (!got) {
      ok = false;
      break;
    }
    total = got.totalCount;
    if (!got.items.length) break;
    for (const item of got.items) rows.push(FIELDS.map((f) => item[f] ?? null));
    await sleep(150);
  }
  if (!ok || rows.length !== total) {
    console.log(`${city.name}: 다 받지 못했어요(${rows.length}/${total}). 다시 돌려요.`);
    continue;
  }
  const data = {
    source: '공공데이터포털 15142031 국토교통부_버스노선별 경유정류장 getBusRoutespecificStopInformation',
    city: city.name,
    ctpvCd: CTPV,
    sggCd: city.sgg,
    oprYmd: OPR_YMD,
    fetched: today,
    fields: FIELDS,
    rows,
  };
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock[`molit-bus-${city.sgg}`] = {
    file: `data/raw/molit-bus/${city.sgg}.json`,
    url: BASE,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    fetched: today,
    note: `인증키가 필요한 API(npm run molit-bus). 운행일 ${OPR_YMD}. 주소에는 인증키를 적지 않는다.`,
  };
  writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  console.log(`${city.name}: 정류장 줄 ${rows.length}개, 저장 ${(text.length / 1024).toFixed(0)}KB`);
}
console.log(`API를 ${calls}번 불렀어요.`);
