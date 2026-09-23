// 실제 부산 시내버스 노선으로 가는 길을 찾는다. 순수 함수만 둔다.
//
// 자료: data/build/bus.json(scripts/build-bus.mjs). 정류장 자리는 격자 칸 단위 × 100이다.
// 그래프
//   정류장 점: 걸어서 오고 가는 곳
//   노선 자리 점: 노선 r의 i번째 정류장(버스 안)
//   정류장 → 노선 자리: 버스를 기다린다(busStopWaitMin). 탈 때마다 기다리므로 갈아타기도 이 값을 낸다.
//   노선 자리 → 다음 노선 자리: 버스를 타고 간다. 정류장 사이 곧은 거리를 버스 빠르기로 나눈다.
//   노선 자리 → 정류장: 내린다(0분).
//   정류장 ↔ 가까운 정류장(길 건너편 등): 걸어간다.
import { straightKm, walkMinutes } from './walk.js';

/** 이만큼 가까운 정류장끼리는 걸어서 갈아탈 수 있다(km). */
const TRANSFER_WALK_KM = 0.25;

/** 작은 우선순위 줄(가장 작은 값을 먼저 꺼낸다). */
class Heap {
  constructor() {
    this.keys = [];
    this.values = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, value) {
    const { keys, values } = this;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }
  pop() {
    const { keys, values } = this;
    const top = values[0];
    const lastKey = keys.pop();
    const lastValue = values.pop();
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1] < keys[child]) child += 1;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child];
        values[i] = values[child];
        i = child;
      }
      keys[i] = lastKey;
      values[i] = lastValue;
    }
    return top;
  }
}

/**
 * 버스 그래프를 만든다. 규칙이 바뀌면 다시 만든다.
 * @param {{names: string[], stops: number[][], routes: {no: string, stops: number[][]}[]}} bus
 * @param {{terrain: string[][]}} grid 들판(field)끼리 잇는 구간은 바깥 빠르기로 간다.
 * @param {object} rules busStopWaitMin, busSpeedCityKmh, busSpeedOuterKmh, walkSpeedKmh, walkHill
 */
