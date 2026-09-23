// 격자, 지형, 인구, 노선을 한 장의 SVG로 그린다. 데이터를 눈으로 확인하는 개발용 그림이다.
// 색은 docs/SPEC.md 7.1절을 따른다. 언덕과 외곽 들판은 SPEC에 색이 없어 가까운 색을 골랐다.

const S = 12; // 칸 하나의 픽셀 크기
const COLORS = {
  sea: '#B9D4E6',
  river: '#9FC6DC',
  mountain: '#C8D6BD',
  highMountain: '#9DB38E',
  hill: '#DCE3D2',
  flat: '#EDF1EC',
  field: '#F4F1E2',
  ink: '#1F3342',
};
const HIGH_MOUNTAIN_M = 400;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** grid: data/build/grid.json 내용, lines/stations: 노선과 역(격자 좌표 x, y 포함), districts: 구·군 경계선 */
export function renderPreview({ grid, lines, stations, districts, notes }) {
  const W = grid.cols * S;
  const H = grid.rows * S;
  const left = 36;
  const top = 44;
  const panel = 260;
  const width = left + W + 24 + panel;
  const height = top + H + 110;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" fill="${COLORS.ink}">`,
  );
  out.push(`<rect width="${width}" height="${height}" fill="#FFFFFF"/>`);
  out.push(`<text x="${left}" y="26" font-size="16" font-weight="700">부산 격자 미리보기 (${grid.cols} × ${grid.rows}칸, 한 칸 = 1km)</text>`);
  out.push(`<g transform="translate(${left},${top})">`);

  // 지형 칸
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const t = grid.terrain[r][c];
      const e = grid.elevationM[r][c];
      const fill = t === 'mountain' && e !== null && e >= HIGH_MOUNTAIN_M ? COLORS.highMountain : COLORS[t];
      out.push(`<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" fill="${fill}"/>`);
    }
  }
  // 5칸마다 옅은 격자선과 번호
  for (let c = 0; c <= grid.cols; c += 5) {
    out.push(`<line x1="${c * S}" y1="0" x2="${c * S}" y2="${H}" stroke="${COLORS.ink}" stroke-opacity="0.12"/>`);
    if (c < grid.cols) out.push(`<text x="${c * S + 1}" y="-4" font-size="9" fill-opacity="0.6">${c}</text>`);
  }
  for (let r = 0; r <= grid.rows; r += 5) {
    out.push(`<line x1="0" y1="${r * S}" x2="${W}" y2="${r * S}" stroke="${COLORS.ink}" stroke-opacity="0.12"/>`);
    if (r < grid.rows) out.push(`<text x="-4" y="${r * S + 9}" font-size="9" text-anchor="end" fill-opacity="0.6">${r}</text>`);
  }
  // 해안선과 구·군 경계
  const path = (points) => points.map(([x, y]) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`).join(' ');
  for (const line of districts?.coastline ?? []) {
    out.push(`<polyline points="${path(line)}" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.45" stroke-width="0.8"/>`);
  }
  for (const line of districts?.boundaries ?? []) {
    out.push(`<polyline points="${path(line)}" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="3 2"/>`);
  }

  // 인구: 칸 가운데 점. 넓이가 인구에 비례한다.
  let maxPop = 1;
  for (const row of grid.population) for (const n of row) maxPop = Math.max(maxPop, n);
  const radius = (n) => (S / 2) * 0.95 * Math.sqrt(n / maxPop);
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const n = grid.population[r][c];
      if (n < 100) continue;
      out.push(`<circle cx="${c * S + S / 2}" cy="${r * S + S / 2}" r="${radius(n).toFixed(2)}" fill="${COLORS.ink}" fill-opacity="0.35"/>`);
    }
  }
  // 노선과 역
  const byId = new Map(stations.map((s) => [s.id, s]));
  for (const line of lines) {
    const pts = line.stations.map((id) => byId.get(id)).map((s) => `${(s.x * S).toFixed(1)},${(s.y * S).toFixed(1)}`);
    out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${line.color ?? COLORS.ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
  }
  for (const s of stations) {
    out.push(`<circle cx="${(s.x * S).toFixed(1)}" cy="${(s.y * S).toFixed(1)}" r="1.8" fill="#FFFFFF" stroke="${COLORS.ink}" stroke-width="0.8"/>`);
  }
  // 노선 번호표: 첫 역 옆
  for (const line of lines) {
    const s = byId.get(line.stations[0]);
    const x = s.x * S;
    const y = s.y * S;
    const w = Math.max(14, line.label.length * 8 + 6);
    out.push(`<rect x="${(x + 4).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${w}" height="14" rx="7" fill="${line.color ?? COLORS.ink}"/>`);
    out.push(`<text x="${(x + 4 + w / 2).toFixed(1)}" y="${(y + 2.5).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#FFFFFF">${esc(line.label)}</text>`);
  }
  // 방위표와 축척 막대
  out.push(`<g transform="translate(${W - 26},${22})"><path d="M0,-14 L7,6 L0,1 L-7,6 Z" fill="${COLORS.ink}"/><text y="18" font-size="10" text-anchor="middle">N</text></g>`);
  out.push(`<g transform="translate(${8},${H - 12})"><rect width="${5 * S}" height="4" fill="${COLORS.ink}"/><text y="-4" font-size="10">5칸 = 5km</text></g>`);
  out.push(`<rect width="${W}" height="${H}" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.5"/>`);
  out.push('</g>');

  // 범례
  const px = left + W + 24;
  let py = top + 6;
  const legend = [
    ['sea', '바다'],
    ['river', '강·호수'],
    ['highMountain', `높은 산(평균 ${HIGH_MOUNTAIN_M}m 이상)`],
    ['mountain', '산'],
    ['hill', '언덕'],
    ['flat', '평지(도시)'],
    ['field', '외곽 들판'],
  ];
  const counts = {};
  for (const row of grid.terrain) for (const t of row) counts[t] = (counts[t] ?? 0) + 1;
  out.push(`<text x="${px}" y="${py}" font-size="12" font-weight="700">지형</text>`);
  py += 8;
  for (const [key, name] of legend) {
    const n = key === 'highMountain' ? null : counts[key] ?? 0;
    out.push(`<rect x="${px}" y="${py}" width="14" height="14" fill="${COLORS[key]}" stroke="${COLORS.ink}" stroke-opacity="0.3"/>`);
    out.push(`<text x="${px + 20}" y="${py + 11}" font-size="11">${esc(name)}${n === null ? '' : ` ${n}칸`}</text>`);
    py += 19;
  }
  py += 10;
  out.push(`<text x="${px}" y="${py}" font-size="12" font-weight="700">사는 사람(칸마다)</text>`);
  py += 10;
  for (const n of [5000, 20000, maxPop]) {
    const rr = radius(n);
    out.push(`<circle cx="${px + 7}" cy="${py + 7}" r="${rr.toFixed(2)}" fill="${COLORS.ink}" fill-opacity="0.35"/>`);
    out.push(`<text x="${px + 20}" y="${py + 11}" font-size="11">${n.toLocaleString('ko-KR')}명</text>`);
    py += 18;
  }
  py += 10;
  out.push(`<text x="${px}" y="${py}" font-size="12" font-weight="700">노선</text>`);
  py += 8;
  for (const line of lines) {
    out.push(`<rect x="${px}" y="${py + 3}" width="18" height="6" fill="${line.color ?? COLORS.ink}"/>`);
    out.push(`<text x="${px + 24}" y="${py + 10}" font-size="11">${esc(line.label)} ${esc(line.name)}</text>`);
    py += 17;
  }
  py += 8;
  for (const note of notes ?? []) {
    out.push(`<text x="${px}" y="${py}" font-size="10" fill-opacity="0.8">${esc(note)}</text>`);
    py += 14;
  }

  // 출처
  const credits = [
    '© OpenStreetMap contributors (openstreetmap.org/copyright): 강·호수 수면, 부산김해경전철·동해선 역, 노선 색',
    '행정동 경계: 통계청 SGIS(공공누리 제1유형)를 vuski/admdongkor가 가공(CC BY 4.0)',
    '고도: SRTM 1초(U.S. Geological Survey 제공), Tilezen Terrain Tiles',
    '인구: 행정안전부 주민등록 인구(2026년 8월), 역: 부산교통공사·국가철도공단(공공데이터포털)',
  ];
  credits.forEach((c, i) => out.push(`<text x="${left}" y="${top + H + 30 + i * 15}" font-size="10" fill-opacity="0.8">${esc(c)}</text>`));
  out.push('</svg>');
  return out.join('\n') + '\n';
}
