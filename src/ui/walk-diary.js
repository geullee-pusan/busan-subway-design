// 여행 일기: 걸어서 여행하기에서 하루 동안 지나온 길, 탄 것, 들른 랜드마크를 지도 한 장과 시간 줄로 보여 준다.
// 그림으로 저장하거나 인쇄할 수 있다(인터넷을 쓰지 않는다).
import { trackBounds } from '../sim/diary.js';
import { clockText, distanceText, durationText } from './format.js';
import { LANDMARK_ICON } from './landmark-scenes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const wonText = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
const minutesText = (m) => durationText(Math.max(1, Math.round(m)) * 60);
const hhmm = (m) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** 탈것마다 선 모양(색만으로 가르지 않게 굵기와 점선 모양도 다르다) */
export const DIARY_STYLE = {
  걷기: { color: '#E8590C', width: 4, dash: '2 7', mark: '👣' },
  지하철: { color: '#1F3342', width: 7, dash: '', mark: '🚇' },
  버스: { color: '#2E8B3E', width: 5, dash: '12 6', mark: '🚌' },
  기차: { color: '#3B3B3B', width: 7, dash: '', mark: '🚆', rail: true },
  택시: { color: '#E0A800', width: 5, dash: '16 6', mark: '🚕' },
};

/**
 * @param {{record: object, track: object[], landmarks: object[], visited: Map<string, number>, dongs: object[], roads: object, roadIndex: Map}} p
 * @returns {HTMLElement}
 */
