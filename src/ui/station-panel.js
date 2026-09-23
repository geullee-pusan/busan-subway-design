// 역을 누르면 보여 주는 정보: 이름, 갈아타기, 개통일, 이웃 역, 하루 이용객, 시간대별 이용객, 이름의 유래.
import { lineById, neighborLinks, ridership, ridershipOf, stationById, stationInfo, transferSiblings } from '../data.js';
import { barChart, hourlyLineChart } from './chart.js';
import { countText, dateText, distanceText, durationText, roParticle, stationLabel } from './format.js';
import { wordWithCard } from './word-card.js';

const DAY_TYPES = ['평일', '토요일', '일요일'];

/** 0~23시를 아이 말로 */
function hourText(hour) {
  if (hour === 0) return '밤 12시';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `아침 ${hour}시`;
  if (hour === 12) return '낮 12시';
  if (hour < 18) return `오후 ${hour - 12}시`;
  if (hour < 21) return `저녁 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "범내골~노포" → "범내골역에서 노포역" */
function openedWithText(range) {
  const [from, to] = range.split('~');
  return `${stationLabel(from)}에서 ${stationLabel(to)}`;
}

function lineTag(lineId) {
  const line = lineById.get(lineId);
  const tag = element('span', 'line-tag', line.label);
  tag.style.background = line.color ?? '#1F3342';
  tag.title = line.name;
  return tag;
}

export function createStationPanel({ numberMode = '기본' } = {}) {
  const root = element('aside', 'panel');
  root.setAttribute('aria-live', 'polite');
  let current = null;
  let dayType = '평일';
  let note = null;

  function showEmpty() {
    root.replaceChildren();
    const box = element('div', 'panel-empty');
    box.append(element('h2', null, '역을 눌러 보세요'));
    box.append(element('p', null, '지도에서 역을 누르면 이름과 하루 이용객을 볼 수 있어요.'));
    box.append(element('p', 'panel-hint', '한 손가락으로 끌면 지도가 움직여요. 두 손가락을 벌리면 커져요.'));
    if (note) box.append(element('p', 'panel-note', note));
    root.append(box);
  }

  function render() {
    if (!current) return showEmpty();
    const station = stationById.get(current);
    const info = stationInfo[station.id];
    const line = lineById.get(station.line);
    root.replaceChildren();

    // 이름과 노선
    const header = element('div', 'panel-header');
    const title = element('h2', 'panel-title');
    title.append(lineTag(station.line), element('span', null, stationLabel(station.name)));
    header.append(title);
    if (info?.nameEn) header.append(element('p', 'panel-sub', info.nameEn));
    root.append(header);

    const body = element('div', 'panel-body');
    root.append(body);

    // 갈아타기
    const siblings = transferSiblings(station.id);
    if (siblings.length > 0) {
      const p = element('p');
      p.append(wordWithCard('환승', '갈아타기'), element('span', null, ': 여기서 '));
      siblings.forEach((sibling, index) => {
        const siblingLine = lineById.get(sibling.line);
        p.append(lineTag(sibling.line), element('span', null, ` ${siblingLine.name}`));
        if (index < siblings.length - 1) p.append(element('span', null, ', '));
      });
      const last = lineById.get(siblings.at(-1).line).name;
      p.append(element('span', null, `${roParticle(last)} 갈아탈 수 있어요.`));
      body.append(p);
    } else {
      body.append(element('p', null, `${line.name} 역이에요.`));
    }

    // 개통일
    if (info?.openedOn) {
      body.append(element('p', null, `${dateText(info.openedOn)}에 문을 열었어요.`));
      if (info.openedWith && !info.openedWith.startsWith(station.name)) {
        body.append(element('p', 'panel-note', `그때 ${openedWithText(info.openedWith)}까지 함께 열었어요.`));
      }
    }

    // 이웃 역까지 거리와 시간
    const neighbors = neighborLinks(station.id);
    if (neighbors.length > 0) {
      const list = element('ul', 'panel-list');
      for (const n of neighbors) {
        const text = `${stationLabel(n.other.name)}까지 ${distanceText(n.distanceM)}, ${durationText(n.runS)}`;
        list.append(element('li', null, n.estimated ? `${text} (어림한 값이에요)` : text));
      }
      body.append(element('h3', null, '이웃 역'), list);
    }

    // 이용객
    const { data, from } = ridershipOf(station.id);
    body.append(element('h3', null, '하루에 타고 내리는 사람'));
    if (!data) {
      body.append(element('p', 'panel-note', '이 역은 이용객 자료가 없어요.'));
      body.append(element('p', 'panel-note', '동해선은 코레일이 운영해서 자료를 구하지 못했어요.'));
    } else {
      if (from) {
        body.append(element('p', 'panel-note', `${stationLabel(from.name)}(${lineById.get(from.line).name})과 개찰구를 함께 써서, 두 역을 합쳐 센 숫자예요.`));
      }
      const picker = element('div', 'day-picker');
      picker.setAttribute('role', 'group');
      picker.setAttribute('aria-label', '요일 고르기');
      for (const type of DAY_TYPES) {
        const button = element('button', 'day-button', type);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(type === dayType));
        if (type === dayType) button.classList.add('is-on');
        button.addEventListener('click', () => {
          dayType = type;
          render();
        });
        picker.append(button);
      }
      body.append(picker);

      const day = data[dayType];
      if (!day) {
        body.append(element('p', 'panel-note', '이 요일 자료가 없어요.'));
      } else {
        const color = line.color ?? '#1F3342';
        body.append(
          barChart(
            [
              { label: '타요', value: day.board, color },
              { label: '내려요', value: day.alight, color },
            ],
            { numberMode },
          ),
        );
        const total = day.board + day.alight;
        body.append(element('p', null, `${dayType}에는 하루에 모두 ${countText(total, numberMode)}이 타고 내려요.`));

        body.append(element('h3', null, '시간대별로 보면'));
        body.append(
          hourlyLineChart(
            [
              { label: '타는 사람', values: day.hourly.board, color },
              { label: '내리는 사람', values: day.hourly.alight, color, dashed: true },
            ],
            { numberMode },
          ),
        );
        const peak = day.hourly.board.indexOf(Math.max(...day.hourly.board));
        body.append(element('p', null, `타는 사람이 가장 많은 때는 ${hourText(peak)}예요.`));
        body.append(element('p', 'panel-note', '점선은 내리는 사람이에요.'));
      }
    }

    // 이름의 유래
    if (info?.origin) {
      const heading = element('h3');
      heading.append(wordWithCard('유래', '이름의 유래'));
      body.append(heading);
      const short = info.origin.length > 90 ? `${info.origin.slice(0, 90)}…` : info.origin;
      const text = element('p', 'panel-origin', short);
      body.append(text);
      if (info.origin.length > 90) {
        const more = element('button', 'more-button', '다 읽기');
        more.type = 'button';
        let open = false;
        more.addEventListener('click', () => {
          open = !open;
          text.textContent = open ? info.origin : short;
          more.textContent = open ? '접기' : '다 읽기';
        });
        body.append(more);
      }
      body.append(element('p', 'panel-note', '어른들이 쓰는 말로 적힌 설명이에요. 부산교통공사 자료예요.'));
    }

    if (data) body.append(element('p', 'panel-source', `이용객 자료: ${ridership.source}`));
  }

  showEmpty();
  return {
    element: root,
    show(stationId) {
      current = stationId;
      render();
    },
    /** 지도 위쪽에서 바뀐 것을 알려 줄 때 쓴다(예: 기준 연도). */
    showNote(text) {
      note = text;
      if (!current) showEmpty();
    },
  };
}
