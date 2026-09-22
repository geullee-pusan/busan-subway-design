// 부산교통공사 열차 시각표(15082980)에서 운행 요약을 만든다.
// 전 구간 소요시간, 첫차·막차, 시간대별 열차 수를 노선·방향별로 센다.
import { readCsv } from '../lib/csv.mjs';
import { normalizeName } from './network.mjs';

const LINE_BY_CODE = { S2601: '1', S2602: '2', S2603: '3', L2604: '4' };

/** "001-노포+002-범어사" → ['노포', '범어사'] (번호 순서대로) */
function splitSeq(text) {
  return text
    .split('+')
    .map((part) => {
      const cut = part.indexOf('-');
      return [Number(part.slice(0, cut)), part.slice(cut + 1)];
    })
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

/** "05:08" → 308분. 새벽 3시 전은 다음 날로 본다(00:10 → 1450분). 값이 없으면 null. */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]);
  return t < 180 ? t + 1440 : t;
}

/** 분 → "05:08" (24시를 넘으면 다시 0시부터) */
export function formatMinutes(t) {
  const h = Math.floor(t / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** 시각표 CSV를 열차 목록으로 읽는다. */
export function readTrains(path) {
  return readCsv(path)
    .records.filter((r) => LINE_BY_CODE[r['노선번호']])
    .map((r) => {
      const names = splitSeq(r['운행구간정거장']);
      const arr = splitSeq(r['정거장도착시각']).map(toMinutes);
      const dep = splitSeq(r['정거장출발시각']).map(toMinutes);
      return {
        train: r['열차번호'],
        line: LINE_BY_CODE[r['노선번호']],
        day: r['요일구분'],
        stops: names.map((name, i) => ({ name, key: normalizeName(name), arr: arr[i], dep: dep[i] })),
      };
    });
}

/**
 * 노선마다 운행 요약을 만든다.
 * lines: [{id, order: 역 이름 목록(첫 역 → 끝 역)}]
 * 열차의 첫 정차역과 마지막 정차역이 order에서 어느 쪽으로 가는지로 방향을 나눈다.
 */
export function summarizeService(trains, lines, day = '평일') {
  return lines.map((line) => {
    const order = line.order.map(normalizeName);
    const pos = new Map(order.map((k, i) => [k, i]));
    const own = trains.filter((t) => t.line === line.id && t.day === day);

    // 열차 수를 셀 역: 노선 가운데쯤, 시각표에 이름이 있는 역
    const seen = new Set(own.flatMap((t) => t.stops.map((s) => s.key)));
    let refIndex = Math.floor(order.length / 2);
    while (refIndex < order.length - 1 && !seen.has(order[refIndex])) refIndex++;
    const ref = order[refIndex];

    const byDir = { down: [], up: [] };
    let unknown = 0;
    for (const t of own) {
      const i = pos.get(t.stops[0].key);
      const j = pos.get(t.stops.at(-1).key);
      if (i === undefined || j === undefined || i === j) {
        unknown++;
        continue;
      }
      byDir[i < j ? 'down' : 'up'].push(t);
    }

    const directions = ['down', 'up'].map((key) => {
      const [from, to] = key === 'down' ? [order[0], order.at(-1)] : [order.at(-1), order[0]];
      const list = byDir[key];
      const full = list.filter((t) => t.stops[0].key === from && t.stops.at(-1).key === to);
      const endToEnd = full.map((t) => t.stops.at(-1).arr - t.stops[0].dep).filter(Number.isFinite);
      const firstDeps = full.map((t) => t.stops[0].dep).filter(Number.isFinite);
      const perHour = new Map();
      for (const t of list) {
        const s = t.stops.find((x) => x.key === ref);
        const time = s ? (s.dep ?? s.arr) : null;
        if (!Number.isFinite(time)) continue;
        const hour = Math.floor(time / 60) % 24;
        perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
      }
      // 새벽 3시를 하루의 시작으로 보고 시간 순서대로 적는다.
      const hours = [...perHour.entries()].sort((x, y) => ((x[0] + 21) % 24) - ((y[0] + 21) % 24));
      return {
        from: line.order[key === 'down' ? 0 : line.order.length - 1],
        to: line.order[key === 'down' ? line.order.length - 1 : 0],
        trains: list.length,
        fullTrips: full.length,
        endToEndMin: {
          median: median(endToEnd),
          min: endToEnd.length ? Math.min(...endToEnd) : null,
          max: endToEnd.length ? Math.max(...endToEnd) : null,
        },
        firstDeparture: firstDeps.length ? formatMinutes(Math.min(...firstDeps)) : null,
        lastDeparture: firstDeps.length ? formatMinutes(Math.max(...firstDeps)) : null,
        trainsPerHour: Object.fromEntries(hours.map(([h, n]) => [String(h).padStart(2, '0'), n])),
      };
    });
    return { line: line.id, day, reference: line.order[refIndex], unknownDirection: unknown, directions };
  });
}
