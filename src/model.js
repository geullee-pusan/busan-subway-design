// 화면에서 모델을 돌린다. 한 번 돌린 결과는 저장해 두고 다시 쓴다.
import { dongs, grid, lines, links, places, ridership, ruleCards, ruleTables, stationById, stations, transfers } from './data.js';
import { compareToReal, meetsTargets } from './sim/compare.js';
import { withDesign } from './sim/design-world.js';
import { prepareWorld, runDay } from './sim/run.js';
import { buildWorld, rulesFromCards } from './sim/world.js';

export const rules = rulesFromCards(ruleCards);

let cached = null;

/** 기존 노선망으로 하루를 돌린 결과 */
export function todayRun() {
  if (cached) return cached;
  const world = buildWorld({
    grid,
    stations,
    lines,
    links,
    transfers,
    places,
    dongs,
    hourShape: ridership.shape['평일'],
    defaultHeadwayMin: rules.defaultHeadwayMin,
  });
  const prepared = prepareWorld(world, rules);
  const result = runDay(world, prepared, rules);
  cached = { world, prepared, result };
  return cached;
}

/** 내가 그린 노선을 넣고 하루를 돌린다. */
export function runWithDesign(design) {
  const { world } = todayRun();
  const nextWorld = withDesign(world, design, grid, ruleTables);
  const prepared = prepareWorld(nextWorld, rules);
  return { world: nextWorld, result: runDay(nextWorld, prepared, rules) };
}

/** 실제 평일 하루 승하차(역 id → 사람 수) */
export function realWeekday() {
  const real = {};
  for (const [id, station] of Object.entries(ridership.stations)) {
    const day = station['평일'];
    if (day) real[id] = day.board + day.alight;
  }
  return real;
}

/** 우리 계산과 진짜를 견준 결과 */
export function comparison() {
  const { result } = todayRun();
  const names = Object.fromEntries(stations.map((s) => [s.id, s.name]));
  const compared = compareToReal(result.stations, realWeekday(), transfers, names);
  return { ...compared, targets: meetsTargets(compared) };
}

/** 역 하나의 노선 색 */
export function lineColorOf(stationId) {
  const station = stationById.get(stationId);
  return station ? lines.find((l) => l.id === station.line)?.color ?? null : null;
}
