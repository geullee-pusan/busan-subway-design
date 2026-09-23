// 설계 가와 나를 나란히 견주는 화면(SPEC 12장 Phase 5).
import { barChart } from './chart.js';
import { countText, distanceText, moneyText } from './format.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{designs: {가: object|null, 나: object|null}, onHome: () => void}} p */
export function renderAB(root, { designs, onHome }) {
  root.replaceChildren();
  const screen = element('div', 'screen ab');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '설계 가와 나 견주기'));
  const home = element('button', 'button', '처음으로');
  home.type = 'button';
  home.addEventListener('click', onHome);
  bar.append(home);
  screen.append(bar);

  const body = element('div', 'compare-body');
  screen.append(body);
  root.append(screen);

  const a = designs['가'];
  const b = designs['나'];
  if (!a || !b) {
    body.append(element('h2', null, '아직 견줄 설계가 모자라요'));
    body.append(element('p', null, '노선을 그려서 하루 운행을 해 보세요. 결과 화면에서 가 칸과 나 칸에 하나씩 저장해요.'));
    const list = element('ul', 'panel-list');
    for (const slot of ['가', '나']) {
      const saved = designs[slot];
      list.append(element('li', null, saved ? `${slot} 칸: ${saved.title ?? '내 노선'} (${saved.savedOn})` : `${slot} 칸: 비어 있어요`));
    }
    body.append(list);
    return () => {};
  }

  body.append(element('h2', null, '무엇이 다를까요?'));
  const titles = element('ul', 'panel-list');
  titles.append(element('li', null, `가: ${a.title ?? '내 노선'} (${a.savedOn})`));
  titles.append(element('li', null, `나: ${b.title ?? '내 노선'} (${b.savedOn})`));
  body.append(titles);

  // 줄마다 재는 것이 달라서(사람, 돈, 거리, 개수) 값을 쓰는 법도 다르다.
  const rows = [
    { label: '하루에 타고 내린 사람', get: (d) => d.newRiders, text: (v) => countText(v) },
    { label: '빨라진 사람', get: (d) => d.faster, text: (v) => countText(v) },
    { label: '공사비', get: (d) => d.cost, text: (v) => moneyText(v) },
    { label: '노선 길이', get: (d) => d.lengthKm, text: (v) => distanceText(v * 1000) },
    { label: '역 수', get: (d) => d.stations, text: (v) => `${v}개` },
  ];

  for (const row of rows) {
    body.append(element('h3', null, row.label));
    const items = [
      { label: '가', value: row.get(a), text: row.text(row.get(a)) },
      { label: '나', value: row.get(b), text: row.text(row.get(b)) },
    ];
    body.append(barChart(items, { width: 360 }));
  }

  // 돈 한 푼으로 몇 명을 태웠나
  const per = (design) => (design.cost > 0 ? design.newRiders / design.cost : 0);
  const aPer = per(a);
  const bPer = per(b);
  body.append(element('h2', null, '돈을 잘 썼을까요?'));
  body.append(element('p', null, '공사비 100억 원마다 몇 명을 태우는지 보여 줘요.'));
  body.append(
    barChart(
      [
        { label: '가', value: Math.round(aPer * 100), text: `${Math.round(aPer * 100)}명` },
        { label: '나', value: Math.round(bPer * 100), text: `${Math.round(bPer * 100)}명` },
      ],
      { width: 360 },
    ),
  );
  body.append(
    element(
      'p',
      'panel-note',
      aPer === bPer ? '둘이 비슷해요.' : `${aPer > bPer ? '가' : '나'} 설계가 같은 돈으로 더 많은 사람을 태워요.`,
    ),
  );
  body.append(element('p', 'panel-note guide', '어느 쪽이 더 좋은 노선인지는 사람마다 생각이 달라요.'));

  return () => {};
}
