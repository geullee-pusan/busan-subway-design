// 기차역의 실제 모양(역 건물, 승강장, 승강장 지붕, 건너는 다리)을 지도 좌표(격자 칸, 1칸 = 1km)로 바꾼다.
// 자료: data/build/station-areas.json(OpenStreetMap, scripts/build-station-areas.mjs). 기차 3D 보기와 같은 자료다.
// 여행하기 지도와 걸어서 여행하기 지도가 함께 쓴다.
import stationAreas from '../../data/build/station-areas.json';

let cache = null;

/**
 * @returns {Array<{id: string, name: string, box: number[], facade: (string|null), buildings: Array<{ring: number[][], area: number}>,
 *   platforms: Array<{ring: number[][]}>, roofs: Array<number[][]>, bridges: Array<{line: number[][], width: number}>}>}
 *   box: [왼, 위, 오른, 아래](격자 칸 좌표)
 */
export function stationShapes() {
  if (cache) return cache;
  cache = [];
  for (const [id, s] of Object.entries(stationAreas.stations ?? {})) {
    const g = ([x, y]) => [s.origin[0] + x / 1000, s.origin[1] + y / 1000];
    const buildings = s.buildings.filter((b) => b.area >= 25).map((b) => ({ ring: b.ring.map(g), area: b.area }));
    const platforms = s.platforms
      .map((p) => {
        if (p.area) return { ring: p.shape.map(g) };
        // 선으로 그린 승강장은 폭만큼 부풀린다
        const w = (p.width ?? 4) / 2;
        const L = p.shape;
        if (L.length < 2) return null;
        const side = (sgn) =>
          L.map((q, i) => {
            const a = L[Math.max(0, i - 1)];
            const b = L[Math.min(L.length - 1, i + 1)];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len = Math.hypot(dx, dy) || 1;
            return g([q[0] - (dy / len) * w * sgn, q[1] + (dx / len) * w * sgn]);
          });
        return { ring: [...side(1), ...side(-1).reverse()] };
      })
      .filter(Boolean);
    const roofs = s.roofs.map((r) => r.ring.map(g));
    const bridges = s.bridges.map((b) => ({ line: b.line.map(g), width: Math.max(3.5, b.width ?? 4) }));
    if (!buildings.length && !platforms.length) continue;
    const pts = [...buildings.flatMap((b) => b.ring), ...platforms.flatMap((p) => p.ring)];
    const box = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    cache.push({ id, name: s.name, box, facade: s.look?.facade ?? null, buildings, platforms, roofs, bridges });
  }
  return cache;
}

/** 역 건물 지붕 색(겉모습 특징에 맞춰: 유리 커튼월은 푸른 회색, 한옥은 기와 회색, 나머지는 밝은 회색) */
export function stationRoofColor(facade, area) {
  if (facade === 'hanok') return '#5B5F66';
  if (facade === 'curtain' || area > 2500) return '#A9BBCB';
  return '#D9D2C4';
}
