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
/** 지도 범위에 걸친 도시(TAGO 도시 번호, getCtyCodeList로 2026-10-31에 확인). 제주는 지도에 추자도만 걸쳐 있어 뺐다. */
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
  // 지도 범위 넓히기 4(2026-11-14): 광주, 전남(담양·화순·강진·보성·영광은 TAGO에 없다), 경남 서쪽
  { code: 24, name: '광주광역시' },
  { code: 36010, name: '목포시' },
  { code: 36020, name: '여수시' },
  { code: 36030, name: '순천시' },
  { code: 36040, name: '나주시' },
  { code: 36060, name: '광양시' },
  { code: 36320, name: '곡성군' },
  { code: 36330, name: '구례군' },
  { code: 36350, name: '고흥군' },
  { code: 36380, name: '장흥군' },
  { code: 36400, name: '해남군' },
  { code: 36410, name: '영암군' },
  { code: 36420, name: '무안군' },
  { code: 36430, name: '함평군' },
  { code: 36450, name: '장성군' },
  { code: 36460, name: '완도군' },
  { code: 36470, name: '진도군' },
  { code: 36480, name: '신안군' },
  { code: 38030, name: '진주시' },
  { code: 38050, name: '통영시' },
  { code: 38060, name: '사천시' },
  { code: 38090, name: '거제시' },
  { code: 38310, name: '의령군' },
  { code: 38340, name: '고성군' },
  { code: 38350, name: '남해군' },
  { code: 38360, name: '하동군' },
  { code: 38370, name: '산청군' },
  { code: 38380, name: '함양군' },
  { code: 38390, name: '거창군' },
  { code: 38400, name: '합천군' },
  // 지도 네모 안에 함께 들어온 이웃 지역(2026-11-14): 대전, 전북(완주는 TAGO에 없다), 경북, 충북, 충남. 제주는 추자도만 걸쳐 빼었다.
  { code: 25, name: '대전광역시' },
  { code: 35010, name: '전주시' },
  { code: 35020, name: '군산시' },
  { code: 35030, name: '익산시' },
  { code: 35040, name: '정읍시' },
  { code: 35050, name: '남원시' },
  { code: 35060, name: '김제시' },
  { code: 35320, name: '진안군' },
  { code: 35330, name: '무주군' },
  { code: 35340, name: '장수군' },
  { code: 35350, name: '임실군' },
  { code: 35360, name: '순창군' },
  { code: 35370, name: '고창군' },
  { code: 35380, name: '부안군' },
  { code: 37010, name: '포항시' },
  { code: 37020, name: '경주시' },
  { code: 37030, name: '김천시' },
  { code: 37040, name: '안동시' },
  { code: 37080, name: '상주시' },
  { code: 37320, name: '의성군' },
  { code: 37330, name: '청송군' },
  { code: 37350, name: '영덕군' },
  // 지도 범위 넓히기 5(경북 본토, 2026-11-15): 경북 북쪽(getCtyCodeList로 2026-11-15에 확인). 울릉군(37430)은 지도 밖이라 뺐다.
  { code: 37060, name: '영주시' },
  { code: 37090, name: '문경시' },
  { code: 37340, name: '영양군' },
  { code: 37400, name: '예천군' },
  { code: 37410, name: '봉화군' },
  { code: 37420, name: '울진군' },
  { code: 33320, name: '보은군' },
  { code: 33330, name: '옥천군' },
  { code: 33340, name: '영동군' },
  { code: 34020, name: '공주시' },
  { code: 34030, name: '보령시' },
  { code: 34060, name: '논산시' },
  { code: 34070, name: '계룡시' },
  { code: 34310, name: '금산군' },
  { code: 34330, name: '부여군' },
  { code: 34340, name: '서천군' },
  { code: 34350, name: '청양군' },
  // 충남·대전·세종 넓히기(2026-11-17, getCtyCodeList로 확인): 세종과 충남 북쪽. 홍성군·예산군은 TAGO에 없다.
  { code: 12, name: '세종특별시' },
  { code: 34010, name: '천안시' },
  { code: 34040, name: '아산시' },
  { code: 34050, name: '서산시' },
  { code: 34380, name: '태안군' },
  { code: 34390, name: '당진시' },
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
