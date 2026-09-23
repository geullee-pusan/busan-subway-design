// 결과 화면과 설명하기(SPEC 6장 5·6번).
// 이용객 막대, 시간대별 꺾은선, 가장 붐빈 곳(사람 아이콘), 빨라진 사람, 공사비, 어림과 비교.
// 세 문장으로 설명하고, 결과 카드를 그림으로 저장하거나 인쇄할 수 있다.
import { lineById, planned, ridership, stationById } from '../data.js';
import { BASE_YEAR, networkOfYear } from '../model.js';
import { NEW_LINE_ID } from '../sim/design-world.js';
import { busiestLinks } from '../sim/effect.js';
import { barChart, hourlyLineChart } from './chart.js';
import { countText, distanceText, moneyText, stationLabel } from './format.js';
import { labelInk } from './map.js';
import { wordWithCard } from './word-card.js';

const NS = 'http://www.w3.org/2000/svg';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 역 이름. 새로 그린 역은 설계 화면에서 정한 이름(없으면 "새 역 n")으로 부른다. */
function nameOf(id, newNames) {
  if (id.startsWith(`${NEW_LINE_ID}-`)) {
    // 설계 화면에서 정한 이름. 차례로 부른 '새 역 n'에는 '역'을 붙이지 않는다.
    const name = newNames.get(id) ?? '새 역';
    return name.startsWith('새 역') ? name : stationLabel(name);
  }
  const station = stationById.get(id);
  return station ? stationLabel(station.name) : id;
}

/** 붐빔을 사람 아이콘 개수로 보여 준다. 10개면 열차가 꽉 찬 것이다. */
function crowdIcons(ratio) {
  const box = element('div', 'crowd-icons');
  const count = Math.max(1, Math.min(20, Math.round(ratio * 10)));
  for (let i = 0; i < count; i++) {
    const icon = element('span', i < 10 ? 'crowd-icon' : 'crowd-icon over');
    icon.textContent = '●';
    box.append(icon);
  }
  return box;
}

/** 결과 카드(그림). 저장하거나 인쇄할 때 쓴다. */
function resultCard({ summary, sentences }) {
  const width = 820;
  const height = 560;
  const svg = svgEl('svg', { xmlns: NS, width, height, viewBox: `0 0 ${width} ${height}`, 'font-family': 'sans-serif' });
  svg.append(svgEl('rect', { width, height, fill: '#FFFFFF' }));
  svg.append(svgEl('rect', { x: 0, y: 0, width, height: 68, fill: '#1F3342' }));
  svg.append(svgEl('text', { x: 28, y: 44, 'font-size': 26, 'font-weight': 700, fill: '#FFFFFF' }, '내가 만든 노선'));
  let y = 118;
  for (const line of summary) {
    svg.append(svgEl('text', { x: 28, y, 'font-size': 20, fill: '#1F3342' }, line));
    y += 34;
  }
  y += 10;
  svg.append(svgEl('line', { x1: 28, y1: y - 18, x2: width - 28, y2: y - 18, stroke: '#1F3342', 'stroke-opacity': 0.3 }));
  for (const sentence of sentences) {
    if (!sentence) continue;
    svg.append(svgEl('text', { x: 28, y, 'font-size': 20, fill: '#1F3342' }, sentence));
    y += 32;
  }
  svg.append(
    svgEl(
      'text',
      { x: 28, y: height - 24, 'font-size': 14, fill: '#1F3342', 'fill-opacity': 0.7 },
      '부산 도시철도 설계실 · 자료: 부산교통공사, 행정안전부, OpenStreetMap contributors',
    ),
  );
  return svg;
}

/** SVG를 PNG로 바꿔 내려받는다. 네트워크를 쓰지 않는다. */
function downloadCard(svg) {
  const text = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Number(svg.getAttribute('width')) * 2;
    canvas.height = Number(svg.getAttribute('height')) * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (!png) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(png);
      link.download = '내가-만든-노선.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  };
  image.src = url;
}

/**
 * @param {object} p design, cost, result, effect, estimate, newNames, runsLeftText, onHome, onAgain
 */
