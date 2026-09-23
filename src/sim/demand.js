// 이동 만들기와 타는 사람 정하기. 순수 함수만 둔다(docs/SPEC.md 5.5).

/**
 * 중심지에 가고 싶은 마음의 크기. 중심지가 클수록 크고, 멀수록 작다(중력 모델).
 * @param {{size: number}} center
 * @param {number} km 곧은 거리
 * @param {{centerPower: number, decayKm: number}} rules
 */
export function centerWeight(center, km, rules) {
  return center.size ** rules.centerPower * Math.exp(-km / rules.decayKm);
}

/**
 * 도시철도를 타는 사람의 비율.
 * 버스보다 10분 빠르면 10명 중 약 4명이 탄다(기본값 기준).
 * @param {number} busMin 버스로 걸리는 시간(분)
 * @param {number} railMin 도시철도로 걸리는 시간(분)
 */
export function boardingShare(busMin, railMin, rules) {
  const value = rules.boardBase + rules.boardSlope * (busMin - railMin);
  return Math.min(rules.boardMax, Math.max(0, value));
}

/**
 * 버스·자동차로 걸리는 시간(분). 곧은 거리에 우회 계수를 곱하고 속도로 나눈 뒤,
 * 정류장까지 걷고 기다리는 시간을 더한다(도시철도도 걷기와 기다리기를 세기 때문에 공평하게 센다).
 * @param {number} km 곧은 거리
 * @param {boolean} outer 출발과 도착이 모두 바깥 동네면 true
 */
export function busMinutes(km, rules, outer = false) {
  const speed = outer ? rules.busSpeedOuterKmh : rules.busSpeedCityKmh;
  return (rules.busWaitMin ?? 0) + ((km * rules.walkDetour) / speed) * 60;
}

/** 하루 이동 수. 칸에 사는 사람 수에 하루 이동 횟수를 곱한다(왕복 한 번을 1로 센다). */
export function zoneTrips(population, rules) {
  return population * rules.tripsPerDay;
}
