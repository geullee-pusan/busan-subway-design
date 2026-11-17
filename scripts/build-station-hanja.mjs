// 역 한자 이름(data/facts.json stationHanja, 위키백과 노선 문서의 역 목록)으로 게임용 data/build/station-hanja.json을 만든다.
// 대전 도시철도 1호선은 대전교통공사 역명 및 주소(15083331)의 한자 칸을 쓴다(괄호 속 부역명은 뺀다).
// 주소(url)는 facts.json에만 두고, 게임 파일에는 역 번호 → 한자만 둔다(없으면 넣지 않는다).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { daejeonOfficial } from './build/daejeon.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8'));
const stations = {};
let found = 0;
let missing = 0;
for (const [line, entry] of Object.entries(facts.stationHanja?.lines ?? {})) {
  for (const [id, hanja] of Object.entries(entry.stations ?? {})) {
    if (hanja) {
      stations[id] = hanja;
      found++;
    } else missing++;
  }
  if (!entry.source) console.log(`! ${line}: 출처가 없어요`);
}
for (const o of daejeonOfficial((f) => resolve(ROOT, 'data/raw', f))) {
  const hanja = o.hanja.replace(/\(.*?\)/g, '');
  if (hanja) {
    stations[`J${o.code}`] = hanja;
    found++;
  } else missing++;
}
writeFileSync(
  resolve(ROOT, 'data/build/station-hanja.json'),
  JSON.stringify({ _설명: '역 한자 이름(역 번호 → 한자). scripts/build-station-hanja.mjs가 data/facts.json stationHanja(위키백과 노선 문서, 출처)와 대전교통공사 15083331로 만든다. 한자가 없는 역은 없다.', stations }) + '\n',
);
console.log(`역 한자 ${found}곳, 한자 없음 ${missing}곳`);
