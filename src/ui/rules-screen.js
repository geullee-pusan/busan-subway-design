// 규칙 카드 화면(docs/SPEC.md 9.1). 게임이 쓰는 규칙을 그대로 보여 준다. 숨은 계산은 없다.
// 부모 화면에서 들어오면 값을 바꾸고 "우리 집 규칙"으로 이름 붙여 저장할 수 있다.
import { ruleCards } from '../data.js';
import { ruleCardText, ruleValueText } from './format.js';
import { activeRuleSet, deleteRuleSet, loadRuleSets, saveRuleSet, useRuleSet } from './storage.js';
import { wordWithCard } from './word-card.js';

// 보여 주는 차례. 아이가 가장 잘 아는 것부터 둔다.
const GROUPS = [
  ['우리가 정한 값', '자료가 아니라 우리가 골라서 정한 값이에요.'],
  ['자료에서 구함', '실제 자료에서 가져온 값이에요.'],
  ['고정', '모델이 늘 쓰는 값이에요.'],
  ['추정', '자료를 못 구해서 어림한 값이에요.'],
  ['조정 손잡이', '실제 승하차 자료와 맞추려고 고른 값이에요. 바꾸면 "우리 계산 vs 진짜"가 달라져요.'],
];

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

/** 값이 범위 어디쯤인지 보여 주는 막대. 숫자는 늘 그림과 함께 보여 준다(CLAUDE.md). */
function valueBar(rule, value) {
  const NS = 'http://www.w3.org/2000/svg';
  const width = 220;
  const height = 14;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(height));
  svg.setAttribute('class', 'rule-bar');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `가장 작은 값 ${ruleValueText(rule, rule.min)}, 가장 큰 값 ${ruleValueText(rule, rule.max)}`);
  const track = document.createElementNS(NS, 'rect');
  track.setAttribute('x', '0');
  track.setAttribute('y', '4');
  track.setAttribute('width', String(width));
  track.setAttribute('height', '6');
  track.setAttribute('rx', '3');
  track.setAttribute('fill', 'rgba(31, 51, 66, 0.18)');
  svg.append(track);
  const span = rule.max - rule.min;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - rule.min) / span)) : 0;
  const fill = document.createElementNS(NS, 'rect');
  fill.setAttribute('x', '0');
  fill.setAttribute('y', '4');
  fill.setAttribute('width', String(Math.max(3, width * ratio)));
  fill.setAttribute('height', '6');
  fill.setAttribute('rx', '3');
  fill.setAttribute('fill', '#1F3342');
  svg.append(fill);
  return svg;
}

/**
 * @param {HTMLElement} root
 * @param {object} p onBack, canEdit, onApply(values|null)
 */
