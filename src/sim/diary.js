// 여행 일기: 걸어서 여행하기에서 지나온 길(자취)을 모으고, 한 장 그림에 담을 범위를 정한다. 순수 함수만 둔다.
// 자취는 조각 목록이다: [{kind: '걷기'|'지하철'|'버스'|'기차'|'택시', pts: [[x, y], ...]}]. 좌표는 격자 좌표(km).

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 자취에 점 하나를 더한다(새 자취를 돌려준다). 같은 종류가 이어지면 그 조각에 붙이고,
 * 마지막 점에서 minKm보다 가까우면 더하지 않는다.
 * @param {{kind: string, pts: number[][]}[]} track
 * @param {string} kind
 * @param {{x: number, y: number}} point
 */
export function appendPoint(track, kind, point, minKm = 0.02) {
  const p = [round3(point.x), round3(point.y)];
  const last = track.at(-1);
  if (last && last.kind === kind) {
    const q = last.pts.at(-1);
    if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < minKm) return track;
    return [...track.slice(0, -1), { kind, pts: [...last.pts, p] }];
  }
  // 새 조각은 앞 조각의 끝에서 시작해 끊기지 않게 한다
  const start = last?.pts.at(-1);
  return [...track, { kind, pts: start && (start[0] !== p[0] || start[1] !== p[1]) ? [start, p] : [p] }];
}

/**
 * 탄 것 한 조각(지하철·버스·기차·택시)을 통째로 더한다.
 * @param {number[][]} pts 지나간 점들
 */
export function appendRide(track, kind, pts) {
  if (!pts.length) return track;
  return [...track, { kind, pts: thinPoints(pts.map(([x, y]) => [round3(x), round3(y)]), 200) }];
}

/** 점이 너무 많으면 고르게 덜어 낸다(처음과 끝은 남긴다) */
export function thinPoints(pts, maxPoints) {
  if (pts.length <= maxPoints) return pts;
  const step = (pts.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => pts[Math.round(i * step)]);
}

/** 저장할 때 자취 전체가 너무 길지 않게: 조각마다 점 수를 줄인다 */
export function compactTrack(track, maxTotal = 3000) {
  const total = track.reduce((s, seg) => s + seg.pts.length, 0);
  if (total <= maxTotal) return track;
  const ratio = maxTotal / total;
  return track.map((seg) => ({ kind: seg.kind, pts: thinPoints(seg.pts, Math.max(2, Math.floor(seg.pts.length * ratio))) }));
}

/**
 * 그림에 담을 범위: 자취와 더 넣을 점들(랜드마크 등)을 모두 담고 둘레를 조금 띄운다.
 * 너무 좁으면 minSpan(km)까지 넓힌다.
 * @returns {{x0: number, y0: number, x1: number, y1: number} | null}
 */
export function trackBounds(track, extra = [], padRatio = 0.08, minSpan = 0.6) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x, y) => {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  for (const seg of track) for (const [x, y] of seg.pts) take(x, y);
  for (const p of extra) take(p.x, p.y);
  if (!Number.isFinite(x0)) return null;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = Math.max(minSpan, (x1 - x0) * (1 + padRatio * 2));
  const h = Math.max(minSpan, (y1 - y0) * (1 + padRatio * 2));
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}
