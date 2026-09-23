// data/facts.json의 인구총조사(부산 구별)를 지금 구·군 인구로 옮겨 data/build/history-population.json을 만든다.
// 옛날 부산 자유 설계의 "그때 인구" 선택지가 쓴다(src/sim/history-population.js).
// 게임 파일에는 바깥 주소를 넣지 않으므로 출처 주소는 facts.json과 data/SOURCES.md에만 둔다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { censusByCurrentDistrict } from '../src/sim/history-population.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8')).historicPopulation;
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));

const census = Object.fromEntries(Object.entries(facts.census).map(([year, entry]) => [year, entry.value]));
const groups = Object.fromEntries(Object.entries(facts.groups).filter(([key]) => /^\d+$/.test(key)));
const current = censusByCurrentDistrict(census, groups, facts.shareYear);

// 지금 인구의 기준 해: 격자 인구 자료의 날짜(예: "… 주민등록 인구수 2026-08-31 …")
const nowYear = Number(/(\d{4})-\d{2}-\d{2}/.exec(grid.sources?.population ?? '')?.[1]);
if (!nowYear) throw new Error('격자 인구 자료의 날짜를 찾지 못했어요');

const rounded = Object.fromEntries(
  Object.entries(current).map(([year, values]) => [year, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v)]))]),
);
const out = {
  _설명:
    '인구총조사(1980~2000) 부산 구별 인구를 지금 구·군으로 옮긴 것. 그때 구가 지금 구 여럿이면 1995년 비율로 나눴다. 만든 곳: scripts/build-history-population.mjs, 출처: data/facts.json historicPopulation.',
  nowYear,
  census: rounded,
};
writeFileSync(resolve(ROOT, 'data/build/history-population.json'), JSON.stringify(out, null, 2) + '\n');
for (const [year, values] of Object.entries(rounded)) {
  console.log(`${year}: 지금 구·군 ${Object.keys(values).length}개, 합 ${Object.values(values).reduce((s, v) => s + v, 0).toLocaleString()}명`);
}
