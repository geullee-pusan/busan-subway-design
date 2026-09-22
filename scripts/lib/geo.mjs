// 다각형 도구. 좌표는 평면 좌표(m)를 [x0, y0, x1, y1, ...] 모양의 Float64Array 고리로 다룬다.

/** GeoJSON Polygon/MultiPolygon을 투영해 고리 배열로 바꾼다. */
export function projectGeometry(geometry, project) {
  let polygons = [];
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
  const rings = [];
  for (const polygon of polygons) {
    for (const ring of polygon) rings.push(projectRing(ring, project));
  }
  return rings;
}

/** [[경도, 위도], ...] 고리 하나를 투영한다. */
export function projectRing(ring, project) {
  const flat = new Float64Array(ring.length * 2);
  for (let k = 0; k < ring.length; k++) {
    const [x, y] = project(ring[k][0], ring[k][1]);
    flat[2 * k] = x;
    flat[2 * k + 1] = y;
  }
  return flat;
}

/** 고리들을 모두 감싸는 상자 {minX, minY, maxX, maxY} */
export function ringsBBox(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < minX) minX = ring[i];
      if (ring[i] > maxX) maxX = ring[i];
      if (ring[i + 1] < minY) minY = ring[i + 1];
      if (ring[i + 1] > maxY) maxY = ring[i + 1];
    }
  }
  return { minX, minY, maxX, maxY };
}

/** 두 상자가 겹치는지 */
export function bboxOverlaps(a, b) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * 짝홀 규칙으로 점이 고리들 안에 있는지 판정한다.
 * 한 도형의 바깥 고리와 구멍 고리를 함께 넘기면 구멍 안의 점은 밖으로 나온다.
 */
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** 고리 넓이(m²). 방향과 상관없이 양수다. */
export function ringArea(ring) {
  let sum = 0;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    sum += (ring[j] - ring[i]) * (ring[j + 1] + ring[i + 1]);
  }
  return Math.abs(sum) / 2;
}

/**
 * OSM way 조각들을 끝점끼리 이어 고리로 만든다.
 * 조각은 [[경도, 위도], ...] 배열이다. 결과는 {coords, closed} 배열이다.
 */
export function assembleRings(segments) {
  const key = (p) => `${p[0]},${p[1]}`;
  const pending = segments.filter((s) => s.length >= 2).map((s) => s.slice());
  const rings = [];
  while (pending.length > 0) {
    let ring = pending.shift();
    while (key(ring[0]) !== key(ring[ring.length - 1])) {
      const endKey = key(ring[ring.length - 1]);
      const startKey = key(ring[0]);
      let idx = pending.findIndex((s) => key(s[0]) === endKey || key(s[s.length - 1]) === endKey);
      if (idx !== -1) {
        const s = pending.splice(idx, 1)[0];
        ring = key(s[0]) === endKey ? ring.concat(s.slice(1)) : ring.concat(s.slice(0, -1).reverse());
        continue;
      }
      idx = pending.findIndex((s) => key(s[0]) === startKey || key(s[s.length - 1]) === startKey);
      if (idx !== -1) {
        const s = pending.splice(idx, 1)[0];
        ring = key(s[s.length - 1]) === startKey ? s.slice(0, -1).concat(ring) : s.slice(1).reverse().concat(ring);
        continue;
      }
      break;
    }
    rings.push({ coords: ring, closed: key(ring[0]) === key(ring[ring.length - 1]) });
  }
  return rings;
}

/** 평면 두 점 사이 거리(m) */
export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
