// 새 노선 설계 계산(docs/SPEC.md 5.2, 6장). 순수 함수만 둔다.
//
// 설계는 이렇게 생겼다.
//   { path: [칸 번호...], stations: [칸 번호...], kind: '지하철'|'경전철', trainsPerHour: 6|8|10|12 }
// 길은 칸을 따라 위·아래·왼쪽·오른쪽으로만 잇는다. 한 칸은 1km다.
// 역은 길 밖에도 놓을 수 있다(떨어진 역). connectStations가 떨어진 역을 길의 끝에 잇는다.

/** 위, 오른쪽, 아래, 왼쪽 */
export const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export const TRAINS_PER_HOUR = [6, 8, 10, 12];

/** 칸 번호 → [열, 행] */
export function cellOf(grid, index) {
  return [index % grid.cols, Math.floor(index / grid.cols)];
}

/** [열, 행] → 칸 번호 */
export function indexOf(grid, col, row) {
  return row * grid.cols + col;
}

/** 두 칸이 위·아래·왼쪽·오른쪽으로 붙어 있는가 */
export function isNextTo(grid, a, b) {
  const [ac, ar] = cellOf(grid, a);
  const [bc, br] = cellOf(grid, b);
  return Math.abs(ac - bc) + Math.abs(ar - br) === 1;
}

/**
 * 길에 칸을 더한다. 더할 수 없으면 원래 길을 그대로 돌려준다.
 * 바로 앞 칸을 다시 누르면 한 칸 지운다.
 */
export function extendPath(grid, path, cell) {
  if (path.length === 0) return [cell];
  const last = path.at(-1);
  if (cell === last) return path;
  if (path.length >= 2 && cell === path.at(-2)) return path.slice(0, -1);
  if (path.includes(cell)) return path; // 같은 칸을 두 번 지나지 않는다
  if (!isNextTo(grid, last, cell)) return path;
  return [...path, cell];
}

/** 칸의 지형 */
export function terrainAt(grid, index) {
  const [col, row] = cellOf(grid, index);
  return grid.terrain[row][col];
}

/** 지형 계수 */
export function terrainFactor(grid, index, tables) {
  return tables.terrainCost[terrainAt(grid, index)]?.factor ?? 1;
}

/**
 * 버스 노선에 필요한 버스 대수. 한 바퀴(갔다 오기) 도는 시간 동안 배차 간격마다 한 대씩 떠나야 한다.
 * @returns {{buses: number, roundTripMin: number, headwayMin: number, cost: number}} cost는 억 원
 */
export function busFleet(design, tables, rules) {
  const kind = tables.lineKinds[design.kind] ?? tables.lineKinds['버스'];
  const km = Math.max(0, design.path.length - 1);
  const roundTripMin = ((2 * km) / kind.speedKmh) * 60;
  const headwayMin = 60 / design.trainsPerHour;
  const buses = km === 0 ? 0 : Math.max(1, Math.ceil(roundTripMin / headwayMin - 1e-9));
  return { buses, roundTripMin, headwayMin, cost: buses * (rules.busPrice100M ?? 0) };
}

/**
 * 공사비(억 원). 구간마다 두 칸의 지형 계수를 평균 내어 쓴다.
 * 역은 한 곳마다 정해진 값이고, 이미 역이 있는 칸이면 두 배다(환승역).
 * 버스 노선은 선과 정류장 공사비가 없고(costFactor 0), 버스 대수만큼 버스 값이 든다(busFleet).
 */
export function designCost(design, grid, rules, tables, existingStationCells = new Set()) {
  const kind = tables.lineKinds[design.kind] ?? tables.lineKinds['경전철'];
  const segments = [];
  for (let i = 0; i + 1 < design.path.length; i++) {
    const from = design.path[i];
    const to = design.path[i + 1];
    const factor = (terrainFactor(grid, from, tables) + terrainFactor(grid, to, tables)) / 2;
    const cost = rules.costPerKm100M * factor * kind.costFactor;
    segments.push({ from, to, km: 1, factor: Math.round(factor * 100) / 100, cost, terrain: terrainAt(grid, to) });
  }
  const stations = design.stations.map((cell) => {
    const transfer = existingStationCells.has(cell);
    return {
      cell,
      transfer,
      cost: rules.costPerStation100M * kind.costFactor * (transfer ? rules.transferStationCost : 1),
    };
  });
  const lineCost = segments.reduce((sum, s) => sum + s.cost, 0);
  const stationCost = stations.reduce((sum, s) => sum + s.cost, 0);
  const fleet = design.kind === '버스' ? busFleet(design, tables, rules) : null;
  const vehicleCost = fleet ? fleet.cost : 0;

  const byTerrain = {};
  for (const segment of segments) {
    byTerrain[segment.terrain] = (byTerrain[segment.terrain] ?? 0) + segment.cost;
  }
  return {
    segments,
    stations,
    lineCost,
    stationCost,
    vehicleCost,
    buses: fleet ? fleet.buses : 0,
    total: lineCost + stationCost + vehicleCost,
    byTerrain,
    lengthKm: Math.max(0, design.path.length - 1),
  };
}

/**
 * 역 사이 거리와 시간. 시간은 노선 종류의 표정속도(정차시간이 들어 있는 속도)로 잰다.
 * @returns {{from: number, to: number, km: number, meters: number, seconds: number}[]}
 */
export function stationGaps(design, grid, tables) {
  const kind = tables.lineKinds[design.kind] ?? tables.lineKinds['경전철'];
  const order = design.path.map((cell, i) => ({ cell, i })).filter(({ cell }) => design.stations.includes(cell));
  const gaps = [];
  for (let i = 0; i + 1 < order.length; i++) {
    const km = order[i + 1].i - order[i].i;
    gaps.push({
      from: order[i].cell,
      to: order[i + 1].cell,
      km,
      meters: km * 1000,
      seconds: Math.round((km / kind.speedKmh) * 3600),
    });
  }
  return gaps;
}

