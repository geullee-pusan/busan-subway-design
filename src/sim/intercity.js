// 고속·시외버스 배차(data/build/intercity.json) 계산. 순수 함수만 둔다.

/**
 * 한 터미널에서 지금 뒤로 떠나는 버스: 갈 곳마다 가장 먼저 떠나는 것.
 * @param {{terminals: object[], routes: Array<[number, number, string, Array<[number, number, number|null, number]>]>, grades: string[]}} data
 * @param {number} terminal 터미널 번호
 * @param {string} kind '고속' | '시외'
 * @param {number} afterMinute 이 시각(0시부터 분) 뒤
 * @returns {{to: number, dep: number, dur: number, fare: number|null, grade: string, later: number}[]} later: 그 뒤로 오늘 더 있는 배차 수
 */
export function nextDepartures(data, terminal, kind, afterMinute) {
  const out = [];
  for (const [from, to, k, trips] of data.routes) {
    if (from !== terminal || k !== kind) continue;
    const rest = trips.filter((t) => t[0] >= afterMinute);
    if (!rest.length) continue;
    const [dep, dur, fare, grade] = rest[0];
    out.push({ to, dep, dur, fare, grade: data.grades[grade] ?? '일반', later: rest.length - 1 });
  }
  return out.sort((a, b) => a.dep - b.dep || a.to - b.to);
}

/** 이 터미널에서 이 종류의 버스가 다니는가 */
export function servesKind(data, terminal, kind) {
  return data.routes.some(([from, , k]) => from === terminal && k === kind);
}

/**
 * 휴게소에 들르는 장면을 넣을까: 게임에서 정한 값(2시간 넘게 달리는 버스). 실제로 들르는지는 버스마다 다르다.
 * @param {number} durMinutes 걸리는 시간
 */
export const REST_STOP_AFTER_MIN = 120;
export function hasRestStop(durMinutes) {
  return durMinutes > REST_STOP_AFTER_MIN;
}
