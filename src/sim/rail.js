// 도시철도 그래프와 가장 빠른 길. 순수 함수만 둔다.
//
// 역 하나는 노선마다 따로 있다(예: 서면 1호선, 서면 2호선). 두 역을 잇는 것은 두 가지다.
//   - 구간: 열차로 가는 시간 = 달리는 시간 + 도착역 정차시간
//   - 갈아타기: 걷는 시간 3분 + 기다리는 시간(배차 간격의 절반)
// 타는 역에서 처음 기다리는 시간은 여기에 넣지 않는다. 길을 고른 뒤에 더한다.

/**
 * 역 그래프를 만든다.
 * @param {{id: string}[]} stations
 * @param {{from: string, to: string, line: string, runS: number}[]} links
 * @param {{stations: string[]}[]} transfers 환승 묶음
 * @param {Record<string, {dwellS: number, headwayMin: number}>} lineInfo 노선별 정차시간과 배차 간격
 * @param {{transferWalkMin: number}} rules
 */
export function buildRailGraph(stations, links, transfers, lineInfo, rules) {
  const index = new Map(stations.map((s, i) => [s.id, i]));
  const edges = stations.map(() => []);
  const add = (fromId, toId, minutes, kind) => {
    const from = index.get(fromId);
    const to = index.get(toId);
    if (from === undefined || to === undefined) return;
    edges[from].push({ to, minutes, kind });
  };

  for (const link of links) {
    const info = lineInfo[link.line] ?? {};
    const dwellMin = (info.dwellS ?? 0) / 60;
    const minutes = link.runS / 60 + dwellMin;
    add(link.from, link.to, minutes, 'ride');
    add(link.to, link.from, minutes, 'ride');
  }

  for (const group of transfers) {
    for (const a of group.stations) {
      for (const b of group.stations) {
        if (a === b) continue;
        const station = stations.find((s) => s.id === b);
        const headway = lineInfo[station?.line]?.headwayMin ?? 0;
        add(a, b, rules.transferWalkMin + headway / 2, 'transfer');
      }
    }
  }
  return { stations, index, edges };
}

/** 아주 작은 우선순위 큐(이진 힙). 같은 값이면 먼저 넣은 것이 먼저 나온다. */
class Heap {
  constructor() {
    this.items = [];
  }
  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].cost <= items[i].cost) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let small = i;
        if (left < items.length && items[left].cost < items[small].cost) small = left;
        if (right < items.length && items[right].cost < items[small].cost) small = right;
        if (small === i) break;
        [items[small], items[i]] = [items[i], items[small]];
        i = small;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

/**
 * 모든 역에서 모든 역까지 가장 빠른 시간을 구한다.
 * @returns {{times: Float64Array, previous: Int32Array, count: number}} times[a * n + b] = 분
 */
export function allShortestTimes(graph) {
  const n = graph.stations.length;
  // Float64로 둔다. Float32로 줄이면 반올림 때문에 이미 찾은 값보다 커 보여서 탐색이 멈춘다.
  const times = new Float64Array(n * n).fill(Infinity);
  const previous = new Int32Array(n * n).fill(-1);
  for (let start = 0; start < n; start++) {
    const base = start * n;
    times[base + start] = 0;
    const queue = new Heap();
    queue.push({ node: start, cost: 0 });
    while (queue.size > 0) {
      const { node, cost } = queue.pop();
      if (cost > times[base + node]) continue;
      for (const edge of graph.edges[node]) {
        const next = cost + edge.minutes;
        if (next < times[base + edge.to]) {
          times[base + edge.to] = next;
          previous[base + edge.to] = node;
          queue.push({ node: edge.to, cost: next });
        }
      }
    }
  }
  return { times, previous, count: n };
}

/** 가장 빠른 길에 있는 역 번호들(출발 → 도착 순서) */
export function pathBetween({ previous, count }, from, to) {
  const path = [to];
  let node = to;
  let guard = 0;
  while (node !== from && guard++ < count) {
    const before = previous[from * count + node];
    if (before < 0) return [];
    path.push(before);
    node = before;
  }
  return path.reverse();
}

/**
 * 한 역에서 다른 역까지 가장 빠른 시간(분). 못 가면 null.
 * 연표 화면처럼 한 짝만 볼 때 쓴다(모든 짝을 구하지 않아 빠르다).
 */
export function timeBetween(graph, fromId, toId) {
  const from = graph.index.get(fromId);
  const to = graph.index.get(toId);
  if (from === undefined || to === undefined) return null;
  if (from === to) return 0;
  const times = new Float64Array(graph.stations.length).fill(Infinity);
  times[from] = 0;
  const queue = new Heap();
  queue.push({ node: from, cost: 0 });
  while (queue.size > 0) {
    const { node, cost } = queue.pop();
    if (cost > times[node]) continue;
    if (node === to) return cost;
    for (const edge of graph.edges[node]) {
      const next = cost + edge.minutes;
      if (next < times[edge.to]) {
        times[edge.to] = next;
        queue.push({ node: edge.to, cost: next });
      }
    }
  }
  return Number.isFinite(times[to]) ? times[to] : null;
}
