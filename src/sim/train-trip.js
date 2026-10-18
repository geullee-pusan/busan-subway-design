// 기차(코레일 일반·고속 열차) 길 찾기. 순수 함수만 둔다(같은 입력이면 같은 결과).
// 시각표는 data/build/trains.json(2026-10-14 하루 기록), 운임은 역 쌍별 어른 운임(TAGO).
// 출발지에서 가까운 기차역까지, 내린 기차역에서 도착지까지 가는 길은 바깥에서 넘겨 준 access 함수로 구한다
// (지금의 걷기·버스·지하철 길 찾기를 쓴다).

/** 고속열차 종류(나머지는 일반열차) */
export const FAST_KINDS = ['KTX', 'KTX-산천', 'KTX-청룡', 'KTX-이음'];

/** '고속' 또는 '일반' */
export function trainGroup(kind) {
  return FAST_KINDS.includes(kind) ? '고속' : '일반';
}

/** 정차역 하나: [역 id, 도착(분), 출발(분)] → 이 역을 떠나는 시각(없으면 도착 시각) */
const depOf = (stop) => stop[2] ?? stop[1];
const arrOf = (stop) => stop[1] ?? stop[2];

/**
 * A역에서 B역까지 바로 가는 열차들(A를 afterMinute 뒤에 떠나는 것). 도착이 이른 차례.
 * @returns {{train: object, from: number, to: number, dep: number, arr: number}[]}
 */
export function directTrains(trains, fromId, toId, afterMinute) {
  const out = [];
  for (const train of trains) {
    const i = train.stops.findIndex((s) => s[0] === fromId);
    if (i < 0) continue;
    const j = train.stops.findIndex((s, k) => k > i && s[0] === toId);
    if (j < 0) continue;
    const dep = depOf(train.stops[i]);
    if (dep === null || dep < afterMinute) continue;
    out.push({ train, from: i, to: j, dep, arr: arrOf(train.stops[j]) });
  }
  return out.sort((a, b) => a.arr - b.arr || a.dep - b.dep || a.train.no - b.train.no);
}

/**
 * 기차 운임. 역 쌍별 표(fareTable["A|B"][열차번호])가 있으면 그 값, 없으면 같은 역 쌍의 같은 종류 운임.
 * 어린이는 어른 운임의 50% 할인(코레일 FAQ). 100원 밑은 버린다(우리가 정한 방법).
 * @returns {number|null} 못 찾으면 null
 */
export function trainFare(fareTable, fromId, toId, train, rider = 'adult') {
  const row = fareTable?.[`${fromId}|${toId}`];
  if (!row) return null;
  let adult = row.byTrain?.[train.no] ?? row.byKind?.[train.kind] ?? null;
  if (adult === null) return null;
  if (rider === 'child') adult = Math.floor(adult / 2 / 100) * 100;
  return adult;
}

const km = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 가는 길 가운데 기차를 타는 것(고속열차 하나, 일반열차 하나까지).
 * @param {object} p
 * @param {{x: number, y: number}} p.from
 * @param {{x: number, y: number}} p.to
 * @param {number} p.hour 떠나는 시각(시)
 * @param {'adult'|'child'} p.rider
 * @param {{stations: object[], lines: object[]}} p.rail data/build/rail.json
 * @param {object[]} p.trains data/build/trains.json의 trains
 * @param {object} p.fareTable 역 쌍별 운임표
 * @param {(a: object, b: object) => ({legs: object[], minutes: number, fare: number} | null)} p.access 두 점 사이 가장 빠른 (걷기·버스·지하철) 길
 * @param {number} [p.nearest] 출발지·도착지마다 볼 기차역 수
 * @param {number} [p.minKm] 이보다 가까우면 기차 길을 찾지 않는다(곧은 거리)
 */
