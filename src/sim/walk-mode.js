// 걸어서 여행하기(돌아다니는 모드)의 계산. 순수 함수만 둔다(같은 입력이면 같은 결과).
// 여행 모드의 걷기 시간 계산은 src/sim/walk.js에 있다.
// 좌표는 격자 좌표(km). 시각은 하루 시작부터 분.

/** 걷는 빠르기(km/h)의 기본값. 화면에서는 규칙 카드(walkSpeedKmh) 값을 넘긴다. */
export const WALK_KMH = 4;
/** 탈 곳이 "가까이" 있다고 보는 거리(km). 우리가 정한 값. */
export const NEAR_KM = 0.15;
/** 택시를 잡을 수 있는 차도까지 거리(km). 우리가 정한 값. */
export const HAIL_KM = 0.04;

/**
 * 걸어갈 수 있는 곳인가. 지도 밖, 바다는 못 간다. 강 칸은 다리(차도) 가까이일 때만 갈 수 있다.
 * @param {{cols: number, rows: number, terrain: string[][]}} grid
 * @param {{x: number, y: number}} point
 * @param {(p: {x: number, y: number}) => boolean} [onRoad] 차도 위(다리)인지
 */
export function walkable(grid, point, onRoad = () => false) {
  if (!(point.x >= 0 && point.y >= 0 && point.x < grid.cols && point.y < grid.rows)) return false;
  const terrain = grid.terrain[Math.floor(point.y)]?.[Math.floor(point.x)];
  if (terrain === 'sea' || terrain === 'river') return onRoad(point);
  return true;
}

/**
 * 한 걸음 옮기기. 막히면 가로나 세로로만 미끄러져 본다(벽을 따라 걷는 느낌).
 * @param {{x: number, y: number}} pos
 * @param {{dx: number, dy: number}} dir 방향(길이는 상관없다)
 * @param {number} km 이번에 걸을 거리
 * @param {(p: {x: number, y: number}) => boolean} canStand
 * @returns {{x: number, y: number, km: number}} 새 자리와 실제로 걸은 거리
 */
export function stepWalk(pos, dir, km, canStand) {
  const len = Math.hypot(dir.dx, dir.dy);
  if (!(len > 0) || !(km > 0)) return { x: pos.x, y: pos.y, km: 0 };
  const ux = dir.dx / len;
  const uy = dir.dy / len;
  const tries = [
    [ux, uy],
    [Math.sign(ux) * Math.abs(ux), 0],
    [0, Math.sign(uy) * Math.abs(uy)],
  ];
  for (const [mx, my] of tries) {
    const moved = Math.hypot(mx, my) * km;
    if (moved <= 1e-9) continue;
    const next = { x: pos.x + mx * km, y: pos.y + my * km };
    if (canStand(next)) return { ...next, km: moved };
  }
  return { x: pos.x, y: pos.y, km: 0 };
}

/** km를 걷는 데 드는 분 */
export function minutesWalking(km, kmh = WALK_KMH) {
  return (km / kmh) * 60;
}

/**
 * 가까운 것들(가까운 차례). items에는 x, y가 있어야 한다.
 * @template T
 * @param {T[]} items
 * @returns {{item: T, km: number}[]}
 */
export function nearby(items, point, radiusKm = NEAR_KM, limit = 8) {
  const out = [];
  for (const item of items) {
    const km = Math.hypot(item.x - point.x, item.y - point.y);
    if (km <= radiusKm) out.push({ item, km });
  }
  return out.sort((a, b) => a.km - b.km || String(a.item.id ?? a.item.name).localeCompare(String(b.item.id ?? b.item.name))).slice(0, limit);
}

/**
 * 다음에 오는 차들의 시각. 배차 간격마다 오고, 정류장마다 오는 때가 조금 다르다(자리 이름으로 늘 같게 정한다).
 * @param {number} now 지금(분)
 * @param {number} headway 배차 간격(분)
 * @param {string} key 정류장·노선 이름(오는 때를 어긋나게 하는 씨앗)
 * @param {number} count 몇 대
 * @returns {number[]} 오는 시각(분)
 */
export function nextArrivals(now, headway, key, count = 3) {
  if (!(headway > 0)) return [];
  let hash = 0;
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) % 100003;
  const offset = (hash % Math.max(1, Math.round(headway * 10))) / 10;
  const first = Math.ceil((now - offset) / headway - 1e-9) * headway + offset;
  return Array.from({ length: count }, (_, i) => first + i * headway);
}

/** 빈 여행 기록 */
export function emptyRecord(startMinute) {
  return { start: startMinute, minutes: 0, meters: 0, paid: 0, entries: [] };
}

/**
 * 기록에 한 가지 일을 더한다(새 기록을 돌려준다).
 * @param {{start: number, minutes: number, meters: number, paid: number, entries: object[]}} record
 * @param {{kind: string, title: string, minutes?: number, meters?: number, fare?: number, place?: string}} entry place: 들른 랜드마크 id
 */
