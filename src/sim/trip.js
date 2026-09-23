// 여행 모드: 출발지에서 도착지까지 가는 길 몇 가지를 찾아 시간과 요금을 견준다. 순수 함수만 둔다.
//
// 걷기, 지하철, 버스는 이동 모델(src/sim/run.js)과 같은 규칙을 쓴다.
//  - 걷기: 곧은 거리 ÷ 걷는 속도(언덕이면 느리게)
//  - 지하철: 가까운 역까지 걷기 + 배차 간격의 절반 기다리기 + 가장 빠른 길(갈아타기 포함) + 걷기
//  - 버스: 어림 버스(정류장까지 걷고 기다리기 + 곧은 거리 × 우회 계수 ÷ 버스 속도). 실제 노선은 쓰지 않는다.
//  - 택시: 잡는 시간 + 곧은 거리 × 우회 계수 ÷ 택시 속도. 요금은 부산 중형택시 요금표.
// 요금은 교통카드 기준(src/content/fares.json). 버스와 지하철을 갈아타면 가장 비싼 요금까지만 내고,
// 지하철 2구간 요금은 따로 낸다.
import { busMinutes } from './demand.js';
import { pathBetween } from './rail.js';
import { nearbyStations, straightKm, walkMinutes } from './walk.js';

/** 걷는 거리(m). 이동 모델처럼 곧은 거리로 센다. */
function meters(km) {
  return Math.round(km * 1000);
}

/** 지하철 길: 역 번호들을 노선마다 나누고, 갈아타는 곳을 넣는다. */
function subwayLegs(world, prepared, fromIndex, toIndex) {
  const path = pathBetween(prepared.shortest, fromIndex, toIndex);
  if (path.length === 0) return null;
  const legs = [];
  let ride = null;
  let km = 0;
  const linkKm = new Map();
  for (const link of world.links) {
    const value = (link.distanceM ?? 0) / 1000;
    linkKm.set(`${link.from}|${link.to}`, value);
    linkKm.set(`${link.to}|${link.from}`, value);
  }
  for (let i = 0; i + 1 < path.length; i++) {
    const a = world.stations[path[i]];
    const b = world.stations[path[i + 1]];
    const edge = prepared.graph.edges[path[i]].find((e) => e.to === path[i + 1]);
    const minutes = edge?.minutes ?? 0;
    if (edge?.kind === 'transfer') {
      ride = null;
      legs.push({ mode: '갈아타기', minutes, meters: 0, stations: [a.id, b.id], line: b.line });
      continue;
    }
    if (!ride || ride.line !== a.line) {
      ride = { mode: '지하철', minutes: 0, meters: 0, line: a.line, stations: [a.id] };
      legs.push(ride);
    }
    ride.minutes += minutes;
    const step = linkKm.get(`${a.id}|${b.id}`) ?? straightKm(a, b);
    ride.meters += meters(step);
    km += step;
    ride.stations.push(b.id);
  }
  return { legs, km };
}

/** 지하철을 타는 길(걷기 → 기다리기 → 타기 → 걷기). 못 가면 null */
function subwayTrip(world, prepared, rules, from, to) {
  const starts = nearbyStations(from, prepared.indexed, rules);
  const ends = nearbyStations(to, prepared.indexed, rules);
  let best = null;
  for (const s of starts) {
    const wait = (prepared.lineInfo[s.station.line]?.headwayMin ?? 0) / 2;
    for (const e of ends) {
      if (s.station.index === e.station.index) continue;
      const ride = prepared.shortest.times[s.station.index * prepared.shortest.count + e.station.index];
      if (!Number.isFinite(ride)) continue;
      const total = s.walkMin + wait + ride + e.walkMin;
      if (!best || total < best.total - 1e-9) best = { total, s, e, wait };
    }
  }
  if (!best) return null;
  const inside = subwayLegs(world, prepared, best.s.station.index, best.e.station.index);
  if (!inside) return null;
  return {
    legs: [
      { mode: '걷기', minutes: best.s.walkMin, meters: meters(straightKm(from, best.s.station)), to: best.s.station.id },
      { mode: '기다리기', minutes: best.wait, meters: 0, line: best.s.station.line },
      ...inside.legs,
      { mode: '걷기', minutes: best.e.walkMin, meters: meters(straightKm(best.e.station, to)), from: best.e.station.id },
    ],
    subwayKm: inside.km,
  };
}

