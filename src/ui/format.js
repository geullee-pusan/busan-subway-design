// 화면에 숫자를 쓰는 규칙(CLAUDE.md).
//  - 큰 수: 기본 모드는 "약 4만 2천 명", 진짜 숫자 모드는 "42,380명"
//  - 시간: "2분 20초"
//  - 거리: "1km 600m"
// 모두 순수 함수다.

/** 만 단위와 천 단위로 어림해서 쓴다. 기본 모드에서 쓴다. */
export function roundedCount(value) {
  const n = Math.round(value);
  if (n < 1000) return `${n}명`;
  if (n < 10000) {
    const rounded = Math.round(n / 100) * 100;
    const thousand = Math.floor(rounded / 1000);
    const hundred = (rounded % 1000) / 100;
    if (thousand === 10) return '약 1만 명';
    return hundred === 0 ? `약 ${thousand}천 명` : `약 ${thousand}천 ${hundred}백 명`;
  }
  const rounded = Math.round(n / 1000) * 1000;
  const man = Math.floor(rounded / 10000);
  const cheon = (rounded % 10000) / 1000;
  return cheon === 0 ? `약 ${man}만 명` : `약 ${man}만 ${cheon}천 명`;
}

/** 쉼표를 넣은 진짜 숫자. 진짜 숫자 모드에서 쓴다. */
export function exactCount(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}명`;
}

/** 숫자 표시 모드에 맞춰 사람 수를 쓴다. */
export function countText(value, mode = '기본') {
  return mode === '진짜 숫자' ? exactCount(value) : roundedCount(value);
}

/** 초 → "2분 20초". 1분이 안 되면 "40초", 딱 떨어지면 "3분". */
export function durationText(seconds) {
  const s = Math.round(seconds);
  const min = Math.floor(s / 60);
  const rest = s % 60;
  if (min === 0) return `${rest}초`;
  if (rest === 0) return `${min}분`;
  return `${min}분 ${rest}초`;
}

/** m → "1km 600m". 1km가 안 되면 "600m", 딱 떨어지면 "2km". */
export function distanceText(meters) {
  const m = Math.round(meters);
  const km = Math.floor(m / 1000);
  const rest = m % 1000;
  if (km === 0) return `${rest}m`;
  if (rest === 0) return `${km}km`;
  return `${km}km ${rest}m`;
}

/**
 * 뒤에 붙는 조사를 고른다. 받침이 없거나 'ㄹ'이면 "로", 아니면 "으로".
 * 예: 2호선 → "2호선으로", 부산김해경전철 → "부산김해경전철로"
 */
export function roParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const final = (code - 0xac00) % 28;
    return final === 0 || final === 8 ? '로' : '으로';
  }
  return '로';
}

/** 역 이름 뒤에 "역"을 붙인다. 이미 "역"으로 끝나면 그대로 둔다(부산역 → 부산역). */
export function stationLabel(name) {
  return name.endsWith('역') ? name : `${name}역`;
}

/** 연도만 뽑는다. "1985-07-19" → "1985년" */
export function yearText(date) {
  return date ? `${date.slice(0, 4)}년` : null;
}

/** "1985-07-19" → "1985년 7월 19일" */
export function dateText(date) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
