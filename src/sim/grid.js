// 격자 계산. 순수 함수만 둔다(DOM, Math.random, 현재 시각 금지).
// 격자는 {cols, rows}이고, 칸 번호는 행 우선이다. 0번 칸이 북서쪽이다.

/** (열, 행) → 칸 번호 */
export function cellIndex(grid, col, row) {
  return row * grid.cols + col;
}

/** 칸 번호 → [열, 행] */
export function cellColRow(grid, index) {
  return [index % grid.cols, Math.floor(index / grid.cols)];
}

/** (열, 행)이 격자 안인가 */
export function inGrid(grid, col, row) {
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;
}

/** 위·아래·왼쪽·오른쪽 이웃 칸 번호. 격자 밖은 뺀다. 순서는 늘 위, 오른쪽, 아래, 왼쪽이다. */
export function neighbors4(grid, index) {
  const [col, row] = cellColRow(grid, index);
  const result = [];
  for (const [dc, dr] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    if (inGrid(grid, col + dc, row + dr)) result.push(cellIndex(grid, col + dc, row + dr));
  }
  return result;
}

/** 두 칸 가운데 사이의 곧은 거리(m) */
export function cellDistanceM(grid, a, b, cellSizeM = 1000) {
  const [ac, ar] = cellColRow(grid, a);
  const [bc, br] = cellColRow(grid, b);
  return Math.hypot(bc - ac, br - ar) * cellSizeM;
}

/** 행마다 나뉜 2차원 배열(grid.json 모양)을 칸 번호 순서의 1차원 배열로 편다. */
export function flattenRows(rows) {
  return rows.flat();
}
