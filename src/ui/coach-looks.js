// 고속·시외버스 칠: 회사마다 다른 칠(data/build/coach-looks.json, scripts/build-bus-looks.mjs가 data/facts.json coachLooks에서 만든다).
// 배차 자료(TAGO)에는 어느 회사 버스인지가 없다. 그래서 그 노선(없으면 두 터미널)에 다니는 회사 가운데 하나를
// 출발 시각으로 정해 고른다(같은 배차는 늘 같은 칠). 화면에 회사 이름은 보여 주지 않는다.
import coachLooksFile from '../../data/build/coach-looks.json';

/** 자료가 없을 때 쓰는 칠(우리가 정한 값: 흰 바탕에 파란 띠) */
export const DEFAULT_COACH_LOOK = {
  lower: '#F4F4F1',
  upper: '#F4F4F1',
  roof: '#E6E8EA',
  front: null,
  stripe: '#1C5FA8',
  stripe2: '#7FB2E0',
  pattern: 'stripes',
};

const COLOR_KEYS = ['lower', 'upper', 'roof', 'front', 'stripe', 'stripe2', 'pattern'];

/** 글자열 → 0 이상 정수(같은 글자열은 늘 같은 수) */
function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 회사 id 목록 가운데 그 종류(고속·시외)를 다니는 것만 */
function ofKind(ids, kind) {
  const companies = coachLooksFile.companies ?? {};
  return (ids ?? []).filter((id) => companies[id] && (!companies[id].kinds?.length || companies[id].kinds.includes(kind)));
}

/**
 * 이 배차에 다닐 만한 회사들(자료가 말하는 차례: 노선 → 두 터미널 모두 → 한 터미널 → 그 종류 모두)
 * @returns {string[]}
 */
export function coachCompaniesFor({ kind, fromName, toName }) {
  const routes = coachLooksFile.routes ?? {};
  const terminals = coachLooksFile.terminals ?? {};
  const byRoute = ofKind([...(routes[`${fromName}→${toName} ${kind}`] ?? []), ...(routes[`${toName}→${fromName} ${kind}`] ?? [])], kind);
  if (byRoute.length) return [...new Set(byRoute)];
  const a = ofKind(terminals[fromName], kind);
  const b = ofKind(terminals[toName], kind);
  const both = a.filter((id) => b.includes(id));
  if (both.length) return both;
  if (a.length || b.length) return [...new Set([...a, ...b])];
  return ofKind(Object.keys(coachLooksFile.companies ?? {}), kind);
}

/** 회사 칠(프리미엄 버스는 프리미엄 칠이 따로 있으면 그것) */
function lookOfCompany(id, grade) {
  const c = coachLooksFile.companies?.[id];
  if (!c) return { ...DEFAULT_COACH_LOOK, company: null };
  const src = String(grade ?? '').includes('프리미엄') && c.premium ? { ...c, ...c.premium } : c;
  const look = { ...DEFAULT_COACH_LOOK };
  for (const k of COLOR_KEYS) if (src[k] !== undefined && src[k] !== null) look[k] = src[k];
  return { ...look, company: id };
}

/**
 * 배차 하나의 칠
 * @param {{kind: string, fromName: string, toName: string, grade: string, dep: number}} p
 */
export function coachLookOf({ kind, fromName, toName, grade, dep }) {
  const ids = coachCompaniesFor({ kind, fromName, toName });
  if (!ids.length) return { ...DEFAULT_COACH_LOOK, company: null };
  return lookOfCompany(ids[hashOf(`${fromName}|${toName}|${kind}|${dep}`) % ids.length], grade);
}

/** 터미널(또는 휴게소)에 서 있는 다른 버스들의 칠 */
export function parkedCoachLooks(kind, terminalName, count = 6) {
  const companies = coachLooksFile.companies ?? {};
  const here = ofKind(coachLooksFile.terminals?.[terminalName], kind);
  const ids = here.length ? here : Object.keys(companies);
  if (!ids.length) return [DEFAULT_COACH_LOOK];
  return Array.from({ length: count }, (_, i) => lookOfCompany(ids[(hashOf(terminalName) + i) % ids.length], i % 3 === 2 ? '프리미엄' : '우등'));
}