export function renderDiary({ record, track, landmarks, visited, dongs, roads, roadIndex }) {
  const box = element('section', 'diary');
  box.append(element('h2', 'diary-title', '📔 나의 여행 일기'));
  box.append(element('p', 'diary-sub', `${clockText(record.start)}에 시작해서 ${clockText(record.start + record.minutes)}까지 다녔어요.`));
  const totals = element('div', 'diary-totals');
  totals.append(
    element('span', null, `⏳ 쓴 시간 ${record.minutes < 1 ? '0분' : minutesText(record.minutes)}`),
    element('span', null, `👣 걸은 거리 ${distanceText(Math.round(record.meters))}`),
    element('span', null, `🪙 쓴 돈 ${wonText(record.paid)}`),
  );
  box.append(totals);

  const seen = landmarks.filter((l) => visited.has(l.id));
  const bounds = trackBounds(track, seen);
  if (!bounds) {
    box.append(element('p', null, '아직 지나온 길이 없어요. 조금 걸어 보고 다시 열어 봐요.'));
    return box;
  }
  const W = 800;
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  const H = Math.round(Math.max(360, Math.min(900, (W * spanY) / spanX)));
  // 가로세로 비율을 지키며 가운데에 맞춘다
  const s = Math.min(W / spanX, H / spanY);
  const ox = (W - spanX * s) / 2;
  const oy = (H - spanY * s) / 2;
  const X = (x) => ox + (x - bounds.x0) * s;
  const Y = (y) => oy + (y - bounds.y0) * s;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'diary-map', role: 'img' });
  svg.setAttribute('aria-label', '오늘 지나온 길을 그린 지도예요.');
  svg.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#CFE6F4' }));
  // 땅(행정동 모양)
  const land = svgEl('path', { fill: '#F3EEDF', stroke: '#DCD2BC', 'stroke-width': 0.6 });
  let d = '';
  for (const dong of dongs) {
    const [bx0, by0, bx1, by1] = dong.box;
    if (bx1 < bounds.x0 || bx0 > bounds.x1 || by1 < bounds.y0 || by0 > bounds.y1) continue;
    for (const ring of dong.rings) d += `M${ring.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}Z`;
  }
  land.setAttribute('d', d);
  svg.append(land);
  // 길: 넓게 보면 큰길만
  const span = Math.max(spanX, spanY);
  const maxCls = span < 4 ? 5 : span < 12 ? 3 : span < 40 ? 2 : 1;
  const seenEdges = new Set();
  let roadD = '';
  for (let row = Math.floor(bounds.y0); row <= Math.floor(bounds.y1); row++) {
    for (let col = Math.floor(bounds.x0); col <= Math.floor(bounds.x1); col++) {
      for (const i of roadIndex.get(`${col},${row}`) ?? []) {
        if (seenEdges.has(i)) continue;
        seenEdges.add(i);
        const e = roads.edges[i];
        if (e.cls > maxCls) continue;
        roadD += `M${e.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}`;
      }
    }
  }
  svg.append(svgEl('path', { d: roadD, fill: 'none', stroke: '#FFFFFF', 'stroke-width': span < 4 ? 3 : 1.5, 'stroke-linecap': 'round' }));

  // 지나온 길
  let rideNo = 0;
  const badges = [];
  for (const seg of track) {
    const st = DIARY_STYLE[seg.kind] ?? DIARY_STYLE.걷기;
    const path = seg.pts.map(([x, y], k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
    svg.append(svgEl('path', { d: path, fill: 'none', stroke: '#FFFFFF', 'stroke-width': st.width + 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.8 }));
    svg.append(svgEl('path', { d: path, fill: 'none', stroke: st.color, 'stroke-width': st.width, 'stroke-dasharray': st.dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (st.rail) svg.append(svgEl('path', { d: path, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2, 'stroke-dasharray': '8 8' }));
    if (seg.kind !== '걷기' && seg.pts.length) {
      rideNo += 1;
      const mid = seg.pts[Math.floor(seg.pts.length / 2)];
      const [a, b] = seg.pts.length > 1 ? [seg.pts[0], seg.pts.at(-1)] : [mid, mid];
      const mx = seg.pts.length > 2 ? X(mid[0]) : (X(a[0]) + X(b[0])) / 2;
      const my = seg.pts.length > 2 ? Y(mid[1]) : (Y(a[1]) + Y(b[1])) / 2;
      badges.push({ x: mx, y: my, no: rideNo, st });
    }
  }
  // 들른 랜드마크
  for (const l of seen) {
    const x = X(l.x);
    const y = Y(l.y);
    svg.append(svgEl('circle', { cx: x, cy: y, r: 13, fill: '#FFFFFF', stroke: '#7048E8', 'stroke-width': 3 }));
    svg.append(svgEl('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 14 }, (LANDMARK_ICON[l.kind] ?? ['📍'])[0]));
    const label = svgEl('text', { x, y: y + 30, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#5F3DC4', stroke: '#FFFFFF', 'stroke-width': 3, 'paint-order': 'stroke' }, l.name);
    svg.append(label);
  }
  // 탄 것 번호(시간 줄 번호와 같다)
  for (const b of badges) {
    svg.append(svgEl('circle', { cx: b.x, cy: b.y, r: 13, fill: b.st.color, stroke: '#FFFFFF', 'stroke-width': 2 }));
    svg.append(svgEl('text', { x: b.x, y: b.y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#FFFFFF' }, String(b.no)));
  }
  // 출발과 지금
  const first = track[0]?.pts[0];
  const last = track.at(-1)?.pts.at(-1);
  const flag = (p, text, color) => {
    const x = X(p[0]);
    const y = Y(p[1]);
    svg.append(svgEl('circle', { cx: x, cy: y, r: 8, fill: color, stroke: '#FFFFFF', 'stroke-width': 3 }));
    svg.append(svgEl('text', { x: x + 12, y: y - 8, 'font-size': 14, 'font-weight': 800, fill: color, stroke: '#FFFFFF', 'stroke-width': 3, 'paint-order': 'stroke' }, text));
  };
  if (first) flag(first, '출발', '#1971C2');
  if (last) flag(last, '끝', '#C92A2A');
  // 축척 막대
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const km = steps.find((v) => v * s >= 80) ?? 50;
  svg.append(svgEl('rect', { x: W - km * s - 26, y: H - 40, width: km * s + 20, height: 32, fill: '#FFFFFF', opacity: 0.85 }));
  svg.append(svgEl('path', { d: `M${W - km * s - 16} ${H - 18} v6 h${km * s} v-6`, stroke: '#1F2933', 'stroke-width': 3, fill: 'none' }));
  svg.append(svgEl('text', { x: W - (km * s) / 2 - 16, y: H - 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#1F2933' }, km >= 1 ? `${km}km` : `${Math.round(km * 1000)}m`));
  svg.append(svgEl('text', { x: 8, y: H - 8, 'font-size': 11, fill: '#495057' }, '© OpenStreetMap contributors'));
  box.append(svg);

  // 그림 설명(선 모양과 이름)
  const legend = element('div', 'diary-legend');
  for (const [kind, st] of Object.entries(DIARY_STYLE)) {
    const sample = svgEl('svg', { width: 46, height: 14, viewBox: '0 0 46 14' });
    sample.append(svgEl('line', { x1: 2, y1: 7, x2: 44, y2: 7, stroke: st.color, 'stroke-width': Math.min(6, st.width), 'stroke-dasharray': st.dash, 'stroke-linecap': 'round' }));
    const item = element('span', 'diary-legend-item');
    item.append(sample, element('span', null, `${st.mark} ${kind}`));
    legend.append(item);
  }
  box.append(legend);
  box.append(element('p', 'panel-note', '지하철, 버스, 기차는 탄 곳과 내린 곳을 곧은 선으로 이었어요.'));

  // 시간 줄
  const list = element('ol', 'diary-timeline');
  let no = 0;
  for (const e of record.entries) {
    const li = element('li');
    const isRide = e.kind !== '걷기' && e.kind !== '들름';
    if (isRide) no += 1;
    const st = DIARY_STYLE[e.kind];
    li.append(element('span', 'diary-time', hhmm(e.at)));
    li.append(element('span', `diary-kind${isRide ? ' is-ride' : ''}`, isRide ? `${no} ${st?.mark ?? ''} ${e.kind}` : e.kind === '들름' ? '📍 들름' : '👣 걷기'));
    li.append(element('span', 'diary-what', e.title));
    const parts = [];
    if (e.minutes >= 1) parts.push(minutesText(e.minutes));
    if (e.meters) parts.push(distanceText(Math.round(e.meters)));
    if (e.fare) parts.push(wonText(e.fare));
    if (parts.length) li.append(element('span', 'diary-num', parts.join(' · ')));
    list.append(li);
  }
  box.append(list);

  // 저장과 인쇄
  const tools = element('div', 'tool-row diary-tools');
  const save = element('button', 'button', '그림으로 저장하기');
  save.type = 'button';
  save.addEventListener('click', () => saveAsPicture(svg));
  const print = element('button', 'button', '인쇄하기');
  print.type = 'button';
  print.addEventListener('click', () => {
    document.body.classList.add('print-diary');
    box.classList.add('is-printing');
    const done = () => {
      document.body.classList.remove('print-diary');
      box.classList.remove('is-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  });
  tools.append(save, print);
  box.append(tools);
  return box;
}

/** 지도 그림을 PNG 파일로 기기에 저장한다(인터넷을 쓰지 않는다) */
function saveAsPicture(svg) {
  const text = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '나의-여행-일기.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}