export function renderResult(root, { design, cost, result, effect, estimate, newNames, endingText, onHome, onRide = null, mission, voices = [], onSave, ruleSetName = null }) {
  root.replaceChildren();
  const screen = element('div', 'screen result');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', mission ? `${mission.number}. ${mission.title}` : '하루 운행 결과'));
  screen.append(bar);

  const body = element('div', 'compare-body');
  screen.append(body);
  root.append(screen);

  const newStations = result.stations.filter((s) => s.id.startsWith(`${NEW_LINE_ID}-`));
  /** 내가 고른 새 노선 색(너무 밝으면 막대가 안 보여서 진하게) */
  const myColor = labelInk(design.color ?? '#C0392B');
  const newRiders = newStations.reduce((sum, s) => sum + s.board + s.alight, 0);
  const dayType = mission?.dayType ?? '평일';
  const shape = ridership.shape[dayType] ?? ridership.shape['평일'];
  const peakHour = shape.indexOf(Math.max(...shape));

  if (mission) {
    body.append(element('h2', null, '오늘의 질문'));
    body.append(element('p', 'mission-question', mission.question));
    body.append(element('p', 'panel-note guide', '아래 숫자를 보고 생각해 보세요. 정답은 없어요.'));
  }

  // 1. 새 노선 이용객과 어림 비교
  body.append(element('h2', null, `내 노선(${design.lineName ?? '새 노선'})에 탄 사람`));
  body.append(
    barChart(
      [
        { label: '내 노선', value: newRiders, color: myColor },
        ...(estimate !== null ? [{ label: '내 어림', value: estimate, color: '#1F3342' }] : []),
      ],
      {},
    ),
  );
  if (estimate !== null) {
    const diff = Math.abs(newRiders - estimate);
    const more = newRiders > estimate;
    body.append(
      element('p', null, `내 어림은 ${countText(estimate)}, 계산 결과는 ${countText(newRiders)}이에요. 차이는 ${countText(diff)}${more ? '이 더 많아요' : '이 더 적어요'}.`),
    );
  } else {
    body.append(element('p', null, `내 노선에는 하루에 ${countText(newRiders)}이 타고 내려요.`));
  }

  // 2. 시간대별
  body.append(element('h2', null, '시간대별로 보면'));
  body.append(hourlyLineChart([{ label: '타는 사람', values: result.byHour.map((v) => v * (newRiders / Math.max(1, result.totals.board))), color: myColor }], {}));
  body.append(element('p', 'panel-note', `아침 ${peakHour}시쯤이 가장 붐벼요. 시간대 모양은 2025년 실제 자료에서 가져왔어요.`));

  // 3. 가장 붐빈 곳: 내 노선과 부산 전체
  const allBusiest = busiestLinks(result, 1);
  const mineBusiest = result.crowding
    .filter((c) => c.line === NEW_LINE_ID && c.ratio !== null)
    .sort((a, b) => b.ratio - a.ratio)[0];
  const showCrowd = (title, link, extra) => {
    if (!link) return;
    body.append(element('h2', null, title));
    body.append(element('p', null, `${nameOf(link.from, newNames)} → ${nameOf(link.to, newNames)} 구간이에요.`));
    body.append(crowdIcons(link.ratio));
    const percent = Math.round(link.ratio * 100);
    body.append(element('p', null, `가장 붐비는 때에 열차 한 대에 정원의 ${percent}%가 타요. 점 10개면 딱 맞게 탄 거예요.`));
    if (extra) body.append(element('p', 'panel-note', extra));
  };
  showCrowd('내 노선에서 가장 붐빈 곳', mineBusiest);
  if (mineBusiest) {
    const tip = element('p', 'panel-note guide');
    tip.append(element('span', null, '열차를 더 자주 오게 하면('), wordWithCard('배차 간격', '배차 간격'), element('span', null, '을 줄이면) 덜 붐벼요.'));
    body.append(tip);
  }
  showCrowd(mineBusiest ? '부산에서 가장 붐빈 곳' : '가장 붐빈 곳', allBusiest[0]);

  // 4. 빨라진 사람과 공사비
  body.append(element('h2', null, '무엇이 달라졌나요?'));
  const list = element('ul', 'panel-list');
  list.append(element('li', null, `빨라진 사람: 하루에 ${countText(effect.fasterPeople)}`));
  if (effect.measuredPeople > 0) {
    list.append(element('li', null, `한 사람이 아낀 시간: 평균 ${effect.averageSavedMin.toFixed(1)}분`));
  }
  if (effect.newlyReachable > 0) {
    list.append(element('li', null, `도시철도로 처음 갈 수 있게 된 사람: 하루에 ${countText(effect.newlyReachable)}`));
  }
  list.append(element('li', null, `노선 길이: ${distanceText(cost.lengthKm * 1000)}, 역 ${design.stations.length}개`));
  list.append(element('li', null, `공사비: ${moneyText(cost.total)}`));
  body.append(list);

  // 4-1. 옛날 부산과 지금 부산 견주기(과제 7)
  const pastYear = mission && mission.baseYear < BASE_YEAR ? mission.baseYear : null;
  if (pastYear) {
    const then = networkOfYear(pastYear);
    const now = networkOfYear(BASE_YEAR);
    const km = (network) => network.links.reduce((sum, link) => sum + link.distanceM, 0) / 1000;
    body.append(element('h2', null, `${pastYear}년 부산과 지금 부산`));
    const rows = [
      { label: '노선 수', then: then.lines.length, now: now.lines.length, text: (v) => `${v}개` },
      { label: '역 수', then: then.stations.length, now: now.stations.length, text: (v) => `${v}개` },
      { label: '노선 길이', then: km(then), now: km(now), text: (v) => distanceText(v * 1000) },
    ];
    for (const row of rows) {
      body.append(element('h3', null, row.label));
      body.append(
        barChart(
          [
            { label: `${pastYear}년`, value: row.then, text: row.text(row.then) },
            { label: `${BASE_YEAR}년`, value: row.now, text: row.text(row.now) },
          ],
          { width: 360 },
        ),
      );
    }
    body.append(element('p', 'panel-note', '사는 사람과 가는 곳은 지금 자료를 썼어요. 그때 자료를 구하지 못했어요.'));
  }

  // 4-2. 실제 계획과 견주기(과제 5)
  const realPlan = mission?.compareWith ? planned.find((line) => line.id === mission.compareWith) : null;
  if (realPlan) {
    body.append(element('h2', null, '실제 계획과 견줘 봐요'));
    body.append(element('p', null, `부산시가 세운 ${realPlan.name} 계획이에요.`));
    const rows = [
      { label: '노선 길이', mine: cost.lengthKm, real: realPlan.lengthKm, text: (v) => distanceText(v * 1000) },
      { label: '역 수', mine: design.stations.length, real: realPlan.stations, text: (v) => `${v}개` },
    ];
    if (realPlan.cost100M) rows.push({ label: '공사비', mine: cost.total, real: realPlan.cost100M, text: (v) => moneyText(v) });
    for (const row of rows) {
      body.append(element('h3', null, row.label));
      body.append(
        barChart(
          [
            { label: '내 노선', value: row.mine, text: row.text(row.mine) },
            { label: '실제 계획', value: row.real, text: row.text(row.real) },
          ],
          { width: 360 },
        ),
      );
    }
    body.append(element('p', 'panel-note guide', '어느 쪽이 맞다는 뜻은 아니에요. 무엇이 다른지 보고 까닭을 생각해 보세요.'));
  }

  // 4-3. 주민 목소리
  if (voices.length > 0) {
    body.append(element('h2', null, '주민 목소리'));
    const box = element('div', 'voice-list');
    const most = Math.max(...voices.map((voice) => voice.people));
    for (const voice of voices) {
      const card = element('article', 'voice-card');
      card.append(element('p', 'voice-text', `“${voice.text}”`));
      const why = voice.closerThanM
        ? `${voice.why} 우리는 ${distanceText(voice.closerThanM)}보다 가까우면 가깝다고 봐요.`
        : voice.why;
      card.append(element('p', 'panel-note', why));
      // 숫자는 늘 그림과 함께 보여 준다(CLAUDE.md). 막대 길이는 가장 많은 목소리에 견준 값이다.
      card.append(barChart([{ label: '관련된 사람', value: voice.people }], { max: most, width: 260 }));
      box.append(card);
    }
    body.append(box);
    body.append(element('p', 'panel-note', '목소리는 노선과 역의 자리를 보고 규칙대로 나와요. 같은 설계면 늘 같은 목소리가 나와요.'));
  }

  // 4-4. 어떤 규칙으로 돌렸는지(SPEC 9.1 운영 방식)
  body.append(
    element('p', 'panel-note', ruleSetName ? `"${ruleSetName}" 규칙으로 돌렸어요.` : '기본 규칙으로 돌렸어요.'),
  );

  // 5. 설명하기
  body.append(element('h2', null, '세 문장으로 설명해요'));
  const form = element('div', 'explain');
  const inputs = [];
  const parts = [
    ['나는 ', '어디에서'],
    ['에서 ', '어디까지'],
    ['까지 노선을 만들었어요. 왜냐하면 ', '왜 만들었나요?'],
    ['. 결과는 ', '무슨 일이 생겼나요?'],
  ];
  for (const [before, placeholder] of parts) {
    form.append(element('span', null, before));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'explain-input';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    form.append(input);
    inputs.push(input);
  }
  form.append(element('span', null, '.'));
  body.append(form);
  inputs[3].value = `하루에 ${countText(newRiders)}이 탔어요`;

  const sentences = () => [
    `나는 ${inputs[0].value || '___'}에서 ${inputs[1].value || '___'}까지 노선을 만들었어요.`,
    `왜냐하면 ${inputs[2].value || '___'}.`,
    `결과는 ${inputs[3].value || '___'}.`,
  ];
  const summary = () => [
    `길이 ${distanceText(cost.lengthKm * 1000)} · 역 ${design.stations.length}개 · ${design.kind}`,
    `공사비 ${moneyText(cost.total)}`,
    `하루에 타고 내린 사람 ${countText(newRiders)}`,
    `빨라진 사람 ${countText(effect.fasterPeople)}`,
  ];

  // 6. 저장과 인쇄, 끝내기
  const cardBox = element('div', 'card-box');
  body.append(element('h2', null, '결과 카드'));
  body.append(cardBox);
  function refreshCard() {
    cardBox.replaceChildren(resultCard({ summary: summary(), sentences: sentences() }));
  }
  refreshCard();
  for (const input of inputs) input.addEventListener('input', refreshCard);

  // 6-1. 설계 저장(가 칸, 나 칸) — 나중에 둘을 나란히 견준다
  if (onSave) {
    body.append(element('h2', null, '이 설계를 저장해요'));
    body.append(element('p', 'panel-note guide', '가 칸과 나 칸에 하나씩 저장하면, 처음 화면에서 둘을 나란히 볼 수 있어요.'));
    const saveRow = element('div', 'tool-row');
    const saved = element('p', 'panel-note', '');
    for (const slot of ['가', '나']) {
      const node = element('button', 'button', `${slot} 칸에 저장`);
      node.type = 'button';
      node.addEventListener('click', () => {
        onSave(slot, { newRiders, faster: effect.fasterPeople, cost: cost.total, lengthKm: cost.lengthKm, stations: design.stations.length });
        saved.textContent = `${slot} 칸에 저장했어요.`;
      });
      saveRow.append(node);
    }
    body.append(saveRow, saved);
  }

  const buttons = element('div', 'tool-row');
  const save = element('button', 'button', '그림으로 저장');
  save.type = 'button';
  save.addEventListener('click', () => downloadCard(resultCard({ summary: summary(), sentences: sentences() })));
  const print = element('button', 'button', '인쇄');
  print.type = 'button';
  print.addEventListener('click', () => window.print());
  if (onRide) {
    const ride = element('button', 'button big ride-button', '내 노선 타 보기');
    ride.type = 'button';
    ride.addEventListener('click', onRide);
    body.append(ride);
  }
  const end = element('button', 'button big', '오늘 운행 끝');
  end.type = 'button';
  end.addEventListener('click', onHome);
  buttons.append(save, print, end);
  body.append(buttons);

  body.append(element('p', null, endingText));
  body.append(element('p', 'panel-source', '이용객은 우리 계산이에요. 시간대 모양과 지형·인구는 실제 자료를 썼어요.'));

  return () => {};
}