export function renderRules(root, { onBack, canEdit = false, onApply }) {
  root.replaceChildren();
  const screen = element('div', 'screen rules');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', canEdit ? '규칙 바꾸기' : '게임의 규칙'));
  bar.append(button(canEdit ? '부모 화면으로' : '처음으로', 'button', onBack));
  screen.append(bar);

  const body = element('div', 'compare-body');
  screen.append(body);
  root.append(screen);

  // 지금 쓰는 값: 저장한 묶음이 있으면 그 값으로 시작한다.
  const active = activeRuleSet();
  let values = { ...(active?.values ?? {}) };
  const valueOf = (rule) => values[rule.id] ?? rule.value;

  const intro = element('p');
  intro.append(
    element('span', null, '게임이 쓰는 규칙이에요. 숨은 계산은 없어요. '),
    wordWithCard('모델', '모델'),
    element('span', null, '이 이 규칙대로만 셈해요.'),
  );
  body.append(intro);

  if (!canEdit) body.append(element('p', 'panel-note guide', '값은 부모 화면에서 바꿀 수 있어요.'));

  const status = element('p', 'panel-note');
  body.append(status);

  function refreshStatus() {
    const changed = Object.keys(values).length;
    const name = activeRuleSet()?.name;
    status.textContent = name
      ? `지금은 "${name}" 규칙으로 돌려요. 기본과 다른 규칙이 ${changed}개예요.`
      : changed > 0
        ? `기본 규칙에서 ${changed}개를 바꿨어요. 아직 저장하지 않았어요.`
        : '지금은 기본 규칙으로 돌려요.';
  }

  const cardNodes = new Map();

  for (const [kind, note] of GROUPS) {
    const group = ruleCards.filter((rule) => rule.kind === kind);
    if (group.length === 0) continue;
    body.append(element('h2', null, kind));
    body.append(element('p', 'panel-note', note));
    const list = element('div', 'rule-list');
    for (const rule of group) list.append(ruleCard(rule));
    body.append(list);
  }

  function ruleCard(rule) {
    const card = element('article', 'rule-card');
    const text = element('p', 'rule-text');
    card.append(text);
    const bars = element('div', 'rule-bar-row');
    const barHolder = element('div', 'rule-bar-holder');
    bars.append(barHolder);
    card.append(bars);

    const draw = () => {
      const value = valueOf(rule);
      text.textContent = ruleCardText(rule, value);
      barHolder.replaceChildren(valueBar(rule, value));
      if (values[rule.id] !== undefined) card.classList.add('is-changed');
      else card.classList.remove('is-changed');
    };

    if (canEdit) {
      const row = element('div', 'rule-edit');
      const nudge = (delta) => () => {
        const next = Math.min(rule.max, Math.max(rule.min, Number((valueOf(rule) + delta).toFixed(4))));
        if (next === rule.value) delete values[rule.id];
        else values[rule.id] = next;
        draw();
        refreshStatus();
      };
      row.append(button('−', 'button round', nudge(-rule.step)));
      row.append(button('+', 'button round', nudge(rule.step)));
      row.append(
        button('처음 값으로', 'button', () => {
          delete values[rule.id];
          draw();
          refreshStatus();
        }),
      );
      card.append(row);
      card.append(
        element('p', 'panel-note', `${ruleValueText(rule, rule.min)}에서 ${ruleValueText(rule, rule.max)}까지 고를 수 있어요.`),
      );
    }

    // 어른용 설명은 눌러야 보인다.
    const note = element('p', 'panel-note');
    note.hidden = true;
    note.textContent = `${rule.note} (지금 값 ${valueOf(rule)}${rule.unit ? ` ${rule.unit}` : ''}, 기본값 ${rule.value})`;
    const toggle = button('어른을 위한 설명', 'more-button', () => {
      note.hidden = !note.hidden;
      toggle.setAttribute('aria-expanded', String(!note.hidden));
      toggle.textContent = note.hidden ? '어른을 위한 설명' : '접기';
      note.textContent = `${rule.note} (지금 값 ${valueOf(rule)}${rule.unit ? ` ${rule.unit}` : ''}, 기본값 ${rule.value})`;
    });
    toggle.setAttribute('aria-expanded', 'false');
    card.append(toggle, note);

    cardNodes.set(rule.id, draw);
    draw();
    return card;
  }

  if (canEdit) {
    body.append(element('h2', null, '우리 집 규칙'));
    body.append(element('p', null, '바꾼 규칙에 이름을 붙여 저장해요. 언제든 기본 규칙으로 돌아올 수 있어요.'));

    const nameRow = element('div', 'tool-row');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.maxLength = 20;
    input.placeholder = '예: 느린 걸음';
    input.value = active?.name ?? '';
    input.setAttribute('aria-label', '규칙 묶음 이름');
    nameRow.append(input);
    const saved = element('p', 'panel-note');

    nameRow.append(
      button('우리 집 규칙으로 저장', 'button', () => {
        const name = input.value.trim();
        if (!name) {
          saved.textContent = '이름을 적어 주세요.';
          return;
        }
        if (Object.keys(values).length === 0) {
          saved.textContent = '바꾼 규칙이 없어요. 값을 먼저 바꿔 보세요.';
          return;
        }
        saveRuleSet(name, values);
        onApply?.(values);
        saved.textContent = `"${name}"으로 저장했어요. 이제 이 규칙으로 돌려요.`;
        refreshStatus();
        drawSets();
      }),
    );
    body.append(nameRow, saved);

    const setList = element('ul', 'panel-list');
    body.append(setList);

    function drawSets() {
      setList.replaceChildren();
      const { sets, activeName } = loadRuleSets();
      if (sets.length === 0) {
        setList.append(element('li', null, '저장한 규칙 묶음이 아직 없어요.'));
        return;
      }
      for (const set of sets) {
        const item = element('li');
        const changed = Object.keys(set.values).length;
        item.append(
          element('span', null, `${set.name} (${set.savedOn}, 바꾼 규칙 ${changed}개)${set.name === activeName ? ' — 지금 써요' : ''} `),
        );
        item.append(
          button('이걸로 돌리기', 'button', () => {
            useRuleSet(set.name);
            values = { ...set.values };
            for (const draw of cardNodes.values()) draw();
            onApply?.(values);
            refreshStatus();
            drawSets();
          }),
        );
        item.append(
          button('지우기', 'button', () => {
            deleteRuleSet(set.name);
            if (set.name === activeName) {
              values = {};
              for (const draw of cardNodes.values()) draw();
              onApply?.(null);
            }
            refreshStatus();
            drawSets();
          }),
        );
        setList.append(item);
      }
    }
    drawSets();

    body.append(
      button('기본 규칙으로 돌아가기', 'button big', () => {
        useRuleSet(null);
        values = {};
        for (const draw of cardNodes.values()) draw();
        onApply?.(null);
        saved.textContent = '기본 규칙으로 돌아왔어요.';
        refreshStatus();
        drawSets();
      }),
    );
  }

  refreshStatus();
  return () => {};
}
