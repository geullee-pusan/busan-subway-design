// 부모 화면(docs/SPEC.md 9.2). 네 자리 숫자로 잠근다.
// 이 잠금은 아이가 잘못 눌러 들어가지 않게 막는 것이지 보안 장치가 아니다. 화면에도 그렇게 적는다.
import { sources } from '../data.js';
import { checkPin, clearAll, hasPin, savePin } from './storage.js';

const NUMBER_MODES = ['기본', '진짜 숫자'];
const RUN_COUNTS = [1, 2, 3, 5];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** 네 자리 숫자 입력칸 */
function pinInput(labelText) {
  const box = element('div', 'pin-box');
  const label = element('label', null, labelText);
  const input = document.createElement('input');
  input.type = 'password';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.maxLength = 4;
  input.className = 'text-input pin-input';
  input.id = `pin-${Math.random().toString(36).slice(2, 8)}`;
  label.htmlFor = input.id;
  box.append(label, input);
  box.input = input;
  return box;
}

/**
 * @param {HTMLElement} root
 * @param {object} p onHome, onRules, onCleared, ruleSetName
 * @param {object} p.settings 지금 설정
 * @param {(next: object) => object} p.onSetting 설정을 저장하고 새 설정을 돌려준다(화면은 그대로 둔다)
 */
