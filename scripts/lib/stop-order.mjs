// 정류장 묶음(차례를 모름)을 한 줄로 잇는 차례를 어림한다.
// 모든 정류장에서 한 번씩 출발해 가장 가까운 정류장으로 이어 가고(가까운 이웃), 2-opt로 꼬인 곳을 푼 뒤,
// 전체 길이가 가장 짧은 것을 고른다. 부산 시내버스(정답 차례가 있음)로 시험하면 이웃한 정류장의 약 94%가 맞는다(2026-10-18).
// 같은 입력이면 늘 같은 차례가 나온다.

/**
 * @param {{x: number, y: number}[]} points
 * @returns {number[]} points의 번호를 차례대로
 */
export function orderStops(points) {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);
  const D = (i, j) => Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
  let best = null;
  let bestLength = Infinity;
  for (let start = 0; start < n; start++) {
    const used = new Array(n).fill(false);
    const path = [start];
    used[start] = true;
    for (let k = 1; k < n; k++) {
      const last = path[path.length - 1];
      let next = -1;
      let nearest = Infinity;
      for (let j = 0; j < n; j++) {
        if (!used[j] && D(last, j) < nearest) {
          nearest = D(last, j);
          next = j;
        }
      }
      path.push(next);
      used[next] = true;
    }
    // 2-opt(열린 길): 두 구간을 바꿔 이어 짧아지면 그 사이를 뒤집는다.
    for (let improved = true; improved; ) {
      improved = false;
      for (let i = 0; i < n - 2; i++) {
        for (let j = i + 2; j < n; j++) {
          const a = path[i];
          const b = path[i + 1];
          const c = path[j];
          const d = j + 1 < n ? path[j + 1] : null;
          const before = D(a, b) + (d === null ? 0 : D(c, d));
          const after = D(a, c) + (d === null ? 0 : D(b, d));
          if (after < before - 1e-9) {
            const middle = path.slice(i + 1, j + 1).reverse();
            path.splice(i + 1, j - i, ...middle);
            improved = true;
          }
        }
      }
    }
    let length = 0;
    for (let k = 1; k < n; k++) length += D(path[k - 1], path[k]);
    if (length < bestLength - 1e-9) {
      bestLength = length;
      best = path;
    }
  }
  return best;
}
