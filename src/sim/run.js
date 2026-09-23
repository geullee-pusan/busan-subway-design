// 하루 운행을 돌린다. 순수 함수만 둔다(docs/SPEC.md 5.5).
//
// 순서
//   1. 칸에 사는 사람 수로 하루 이동을 만든다(왕복 한 번을 1로 센다).
//   2. 중심지마다 가고 싶은 마음(중력 모델)으로 이동을 나눈다.
//   3. 도시철도로 가는 시간과 버스로 가는 시간을 재서, 탑승 규칙으로 타는 사람을 정한다.
//   4. 타는 사람을 역과 구간에 더한다. 갈 때와 올 때를 모두 센다.
//   5. 시간대 모양으로 하루를 나누고, 가장 붐비는 때의 붐빔을 잰다.
import { boardingShare, busMinutes, centerWeight, zoneTrips } from './demand.js';
import { allShortestTimes, buildRailGraph, pathBetween } from './rail.js';
import { nearbyStations, straightKm } from './walk.js';

/** 이보다 작은 이동은 셈에서 뺀다(결과를 바꾸지 않을 만큼 작다). */
const MIN_TRIPS = 0.5;


/**
 * 역 그래프와 가까운 역을 미리 구해 둔다. 노선망이 바뀔 때만 다시 부르면 된다.
 * @param {object} world zones, stations, links, transfers, centers, lines
 * @param {object} rules
 */
export function prepareWorld(world, rules) {
  const lineInfo = Object.fromEntries(world.lines.map((l) => [l.id, l]));
  const graph = buildRailGraph(world.stations, world.links, world.transfers, lineInfo, rules);
  const shortest = allShortestTimes(graph);
  const withIndex = world.stations.map((s, i) => ({ ...s, index: i }));
  const zoneAccess = world.zones.map((zone) => nearbyStations(zone, withIndex, rules));
  const centerAccess = world.centers.map((center) => nearbyStations(center, withIndex, rules));
  return { graph, shortest, lineInfo, zoneAccess, centerAccess, stationCount: world.stations.length };
}

/**
 * 하루를 돌린다.
 * @returns {{
 *  stations: {id: string, board: number, alight: number}[],
 *  links: {line: string, from: string, to: string, people: number}[],
 *  byHour: number[],
 *  totals: {trips: number, railTrips: number, board: number},
 *  crowding: {line: string, from: string, to: string, peopleAtPeak: number, capacity: number|null, ratio: number|null}[]
 * }}
 */
export function runDay(world, prepared, rules) {
  const n = prepared.stationCount;
  const board = new Float64Array(n);
  const alight = new Float64Array(n);
  const flow = new Float64Array(n * n);
  // 칸 × 중심지마다 도시철도로 걸린 시간과 탄 사람 수. 노선을 새로 그렸을 때 견주는 데 쓴다.
  const pairCount = world.zones.length * world.centers.length;
  const pairTime = new Float64Array(pairCount).fill(Infinity);
  const pairPeople = new Float64Array(pairCount);
  let trips = 0;
  let railTrips = 0;

  const centerWeights = new Float64Array(world.centers.length);
  for (const zone of world.zones) {
    const fromZone = zoneTrips(zone.population, rules);
    if (fromZone < MIN_TRIPS) continue;
    trips += fromZone;
    const access = prepared.zoneAccess[zone.index];
    if (access.length === 0) continue;

    let weightSum = 0;
    for (const [ci, center] of world.centers.entries()) {
      const km = straightKm(zone, center);
      const weight = centerWeight(center, km, rules);
      centerWeights[ci] = weight;
      weightSum += weight;
    }
    if (weightSum <= 0) continue;

    for (const [ci, center] of world.centers.entries()) {
      const centerTrips = (fromZone * centerWeights[ci]) / weightSum;
      if (centerTrips < MIN_TRIPS) continue;
      const km = straightKm(zone, center);
      const busMin = busMinutes(km, rules, zone.outer && center.outer);

      // 가까운 역 3개 가운데 가장 빠른 길 하나를 고른다(SPEC 5.5 구현 조건).
      let best = null;
      for (const start of access) {
        const wait = (prepared.lineInfo[start.station.line]?.headwayMin ?? 0) / 2;
        for (const end of prepared.centerAccess[ci]) {
          if (start.station.index === end.station.index) continue;
          const ride = prepared.shortest.times[start.station.index * n + end.station.index];
          if (!Number.isFinite(ride)) continue;
          const total = start.walkMin + wait + ride + end.walkMin;
          if (!best || total < best.total) best = { total, start, end };
        }
      }
      if (!best) continue;

      const share = boardingShare(busMin, best.total, rules);
      const people = centerTrips * share;
      const key = zone.index * world.centers.length + ci;
      pairTime[key] = best.total;
      if (people < MIN_TRIPS) continue;
      pairPeople[key] = people;
      railTrips += people;

      const a = best.start.station.index;
      const b = best.end.station.index;
      // 갈 때와 올 때를 모두 센다.
      board[a] += people;
      alight[b] += people;
      board[b] += people;
      alight[a] += people;
      const path = pathBetween(prepared.shortest, a, b);
      for (let i = 0; i + 1 < path.length; i++) {
        flow[path[i] * n + path[i + 1]] += people;
        flow[path[i + 1] * n + path[i]] += people;
      }
    }
  }

  const stations = world.stations.map((station, i) => ({ id: station.id, board: board[i], alight: alight[i] }));
  const links = [];
  for (const link of world.links) {
    const a = prepared.graph.index.get(link.from);
    const b = prepared.graph.index.get(link.to);
    if (a === undefined || b === undefined) continue;
    links.push({ line: link.line, from: link.from, to: link.to, people: flow[a * n + b] + flow[b * n + a] });
  }

  const totalBoard = stations.reduce((sum, s) => sum + s.board, 0);
  const byHour = world.hourShape.map((share) => totalBoard * share);
  const peakShare = Math.max(...world.hourShape);

  const crowding = links.map((link) => {
    const line = prepared.lineInfo[link.line] ?? {};
    // 가장 붐비는 때 한 방향으로 지나는 사람 수
    const peopleAtPeak = (link.people / 2) * peakShare;
    const capacity = line.trainsPerHourPeak && line.capacityPerTrain ? line.trainsPerHourPeak * line.capacityPerTrain : null;
    return {
      line: link.line,
      from: link.from,
      to: link.to,
      peopleAtPeak,
      capacity,
      ratio: capacity ? peopleAtPeak / capacity : null,
    };
  });

  return { stations, links, byHour, totals: { trips, railTrips, board: totalBoard }, crowding, pairTime, pairPeople };
}
