// 기차 3D 보기에 쓰는 계산. 순수 함수만 둔다(그리기는 src/ui/train-3d.js).
// 좌표는 격자 칸 단위(1칸 = 1km)다. 높이는 미터다.

/** 바다 칸 바닥 높이(미터). 물 높이(0)보다 조금 낮게 둔다. */
export const SEA_FLOOR_M = -6;

/**
 * 한 칸의 높이(미터). 고도가 없으면 바다는 SEA_FLOOR_M, 나머지는 0으로 본다.
 * @param {{elevationM: (number|null)[][], terrain: string[][], cols: number, rows: number}} grid
 */
export function cellHeight(grid, col, row) {
  const c = Math.max(0, Math.min(grid.cols - 1, col));
  const r = Math.max(0, Math.min(grid.rows - 1, row));
  const terrain = grid.terrain[r]?.[c];
  if (terrain === 'sea') return SEA_FLOOR_M;
  const h = grid.elevationM[r]?.[c];
  return typeof h === 'number' ? h : 0;
}

/**
 * 한 점의 땅 높이(미터). 칸 가운데의 높이 사이를 겹선형으로 잇는다.
 * @param {number} x 격자 칸 좌표(동쪽으로 커진다)
 * @param {number} y 격자 칸 좌표(남쪽으로 커진다)
 */
export function groundAt(grid, x, y) {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const tx = fx - c0;
  const ty = fy - r0;
  const h00 = cellHeight(grid, c0, r0);
  const h10 = cellHeight(grid, c0 + 1, r0);
  const h01 = cellHeight(grid, c0, r0 + 1);
  const h11 = cellHeight(grid, c0 + 1, r0 + 1);
  return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
}

/** 칸 종류(격자 밖은 'sea') */
export function terrainAt(grid, x, y) {
  return grid.terrain[Math.floor(y)]?.[Math.floor(x)] ?? 'sea';
}

/**
 * 선로 모양을 stepKm마다 다시 찍고, 점마다 땅 높이와 선로 높이를 정한다.
 * 선로 높이는 앞뒤 smoothKm 안의 땅 높이를 고르게 한 값이다(선로는 땅처럼 오르내리지 않는다).
 * 땅이 선로보다 tunnelM 넘게 높으면 터널, 선로가 땅보다 bridgeM 넘게 높으면 다리로 본다.
 * @param {Array<[number, number]>} points 격자 칸 좌표
 * @returns {{x: number[], y: number[], s: number[], ground: number[], track: number[], tunnel: boolean[], bridge: boolean[], lengthKm: number}}
 */
export function routeProfile(grid, points, { stepKm = 0.05, smoothKm = 1.2, tunnelM = 25, bridgeM = 6 } = {}) {
  const x = [];
  const y = [];
  const s = [];
  if (!points || points.length === 0) return { x, y, s, ground: [], track: [], tunnel: [], bridge: [], lengthKm: 0 };
  let total = 0;
  x.push(points[0][0]);
  y.push(points[0][1]);
  s.push(0);
  let carry = 0;
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    let d = stepKm - carry;
    while (d <= len + 1e-9) {
      const t = d / len;
      x.push(x0 + (x1 - x0) * t);
      y.push(y0 + (y1 - y0) * t);
      s.push(total + d);
      d += stepKm;
    }
    carry = len - (d - stepKm);
    total += len;
  }
  const last = points.at(-1);
  if (s.at(-1) < total - 1e-6) {
    x.push(last[0]);
    y.push(last[1]);
    s.push(total);
  }
  const ground = x.map((_, i) => groundAt(grid, x[i], y[i]));
  // 고르게: 앞뒤 smoothKm 안의 평균(누적 합으로). 물 위에서는 물보다 낮아지지 않게 한다.
  const n = ground.length;
  const prefix = [0];
  for (const g of ground) prefix.push(prefix.at(-1) + g);
  const track = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (s[lo] < s[i] - smoothKm) lo += 1;
    while (hi + 1 < n && s[hi + 1] <= s[i] + smoothKm) hi += 1;
    track.push(Math.max(3, (prefix[hi + 1] - prefix[lo]) / (hi + 1 - lo)));
  }
  const tunnel = tidyRuns(
    ground.map((g, i) => g - track[i] > tunnelM),
    s,
    { gapKm: 0.4, minKm: 0.3 },
  );
  const bridge = ground.map((g, i) => track[i] - g > bridgeM);
  return { x, y, s, ground, track, tunnel, bridge, lengthKm: total };
}

