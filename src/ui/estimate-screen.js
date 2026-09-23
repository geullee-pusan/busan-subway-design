// 어림하기 화면(SPEC 6장 3번). 막대를 끌어 "하루에 몇 명 탈까요?"를 맞혀 본다.
// 건너뛸 수 있지만 해 보기를 권한다.
import { countText } from './format.js';

const STEPS = [0, 5000, 10000, 20000, 30000, 50000, 70000, 100000, 150000, 200000, 300000, 500000];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{onDone: (estimate: number|null) => void, onBack: () => void}} actions */
export function renderEstimate(root, { onDone, onBack }) {
  root.replaceChildren();
  const screen = element('div', 'screen estimate');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '어림하기'));
  const back = element('button', 'button', '설계로');
  back.type = 'button';
  back.addEventListener('click', onBack);
  bar.append(back);
  screen.append(bar);

  const body = element('div', 'compare-body');
  body.append(element('h2', null, '내가 그린 노선에 하루에 몇 명이 탈까요?'));
  body.append(element('p', null, '막대를 끌어서 어림해 보세요. 맞히지 않아도 괜찮아요.'));

  let index = 4; // 3만 명에서 시작
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(STEPS.length - 1);
  slider.step = '1';
  slider.value = String(index);
  slider.className = 'estimate-slider';
  slider.setAttribute('aria-label', '하루에 타는 사람 어림하기');

  const gauge = element('div', 'estimate-gauge');
  const fill = element('div', 'estimate-fill');
  gauge.append(fill);
  const value = element('p', 'estimate-value');

  function update() {
    index = Number(slider.value);
    const people = STEPS[index];
    fill.style.width = `${(index / (STEPS.length - 1)) * 100}%`;
    value.textContent = `내 어림: ${countText(people)}`;
  }
  slider.addEventListener('input', update);
  update();

  body.append(gauge, slider, value);

  const buttons = element('div', 'tool-row');
  const go = element('button', 'button big', '이걸로 하루 운행');
  go.type = 'button';
  go.addEventListener('click', () => onDone(STEPS[index]));
  const skip = element('button', 'button', '어림 건너뛰기');
  skip.type = 'button';
  skip.addEventListener('click', () => onDone(null));
  buttons.append(go, skip);
  body.append(buttons);
  body.append(element('p', 'panel-note guide', '어림한 값과 계산한 값을 나중에 나란히 보여 줄게요.'));

  screen.append(body);
  root.append(screen);
  return () => {};
}
