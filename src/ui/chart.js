// 그래프. 숫자는 늘 그림과 함께 보여준다(CLAUDE.md).
// 색만으로 뜻을 전하지 않도록, 막대와 선에 이름표를 함께 붙인다.
import { countText } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const INK = '#1F3342';

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 막대그래프. items: [{label, value, color}]
 */
export function barChart(items, { max, width = 320, numberMode = '기본' } = {}) {
  const rowHeight = 44;
  const height = items.length * rowHeight + 8;
  const labelWidth = 56;
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img' });
  items.forEach((item, index) => {
    const y = index * rowHeight + 4;
    const barWidth = Math.max(2, ((width - labelWidth - 8) * item.value) / top);
    svg.append(el('text', { x: 0, y: y + 22, 'font-size': 16, fill: INK }, item.label));
    svg.append(el('rect', { x: labelWidth, y: y + 6, width: barWidth, height: 20, rx: 4, fill: item.color ?? INK }));
    svg.append(el('text', { x: labelWidth + 4, y: y + 40, 'font-size': 15, fill: INK }, countText(item.value, numberMode)));
  });
  return svg;
}

/**
 * 두 값을 나란히 견주는 막대그래프. rows: [{label, real, model}]
 * 색만으로 뜻을 전하지 않도록 막대마다 "진짜", "우리 계산" 이름표를 붙인다.
 */
export function comparisonChart(rows, { width = 460, numberMode = '기본', color = INK } = {}) {
  const rowHeight = 74;
  const height = rows.length * rowHeight + 8;
  const labelWidth = 110;
  // 막대 오른쪽에 숫자를 쓸 자리를 남겨 둔다.
  const barArea = width - labelWidth - 120;
  const max = Math.max(1, ...rows.flatMap((r) => [r.real, r.model]));
  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img' });
  rows.forEach((row, index) => {
    const y = index * rowHeight + 6;
    svg.append(el('text', { x: 0, y: y + 20, 'font-size': 16, fill: INK, 'font-weight': 600 }, row.label));
    const bars = [
      { name: '진짜', value: row.real, fill: color, opacity: 1 },
      { name: '우리 계산', value: row.model, fill: color, opacity: 0.45 },
    ];
    bars.forEach((bar, i) => {
      const barY = y + i * 28;
      svg.append(el('text', { x: 0, y: barY + 34, 'font-size': 14, fill: INK }, bar.name));
      svg.append(
        el('rect', {
          x: labelWidth,
          y: barY + 20,
          width: Math.max(2, (barArea * bar.value) / max),
          height: 18,
          rx: 4,
          fill: bar.fill,
          'fill-opacity': bar.opacity,
        }),
      );
      svg.append(
        el('text', { x: labelWidth + Math.max(2, (barArea * bar.value) / max) + 6, y: barY + 34, 'font-size': 14, fill: INK }, countText(bar.value, numberMode)),
      );
    });
  });
  return svg;
}

/**
 * 시간대별 꺾은선그래프. series: [{label, values(24개), color, dashed}]
 */
export function hourlyLineChart(series, { width = 340, height = 190, numberMode = '기본' } = {}) {
  const padding = { top: 16, right: 10, bottom: 34, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (hour) => padding.left + (innerWidth * hour) / 23;
  const y = (value) => padding.top + innerHeight - (innerHeight * value) / max;

  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img' });
  // 세로 눈금: 0과 가장 큰 값
  svg.append(el('line', { x1: padding.left, y1: y(0), x2: width - padding.right, y2: y(0), stroke: INK, 'stroke-opacity': 0.4 }));
  svg.append(el('text', { x: 0, y: y(0) + 5, 'font-size': 13, fill: INK }, '0'));
  svg.append(el('text', { x: 0, y: y(max) + 5, 'font-size': 13, fill: INK }, countText(max, numberMode).replace('명', '').replace('약 ', '')));
  // 가로 눈금: 6시, 12시, 18시
  for (const hour of [6, 12, 18]) {
    svg.append(el('line', { x1: x(hour), y1: padding.top, x2: x(hour), y2: y(0), stroke: INK, 'stroke-opacity': 0.12 }));
    svg.append(el('text', { x: x(hour), y: height - 16, 'font-size': 13, fill: INK, 'text-anchor': 'middle' }, `${hour}시`));
  }
  for (const s of series) {
    const points = s.values.map((v, hour) => `${x(hour).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    svg.append(
      el('polyline', {
        points,
        fill: 'none',
        stroke: s.color ?? INK,
        'stroke-width': 3,
        'stroke-linejoin': 'round',
        ...(s.dashed ? { 'stroke-dasharray': '6 4' } : {}),
      }),
    );
    // 가장 높은 때에 점과 이름표
    const peak = s.values.indexOf(Math.max(...s.values));
    svg.append(el('circle', { cx: x(peak), cy: y(s.values[peak]), r: 4, fill: s.color ?? INK }));
    svg.append(
      el(
        'text',
        { x: Math.min(x(peak) + 6, width - 60), y: Math.max(y(s.values[peak]) - 6, padding.top + 12), 'font-size': 13, fill: INK },
        `${s.label} ${peak}시`,
      ),
    );
  }
  return svg;
}