/**
 * 참인 토막을 다듬는다: 사이가 gapKm보다 짧으면 잇고, 그다음 minKm보다 짧은 토막은 지운다.
 * (터널이 깜빡이듯 짧게 나왔다 사라지지 않게)
 * @param {boolean[]} flags
 * @param {number[]} s 점마다 거리(km)
 */
export function tidyRuns(flags, s, { gapKm, minKm }) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  const merged = [];
  for (const run of runs) {
    const prev = merged.at(-1);
    if (prev && s[run[0]] - s[prev[1]] < gapKm) prev[1] = run[1];
    else merged.push([...run]);
  }
  const out = flags.map(() => false);
  for (const [a, b] of merged) {
    if (s[b] - s[a] < minKm) continue;
    for (let i = a; i <= b; i++) out[i] = true;
  }
  return out;
}

/**
 * 선로 위 km 지점의 자리, 높이, 방향.
 * @returns {{x: number, y: number, h: number, dx: number, dy: number, tunnel: boolean}} dx, dy는 가는 방향(길이 1)
 */
export function pointAt(profile, km) {
  const { s, x, y, track, tunnel } = profile;
  const n = s.length;
  if (n === 0) return { x: 0, y: 0, h: 0, dx: 1, dy: 0, tunnel: false };
  if (n === 1) return { x: x[0], y: y[0], h: track[0], dx: 1, dy: 0, tunnel: tunnel[0] };
  const k = Math.max(0, Math.min(profile.lengthKm, km));
  // 이분 찾기
  let a = 0;
  let b = n - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (s[m] <= k) a = m;
    else b = m;
  }
  const span = s[b] - s[a] || 1;
  const t = Math.max(0, Math.min(1, (k - s[a]) / span));
  const ddx = x[b] - x[a];
  const ddy = y[b] - y[a];
  const len = Math.hypot(ddx, ddy) || 1;
  return {
    x: x[a] + ddx * t,
    y: y[a] + ddy * t,
    h: track[a] + (track[b] - track[a]) * t,
    dx: ddx / len,
    dy: ddy / len,
    tunnel: t < 0.5 ? tunnel[a] : tunnel[b],
  };
}

/**
 * 시간 비율(0~1) → 간 거리 비율(0~1). 빠르기 함수를 쌓아(적분해) 만든다.
 * 빨라지고 느려지는 동안 기차가 덜 가는 것을 그림에 맞춘다.
 * @param {(t: number) => number} speedAt t → km/h
 * @returns {(t: number) => number}
 */
export function distanceFraction(speedAt, samples = 200) {
  const cum = [0];
  for (let i = 1; i <= samples; i++) {
    const v0 = Math.max(0, speedAt((i - 1) / samples));
    const v1 = Math.max(0, speedAt(i / samples));
    cum.push(cum[i - 1] + (v0 + v1) / 2);
  }
  const total = cum[samples];
  if (!(total > 0)) return (t) => Math.max(0, Math.min(1, t));
  return (t) => {
    const u = Math.max(0, Math.min(1, t)) * samples;
    const i = Math.min(samples - 1, Math.floor(u));
    const f = u - i;
    return (cum[i] + (cum[i + 1] - cum[i]) * f) / total;
  };
}

/**
 * 칸마다 정해지는 0 이상 1 미만의 수(같은 칸은 늘 같은 값). 건물과 나무 자리에 쓴다.
 */
export function cellNoise(col, row, salt = 0) {
  let h = (Math.imul(col | 0, 73856093) ^ Math.imul(row | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
