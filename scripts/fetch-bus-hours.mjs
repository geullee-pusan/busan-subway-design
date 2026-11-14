// npm run bus-hours: 국토교통부 TAGO 버스노선정보(15098529) 노선 목록으로 부산 시내버스 노선마다 첫차·막차 시각을 받아
// data/raw/tago-bus/route-hours-21.json에 둔다(네트워크와 인증키를 쓴다. 한두 번만 부른다).
// 부산 노선과 정류장 차례는 부산 자료(15123610)를 쓰고, 여기서는 시각만 가져온다. 다른 TAGO 도시는 npm run tago-bus 원본에 시각이 들어 있다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const routes = [];
for (let page = 1; page < 10; page++) {
  const res = await fetch(`https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList?serviceKey=${encodeURIComponent(key)}&_type=json&numOfRows=1000&pageNo=${page}&cityCode=21`, { signal: AbortSignal.timeout(60_000) });
  const json = JSON.parse(await res.text());
  const list = [].concat(json?.response?.body?.items?.item ?? []);
  routes.push(...list);
  if (list.length < 1000) break;
}
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const text = JSON.stringify({ source: '공공데이터포털 15098529 국토교통부_(TAGO)_버스노선정보 getRouteNoList', city: '부산광역시', cityCode: 21, fetched: today, routes });
const file = 'data/raw/tago-bus/route-hours-21.json';
writeFileSync(resolve(ROOT, file), text);
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock['tago-bus-route-hours-21'] = { file, url: 'https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList', bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), fetched: today, note: '인증키가 필요한 API(npm run bus-hours). 주소에는 인증키를 적지 않는다.' };
writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
console.log(`부산 노선 ${routes.length}개, 시각이 있는 노선 ${routes.filter((r) => r.startvehicletime).length}개`);
