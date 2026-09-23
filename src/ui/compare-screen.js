// "우리 계산 vs 진짜" 화면(docs/SPEC.md 5.6). 모델 결과를 실제 자료와 나란히 보여 준다.
// 틀린 곳도 숨기지 않고 "왜 다를까요?"를 함께 적는다.
import { lineById, ridership, stationById } from '../data.js';
import { comparison, todayRun } from '../model.js';
import { comparisonChart } from './chart.js';
import { countText, stationLabel } from './format.js';
import { activeRuleSet } from './storage.js';
import { wordWithCard } from './word-card.js';

const WHY = [
  '우리 계산은 집에서 큰 중심지로 가는 길만 세어요. 학교나 친구 집으로 가는 길은 빼먹었어요.',
  '중심지 크기는 우리가 정한 값이에요. 진짜 일자리 수를 넣으면 더 잘 맞을 거예요.',
  '버스 시간은 곧은 거리로 어림했어요. 진짜 버스 길과 막히는 길은 넣지 않았어요.',
  '갈아타기만 하고 나가지 않는 사람은 진짜 자료에 안 세는데, 우리 계산은 조금 다르게 세요.',
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{onHome: () => void}} actions */
export function renderCompare(root, { onHome }) {
  // 규칙을 바꾸면 이 견주기도 달라진다. 어떤 규칙으로 돌렸는지 늘 적는다(SPEC 9.1).
  const ruleSet = activeRuleSet();
  root.replaceChildren();
  const screen = element('div', 'screen compare');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '우리 계산 vs 진짜'));
  const home = element('button', 'button', '처음으로');
  home.type = 'button';
  home.addEventListener('click', onHome);
  bar.append(home);
  screen.append(bar);

  const body = element('div', 'compare-body');
  screen.append(body);
  root.append(screen);

  // 계산은 조금 걸릴 수 있어서 화면을 먼저 띄운다.
  body.append(element('p', null, '계산하고 있어요…'));
  setTimeout(() => {
    const { result } = todayRun();
    const compared = comparison();
    body.replaceChildren();

    body.append(element('h2', null, '하루에 타고 내리는 사람'));
    const totals = element('p');
    totals.append(
      element(
        'span',
        null,
        `우리 계산은 ${countText(compared.totals.model)}, 진짜는 ${countText(compared.totals.real)}이에요.`,
      ),
    );
    body.append(totals);
    const diff = Math.abs(compared.totals.diffPercent);
    body.append(
      element('p', 'panel-note', diff < 1 ? '거의 같아요.' : `우리 계산이 진짜보다 ${diff.toFixed(0)}% ${compared.totals.diffPercent > 0 ? '많아요' : '적어요'}.`),
    );

    body.append(element('h2', null, '많이 타는 역 10곳을 견줘 봐요'));
    const rows = compared.pairs.slice(0, 10).map((p) => {
      const station = stationById.get(p.id);
      const line = station ? lineById.get(station.line) : null;
      return { label: `${stationLabel(p.name)}${line ? ` · ${line.name}` : ''}`, real: p.real, model: p.model };
    });
    body.append(comparisonChart(rows, {}));
    const matched = compared.topMatch.matched;
    body.append(element('p', null, `진짜로 사람이 많은 역 10곳 가운데 ${matched}곳을 우리 계산도 많다고 했어요.`));

    if (ruleSet) {
      body.append(
        element('p', 'warn', `"${ruleSet.name}" 규칙으로 돌린 값이에요. 기본 규칙일 때와 달라요.`),
      );
    } else {
      body.append(element('p', 'panel-note', '기본 규칙으로 돌린 값이에요.'));
    }

    body.append(element('h2', null, '왜 다를까요?'));
    const why = element('ul', 'panel-list');
    for (const text of WHY) why.append(element('li', null, text));
    body.append(why);

    const note = element('p');
    note.append(
      element('span', null, '우리 계산은 '),
      wordWithCard('격자', '격자'),
      element('span', null, ` 칸마다 사는 사람으로 이동을 만들고, 가까운 역 3개까지 살펴서 가장 빠른 길을 골라요. 오늘 계산에서 도시철도를 탄 사람은 ${countText(result.totals.railTrips * 2)}이에요.`),
    );
    body.append(note);
    body.append(element('p', 'panel-source', `견준 자료: ${ridership.source}`));
  }, 0);

  return () => {};
}
