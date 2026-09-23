// 첫 화면. 여기서만 새 하루를 시작한다(SPEC 6장 끝나는 방식).
import { clearAll, runsLeft } from './storage.js';

const CREDITS = [
  '© OpenStreetMap contributors (openstreetmap.org/copyright)',
  '행정동 경계: 통계청 SGIS(공공누리 제1유형), vuski/admdongkor 가공(CC BY 4.0)',
  '고도: SRTM(U.S. Geological Survey)',
  '역·운행·인구: 부산교통공사, 국가철도공단, 한국철도공사, 김해시, 행정안전부(공공데이터포털)',
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bigButton(label, onClick) {
  const node = element('button', 'button big', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {object} actions onExplore, onCompare, onDesign, onMissions, onAB, onHistory, onRules, onParent, onCleared, settings, onSetting, ruleSetName
 */
export function renderHome(root, {
  onExplore,
  onCompare,
  onDesign,
  onMissions,
  onAB,
  onHistory,
  onRules,
  onParent,
  settings,
  onSetting,
  onCleared,
  ruleSetName = null,
}) {
  root.replaceChildren();

  const main = element('main', 'screen home');
  const head = element('div', 'home-head');
  head.append(element('h1', null, '부산 도시철도 설계실'));
  const parentButton = element('button', 'button', '부모');
  parentButton.type = 'button';
  parentButton.addEventListener('click', onParent);
  head.append(parentButton);
  main.append(head);

  const buttons = element('div', 'home-buttons');
  buttons.append(bigButton('부산 둘러보기', onExplore), bigButton('과제 카드', onMissions), bigButton('자유 설계', onDesign));
  main.append(buttons);

  const more = element('div', 'home-buttons');
  const small = (label, onClick) => {
    const node = element('button', 'button', label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };
  more.append(
    small('옛날 부산', onHistory),
    small('게임의 규칙', onRules),
    small('설계 가와 나 견주기', onAB),
    small('우리 계산 vs 진짜', onCompare),
  );
  main.append(more);
  if (ruleSetName) main.append(element('p', 'home-note', `지금은 "${ruleSetName}" 규칙으로 돌려요.`));

  main.append(element('p', 'home-note', '지도에서 역을 눌러 보세요. 노선을 그려서 하루 운행도 해 볼 수 있어요.'));

  // 하루 운행 횟수: 처음 실행할 때 부모가 정한다.
  if (settings.runsPerDay === null) {
    const card = element('div', 'parent-card');
    card.append(element('h2', null, '부모님께'));
    card.append(element('p', null, '하루에 몇 번 운행할까요? 나중에 바꿀 수 있어요.'));
    const row = element('div', 'tool-row');
    for (const count of [1, 2, 3, 5]) {
      const node = element('button', 'button', `${count}번`);
      node.type = 'button';
      node.addEventListener('click', () => onSetting({ runsPerDay: count }));
      row.append(node);
    }
    const none = element('button', 'button', '정하지 않기');
    none.type = 'button';
    none.addEventListener('click', () => onSetting({ runsPerDay: 0 }));
    row.append(none);
    card.append(row);
    main.append(card);
  } else if (settings.runsPerDay > 0) {
    const left = runsLeft(settings);
    const line = element('p', 'home-note', left > 0 ? `오늘 하루 운행을 ${left}번 할 수 있어요.` : '오늘 운행은 모두 끝났어요. 내일 첫차는 05:30이에요.');
    main.append(line);
    const change = element('button', 'button', '하루 운행 횟수 바꾸기');
    change.type = 'button';
    change.addEventListener('click', () => onSetting({ runsPerDay: null }));
    main.append(change);
  }

  // 부모 화면의 네 자리 숫자를 잊었을 때 쓰는 길(SPEC 9.2). 두 번 물어본다.
  const wipe = element('div', 'home-wipe');
  const wipeStart = element('button', 'quiet-button', '저장한 것 모두 지우기');
  wipeStart.type = 'button';
  wipeStart.addEventListener('click', () => {
    wipe.replaceChildren();
    wipe.append(element('p', 'warn', '설정, 저장한 설계, 우리 집 규칙, 부모 화면 숫자를 모두 지울까요? 되돌릴 수 없어요.'));
    const row = element('div', 'tool-row');
    const yes = element('button', 'button', '네, 지워요');
    yes.type = 'button';
    yes.addEventListener('click', () => {
      clearAll();
      onCleared();
    });
    const no = element('button', 'button', '아니요');
    no.type = 'button';
    no.addEventListener('click', () => {
      wipe.replaceChildren(wipeStart);
    });
    row.append(yes, no);
    wipe.append(row);
  });
  wipe.append(wipeStart);
  main.append(wipe);

  const credits = element('ul', 'credits');
  for (const text of CREDITS) credits.append(element('li', null, text));
  main.append(credits);

  root.append(main);
}
