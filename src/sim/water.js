// 강과 호수 모양(data/build/water-shapes.json)을 다루는 계산. 순수 함수만 둔다. 좌표는 격자 좌표(km).

/**
 * @param {{unit: number, water: Array<{name?: string, rings: number[][]}>}} data
 * @returns {Array<{name: string|null, rings: Array<Array<[number, number]>>, box: [number, number, number, number]}>}
 */
export function decodeWater(data) {
  return data.water.map((item) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const rings = item.rings.map((flat) => {
      const ring = [];
      let x = 0;
      let y = 0;
      for (let k = 0; k < flat.length; k += 2) {
        x += flat[k];
        y += flat[k + 1];
        const px = x * data.unit;
        const py = y * data.unit;
        ring.push([px, py]);
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return ring;
    });
    return { name: item.name ?? null, rings, box: [minX, minY, maxX, maxY] };
  });
}

/** 네모 칸과 겹치는 수면만 */
export function waterInBox(list, left, top, right, bottom) {
  return list.filter(({ box }) => box[2] >= left && box[0] <= right && box[3] >= top && box[1] <= bottom);
}

/** 점이 물 위에 있는지(고리를 짝수-홀수 규칙으로 본다. 강 가운데 섬은 물이 아니다) */
export function waterAt(list, point) {
  for (const { rings, box } of list) {
    if (point.x < box[0] || point.x > box[2] || point.y < box[1] || point.y > box[3]) continue;
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}