export function buildBusNetwork(bus, grid, rules) {
  const stops = bus.stops.map(([x, y, name], index) => {
    const px = x / 100;
    const py = y / 100;
    const terrain = grid.terrain[Math.floor(py)]?.[Math.floor(px)];
    return { index, x: px, y: py, name: bus.names[name], hilly: terrain === 'hill', outer: terrain === 'field' };
  });
  const stopCount = stops.length;
  // 노선 자리 점 번호: stopCount부터 차례로
  const nodeRoute = [];
  const nodePos = [];
  const routeStart = [];
  for (const [r, route] of bus.routes.entries()) {
    routeStart.push(stopCount + nodeRoute.length);
    for (let i = 0; i < route.stops.length; i++) {
      nodeRoute.push(r);
      nodePos.push(i);
    }
  }
  const nodeCount = stopCount + nodeRoute.length;
  const edges = [];
  const add = (from, to, minutes) => edges.push({ from, to, minutes });

  for (const [r, route] of bus.routes.entries()) {
    const base = routeStart[r];
    for (let i = 0; i < route.stops.length; i++) {
      const stop = stops[route.stops[i][0]];
      if (i + 1 < route.stops.length) {
        add(stop.index, base + i, rules.busStopWaitMin);
        const next = stops[route.stops[i + 1][0]];
        const speed = stop.outer && next.outer ? rules.busSpeedOuterKmh : rules.busSpeedCityKmh;
        add(base + i, base + i + 1, (straightKm(stop, next) / speed) * 60);
      }
      if (i > 0) add(base + i, stop.index, 0);
    }
  }

  // 가까운 정류장끼리 걸어서 갈아타기. 작은 칸으로 나눠 가까운 것만 본다.
  const buckets = new Map();
  const cellOf = (value) => Math.floor(value / TRANSFER_WALK_KM);
  for (const stop of stops) {
    const key = `${cellOf(stop.x)},${cellOf(stop.y)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(stop);
  }
  for (const stop of stops) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of buckets.get(`${cellOf(stop.x) + dx},${cellOf(stop.y) + dy}`) ?? []) {
          if (other.index === stop.index) continue;
          const km = straightKm(stop, other);
          if (km <= TRANSFER_WALK_KM) add(stop.index, other.index, walkMinutes(km, rules, stop.hilly));
        }
      }
    }
  }

  // 노선마다 버스 안에 있는 사람(하루 합계): 처음 정류장부터 승차 − 하차를 쌓는다. 가장 붐비는 곳을 1로 둔다.
  const loads = bus.routes.map((route) => {
    let onBoard = 0;
    const list = route.stops.map(([, board, alight]) => {
      onBoard = Math.max(0, onBoard + board - alight);
      return onBoard;
    });
    const most = Math.max(...list, 1);
    return list.map((value) => value / most);
  });

  // 정류장마다 서는 노선(차례 번호)
  const routesAt = stops.map(() => []);
  for (const [r, route] of bus.routes.entries()) {
    for (const [index] of route.stops) if (routesAt[index].at(-1) !== r) routesAt[index].push(r);
  }

  return {
    stops,
    routes: bus.routes,
    routesAt,
    loads,
    nodeRoute,
    nodePos,
    stopCount,
    nodeCount,
    forward: adjacency(nodeCount, edges, 'from', 'to'),
    backward: adjacency(nodeCount, edges, 'to', 'from'),
  };
}

/** 점마다 나가는 줄을 모아 둔다(CSR). */
function adjacency(nodeCount, edges, fromKey, toKey) {
  const start = new Int32Array(nodeCount + 1);
  for (const edge of edges) start[edge[fromKey] + 1] += 1;
  for (let i = 0; i < nodeCount; i++) start[i + 1] += start[i];
  const fill = start.slice(0, nodeCount);
  const target = new Int32Array(edges.length);
  const weight = new Float64Array(edges.length);
  for (const edge of edges) {
    const at = fill[edge[fromKey]]++;
    target[at] = edge[toKey];
    weight[at] = edge.minutes;
  }
  return { start, target, weight };
}

/**
 * 여러 곳에서 동시에 출발하는 가장 짧은 시간(다익스트라).
 * @param {{node: number, minutes: number}[]} seeds
 */
function shortest(network, adj, seeds) {
  const dist = new Float64Array(network.nodeCount).fill(Infinity);
  const prev = new Int32Array(network.nodeCount).fill(-1);
  const heap = new Heap();
  for (const seed of seeds) {
    if (seed.minutes < dist[seed.node]) {
      dist[seed.node] = seed.minutes;
      heap.push(seed.minutes, seed.node);
    }
  }
  while (heap.size > 0) {
    const node = heap.pop();
    const here = dist[node];
    for (let e = adj.start[node]; e < adj.start[node + 1]; e++) {
      const next = adj.target[e];
      const value = here + adj.weight[e];
      if (value < dist[next] - 1e-9) {
        dist[next] = value;
        prev[next] = node;
        heap.push(value, next);
      }
    }
  }
  return { dist, prev };
}

/**
 * 한 점에서 걸어갈 수 있는 정류장과 걷는 시간.
 * @param {{x: number, y: number, hilly?: boolean}} point
 * @returns {{node: number, minutes: number}[]}
 */
export function stopsNear(network, point, rules) {
  const maxKm = (rules.busWalkMaxMin / 60) * rules.walkSpeedKmh;
  const found = [];
  for (const stop of network.stops) {
    const km = straightKm(point, stop);
    if (km > maxKm) continue;
    const walkMin = walkMinutes(km, rules, point.hilly);
    if (walkMin <= rules.busWalkMaxMin) found.push({ node: stop.index, minutes: walkMin });
  }
  return found;
}

/**
 * 칸 × 중심지마다 실제 버스로 가는 시간(분). 걷기 + 기다리기 + 타기 + 갈아타기 + 걷기.
 * 걸어갈 거리에 정류장이 없으면 Infinity다(모델은 버스 시간 어림 식을 쓴다).
 * 걷기만 하는 편이 빠르면 걷는 시간을 쓴다.
 * @returns {Float64Array} [zone.index * centers.length + 중심지 차례]
 */
export function busTimeTable(network, zones, centers, rules) {
  const table = new Float64Array(zones.length * centers.length).fill(Infinity);
  const zoneStops = zones.map((zone) => stopsNear(network, zone, rules));
  for (const [ci, center] of centers.entries()) {
    const seeds = stopsNear(network, center, rules);
    if (seeds.length === 0) continue;
    // 중심지에서 거꾸로 퍼져 나가면 모든 정류장에서 중심지까지 걸리는 시간이 한 번에 나온다.
    const { dist } = shortest(network, network.backward, seeds);
    for (const zone of zones) {
      let best = Infinity;
      for (const start of zoneStops[zone.index]) best = Math.min(best, start.minutes + dist[start.node]);
      if (!Number.isFinite(best)) continue;
      const walkOnly = walkMinutes(straightKm(zone, center) * rules.walkDetour, rules, zone.hilly);
      table[zone.index * centers.length + ci] = Math.min(best, walkOnly);
    }
  }
  return table;
}

/**
 * 두 점 사이 버스 길을 찾는다(여행 모드).
 * @param {{x: number, y: number, hilly?: boolean}} from
 * @param {{x: number, y: number, hilly?: boolean}} to
 * @returns {null | {
 *   minutes: number,
 *   legs: ({type: 'walk', minutes: number, km: number, to: string|null}
 *     | {type: 'wait', minutes: number, route: string}
 *     | {type: 'bus', route: string, minutes: number, endsAtTerminal: boolean,
 *        stops: {name: string, x: number, y: number, board: number, alight: number, load: number}[]})[]
 *   load: 이 노선에서 가장 붐비는 곳을 1로 둔 붐빔(하루 승하차로 어림한 값, 버스 한 대에 탄 사람 수가 아니다)
 * }} 걸어갈 거리에 정류장이 없거나 버스로 갈 수 없으면 null
 */
export function busJourney(network, from, to, rules) {
  const seeds = stopsNear(network, from, rules);
  const ends = stopsNear(network, to, rules);
  if (seeds.length === 0 || ends.length === 0) return null;
  const { dist, prev } = shortest(network, network.forward, seeds);
  let best = null;
  for (const end of ends) {
    const total = dist[end.node] + end.minutes;
    if (!best || total < best.total - 1e-9) best = { total, end };
  }
  if (!best || !Number.isFinite(best.total)) return null;

  // 되짚어 온 점들
  const nodes = [];
  for (let node = best.end.node; node !== -1; node = prev[node]) nodes.push(node);
  nodes.reverse();
  const isStop = (node) => node < network.stopCount;
  const firstStop = network.stops[nodes[0]];
  const legs = [
    { type: 'walk', minutes: dist[nodes[0]], km: straightKm(from, firstStop), to: firstStop.name },
  ];
  let i = 0;
  while (i < nodes.length - 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (isStop(b)) {
      // 가까운 정류장으로 걸어서 옮긴다.
      const sa = network.stops[a];
      const sb = network.stops[b];
      legs.push({ type: 'walk', minutes: dist[b] - dist[a], km: straightKm(sa, sb), to: sb.name });
      i += 1;
      continue;
    }
    // 정류장 → 노선 자리: 기다렸다가 타고, 내릴 때까지 간다.
    const route = network.routes[network.nodeRoute[b - network.stopCount]];
    legs.push({ type: 'wait', minutes: dist[b] - dist[a], route: route.no });
    let j = i + 1;
    while (j + 1 < nodes.length && !isStop(nodes[j + 1])) j += 1;
    const fromPos = network.nodePos[b - network.stopCount];
    const toPos = network.nodePos[nodes[j] - network.stopCount];
    const r = network.nodeRoute[b - network.stopCount];
    const stops = route.stops.slice(fromPos, toPos + 1).map(([index, board, alight], k) => {
      const stop = network.stops[index];
      return { name: stop.name, x: stop.x, y: stop.y, board, alight, load: network.loads[r][fromPos + k] };
    });
    // 이 버스의 마지막 정류장(종점)에서 내리면 종점 방송을 한다.
    const endsAtTerminal = toPos === route.stops.length - 1;
    legs.push({ type: 'bus', route: route.no, stops, minutes: dist[nodes[j]] - dist[b], endsAtTerminal });
    i = j + 1; // 내린 정류장
  }
  const lastStop = network.stops[best.end.node];
  legs.push({ type: 'walk', minutes: best.end.minutes, km: straightKm(lastStop, to), to: null });
  return { minutes: best.total, legs };
}

/**
 * 세상에 실제 버스 시간 표를 붙인다. 하루 운행(runDay)은 표에 값이 있으면 그 값을 버스 시간으로 쓴다.
 * 칸과 중심지는 노선을 새로 그려도 그대로라서, 한 번 붙이면 설계를 넣은 세상도 같은 표를 쓴다.
 * @param {object} world buildWorld의 결과
 * @param {object} network buildBusNetwork의 결과
 */
export function withBusTimes(world, network, rules) {
  return { ...world, busTimes: busTimeTable(network, world.zones, world.centers, rules) };
}

/**
 * 한 점에서 버스로 모든 곳까지(backward면 모든 곳에서 한 점까지) 걸리는 시간을 한 번에 구해 둔다.
 * 돌려주는 함수에 다른 점을 넣으면 그 점까지(그 점에서) 버스로 가는 시간이 나온다(걷기 포함, 못 가면 Infinity).
 * 여행 모드에서 "버스 + 지하철" 길의 갈아탈 역을 고를 때 쓴다.
 * @param {{x: number, y: number, hilly?: boolean}} point
 * @param {boolean} [backward] true면 "그 점에서 이 점까지"
 * @returns {(other: {x: number, y: number, hilly?: boolean}) => number}
 */
export function busReach(network, point, rules, backward = false) {
  const seeds = stopsNear(network, point, rules);
  if (seeds.length === 0) return () => Infinity;
  const { dist } = shortest(network, backward ? network.backward : network.forward, seeds);
  return (other) => {
    let best = Infinity;
    for (const near of stopsNear(network, other, rules)) best = Math.min(best, near.minutes + dist[near.node]);
    return best;
  };
}

/**
 * 한 점 가까이(km 안) 정류장에 서는 실제 시내버스 번호. 번호 차례(숫자 크기)로 늘어놓는다.
 * 시승 모드에서 아이가 만든 버스 정류장 표지에 "가까이 서는 시내버스"로 보여 준다.
 * @param {{x: number, y: number}} point
 */
export function routesNear(network, point, km = 0.3) {
  const found = new Set();
  for (const stop of network.stops) {
    if (straightKm(point, stop) > km) continue;
    for (const r of network.routesAt[stop.index]) found.add(network.routes[r].no);
  }
  return [...found].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
}
