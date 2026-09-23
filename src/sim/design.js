// 새 노선 설계 계산(docs/SPEC.md 5.2, 6장). 순수 함수만 둔다.
//
// 설계는 이렇게 생겼다.
//   { path: [칸 번호...], stations: [칸 번호...], kind: '지하철'|'경전철', trainsPerHour: 6|8|10|12 }
// 길은 칸을 따라 위·아래·왼쪽·오른쪽으로만 잇는다. 한 칸은 1km다.

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
 * 공사비(억 원). 구간마다 두 칸의 지형 계수를 평균 내어 쓴다.
 * 역은 한 곳마다 정해진 값이고, 이미 역이 있는 칸이면 두 배다(환승역).
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

  const byTerrain = {};
  for (const segment of segments) {
    byTerrain[segment.terrain] = (byTerrain[segment.terrain] ?? 0) + segment.cost;
  }
  return {
    segments,
    stations,
    lineCost,
    stationCost,
    total: lineCost + stationCost,
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
  if (offPath.length > 0) problems.push('역은 선 위에만 놓을 수 있어요.');
  return { ok: problems.length === 0, problems };
}
