// 화면에서 모델을 돌린다. 한 번 돌린 결과는 저장해 두고 다시 쓴다.
//
// 기준 연도: 2026년은 지금 운행 중인 노선만, 2027년은 양산선과 사상–하단선을 더한다.
// 요일: 평일과 토요일은 시간대 모양이 다르고, 토요일에는 중심지에 오는 사람 수도 다르다(실제 자료).
import {
  dongs,
  futureLines,
  grid,
  lines,
  links,
  places,
  ridership,
  ruleCards,
  ruleTables,
  stationById,
  stations,
  transfers,
} from './data.js';
import { compareToReal, meetsTargets } from './sim/compare.js';
import { withDesign } from './sim/design-world.js';
import { prepareWorld, runDay } from './sim/run.js';
import { buildWorld, rulesFromCards } from './sim/world.js';

export const rules = rulesFromCards(ruleCards);
export const DAY_TYPES = ['평일', '토요일'];

/** 역 하나의 요일별 이용객 합계 */
function dayTotal(stationId, dayType) {
  const day = ridership.stations[stationId]?.[dayType];
  return day ? day.board + day.alight : null;
}

/** 토요일에 중심지로 오는 사람이 평일보다 몇 배인지. 중심지 옆 역의 실제 자료에서 구한다. */
function weekendFactor(place) {
  if (!place.at?.station) return 1;
  const weekday = dayTotal(place.at.station, '평일');
  const saturday = dayTotal(place.at.station, '토요일');
  if (!weekday || !saturday) return 1;
  return saturday / weekday;
}

/** 요일에 따라 하루 이동 횟수를 조절한다(토요일에는 전체 이용객이 적다). */
function dayTripFactor(dayType) {
  if (dayType === '평일') return 1;
  const sum = (type) =>
    Object.values(ridership.stations).reduce((total, station) => total + (station[type]?.board ?? 0), 0);
  const weekday = sum('평일');
  const other = sum(dayType);
  return weekday > 0 ? other / weekday : 1;
}

const worlds = new Map();

/**
 * 기준 연도와 요일에 맞는 세상을 만든다.
 * @param {{year?: number, dayType?: string}} options
 */
export function worldFor({ year = 2026, dayType = '평일' } = {}) {
  const key = `${year}-${dayType}`;
  if (worlds.has(key)) return worlds.get(key);

  const useFuture = year >= 2027;
  const allStations = useFuture ? [...stations, ...futureLines.stations] : stations;
  const allLines = useFuture ? [...lines, ...futureLines.lines] : lines;
  const allLinks = useFuture ? [...links, ...futureLines.links] : links;
  const allTransfers = useFuture ? [...transfers, ...futureLines.transfers] : transfers;

  const weekendPlaces = places.map((place) => ({
    ...place,
    size: dayType === '평일' ? place.size : place.size * weekendFactor(place),
  }));

  const world = buildWorld({
    grid,
    stations: allStations,
    lines: allLines,
    links: allLinks,
    transfers: allTransfers,
    places: weekendPlaces,
    dongs,
    hourShape: ridership.shape[dayType] ?? ridership.shape['평일'],
    defaultHeadwayMin: rules.defaultHeadwayMin,
  });

  const dayRules = { ...rules, tripsPerDay: rules.tripsPerDay * dayTripFactor(dayType) };
  const prepared = prepareWorld(world, dayRules);
  const result = runDay(world, prepared, dayRules);
  const entry = { world, prepared, result, rules: dayRules, year, dayType };
  worlds.set(key, entry);
  return entry;
}

/** 2026년 평일 기본 세상 */
export function todayRun() {
  return worldFor({ year: 2026, dayType: '평일' });
}

/** 내가 그린 노선을 넣고 하루를 돌린다. */
export function runWithDesign(design, options = {}) {
  const base = worldFor(options);
  const nextWorld = withDesign(base.world, design, grid, ruleTables);
  const prepared = prepareWorld(nextWorld, base.rules);
  return { world: nextWorld, result: runDay(nextWorld, prepared, base.rules), base };
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
