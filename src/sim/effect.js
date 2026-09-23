// 새 노선이 무엇을 바꿨는지 센다. 순수 함수만 둔다.
// "빨라진 사람"은 새 노선 덕분에 도시철도로 가는 시간이 줄어든 사람이다.

import { NEW_LINE_ID } from './design-world.js';

/** 이만큼(분) 넘게 줄어야 "빨라졌다"고 센다. */
const FASTER_MIN = 0.5;

/**
 * @param {object} before 노선을 그리기 전 결과(runDay)
 * @param {object} after 노선을 그린 뒤 결과(runDay)
 */
export function compareRuns(before, after) {
  let fasterPeople = 0;
  let savedMinutes = 0;
  let newlyReachable = 0;
  for (let i = 0; i < after.pairTime.length; i++) {
    const people = after.pairPeople[i] * 2; // 갈 때와 올 때를 모두 센다
    if (people <= 0) continue;
    const timeBefore = before.pairTime[i];
    const timeAfter = after.pairTime[i];
    if (!Number.isFinite(timeAfter)) continue;
    if (!Number.isFinite(timeBefore)) {
      newlyReachable += people;
      fasterPeople += people;
      continue;
    }
    if (timeBefore - timeAfter > FASTER_MIN) {
      fasterPeople += people;
      savedMinutes += people * (timeBefore - timeAfter);
    }
  }
  const newLine = after.stations.filter((s) => s.id.startsWith(`${NEW_LINE_ID}-`));
  return {
    fasterPeople,
    savedMinutes,
    averageSavedMin: fasterPeople > 0 ? savedMinutes / fasterPeople : 0,
    newlyReachable,
    newLineRiders: newLine.reduce((sum, s) => sum + s.board + s.alight, 0),
    totalBefore: before.totals.board,
    totalAfter: after.totals.board,
  };
}

/** 가장 붐비는 구간 몇 개. 붐빔은 사람 수 ÷ (열차 수 × 정원)이다. */
export function busiestLinks(result, count = 3) {
  return [...result.crowding]
    .filter((c) => c.ratio !== null)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, count);
}
