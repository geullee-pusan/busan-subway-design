// 과제 카드 고르기(docs/SPEC.md 8장). 별이나 점수는 없다. 카드마다 상황, 질문, 예산, 기준 연도가 있다.
import { missions, standards } from '../data.js';
import { moneyText } from './format.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{onPick: (mission: object) => void, onHome: () => void}} actions */
export function renderMissions(root, { onPick, onHome }) {
  root.replaceChildren();
  const screen = element('div', 'screen missions');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '과제 카드'));
  const home = element('button', 'button', '처음으로');
  home.type = 'button';
  home.addEventListener('click', onHome);
  bar.append(home);
  screen.append(bar);

  const body = element('div', 'compare-body');
  body.append(element('p', 'guide', '하고 싶은 과제를 골라요. 정답은 없어요.'));

  const list = element('div', 'mission-list');
  for (const mission of missions) {
    const card = element('article', 'mission-card');
    const title = element('h2', null, `${mission.number}. ${mission.title}`);
    card.append(title);
    for (const line of mission.situation) card.append(element('p', null, line));
    card.append(element('p', 'mission-question', mission.question));

    const facts = element('ul', 'panel-list');
    facts.append(element('li', null, `쓸 수 있는 돈: ${moneyText(mission.budget100M)}`));
    facts.append(element('li', null, `${mission.baseYear}년 부산으로 해요`));
    if (mission.dayType !== '평일') facts.append(element('li', null, `${mission.dayType} 자료로 하루를 돌려요`));
    card.append(facts);

    // 성취기준 원문은 어른이 쓰는 말이라, 눌러야 보이게 접어 둔다.
    if (mission.standards.length > 0) {
      const learn = element('p', 'panel-note');
      learn.hidden = true;
      for (const code of mission.standards) {
        const item = element('span', 'standard-line');
        item.textContent = `[${code}] ${standards[code]?.text ?? '원문을 아직 확인하지 못했어요'}`;
        learn.append(item);
      }
      const toggle = element('button', 'more-button', '어른을 위한 설명');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        learn.hidden = !learn.hidden;
        toggle.setAttribute('aria-expanded', String(!learn.hidden));
        toggle.textContent = learn.hidden ? '어른을 위한 설명' : '접기';
      });
      card.append(toggle, learn);
    }

    const go = element('button', 'button big', '이 과제 하기');
    go.type = 'button';
    go.addEventListener('click', () => onPick(mission));
    card.append(go);
    list.append(card);
  }
  body.append(list);
  screen.append(body);
  root.append(screen);
  return () => {};
}