/** 어림 버스 한 번 타기(기다리기 + 타기) */
function busLegs(rules, a, b) {
  const km = straightKm(a, b);
  const total = busMinutes(km, rules, Boolean(a.outer && b.outer));
  const wait = rules.busWaitMin ?? 0;
  return [
    { mode: '기다리기', minutes: wait, meters: 0, bus: true },
    { mode: '버스', minutes: total - wait, meters: meters(km * rules.walkDetour) },
  ];
}

/**
 * 버스와 지하철 요금(교통카드). 갈아타면 가장 비싼 요금까지만 내고, 지하철 2구간 요금은 따로 낸다.
 * @param {{bus: boolean, subway: boolean, subwayKm: number}} used
 * @param {'adult'|'child'} rider
 */
export function transitFare(fares, { bus, subway, subwayKm = 0 }, rider = 'adult') {
  const who = rider === 'child' ? 'child' : 'adult';
  const subwayZone = subwayKm > fares.subway.zoneKm ? 1 : 0;
  const busFare = bus ? fares.bus[who] : 0;
  const subwayBase = subway ? fares.subway[who][0] : 0;
  const subwayExtra = subway ? fares.subway[who][subwayZone] - fares.subway[who][0] : 0;
  return Math.max(busFare, subwayBase) + subwayExtra;
}

/**
 * 부산 중형택시 요금.
 * @param {number} km 달린 거리
 * @param {number} minutes 달린 시간(분)
 * @param {number} hour 탄 시각(0~23, 소수 가능)
 */
export function taxiFare(fares, km, minutes, hour) {
  const t = fares.taxi;
  const speed = minutes > 0 ? km / (minutes / 60) : Infinity;
  let fare = t.baseFare;
  if (speed > t.slowKmh) {
    fare += Math.ceil(Math.max(0, km - t.baseKm) * 1000 / t.stepMeters) * t.stepFare;
  } else {
    // 느리게 가면 시간으로 센다(기본 거리만큼 가는 시간은 뺀다).
    const baseSeconds = (t.baseKm / Math.max(speed, 1e-9)) * 3600;
    fare += Math.ceil(Math.max(0, minutes * 60 - baseSeconds) / t.slowSeconds) * t.stepFare;
  }
  const h = ((hour % 24) + 24) % 24;
  const night = t.night.find((n) => h >= n.from && h < n.to);
  if (night) fare = Math.round((fare * (1 + night.rate)) / 100) * 100;
  return fare;
}

/**
 * 가는 길 몇 가지.
 * @param {object} p
 * @param {{x: number, y: number, hilly?: boolean, outer?: boolean}} p.from 출발(칸 단위, 1칸 = 1km)
 * @param {{x: number, y: number, hilly?: boolean, outer?: boolean}} p.to 도착
 * @param {number} p.hour 떠나는 시각(시)
 * @param {{walk?: boolean, bus?: boolean, subway?: boolean, taxi?: boolean}} p.modes 켜 둔 가는 방법
 * @param {'adult'|'child'} p.rider 여행하는 사람(요금)
 * @param {object} p.world buildWorld가 만든 세상
 * @param {object} p.prepared prepareWorld 결과
 * @param {object} p.rules 규칙 값
 * @param {object} p.fares src/content/fares.json
 * @returns {{id: string, title: string, legs: object[], minutes: number, fare: number, walkMeters: number}[]} 빠른 차례
 */
