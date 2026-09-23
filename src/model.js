// 화면에서 모델을 돌린다. 한 번 돌린 결과는 저장해 두고 다시 쓴다.
//
// 기준 연도: 2026년은 지금 운행 중인 노선, 2027년은 양산선과 사상–하단선을 더한다.
//   1985~2025년은 그 해에 문을 연 역까지만 남긴다(src/sim/history.js).
//   옛날 부산에서도 가는 곳(중심지)은 지금 자료를 쓴다. 사는 사람은 "그때 인구"를 고르면 인구총조사로 어림한다.
// 버스: 2026년부터는 실제 시내버스 노선(2023년 자료)으로 버스 시간을 찾는다. 옛날 부산은 그때 노선을 몰라서 어림 식을 쓴다.
// 요일: 평일과 토요일은 시간대 모양이 다르고, 토요일에는 중심지에 오는 사람 수도 다르다(실제 자료).
// 규칙: 부모가 "우리 집 규칙"으로 값을 바꾸면 setRules로 알려 주고, 저장해 둔 세상을 모두 버린다.
import {
  bus,
  dongs,
  futureLines,
  grid,
  historyPopulation,
  stationInfo,
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
import { asPlan, withPlan } from './sim/plan.js';
import { networkAt } from './sim/history.js';
import { buildBusNetwork, withBusTimes } from './sim/bus-network.js';
import { prepareWorld, runDay } from './sim/run.js';
import { populationRowsAt } from './sim/history-population.js';
import { riderLevel, stationSurroundings } from './sim/station-info.js';
import { buildWorld, rulesFromCards } from './sim/world.js';

/** 지금 쓰는 규칙 값. 부모가 바꾸면 setRules로 갈아 끼운다. */
export let rules = rulesFromCards(ruleCards);
export const DAY_TYPES = ['평일', '토요일'];
/** 지금 부산의 기준 연도. 이보다 앞선 해는 옛날 노선망으로 돌린다. */
export const BASE_YEAR = 2026;

/**
 * 규칙 값을 갈아 끼운다. 저장해 둔 세상은 모두 버린다(같은 규칙에서만 같은 결과다).
 * @param {Record<string, number>} [overrides] 바꾼 값만 담은 것. 없으면 기본 규칙으로 되돌린다.
 */
export function setRules(overrides) {
  rules = { ...rulesFromCards(ruleCards), ...(overrides ?? {}) };
  worlds.clear();
  return rules;
}

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

/** 실제 시내버스 그래프. 규칙이 바뀌면(setRules) 다시 만든다. */
let busGraph = null;
let busGraphRules = null;
export function busNetwork() {
  if (busGraphRules !== rules) {
    busGraph = buildBusNetwork(bus, grid, rules);
    busGraphRules = rules;
  }
  return busGraph;
}

/** 옛날 부산에서 "그때 인구"를 쓸 수 있는 해(인구총조사가 있는 첫 해부터 지금 전까지) */
export function canUseThenPopulation(year) {
  const first = Math.min(...Object.keys(historyPopulation.census).map(Number));
  return year >= first && year < BASE_YEAR;
}

/**
 * 기준 연도와 요일에 맞는 세상을 만든다.
 * @param {{year?: number, dayType?: string, population?: 'now'|'then'}} options
 *   population: 사는 사람 자료. now(기본) = 지금 인구, then = 그 해 인구(인구총조사로 어림, 옛날 부산만)
 */
export function worldFor({ year = 2026, dayType = '평일', population = 'now' } = {}) {
  const useThen = population === 'then' && canUseThenPopulation(year);
  const key = `${year}-${dayType}${useThen ? '-then' : ''}`;
  if (worlds.has(key)) return worlds.get(key);

  const useFuture = year >= 2027;
  // 옛날 부산: 그 해에 문을 연 역까지만 남긴다.
  const past =
    year < BASE_YEAR ? networkAt(year, { lines, stations, links, transfers, stationInfo }) : null;
  const allStations = useFuture ? [...stations, ...futureLines.stations] : (past?.stations ?? stations);
  const allLines = useFuture ? [...lines, ...futureLines.lines] : (past?.lines ?? lines);
  const allLinks = useFuture ? [...links, ...futureLines.links] : (past?.links ?? links);
  const allTransfers = useFuture ? [...transfers, ...futureLines.transfers] : (past?.transfers ?? transfers);

  const weekendPlaces = places.map((place) => ({
    ...place,
    size: dayType === '평일' ? place.size : place.size * weekendFactor(place),
  }));

  // 그 해 인구: 부산 칸마다 구·군 비율을 곱한 격자(src/sim/history-population.js)
  const gridOfYear = useThen ? { ...grid, population: populationRowsAt(grid, year, historyPopulation).population } : grid;
  const plainWorld = buildWorld({
    grid: gridOfYear,
    stations: allStations,
    lines: allLines,
    links: allLinks,
    transfers: allTransfers,
    places: weekendPlaces,
    dongs,
    hourShape: ridership.shape[dayType] ?? ridership.shape['평일'],
    defaultHeadwayMin: rules.defaultHeadwayMin,
    // 옛날 부산에도 중심지는 그대로 있다. 자리는 지금 역 목록에서 찾는다.
    anchorStations: stations,
  });
  const world = year >= BASE_YEAR ? withBusTimes(plainWorld, busNetwork(), rules) : plainWorld;

  const dayRules = { ...rules, tripsPerDay: rules.tripsPerDay * dayTripFactor(dayType) };
  const prepared = prepareWorld(world, dayRules);
  const result = runDay(world, prepared, dayRules);
  const entry = { world, prepared, result, rules: dayRules, year, dayType };
  worlds.set(key, entry);
  return entry;
}

/** 지금 부산의 평일 기본 세상 */
export function todayRun() {
  return worldFor({ year: BASE_YEAR, dayType: '평일' });
}

/** 그 해의 노선망(화면에 그릴 때 쓴다) */
export function networkOfYear(year) {
  return networkAt(year, { lines, stations, links, transfers, stationInfo });
}

/** 내가 그린 노선(하나 또는 설계 묶음)을 넣고 하루를 돌린다. */
export function runWithDesign(design, options = {}) {
  const base = worldFor(options);
  const nextWorld = withPlan(base.world, asPlan(design), grid, ruleTables);
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

/**
 * 새 역 이름을 지을 때 쓰는 자료(src/sim/station-names.js).
 * 이미 있는 역은 그 해의 노선망을 따른다(2027년이면 앞으로 생길 역까지, 옛날이면 그때 있던 역만).
 */
export function stationNameContext(year = BASE_YEAR) {
  const list =
    year >= 2027 ? [...stations, ...futureLines.stations] : year < BASE_YEAR ? networkOfYear(year).stations : stations;
  // 설계를 세상에 넣을 때(withDesign)와 같은 방법으로 칸을 정한다.
  const cellOf = (s) => Math.floor(s.y) * grid.cols + Math.floor(s.x);
  const inside = (s) => s.x >= 0 && s.y >= 0 && s.x < grid.cols && s.y < grid.rows;
  // x, y는 갈아타는 새 역을 기존 역 자리에 정확히 겹쳐 그릴 때 쓴다(withDesign과 같은 역을 고른다: 칸마다 처음 나온 역).
  const existing = list.filter(inside).map((s) => ({ name: s.name, cell: cellOf(s), x: s.x, y: s.y }));
  // 중심지 자리는 지금 역 목록과 행정동에서 찾는다(옛날 부산에도 중심지는 있다).
  const dongByCode = new Map(dongs.map((d) => [d.code, d]));
  const placeSpots = places
    .map((place) => {
      const anchor = place.at.station ? stationById.get(place.at.station) : dongByCode.get(place.at.dong);
      return anchor ? { name: place.name, x: anchor.x, y: anchor.y } : null;
    })
    .filter(Boolean);
  return {
    cols: grid.cols,
    existing,
    dongs: dongs.map((d) => ({ name: d.name, x: d.x, y: d.y })),
    places: placeSpots,
  };
}

/**
 * 설계 화면의 역 정보(칸 번호 → 정보). 역이 둘 넘으면 하루를 돌려 예상 승객 단계도 구한다.
 * 예상 승객은 숫자가 아니라 부산의 다른 역과 견준 단계(1~5)로만 돌려준다. 어림하기를 남겨 두려는 것이다.
 * @param {object} planOrDesign 설계 묶음(또는 설계 하나). 설계마다 stationPoints가 있으면 갈아타는 역 자리를 쓴다.
 * @param {{year?: number, dayType?: string}} options
 * @param {number} [lineIndex] 정보를 볼 노선(묶음 안 차례). 하루는 모든 노선을 넣고 돌린다.
 */
export function designStationInfo(planOrDesign, options = {}, lineIndex = 0) {
  const plan = asPlan(planOrDesign);
  const design = plan.lines[lineIndex];
  const base = worldFor(options);
  const { world } = base;
  const lineName = new Map(world.lines.map((line) => [line.id, line.name]));
  const cellOf = (s) => Math.floor(s.y) * grid.cols + Math.floor(s.x);
  const pointOf = (cell) =>
    design.stationPoints?.[cell] ?? { x: (cell % grid.cols) + 0.5, y: Math.floor(cell / grid.cols) + 0.5 };

  // 예상 승객: 새 노선을 넣고 하루를 돌린다(역이 하나뿐이면 노선이 되지 않는다).
  let riders = null;
  let references = [];
  if (design.stations.length >= 2 && design.path.length >= 2) {
    const after = runWithDesign(plan, options);
    riders = new Map(after.result.stations.map((s) => [s.id, s.board + s.alight]));
    references = base.result.stations.map((s) => s.board + s.alight).filter((value) => value > 0);
  }

  const info = {};
  for (const cell of design.stations) {
    const point = pointOf(cell);
    // 다른 새 역: 이 노선의 다른 역과 다른 새 노선의 역
    const others = [
      ...design.stations.filter((other) => other !== cell).map(pointOf),
      ...plan.lines
        .filter((line) => line !== design)
        .flatMap((line) => line.stations.filter((other) => other !== cell).map((other) => line.stationPoints?.[other] ?? pointOf(other))),
    ];
    const around = stationSurroundings({
      point,
      zones: world.zones,
      existing: world.stations,
      others,
      centers: world.centers,
      rules: base.rules,
    });
    const transfers = world.stations
      .filter((s) => cellOf(s) === cell)
      .map((s) => ({ name: s.name, line: lineName.get(s.line) ?? '' }))
      // 같은 칸을 지나는 다른 새 노선
      .concat(
        plan.lines
          .filter((line) => line !== design && line.stations.includes(cell) && line.path.includes(cell))
          .map((line) => ({ name: line.stationNames?.[cell] ?? '새 역', line: line.lineName ?? '새 노선' })),
      );
    const value = riders?.get(`${design.id}-${cell}`) ?? null;
    info[cell] = {
      ...around,
      transfers,
      riderLevel: value === null ? null : riderLevel(value, references),
    };
  }
  return info;
}
