// 설계 화면의 역 정보. 순수 함수만 둔다.
// 새 역 둘레에 사는 사람과 가까운 중심지를 세고, 예상 승객을 부산의 다른 역과 견준 단계로 바꾼다.
// 걷는 시간은 모델과 같은 규칙으로 잰다(src/sim/walk.js: 시속, 언덕 계수, 걸어갈 수 있는 시간).
import { straightKm, walkMinutes } from './walk.js';

/** 예상 승객 단계 수(사람 아이콘 개수) */
export const RIDER_LEVELS = 5;

/**
 * 역 하나의 둘레를 센다.
 * @param {object} p
 * @param {{x: number, y: number}} p.point 새 역 자리(칸 단위, 1칸 = 1km)
 * @param {{x: number, y: number, population: number, hilly?: boolean}[]} p.zones 사람이 사는 칸
 * @param {{x: number, y: number}[]} p.existing 이미 있는 역
 * @param {{x: number, y: number}[]} [p.others] 같이 설계한 다른 새 역
 * @param {{name: string, x: number, y: number, hilly?: boolean}[]} p.centers 중심지
 * @param {{walkSpeedKmh: number, walkHill: number, walkMaxMin: number}} p.rules
 * @returns {{
 *   walkPeople: number,
 *   closestPeople: number,
 *   newPeople: number,
 *   places: {name: string, walkMin: number}[]
 * }}
 *   walkPeople: 걸어서 올 수 있는 곳에 사는 사람
 *   closestPeople: 그 가운데 이 역이 가장 가까운 사람(다른 역과 똑같이 가까우면 넣는다)
 *   newPeople: 그 가운데 원래는 걸어갈 역이 없던 사람
 *   places: 걸어서 갈 수 있는 중심지(가까운 순서)
 */
export function stationSurroundings({ point, zones, existing, others = [], centers, rules }) {
  const maxKm = (rules.walkMaxMin / 60) * rules.walkSpeedKmh;
  const reach = (from, to) => {
    const km = straightKm(from, to);
    if (km > maxKm) return Infinity;
    const minutes = walkMinutes(km, rules, from.hilly);
    return minutes <= rules.walkMaxMin ? minutes : Infinity;
  };

  let walkPeople = 0;
  let closestPeople = 0;
  let newPeople = 0;
  for (const zone of zones) {
    const mine = reach(zone, point);
    if (mine === Infinity) continue;
    walkPeople += zone.population;
    let bestOld = Infinity;
    for (const station of existing) bestOld = Math.min(bestOld, reach(zone, station));
    let best = bestOld;
    for (const station of others) best = Math.min(best, reach(zone, station));
    if (mine <= best) closestPeople += zone.population;
    if (bestOld === Infinity) newPeople += zone.population;
  }

  const places = centers
    .map((center) => ({ name: center.name, walkMin: reach(center, point) }))
    .filter((place) => place.walkMin !== Infinity)
    .sort((a, b) => a.walkMin - b.walkMin || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { walkPeople, closestPeople, newPeople, places };
}

/**
 * 예상 승객을 부산의 다른 역과 견준 단계(1~5)로 바꾼다. 타는 사람이 없으면 0이다.
 * 다른 역 가운데 이 역보다 적은 역이 얼마나 되는지로 정한다(5등분).
 * @param {number} value 이 역의 하루 승객(탄 사람 + 내린 사람)
 * @param {number[]} references 다른 역들의 하루 승객
 */
export function riderLevel(value, references) {
  if (!(value > 0)) return 0;
  if (references.length === 0) return 1;
  const below = references.filter((other) => other < value).length;
  return Math.min(RIDER_LEVELS, 1 + Math.floor((below / references.length) * RIDER_LEVELS));
}