export function planTrips({ from, to, hour, modes, rider = 'adult', world, prepared, rules, fares }) {
  const km = straightKm(from, to);
  const prep = { ...prepared, indexed: world.stations.map((s, index) => ({ ...s, index })) };
  const options = [];
  const push = (id, title, legs, fare) => {
    const minutes = legs.reduce((sum, leg) => sum + leg.minutes, 0);
    const walkMeters = legs.filter((leg) => leg.mode === '걷기').reduce((sum, leg) => sum + leg.meters, 0);
    options.push({ id, title, legs, minutes, fare, walkMeters });
  };

  if (modes.walk) {
    push('walk', '걷기', [{ mode: '걷기', minutes: walkMinutes(km, rules, from.hilly), meters: meters(km) }], 0);
  }

  let bestSubway = null;
  if (modes.subway) {
    bestSubway = subwayTrip(world, prep, rules, from, to);
    if (bestSubway) push('subway', '지하철', bestSubway.legs, transitFare(fares, { subway: true, subwayKm: bestSubway.subwayKm }, rider));
  }

  if (modes.bus) {
    push('bus', '버스', busLegs(rules, from, to), transitFare(fares, { bus: true }, rider));
  }

  if (modes.bus && modes.subway) {
    // 버스로 먼 역까지 가서 지하철을 타거나, 지하철을 타고 가다 버스로 갈아탄다.
    // 걸어서 갈 수 있는 역은 빼고(그러면 지하철 길과 같다) 가장 빠른 길 하나를 고른다.
    const walkable = (point) => new Set(nearbyStations(point, prep.indexed, rules).map((s) => s.station.index));
    const nearFrom = walkable(from);
    const nearTo = walkable(to);
    let best = null;
    for (const station of prep.indexed) {
      if (!nearFrom.has(station.index)) {
        const bus = busLegs(rules, from, station);
        const rest = subwayTrip(world, prep, rules, station, to);
        if (rest) {
          // 역에 내려서 바로 지하철을 탄다(버스에서 역까지 걷는 시간은 갈아타기로 센다).
          const legs = [...bus, { mode: '갈아타기', minutes: rules.transferWalkMin, meters: 0 }, ...rest.legs.slice(1)];
          const total = legs.reduce((sum, leg) => sum + leg.minutes, 0);
          if (!best || total < best.total - 1e-9) best = { total, legs, subwayKm: rest.subwayKm, title: '버스 + 지하철' };
        }
      }
      if (!nearTo.has(station.index)) {
        const first = subwayTrip(world, prep, rules, from, station);
        if (first) {
          const legs = [...first.legs.slice(0, -1), { mode: '갈아타기', minutes: rules.transferWalkMin, meters: 0 }, ...busLegs(rules, station, to)];
          const total = legs.reduce((sum, leg) => sum + leg.minutes, 0);
          if (!best || total < best.total - 1e-9) best = { total, legs, subwayKm: first.subwayKm, title: '지하철 + 버스' };
        }
      }
    }
    // 지하철만, 버스만보다 빠를 때만 보여 준다(느리면 굳이 갈아탈 까닭이 없다).
    const plain = options.filter((o) => o.id === 'bus' || o.id === 'subway').map((o) => o.minutes);
    if (best && plain.every((m) => best.total < m - 0.5)) {
      push('mixed', best.title, best.legs, transitFare(fares, { bus: true, subway: true, subwayKm: best.subwayKm }, rider));
    }
  }

  if (modes.taxi) {
    const roadKm = km * rules.walkDetour;
    const rideMin = (roadKm / rules.taxiSpeedKmh) * 60;
    push(
      'taxi',
      '택시',
      [
        { mode: '기다리기', minutes: rules.taxiWaitMin, meters: 0, taxi: true },
        { mode: '택시', minutes: rideMin, meters: meters(roadKm) },
      ],
      taxiFare(fares, roadKm, rideMin, hour),
    );
  }

  const order = ['walk', 'subway', 'bus', 'mixed', 'taxi'];
  return options.sort((a, b) => a.minutes - b.minutes || order.indexOf(a.id) - order.indexOf(b.id));
}
