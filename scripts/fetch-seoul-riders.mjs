// npm run seoul-riders: 서울 열린데이터광장 지하철 승하차 인원을 받아 data/raw/seoul-subway/riders-<월>.json에 둔다(네트워크를 쓴다).
//  - CardSubwayStatsNew(서울시 지하철호선별 역별 승하차 인원 정보): 날마다 노선·역별 승차·하차 수. 그 달 하루하루를 부른다.
//  - CardSubwayTime(서울시 지하철 호선별 역별 시간대별 승하차 인원 정보): 그 달 노선·역별 시간대(4시~3시) 승차·하차 합계.
// 인증키는 seoul_api.txt(git에 넣지 않음)나 환경 변수 SEOUL_OPEN_KEY에 둔다. 키는 주소 안에 들어가므로 주소를 출력하거나 저장하지 않는다.
//   npm run seoul-riders -- --month=202610   받을 달(기본 2026년 10월: 2026-11-22에 받을 수 있는 가장 최근의 온 달)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readSeoulKey } from './lib/api-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = readSeoulKey();
if (!key) {
  console.log('서울 열린데이터광장 인증키가 없어요. 저장소 폴더에 seoul_api.txt로 두어요.');
  process.exit(1);
}
const monthArg = process.argv.find((a) => a.startsWith('--month='));
const MONTH = monthArg ? monthArg.slice('--month='.length) : '202610';
if (!/^\d{6}$/.test(MONTH)) {
  console.log('--month는 202610 꼴로 적어요.');
  process.exit(1);
}
const hide = (text) => String(text).split(key).join('…');
let calls = 0;
/** 한 서비스의 모든 줄(1000줄씩) */
async function all(service, suffix) {
  const out = [];
  for (let start = 1; ; start += 1000) {
    let json = null;
    for (let attempt = 1; attempt <= 3 && !json; attempt++) {
      calls += 1;
      try {
        const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/${service}/${start}/${start + 999}/${suffix}`, { signal: AbortSignal.timeout(60_000) });
        const body = JSON.parse(await res.text());
        if (body[service]) json = body[service];
        else if (body.RESULT?.CODE === 'INFO-200') return out; // 자료 없음
        else console.log(`  ${service} ${suffix}: ${hide(JSON.stringify(body).slice(0, 120))}. 다시 해요.`);
      } catch (error) {
        console.log(`  ${service} ${suffix}: ${hide(error.message)}. 다시 해요.`);
      }
      if (!json) await sleep(attempt * 3000);
    }
    if (!json) throw new Error(`${service} ${suffix}를 받지 못했어요.`);
    out.push(...(json.row ?? []));
    if (out.length >= Number(json.list_total_count) || !(json.row ?? []).length) return out;
    await sleep(100);
  }
}

const y = Number(MONTH.slice(0, 4));
const m = Number(MONTH.slice(4));
const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
const daily = [];
for (let d = 1; d <= days; d++) {
  const date = `${MONTH}${String(d).padStart(2, '0')}`;
  const rows = await all('CardSubwayStatsNew', date);
  daily.push(...rows.map((r) => [r.USE_YMD, r.SBWY_ROUT_LN_NM, r.SBWY_STNS_NM, Number(r.GTON_TNOPE), Number(r.GTOFF_TNOPE)]));
  console.log(`${date}: ${rows.length}줄`);
}
const timeRows = await all('CardSubwayTime', MONTH);
const hourly = timeRows.map((r) => [
  r.SBWY_ROUT_LN_NM,
  r.STTN,
  Array.from({ length: 24 }, (_, h) => Number(r[`HR_${h}_GET_ON_NOPE`] ?? 0)),
  Array.from({ length: 24 }, (_, h) => Number(r[`HR_${h}_GET_OFF_NOPE`] ?? 0)),
]);
console.log(`시간대 ${MONTH}: ${hourly.length}줄`);

const data = {
  source: '서울 열린데이터광장 CardSubwayStatsNew(서울시 지하철호선별 역별 승하차 인원 정보), CardSubwayTime(서울시 지하철 호선별 역별 시간대별 승하차 인원 정보)',
  month: MONTH,
  dailyFields: ['date', 'line', 'station', 'board', 'alight'],
  daily,
  hourlyFields: ['line', 'station', 'board[0~23시]', 'alight[0~23시]'],
  hourly,
};
const file = `data/raw/seoul-subway/riders-${MONTH}.json`;
mkdirSync(resolve(ROOT, 'data/raw/seoul-subway'), { recursive: true });
const text = JSON.stringify(data);
writeFileSync(resolve(ROOT, file), text);
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock[`seoul-subway-riders-${MONTH}`] = {
  file,
  url: 'http://openapi.seoul.go.kr:8088/(인증키)/json/CardSubwayStatsNew, CardSubwayTime',
  bytes: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex'),
  fetched: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
  note: '서울 열린데이터광장 인증키가 필요한 API(npm run seoul-riders). 주소에는 인증키를 적지 않는다.',
};
writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
console.log(`저장: ${file} ${(Buffer.byteLength(text) / 1024).toFixed(0)}KB`);

// 역 목록(SearchSTNBySubwayLineInfo): 역명판의 역 번호(FR_CODE), 영어·한자·일본어 이름
const stationRows = await all('SearchSTNBySubwayLineInfo', '');
const stationData = {
  source: '서울 열린데이터광장 SearchSTNBySubwayLineInfo(서울시 지하철 노선별 역 정보)',
  fields: ['line', 'name', 'number', 'en', 'zh', 'ja', 'code'],
  rows: stationRows.map((r) => [r.LINE_NUM, r.STATION_NM, r.FR_CODE, r.STATION_NM_ENG, r.STATION_NM_CHN, r.STATION_NM_JPN, r.STATION_CD]),
};
const stationFile = 'data/raw/seoul-subway/stations.json';
const stationText = JSON.stringify(stationData);
writeFileSync(resolve(ROOT, stationFile), stationText);
const lock2 = JSON.parse(readFileSync(lockPath, 'utf8'));
lock2['seoul-subway-stations'] = {
  file: stationFile,
  url: 'http://openapi.seoul.go.kr:8088/(인증키)/json/SearchSTNBySubwayLineInfo',
  bytes: Buffer.byteLength(stationText),
  sha256: createHash('sha256').update(stationText).digest('hex'),
  fetched: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
  note: '서울 열린데이터광장 인증키가 필요한 API(npm run seoul-riders). 주소에는 인증키를 적지 않는다.',
};
writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock2).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
console.log(`저장: ${stationFile} 역 ${stationRows.length}줄, API를 ${calls}번 불렀어요.`);