/** 배차 간격. 나눗셈 그대로 보여 준다: "60분 ÷ 8대 = 7분 30초" */
export function headway(trainsPerHour) {
  const minutes = Math.floor(60 / trainsPerHour);
  const seconds = Math.round((60 / trainsPerHour - minutes) * 60);
  return { minutes, seconds, totalMinutes: 60 / trainsPerHour, trainsPerHour };
}

/** 설계가 쓸 만한지 본다. */
export function checkDesign(design) {
  const problems = [];
  if (design.path.length < 2) problems.push('선을 두 칸 이상 그어요.');
  if (design.stations.length < 2) problems.push('역을 두 개 이상 놓아요.');
  const offPath = design.stations.filter((cell) => !design.path.includes(cell));
  if (offPath.length > 0) problems.push('선로로 잇지 않은 역이 있어요. 역 잇기를 눌러요.');
  return { ok: problems.length === 0, problems };
}

/** 칸 가운데 점에서 선분 a–b까지 거리(칸) */
function distanceToSegment(grid, cell, a, b) {
  const [x, y] = cellOf(grid, cell);
  const [ax, ay] = cellOf(grid, a);
  const [bx, by] = cellOf(grid, b);
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** 곧은 길에 가까운 쪽을 고르는 아주 작은 값. 공사비가 같은 길끼리만 가른다. */
const STRAIGHT_BIAS = 0.001;

/**
 * 두 칸 사이에서 공사비가 가장 적게 드는 길(칸 목록, from과 to를 넣는다). 길이 없으면 null.
 * 공사비가 같으면 두 칸을 잇는 곧은 선에 가까운 길을 고른다. 그래도 같으면 칸 번호가 작은 쪽(늘 같은 결과).
 * @param {Set<number>} blocked 지나갈 수 없는 칸(이미 그은 길)
 */
export function cheapestRoute(grid, from, to, tables, blocked = new Set()) {
  const size = grid.cols * grid.rows;
  const cost = new Float64Array(size).fill(Infinity);
  const previous = new Int32Array(size).fill(-1);
  const done = new Uint8Array(size);
  // 작은 이진 힙: [비용, 칸]
  const heap = [];
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  cost[from] = 0;
  push([0, from]);
  while (heap.length > 0) {
    const [c, cell] = pop();
    if (done[cell]) continue;
    done[cell] = 1;
    if (cell === to) break;
    const [col, row] = cellOf(grid, cell);
    for (const [dc, dr] of DIRECTIONS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const next = indexOf(grid, nc, nr);
      if (done[next] || (blocked.has(next) && next !== to)) continue;
      const step =
        (terrainFactor(grid, cell, tables) + terrainFactor(grid, next, tables)) / 2 +
        STRAIGHT_BIAS * distanceToSegment(grid, next, from, to);
      const total = c + step;
      if (total < cost[next] || (total === cost[next] && cell < previous[next])) {
        cost[next] = total;
        previous[next] = cell;
        push([total, next]);
      }
    }
  }
  if (cost[to] === Infinity) return null;
  const route = [to];
  while (route.at(-1) !== from) route.push(previous[route.at(-1)]);
  return route.reverse();
}

/**
 * 떨어진 역(길 위에 없는 역)을 선로로 잇는다.
 *  1. 길이 없으면 처음 놓은 떨어진 역에서 시작한다.
 *  2. 떨어진 역 가운데 길의 끝(뒤 끝, 앞 끝)과 가장 가까운 역부터 그 끝에 잇는다.
 *     거리가 같으면 먼저 놓은 역, 그다음 뒤 끝.
 *  3. 끝과 역 사이는 공사비가 가장 적게 드는 길로 잇는다(cheapestRoute). 이미 그은 길은 지나지 않는다.
 * @returns {{path: number[], missed: number[]}} missed는 길을 찾지 못한 역
 */
export function connectStations(grid, design, tables) {
  let path = [...design.path];
  const missed = [];
  const looseOf = () => design.stations.filter((cell) => !path.includes(cell) && !missed.includes(cell));
  if (path.length === 0) {
    const first = looseOf()[0];
    if (first === undefined) return { path, missed };
    path = [first];
  }
  for (let loose = looseOf(); loose.length > 0; loose = looseOf()) {
    const ends = path.length === 1 ? [{ side: 'tail', cell: path[0] }] : [
      { side: 'tail', cell: path.at(-1) },
      { side: 'head', cell: path[0] },
    ];
    const options = [];
    for (const [order, station] of loose.entries()) {
      for (const [sideOrder, end] of ends.entries()) {
        const [ac, ar] = cellOf(grid, end.cell);
        const [bc, br] = cellOf(grid, station);
        options.push({ station, end, distance: Math.hypot(ac - bc, ar - br), order, sideOrder });
      }
    }
    options.sort((a, b) => a.distance - b.distance || a.order - b.order || a.sideOrder - b.sideOrder);
    const station = options[0].station;
    // 가까운 끝부터 해 보고, 길이 없으면 다른 끝으로 한다.
    const tries = options.filter((option) => option.station === station);
    let joined = false;
    for (const { end } of tries) {
      const route = cheapestRoute(grid, end.cell, station, tables, new Set(path));
      if (!route) continue;
      path = end.side === 'tail' ? [...path, ...route.slice(1)] : [...route.slice(1).reverse(), ...path];
      joined = true;
      break;
    }
    if (!joined) missed.push(station);
  }
  return { path, missed };
}
