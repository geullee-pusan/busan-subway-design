// 걷기. 순수 함수만 둔다.
// 길이 굽어서 곧은 거리보다 조금 더 걷고, 언덕에서는 더 느리다(docs/SPEC.md 5.2, 5.5).

/** 두 점 사이 곧은 거리(km). 점은 {x, y}이고 칸 단위(1칸 = 1km)다. */
export function straightKm(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 걷는 시간(분). SPEC 5.5-2: 시속 4km에 지형 계수를 곱한다. 우회 계수는 버스에만 쓴다.
 * @param {number} km 곧은 거리
 * @param {{walkSpeedKmh: number, walkHill: number}} rules
 * @param {boolean} hilly 언덕이면 true
 */
export function walkMinutes(km, rules, hilly = false) {
  const hill = hilly ? rules.walkHill : 1;
  return (km / rules.walkSpeedKmh) * 60 * hill;
}

/**
 * 한 점에서 가까운 역 몇 개를 걷는 시간과 함께 찾는다.
 * @param {{x: number, y: number, hilly?: boolean}} point
 * @param {{id: string, x: number, y: number}[]} stations
 * @param {object} rules walkSpeedKmh, walkDetour, walkHill, walkMaxMin, accessStations
 * @returns {{station: object, walkMin: number}[]} 걷는 시간이 짧은 순서
 */
export function nearbyStations(point, stations, rules) {
  const found = [];
  const maxKm = (rules.walkMaxMin / 60) * rules.walkSpeedKmh;
  for (const station of stations) {
    const km = straightKm(point, station);
    if (km > maxKm) continue;
    const walkMin = walkMinutes(km, rules, point.hilly);
    if (walkMin <= rules.walkMaxMin) found.push({ station, walkMin });
  }
  found.sort((a, b) => a.walkMin - b.walkMin || (a.station.id < b.station.id ? -1 : 1));
  return found.slice(0, rules.accessStations);
}
