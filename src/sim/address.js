// "지금 있는 곳" 주소: 행정동 모양(data/build/dong-shapes.json)과 가까운 길 이름. 순수 함수만 둔다.

/**
 * dong-shapes.json을 푼다.
 * @param {{unit: number, dongs: {name: string, rings: number[][]}[]}} data
 * @returns {{name: string, rings: Array<Array<[number, number]>>, box: [number, number, number, number]}[]}
 */
export function decodeDongs(data) {
  return data.dongs.map((dong) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const rings = dong.rings.map((flat) => {
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
    return { name: dong.name, rings, box: [minX, minY, maxX, maxY] };
  });
}

/** 점이 고리 안에 있는가(짝홀 규칙) */
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 점이 들어 있는 행정동 이름("부산광역시 부산진구 부전2동"). 없으면(바다 등) null.
 * @param {{name: string, rings: Array<Array<[number, number]>>, box: number[]}[]} dongs
 * @param {{x: number, y: number}} point
 */
export function dongAt(dongs, point) {
  for (const dong of dongs) {
    const [x0, y0, x1, y1] = dong.box;
    if (point.x < x0 || point.x > x1 || point.y < y0 || point.y > y1) continue;
    if (dong.rings.some((ring) => inRing(ring, point.x, point.y))) return dong.name;
  }
  return null;
}