export function trainTrips({ from, to, hour, rider = 'adult', rail, trains, fareTable, access, nearest = 3, minKm = 8 }) {
  if (km(from, to) < minKm) return [];
  const served = new Set(trains.flatMap((t) => t.stops.map((s) => s[0])));
  const stations = rail.stations.filter((s) => served.has(s.id));
  const near = (point) =>
    stations
      .map((s) => ({ s, d: km(point, s) }))
      .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id))
      .slice(0, nearest)
      .map((x) => x.s);
  const start = hour * 60;
  const linkKm = new Map();
  for (const line of rail.lines) {
    for (const link of line.links) {
      linkKm.set(`${link.from}|${link.to}`, link.km);
      linkKm.set(`${link.to}|${link.from}`, link.km);
    }
  }
  const stationById = new Map(rail.stations.map((s) => [s.id, s]));
  /** 같은 노선 위 두 역 사이 거리표 거리의 합(같은 노선에 없으면 null) */
  const lineKm = (a, b) => {
    for (const line of rail.lines) {
      const i = line.stations.indexOf(a);
      const j = line.stations.indexOf(b);
      if (i < 0 || j < 0 || i === j) continue;
      const [lo, hi] = i < j ? [i, j] : [j, i];
      let sum = 0;
      for (let k = lo; k < hi; k++) sum += line.links[k].km;
      return sum;
    }
    return null;
  };
  /** 열차가 지나는 정차역 사이 거리(km): 이웃 역이면 거리표, 같은 노선이면 그 사이 거리표 합, 아니면 곧은 거리 */
  const rideKm = (train, i, j) => {
    let sum = 0;
    for (let k = i + 1; k <= j; k++) {
      const a = train.stops[k - 1][0];
      const b = train.stops[k][0];
      sum += linkKm.get(`${a}|${b}`) ?? lineKm(a, b) ?? km(stationById.get(a), stationById.get(b));
    }
    return sum;
  };

  const accessCache = new Map();
  const reach = (a, b, keyName) => {
    if (!accessCache.has(keyName)) accessCache.set(keyName, access(a, b));
    return accessCache.get(keyName);
  };

  const best = { 고속: null, 일반: null };
  for (const A of near(from)) {
    const first = reach(from, A, `from|${A.id}`);
    if (!first) continue;
    const ready = start + first.minutes;
    for (const B of near(to)) {
      if (B.id === A.id) continue;
      const last = reach(B, to, `to|${B.id}`);
      if (!last) continue;
      const options = directTrains(trains, A.id, B.id, ready);
      for (const group of ['고속', '일반']) {
        const pick = options.find((o) => trainGroup(o.train.kind) === group);
        if (!pick) continue;
        const total = pick.arr + last.minutes - start;
        const fare = trainFare(fareTable, A.id, B.id, pick.train, rider);
        const current = best[group];
        if (!current || total < current.total - 1e-9 || (Math.abs(total - current.total) < 1e-9 && (fare ?? Infinity) < (current.fare ?? Infinity))) {
          best[group] = { total, A, B, first, last, pick, ready, fare };
        }
      }
    }
  }

  const trips = [];
  for (const group of ['고속', '일반']) {
    const b = best[group];
    if (!b) continue;
    const { pick } = b;
    const wait = pick.dep - b.ready;
    const ride = pick.arr - pick.dep;
    const legs = [
      ...b.first.legs.map((leg, i, all) => (i === all.length - 1 && leg.mode === '걷기' ? { ...leg, toRail: b.A.id } : leg)),
      {
        mode: '기차',
        minutes: wait + ride,
        wait,
        ride,
        dep: pick.dep,
        arr: pick.arr,
        train: pick.train.no,
        kind: pick.train.kind,
        from: b.A.id,
        to: b.B.id,
        fromIndex: pick.from,
        toIndex: pick.to,
        fare: b.fare,
        meters: Math.round(rideKm(pick.train, pick.from, pick.to) * 1000),
      },
      ...b.last.legs.map((leg, i) => (i === 0 && leg.mode === '걷기' ? { ...leg, fromRail: b.B.id } : leg)),
    ];
    const minutes = legs.reduce((s, leg) => s + leg.minutes, 0);
    const walkMeters = legs.filter((leg) => leg.mode === '걷기').reduce((s, leg) => s + leg.meters, 0);
    trips.push({
      id: group === '고속' ? 'train-fast' : 'train-slow',
      title: pick.train.kind ?? '기차',
      group,
      legs,
      minutes,
      fare: (b.first.fare ?? 0) + (b.fare ?? 0) + (b.last.fare ?? 0),
      fareKnown: b.fare !== null,
      walkMeters,
    });
  }
  return trips;
}
