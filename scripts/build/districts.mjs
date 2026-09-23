// 구·군 경계선과 바깥 경계(해안선)를 뽑는다.
// 행정동 경계의 변(선분)을 모두 모아, 양쪽 동의 시군구가 다르면 구·군 경계로,
// 한 번만 나오면 바깥 경계(바다 쪽)로 본다. 이어 붙여 선으로 만들고 간단하게 줄인다.

/** 점을 적게 줄인다(Douglas–Peucker). tolerance는 좌표 단위(m). */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let far = sq;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 선분들을 끝점끼리 이어 선으로 만든다. */
function chain(segments) {
  const ends = new Map();
  const add = (key, seg) => {
    if (!ends.has(key)) ends.set(key, []);
    ends.get(key).push(seg);
  };
  const key = (x, y) => `${x},${y}`;
  for (const seg of segments) {
    seg.used = false;
    add(key(seg.ax, seg.ay), seg);
    add(key(seg.bx, seg.by), seg);
  }
  const lines = [];
  for (const start of segments) {
    if (start.used) continue;
    start.used = true;
    let points = [
      [start.ax, start.ay],
      [start.bx, start.by],
    ];
    // 양쪽 끝으로 이어 간다.
    for (const forward of [true, false]) {
      for (;;) {
        const [x, y] = forward ? points.at(-1) : points[0];
        const next = (ends.get(key(x, y)) ?? []).find((s) => !s.used);
        if (!next) break;
        next.used = true;
        const other = next.ax === x && next.ay === y ? [next.bx, next.by] : [next.ax, next.ay];
        if (forward) points.push(other);
        else points.unshift(other);
      }
    }
    lines.push(points);
  }
  return lines;
}

/**
 * @param {{sggCode: string, sido: string, sgg: string, rings: Float64Array[], bbox: object}[]} dongs
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} box 격자 범위(m)
 * @param {{easting: number, northing: number}} origin 격자 왼쪽 위 모서리
 */
export function buildDistricts(dongs, box, origin, { toleranceM = 60, cellSizeM = 1000 } = {}) {
  const edges = new Map();
  for (const d of dongs) {
    for (const ring of d.rings) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = ring[j];
        const ay = ring[j + 1];
        const bx = ring[i];
        const by = ring[i + 1];
        if (ax === bx && ay === by) continue;
        const forward = ax < bx || (ax === bx && ay < by);
        const k = forward ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
        let e = edges.get(k);
        if (!e) {
          e = forward ? { ax, ay, bx, by, count: 0, codes: new Set() } : { ax: bx, ay: by, bx: ax, by: ay, count: 0, codes: new Set() };
          edges.set(k, e);
        }
        e.count++;
        e.codes.add(d.sggCode);
      }
    }
  }

  const margin = 2000;
  const inBox = (e) =>
    Math.max(e.ax, e.bx) >= box.minX - margin &&
    Math.min(e.ax, e.bx) <= box.maxX + margin &&
    Math.max(e.ay, e.by) >= box.minY - margin &&
    Math.min(e.ay, e.by) <= box.maxY + margin;

  const district = [];
  const outer = [];
  for (const e of edges.values()) {
    if (!inBox(e)) continue;
    if (e.codes.size > 1) district.push(e);
    else if (e.count === 1) outer.push(e);
  }

  const toGrid = (points) =>
    points.map(([x, y]) => [
      Math.round(((x - origin.easting) / cellSizeM) * 1000) / 1000,
      Math.round(((origin.northing - y) / cellSizeM) * 1000) / 1000,
    ]);
  const makeLines = (segments) =>
    chain(segments)
      .map((points) => toGrid(simplify(points, toleranceM)))
      .filter((points) => points.length >= 2);

  const names = new Map();
  for (const d of dongs) names.set(d.sggCode, `${d.sido} ${d.sgg}`);

  return {
    districts: [...names.entries()].sort().map(([code, name]) => ({ code, name })),
    boundaries: makeLines(district),
    coastline: makeLines(outer),
  };
}
