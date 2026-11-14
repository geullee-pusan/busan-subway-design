// 고속·시외버스 타기 장면(걸어서 여행하기): 터미널 대합실(출발 안내판) → 버스 안(고속도로) → 휴게소(오래 달리는 버스) → 도착.
// 시각과 요금은 TAGO 배차 자료(data/build/intercity.json)이다. 휴게소 장면은 게임에서 넣은 것이다(실제로 들르는지는 버스마다 다르다).
// 다음 단계로는 아이가 단추를 눌러야 간다.
import { hasRestStop } from '../sim/intercity.js';
import { distanceText, durationText } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 버스 그림이 달리는 시간(밀리초) */
const DRIVE_MS = 6000;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, onClick, className = 'button') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
/** 분 → "08:34" */
export function hhmm(minutes) {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const wonText = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;

/** 버스 옆모습. 고속버스는 파란 띠, 시외버스는 초록 띠(색만으로 가르지 않게 옆에 "고속"·"시외" 글자를 적는다) */
function busSide(kind) {
  const g = el('g');
  const stripe = kind === '고속' ? '#1C5FA8' : '#2E8B3E';
  g.append(el('rect', { x: 0, y: 0, width: 150, height: 52, rx: 9, fill: '#F7F7F2', stroke: '#6B7178', 'stroke-width': 2 }));
  g.append(el('rect', { x: 0, y: 30, width: 150, height: 8, fill: stripe }));
  for (let i = 0; i < 6; i++) g.append(el('rect', { x: 10 + i * 22, y: 7, width: 18, height: 17, rx: 3, fill: '#5E7F99' }));
  g.append(el('rect', { x: 136, y: 7, width: 11, height: 22, rx: 3, fill: '#4D6C84' }));
  g.append(el('text', { x: 70, y: 49, 'font-size': 9, 'font-weight': 800, 'text-anchor': 'middle', fill: stripe }, `${kind}버스`));
  for (const x of [28, 118]) {
    g.append(el('circle', { cx: x, cy: 54, r: 9, fill: '#2B2F33' }));
    g.append(el('circle', { cx: x, cy: 54, r: 4, fill: '#A6ADB4' }));
  }
  return g;
}

/** 고속도로 장면: 산, 방음벽, 차선, 표지판. progress(0~1)에 따라 버스가 앞으로 간다. */
function highwayArt(kind, toName, km) {
  const svg = el('svg', { viewBox: '0 0 600 260', class: 'coach-scene', role: 'img', 'aria-label': `${toName}(으)로 가는 ${kind}버스가 고속도로를 달리는 그림이에요.` });
  const defs = el('defs');
  const sky = el('linearGradient', { id: 'coach-sky', x1: 0, y1: 0, x2: 0, y2: 1 });
  sky.append(el('stop', { offset: 0, 'stop-color': '#7DB6E3' }), el('stop', { offset: 1, 'stop-color': '#E3F1F9' }));
  defs.append(sky);
  svg.append(defs);
  svg.append(el('rect', { x: 0, y: 0, width: 600, height: 260, fill: 'url(#coach-sky)' }));
  svg.append(el('path', { d: 'M0 130 L80 92 L170 120 L260 78 L360 116 L450 86 L540 112 L600 96 L600 160 L0 160 Z', fill: '#8DAF8E' }));
  svg.append(el('path', { d: 'M0 150 L120 122 L230 146 L350 118 L470 142 L600 126 L600 170 L0 170 Z', fill: '#6E9A6C' }));
  // 움직이는 것들(가로등, 차선)
  const moving = el('g', { class: 'coach-move' });
  for (let x = 0; x < 1200; x += 150) {
    moving.append(el('rect', { x, y: 120, width: 4, height: 48, fill: '#7A8188' }));
    moving.append(el('rect', { x: x - 8, y: 118, width: 20, height: 4, fill: '#7A8188' }));
  }
  svg.append(el('rect', { x: 0, y: 166, width: 600, height: 94, fill: '#5B6066' }));
  svg.append(el('rect', { x: 0, y: 166, width: 600, height: 6, fill: '#C9CDD1' }));
  for (let x = 0; x < 1200; x += 60) moving.append(el('rect', { x, y: 212, width: 34, height: 5, fill: '#F2F2EA' }));
  svg.append(moving);
  // 초록 표지판
  const sign = el('g', { transform: 'translate(410 26)' });
  sign.append(el('rect', { x: 0, y: 0, width: 170, height: 56, rx: 6, fill: '#1E7B4A', stroke: '#FFFFFF', 'stroke-width': 3 }));
  sign.append(el('text', { x: 85, y: 24, 'font-size': 17, 'font-weight': 800, 'text-anchor': 'middle', fill: '#FFFFFF' }, toName.length > 9 ? `${toName.slice(0, 9)}…` : toName));
  sign.append(el('text', { x: 85, y: 46, 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle', fill: '#FFFFFF' }, `곧게 재면 ${distanceText(Math.round(km * 1000))}`));
  sign.append(el('rect', { x: 80, y: 56, width: 10, height: 66, fill: '#7A8188' }));
  svg.append(sign);
  const bus = busSide(kind);
  bus.setAttribute('transform', 'translate(40 182)');
  svg.append(bus);
  return {
    svg,
    setProgress(p) {
      bus.setAttribute('transform', `translate(${(40 + p * 380).toFixed(1)} 182)`);
    },
  };
}

/** 휴게소 장면: 휴게소 건물, 주차한 버스들, 간식 가게, 쉬는 사람들 */
function restStopArt(kind) {
  const svg = el('svg', { viewBox: '0 0 600 260', class: 'coach-scene', role: 'img', 'aria-label': '고속도로 휴게소에서 쉬는 그림이에요.' });
  svg.append(el('rect', { x: 0, y: 0, width: 600, height: 260, fill: '#DCEEF8' }));
  svg.append(el('path', { d: 'M0 110 L90 70 L200 104 L320 64 L440 100 L600 76 L600 140 L0 140 Z', fill: '#9BBF95' }));
  svg.append(el('rect', { x: 0, y: 140, width: 600, height: 120, fill: '#8C9298' }));
  // 휴게소 건물
  svg.append(el('rect', { x: 250, y: 66, width: 320, height: 80, fill: '#F1E8D8', stroke: '#A08C6E', 'stroke-width': 2 }));
  svg.append(el('path', { d: 'M238 70 L410 34 L582 70 Z', fill: '#C0563C' }));
  svg.append(el('rect', { x: 330, y: 44, width: 160, height: 26, rx: 4, fill: '#1E5E8C' }));
  svg.append(el('text', { x: 410, y: 63, 'font-size': 16, 'font-weight': 800, 'text-anchor': 'middle', fill: '#FFFFFF' }, '휴게소'));
  for (let i = 0; i < 5; i++) svg.append(el('rect', { x: 268 + i * 60, y: 86, width: 44, height: 40, fill: '#9EC5DD', stroke: '#6E8FA6' }));
  // 간식 가게 천막(호두과자·라면 그림 대신 단순한 그릇과 봉지)
  svg.append(el('path', { d: 'M150 100 L240 100 L232 84 L158 84 Z', fill: '#F59F00' }));
  svg.append(el('rect', { x: 158, y: 100, width: 74, height: 40, fill: '#FFF6E0', stroke: '#C9A55A' }));
  svg.append(el('circle', { cx: 180, cy: 116, r: 8, fill: '#C28A4A' }));
  svg.append(el('circle', { cx: 205, cy: 116, r: 8, fill: '#C28A4A' }));
  // 주차선과 버스
  for (let i = 0; i < 6; i++) svg.append(el('rect', { x: 20 + i * 100, y: 236, width: 4, height: 24, fill: '#F2F2EA' }));
  const a = busSide(kind);
  a.setAttribute('transform', 'translate(30 176)');
  const b = busSide(kind === '고속' ? '시외' : '고속');
  b.setAttribute('transform', 'translate(240 182) scale(0.85)');
  svg.append(a, b);
  // 쉬는 사람들
  for (const [x, c] of [[440, '#E8590C'], [470, '#1971C2'], [520, '#2F9E44']]) {
    svg.append(el('circle', { cx: x, cy: 168, r: 6, fill: '#E9BE9A' }));
    svg.append(el('rect', { x: x - 6, y: 174, width: 12, height: 16, rx: 4, fill: c }));
    svg.append(el('path', { d: `M${x - 3} 190 L${x - 4} 202 M${x + 3} 190 L${x + 4} 202`, stroke: '#2F3A45', 'stroke-width': 3 }));
  }
  return svg;
}

/**
 * 버스 한 대 타기.
 * @param {HTMLElement} area
 * @param {{kind: '고속'|'시외', fromName: string, toName: string, km: number, dep: number, dur: number, fare: number|null, grade: string,
 *   readyMinute: number, rider: 'adult'|'child', reduceMotion?: boolean, onDone: (minutes: number) => void}} p
 * @returns {() => void} 치우기
 */
export function runCoachTrip(area, { kind, fromName, toName, km, dep, dur, fare, grade, readyMinute, rider, onDone }) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let frame = null;
  const cleanup = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  };
  const rest = hasRestStop(dur);

  /** 1. 대합실: 출발 안내판 */
  function waitingRoom() {
    area.replaceChildren();
    area.append(element('h3', null, `${fromName} 대합실`));
    const board = element('div', 'tr-board coach-board');
    board.append(element('p', 'coach-board-title', '출발 안내'));
    const row = element('p', 'coach-board-row');
    row.append(element('span', null, hhmm(dep)), element('span', null, `${toName} 가는 ${kind}버스`), element('span', null, grade));
    board.append(row);
    area.append(board);
    const wait = Math.max(0, dep - readyMinute);
    area.append(element('p', null, wait > 0 ? `${durationText(wait * 60)} 기다리면 버스가 떠나요.` : '버스가 곧 떠나요.'));
    area.append(element('p', null, `가는 데 ${durationText(dur * 60)} 걸려요.`));
    if (fare !== null) area.append(element('p', null, `요금은 ${wonText(fare)}이에요.`));
    else area.append(element('p', null, '요금 자료가 없어요.'));
    if (rider === 'child') area.append(element('p', 'panel-note', '어린이 요금 자료가 없어서 어른 요금으로 셈해요.'));
    area.append(element('p', 'panel-note', '시각과 요금은 국토교통부 TAGO 배차 자료예요.'));
    area.append(button('버스에 타요', () => drive(0, rest ? 0.5 : 1, rest ? restStop : arrive), 'button big ride-go'));
  }

  /** 2. 버스 안: from~to(0~1)까지 달린다 */
  function drive(from, to, next) {
    area.replaceChildren();
    area.append(element('h3', null, `${toName}(으)로 가는 ${kind}버스`));
    const art = highwayArt(kind, toName, km);
    area.append(art.svg);
    const clock = element('p', 'walk-next');
    area.append(clock);
    const nextButton = button(next === restStop ? '휴게소에 들러요' : '다 왔어요', next, 'button big ride-go');
    nextButton.disabled = true;
    area.append(nextButton);
    const start = performance.now();
    const step = (t) => {
      const p = reduceMotion ? 1 : Math.min(1, (t - start) / DRIVE_MS);
      const at = from + (to - from) * p;
      art.setProgress(at);
      clock.textContent = `지금 ${hhmm(dep + dur * at)} · ${durationText(Math.round(dur * at) * 60)} 달렸어요`;
      if (p < 1) frame = requestAnimationFrame(step);
      else {
        frame = null;
        nextButton.disabled = false;
      }
    };
    frame = requestAnimationFrame(step);
  }

  /** 3. 휴게소(게임에서 넣은 장면) */
  function restStop() {
    area.replaceChildren();
    area.append(element('h3', null, '휴게소에서 쉬어요'));
    area.append(restStopArt(kind));
    area.append(element('p', null, '오래 달리는 버스는 휴게소에서 잠깐 쉬기도 해요.'));
    area.append(element('p', 'panel-note', '실제로 휴게소에 들르는지는 버스마다 달라요.'));
    area.append(element('p', 'panel-note', '쉬는 시간도 도착 시각 안에 들어 있어요.'));
    area.append(button('다시 버스에 타요', () => drive(0.5, 1, arrive), 'button big ride-go'));
  }

  /** 4. 도착 */
  function arrive() {
    cleanup();
    onDone(dep + dur - readyMinute);
  }

  waitingRoom();
  return cleanup;
}