export function renderParent(root, { onHome, onRules, settings, onSetting, onCleared, ruleSetName }) {
  // 설정을 바꿔도 부모 화면에 그대로 머문다(다시 잠금을 묻지 않는다).
  let current = settings;
  const change = (next) => {
    current = onSetting(next) ?? { ...current, ...next };
    showMenu();
  };
  root.replaceChildren();
  const screen = element('div', 'screen parent');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '부모 화면'));
  bar.append(button('처음으로', 'button', onHome));
  screen.append(bar);

  const body = element('div', 'compare-body');
  screen.append(body);
  root.append(screen);

  if (!hasPin()) return askNewPin();
  return askPin();

  /** 처음 들어올 때: 네 자리 숫자를 정한다. */
  function askNewPin() {
    body.append(element('h2', null, '네 자리 숫자를 정해 주세요'));
    body.append(element('p', null, '아이가 이 화면에 들어오지 않게 막는 숫자예요.'));
    body.append(
      element('p', 'panel-note', '이 숫자는 이 기기 안에만 있어요. 아무 데도 보내지 않아요. 비밀번호처럼 튼튼한 잠금은 아니에요.'),
    );
    const first = pinInput('네 자리 숫자');
    const again = pinInput('한 번 더');
    const message = element('p', 'warn');
    body.append(first, again, message);
    body.append(
      button('정하기', 'button big', () => {
        const value = first.input.value.trim();
        if (!/^\d{4}$/.test(value)) {
          message.textContent = '숫자 네 자리를 적어 주세요.';
          return;
        }
        if (value !== again.input.value.trim()) {
          message.textContent = '두 번 적은 숫자가 달라요.';
          return;
        }
        // 저장이 안 되는 기기(사생활 보호 창 등)에서도 화면은 열어 준다.
        if (!savePin(value)) message.textContent = '이 기기에서는 숫자를 저장하지 못했어요. 이번만 열어 드려요.';
        showMenu();
      }),
    );
    body.append(element('p', 'panel-note', '잊으면 처음 화면의 "저장한 것 모두 지우기"로 다시 정할 수 있어요.'));
    return () => {};
  }

  /** 들어올 때마다: 네 자리 숫자를 묻는다. */
  function askPin() {
    body.append(element('h2', null, '네 자리 숫자를 넣어 주세요'));
    const box = pinInput('네 자리 숫자');
    const message = element('p', 'warn');
    body.append(box, message);
    const tryPin = () => {
      if (checkPin(box.input.value.trim())) showMenu();
      else {
        message.textContent = '숫자가 달라요. 다시 해 보세요.';
        box.input.value = '';
        box.input.focus();
      }
    };
    box.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') tryPin();
    });
    body.append(button('들어가기', 'button big', tryPin));
    body.append(
      element('p', 'panel-note', '잊으셨나요? 처음 화면 맨 아래 "저장한 것 모두 지우기"를 누르면 다시 정할 수 있어요. 저장한 설계도 함께 지워져요.'),
    );
    return () => {};
  }

  function showMenu() {
    body.replaceChildren();

    // 1. 숫자 표시 모드
    body.append(element('h2', null, '숫자 표시'));
    body.append(element('p', null, '큰 수를 어떻게 보여 줄까요?'));
    const modeRow = element('div', 'tool-row');
    modeRow.setAttribute('role', 'group');
    modeRow.setAttribute('aria-label', '숫자 표시 모드 고르기');
    for (const mode of NUMBER_MODES) {
      const node = button(mode, 'button', () => change({ numberMode: mode }));
      const on = current.numberMode === mode;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
      modeRow.append(node);
    }
    body.append(modeRow);
    body.append(
      element(
        'p',
        'panel-note',
        current.numberMode === '진짜 숫자'
          ? '지금은 "42,380명", "1조 1,265억 원"처럼 보여 줘요. 4학년쯤에 맞아요.'
          : '지금은 "약 4만 2천 명", "약 1조 1천억 원"처럼 보여 줘요. 3학년쯤에 맞아요.',
      ),
    );

    // 2. 하루 운행 횟수
    body.append(element('h2', null, '하루 운행 횟수'));
    body.append(element('p', null, '하루에 몇 번 운행할까요?'));
    const runRow = element('div', 'tool-row');
    runRow.setAttribute('role', 'group');
    runRow.setAttribute('aria-label', '하루 운행 횟수 고르기');
    for (const count of RUN_COUNTS) {
      const node = button(`${count}번`, 'button', () => change({ runsPerDay: count }));
      const on = current.runsPerDay === count;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
      runRow.append(node);
    }
    const none = button('정하지 않기', 'button', () => change({ runsPerDay: 0 }));
    const noneOn = current.runsPerDay === 0;
    none.classList.toggle('is-on', noneOn);
    none.setAttribute('aria-pressed', String(noneOn));
    runRow.append(none);
    body.append(runRow);
    body.append(element('p', 'panel-note', `오늘은 ${current.runsUsed}번 했어요. 날짜가 바뀌면 다시 셈해요.`));

    // 3. 규칙 편집
    body.append(element('h2', null, '규칙 바꾸기'));
    body.append(element('p', null, '게임이 쓰는 규칙을 바꾸고 "우리 집 규칙"으로 저장해요.'));
    body.append(element('p', 'panel-note', ruleSetName ? `지금은 "${ruleSetName}" 규칙으로 돌려요.` : '지금은 기본 규칙으로 돌려요.'));
    body.append(button('규칙 바꾸러 가기', 'button big', onRules));

    // 4. 데이터 출처
    body.append(element('h2', null, '이 숫자는 어디서 왔나요?'));
    for (const group of sources.groups) {
      body.append(element('h3', null, group.title));
      const list = element('ul', 'panel-list');
      for (const item of group.items) {
        const li = element('li');
        li.append(element('strong', null, item.what));
        li.append(element('span', null, ` — ${item.from}`));
        li.append(element('span', 'panel-note', ` ${item.when} · ${item.license}`));
        list.append(li);
      }
      body.append(list);
    }
    body.append(element('p', 'panel-note', '자세한 기록은 저장소의 data/SOURCES.md에 있어요.'));

    // 5. 저장 데이터 지우기
    body.append(element('h2', null, '저장한 것 지우기'));
    body.append(element('p', null, '설정, 저장한 설계, 우리 집 규칙, 네 자리 숫자를 모두 지워요.'));
    const wipe = element('div');
    body.append(wipe);
    wipe.append(
      button('저장한 것 모두 지우기', 'button', () => {
        wipe.replaceChildren();
        wipe.append(element('p', 'warn', '정말 지울까요? 되돌릴 수 없어요.'));
        const row = element('div', 'tool-row');
        row.append(
          button('네, 지워요', 'button', () => {
            clearAll();
            onCleared();
          }),
        );
        row.append(button('아니요', 'button', () => showMenu()));
        wipe.append(row);
      }),
    );
  }
}