export function addEntry(record, entry) {
  const minutes = Math.max(0, entry.minutes ?? 0);
  const meters = Math.max(0, entry.meters ?? 0);
  const fare = Math.max(0, entry.fare ?? 0);
  const at = record.start + record.minutes;
  // 걷기는 이어서 걸으면 한 줄로 합친다
  const last = record.entries.at(-1);
  const entries =
    entry.kind === '걷기' && last?.kind === '걷기'
      ? [...record.entries.slice(0, -1), { ...last, minutes: last.minutes + minutes, meters: last.meters + meters }]
      : [...record.entries, { kind: entry.kind, title: entry.title, at, minutes, meters, fare, ...(entry.place ? { place: entry.place } : {}) }];
  return { start: record.start, minutes: record.minutes + minutes, meters: record.meters + meters, paid: record.paid + fare, entries };
}

/**
 * 시각표가 없는 노선(동해선, 대경선, 부산김해경전철)이 다니는 때(시, 우리가 정한 값). 새벽 5시 30분부터 밤 12시까지.
 * 코레일 열차운행정보(15125762)에는 광역전철 열차가 들어 있지 않아 셀 수 없었다(2026-11-14 확인).
 */
export const SUBWAY_GUESS_HOURS = [5.5, 24];

/**
 * 지하철 노선의 그 시간 배차 간격(분). 밤에 다니지 않으면 null.
 *  1. 부산 도시철도 평일 시각표(service)가 있으면 그 시간 시간당 열차 수(두 방향 평균)로 셈한다.
 *  2. 없고 노선에 시간대별 열차 수(hourly, 대구·광주 시각표에서 셈)가 있으면 그것으로 셈한다.
 *  3. 둘 다 없으면 SUBWAY_GUESS_HOURS 안에서만 노선의 평소 배차 간격(headwayMin)으로 다닌다.
 * @param {{weekday: {line: string, directions: {trainsPerHour: Record<string, number>}[]}[]}} service
 * @param {string} line
 * @param {number} hour 시(자정을 넘긴 여행은 24보다 클 수 있다)
 * @param {{hourly?: number[], headwayMin?: number|null}} [info] 노선 자료(lines.json)
 * @returns {number|null} 그 시간에 다니지 않거나 자료가 없으면 null
 */
export function subwayHeadway(service, line, hour, info = {}) {
  const h = ((hour % 24) + 24) % 24;
  const entry = service?.weekday?.find((s) => s.line === line);
  if (entry) {
    const key = String(Math.floor(h)).padStart(2, '0');
    const counts = entry.directions.map((d) => d.trainsPerHour?.[key] ?? 0).filter((n) => n > 0);
    if (!counts.length) return null;
    return 60 / (counts.reduce((a, b) => a + b, 0) / counts.length);
  }
  if (Array.isArray(info.hourly)) {
    const count = info.hourly[Math.floor(h)] ?? 0;
    return count > 0 ? 60 / count : null;
  }
  if (!info.headwayMin) return null;
  return h >= SUBWAY_GUESS_HOURS[0] && h < SUBWAY_GUESS_HOURS[1] ? info.headwayMin : null;
}

/** 첫차·막차 시각을 모르는 시내버스 노선(양산 등)의 첫차와 막차 출발 시각(분, 우리가 정한 값): 5시 30분, 23시 */
export const BUS_GUESS_HOURS = [330, 1380];
/** 막차가 첫 정류장을 떠난 뒤 이만큼(분) 더 다닌다고 본다(우리가 정한 값). 정류장마다 막차가 지나는 시각은 자료에 없다. */
export const BUS_LAST_RUN_MIN = 60;

/**
 * 시내버스 노선이 그 시각에 다니는지.
 * @param {[number, number]|undefined} hours 첫차와 막차가 첫 정류장을 떠나는 시각(분, 막차가 자정을 넘기면 1440보다 크다). bus.json routes[].hours
 * @param {number} minute 지금(분, 자정을 넘긴 여행은 1440보다 클 수 있다)
 * @returns {{running: boolean, nextFirst: number}} nextFirst: 다음 첫차 시각(지금과 같은 날 기준의 분, 내일이면 1440을 더한다)
 */
export function busRunning(hours, minute) {
  const [first, last] = hours ?? BUS_GUESS_HOURS;
  const day = Math.floor(minute / 1440) * 1440;
  const t = minute - day;
  const end = last + BUS_LAST_RUN_MIN;
  // 어제 막차가 자정을 넘겨 아직 다니는 때도 본다
  const running = (t >= first && t <= end) || t + 1440 <= end;
  return { running, nextFirst: day + (t < first ? first : first + 1440) };
}

/**
 * 이번 여행에서 들른 랜드마크: id → 처음 들른 시각(분).
 * @param {{entries: {place?: string, at: number}[]}} record
 * @returns {Map<string, number>}
 */
export function visitedPlaces(record) {
  const out = new Map();
  for (const e of record?.entries ?? []) if (e.place && !out.has(e.place)) out.set(e.place, e.at);
  return out;
}

/** 랜드마크 음악을 다시 틀 때까지 기다리는 시간(밀리초). 둘레를 왔다 갔다 해도 계속 나오지 않게 한다. */
export const MUSIC_GAP_MS = 10000;

/** 지난번 음악(lastMs)에서 gapMs가 지났으면 다시 틀어도 된다 */
export function canPlayAgain(lastMs, nowMs, gapMs = MUSIC_GAP_MS) {
  return !(nowMs - lastMs < gapMs);
}
