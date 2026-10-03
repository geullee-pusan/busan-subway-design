// 버스와 지하철 안 승객. 한 사람마다 이름, 성별, 나이, 외모가 있고, 누르면 대화창에서 한 마디 한다.
//
// - 탈 때마다 씨앗(seed) 하나를 아무거나 정하고, 그 씨앗으로 자리마다 사람을 만든다(같은 씨앗이면 같은 사람).
//   역에서 내리고 타는 만큼 그 자리의 사람이 바뀐다(자리마다 "몇 번째 사람"을 센다).
// - 이름과 대사는 src/content/passengers.json의 지어낸 재료로 만든다. 실제 사람이 아니다.
// - 외모(머리 모양, 머리색, 옷, 안경, 모자, 가방)는 성별과 상관없이 정한다.
// - 사람과 대사를 정하는 계산은 src/sim/passengers.js(순수 함수)에 있다. 여기는 그림과 대화창이다.
//   씨앗만 화면에서 아무거나 정한다(계산 코드 src/sim에는 무작위가 없다).
import passengersFile from '../content/passengers.json';
import * as crowdModel from '../sim/passengers.js';
import { speakAs, stopSpeaking } from './ride-sound.js';

/** 한 사람 만들기(재료는 passengers.json) */
export const makePerson = (seed, slot, generation = 0) => crowdModel.makePerson(passengersFile, seed, slot, generation);
/** 한 번 타는 동안의 승객들 */
export const createCrowd = (seed) => crowdModel.createCrowd(passengersFile, seed);
/** 대화창에서 할 말 */
export const talkLines = (person, ctx) => crowdModel.talkLines(passengersFile, person, ctx);
const { personLabel } = crowdModel;

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- 그림 ----------
/** 정면 머리(머리 가운데가 0, 0, 반지름 11) */
function frontHead(g, look) {
  const { hair, hairColor, skin } = look;
  if (hair === '긴') g.append(svgEl('rect', { x: -12.5, y: -6, width: 25, height: 26, rx: 7, fill: hairColor }));
  g.append(svgEl('circle', { cx: 0, cy: 0, r: 11, fill: skin, stroke: '#1F3342', 'stroke-width': 1.5 }));
  const cap = 'M -11.5 -1 Q -12.5 -14 0 -13.5 Q 12.5 -14 11.5 -1 Q 6 -7.5 0 -7 Q -6 -7.5 -11.5 -1 Z';
  if (hair === '짧은' || hair === '긴') g.append(svgEl('path', { d: cap, fill: hairColor }));
  if (hair === '묶은') {
    g.append(svgEl('path', { d: cap, fill: hairColor }));
    g.append(svgEl('circle', { cx: 0, cy: -14, r: 5, fill: hairColor }));
  }
  if (hair === '곱슬') {
    for (const angle of [-165, -135, -105, -75, -45, -15]) {
      const rad = (angle * Math.PI) / 180;
      g.append(svgEl('circle', { cx: (10 * Math.cos(rad)).toFixed(1), cy: (10 * Math.sin(rad)).toFixed(1), r: 4.6, fill: hairColor }));
    }
  }
  if (hair === '둥근') g.append(svgEl('path', { d: 'M -12 3 Q -13 -14 0 -13.5 Q 13 -14 12 3 L 9 3 Q 8 -6 0 -6 Q -8 -6 -9 3 Z', fill: hairColor }));
  if (hair === '적은') {
    g.append(svgEl('path', { d: 'M -11.5 2 Q -12 -5 -8 -8', fill: 'none', stroke: hairColor, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    g.append(svgEl('path', { d: 'M 11.5 2 Q 12 -5 8 -8', fill: 'none', stroke: hairColor, 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }
  // 눈, 입
  for (const x of [-4, 4]) g.append(svgEl('circle', { cx: x, cy: -0.5, r: 1.4, fill: '#1F3342' }));
  g.append(svgEl('path', { d: 'M -3 4.5 Q 0 7 3 4.5', fill: 'none', stroke: '#1F3342', 'stroke-width': 1.2, 'stroke-linecap': 'round' }));
  if (look.glasses) {
    for (const x of [-4, 4]) g.append(svgEl('circle', { cx: x, cy: -0.5, r: 3.4, fill: 'none', stroke: '#1F3342', 'stroke-width': 1.1 }));
    g.append(svgEl('line', { x1: -0.6, y1: -0.5, x2: 0.6, y2: -0.5, stroke: '#1F3342', 'stroke-width': 1.1 }));
  }
  if (look.hat) {
    g.append(svgEl('path', { d: 'M -11 -5 Q -11 -16 0 -16 Q 11 -16 11 -5 Z', fill: look.hat }));
    g.append(svgEl('rect', { x: -13, y: -6.5, width: 26, height: 3.5, rx: 1.5, fill: look.hat, stroke: '#1F3342', 'stroke-width': 0.6 }));
  }
}

/**
 * 앞에서 본 사람(열차 안). 머리 가운데가 (x, y)이고, scale만큼 키운다. 서 있으면 한 손으로 손잡이를 잡는다.
 */
export function frontPassenger(person, { x, y, scale, seated }) {
  const { look } = person;
  const g = svgEl('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})` });
  if (!seated) g.append(svgEl('line', { x1: 8, y1: 16, x2: 14, y2: -36, stroke: look.shirt, 'stroke-width': 6, 'stroke-linecap': 'round' }));
  const bodyH = seated ? 40 : 56;
  g.append(svgEl('rect', { x: -13, y: 12, width: 26, height: bodyH, rx: 9, fill: look.shirt, stroke: '#1F3342', 'stroke-width': 1.5 }));
  if (seated) {
    g.append(svgEl('rect', { x: -11, y: 50, width: 22, height: 14, rx: 4, fill: look.pants }));
    g.append(svgEl('rect', { x: -10, y: 62, width: 8, height: 26, rx: 3, fill: look.pants }));
    g.append(svgEl('rect', { x: 2, y: 62, width: 8, height: 26, rx: 3, fill: look.pants }));
  } else {
    g.append(svgEl('rect', { x: -11, y: 66, width: 9, height: 50, rx: 3, fill: look.pants }));
    g.append(svgEl('rect', { x: 2, y: 66, width: 9, height: 50, rx: 3, fill: look.pants }));
  }
  if (look.bag === '어깨가방') {
    g.append(svgEl('line', { x1: -9, y1: 13, x2: 9, y2: 40, stroke: '#1F3342', 'stroke-width': 2 }));
    g.append(svgEl('rect', { x: 6, y: 36, width: 12, height: 10, rx: 2, fill: look.bagColor, stroke: '#1F3342', 'stroke-width': 1 }));
  } else if (look.bag === '배낭') {
    for (const sx of [-7, 7]) g.append(svgEl('line', { x1: sx, y1: 12, x2: sx, y2: 34, stroke: look.bagColor, 'stroke-width': 3 }));
  }
  frontHead(g, look);
  return g;
}

/**
 * 뒤에서 본 사람(버스 안). 머리 가운데가 (x, y)이다. 서 있고 holding이면 한 손을 들어 손잡이를 잡는다.
 */
export function backPassenger(person, { x, y, scale, seated, holding = true }) {
  const { look } = person;
  const g = svgEl('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})` });
  if (!seated && holding) g.append(svgEl('line', { x1: 9, y1: 16, x2: 15, y2: -34, stroke: look.shirt, 'stroke-width': 6, 'stroke-linecap': 'round' }));
  g.append(svgEl('rect', { x: -14, y: 12, width: 28, height: seated ? 40 : 56, rx: 10, fill: look.shirt, stroke: '#1F3342', 'stroke-width': 1.5 }));
  if (look.bag === '배낭') g.append(svgEl('rect', { x: -10, y: 18, width: 20, height: 24, rx: 5, fill: look.bagColor, stroke: '#1F3342', 'stroke-width': 1 }));
  if (look.bag === '어깨가방') g.append(svgEl('line', { x1: 10, y1: 13, x2: -9, y2: 42, stroke: '#1F3342', 'stroke-width': 2 }));
  // 머리(뒤): 머리카락이 머리를 덮는다
  for (const sx of [-11, 11]) g.append(svgEl('circle', { cx: sx, cy: 1, r: 3, fill: look.skin }));
  if (look.hair === '적은') {
    g.append(svgEl('circle', { cx: 0, cy: 0, r: 11, fill: look.skin, stroke: '#1F3342', 'stroke-width': 1.5 }));
    g.append(svgEl('path', { d: 'M -11 3 Q 0 12 11 3 L 11 6 Q 0 14 -11 6 Z', fill: look.hairColor }));
  } else {
    if (look.hair === '긴') g.append(svgEl('rect', { x: -12, y: -4, width: 24, height: 28, rx: 8, fill: look.hairColor }));
    g.append(svgEl('circle', { cx: 0, cy: 0, r: 11, fill: look.hairColor, stroke: '#1F3342', 'stroke-width': 1.5 }));
    if (look.hair === '묶은') g.append(svgEl('circle', { cx: 0, cy: 9, r: 4.5, fill: look.hairColor, stroke: '#1F3342', 'stroke-width': 1 }));
    if (look.hair === '곱슬') {
      for (const angle of [-150, -110, -70, -30, 10, 170]) {
        const rad = (angle * Math.PI) / 180;
        g.append(svgEl('circle', { cx: (10 * Math.cos(rad)).toFixed(1), cy: (10 * Math.sin(rad)).toFixed(1), r: 4, fill: look.hairColor }));
      }
    }
  }
  if (look.hat) {
    g.append(svgEl('path', { d: 'M -11 -2 Q -11 -15 0 -15 Q 11 -15 11 -2 Z', fill: look.hat }));
    g.append(svgEl('rect', { x: -12, y: -3.5, width: 24, height: 3, rx: 1.5, fill: look.hat }));
  }
  if (seated) return g;
  g.append(svgEl('rect', { x: -11, y: 66, width: 9, height: 50, rx: 3, fill: look.pants }));
  g.append(svgEl('rect', { x: 2, y: 66, width: 9, height: 50, rx: 3, fill: look.pants }));
  return g;
}

/**
 * 사람 그림을 누를 수 있게 한다. 손가락으로 누르기 쉽게 몸 크기만 한 투명한 판을 깐다.
 * @param {SVGGElement} g frontPassenger나 backPassenger가 만든 그림
 */
export function makeTappable(g, person, onTap, seated) {
  g.insertBefore(svgEl('rect', { x: -18, y: -18, width: 36, height: seated ? 110 : 140, fill: 'transparent' }), g.firstChild);
  g.classList.add('passenger');
  g.setAttribute('role', 'button');
  g.setAttribute('tabindex', '0');
  g.setAttribute('aria-label', `${personLabel(person)}. 눌러서 이야기 듣기`);
  g.addEventListener('click', (event) => {
    event.stopPropagation();
    onTap(person);
  });
  g.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onTap(person);
    }
  });
  return g;
}

/** 대화창 얼굴 그림(앞모습, 크게) */
function portrait(person) {
  const svg = svgEl('svg', { class: 'talk-face', viewBox: '0 0 120 120', role: 'img' });
  svg.setAttribute('aria-label', `${person.name} 얼굴 그림`);
  svg.append(svgEl('circle', { cx: 60, cy: 60, r: 58, fill: '#EEF1F4' }));
  const g = svgEl('g', { transform: 'translate(60 52) scale(3)' });
  g.append(svgEl('rect', { x: -15, y: 12, width: 30, height: 20, rx: 9, fill: person.look.shirt, stroke: '#1F3342', 'stroke-width': 1 }));
  frontHead(g, person.look);
  svg.append(g);
  return svg;
}

/**
 * 대화창을 연다: 얼굴, 이름·나이·성별, 말풍선. 그 사람에게 맞는 목소리로 읽는다(기기에 목소리가 있으면).
 * @param {ReturnType<typeof makePerson>} person
 * @param {string[]} lines
 */
export function openTalk(person, lines) {
  for (const old of document.querySelectorAll('.talk-dialog')) old.remove();
  const dialog = element('dialog', 'talk-dialog');
  dialog.setAttribute('aria-label', `${person.name}의 이야기`);
  const head = element('div', 'talk-head');
  head.append(portrait(person));
  const who = element('div', 'talk-who');
  who.append(element('h2', null, person.name), element('p', 'talk-info', `${person.age}살 · ${person.gender} ${person.ageGroup}`));
  head.append(who);
  dialog.append(head);
  const bubble = element('div', 'talk-bubble');
  for (const line of lines) bubble.append(element('p', null, line));
  dialog.append(bubble);
  dialog.append(element('p', 'panel-note', '승객 이름과 이야기는 게임에서 지어낸 것이에요.'));
  const row = element('div', 'tool-row');
  const again = element('button', 'button', '다시 듣기');
  again.type = 'button';
  again.addEventListener('click', () => speakAs(lines, person));
  const close = element('button', 'button big', '닫기');
  close.type = 'button';
  const shut = () => {
    stopSpeaking();
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  close.addEventListener('click', shut);
  dialog.addEventListener('cancel', shut);
  row.append(again, close);
  dialog.append(row);
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute('open', '');
  }
  speakAs(lines, person).then((started) => {
    if (!started) again.hidden = true;
  });
  return dialog;
}
