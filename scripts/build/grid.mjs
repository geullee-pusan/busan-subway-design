// 1km 격자를 만들고 칸마다 지형과 인구를 매긴다.
//
// 칸마다 100m 간격으로 10×10점을 찍는다. 점마다
//   - 어느 행정동에 속하는지(속하는 동이 없으면 바다),
//   - OSM 수면(강, 호수, 저수지) 안인지,
//   - 고도(SRTM)와 경사
// 를 구하고, 칸 안의 점들로 지형을 정한다. 인구는 행정동 인구를 그 동의 "살 수 있는 점"에 똑같이 나눈다.
// 격자 가장자리에 걸친 동도 동 전체에서 몫을 나누도록, 격자보다 넓은 범위(확장 격자)에서 계산한 뒤 잘라 낸다.
import { readFileSync } from 'node:fs';
import { assembleRings, projectRing, ringsBBox, bboxOverlaps } from '../lib/geo.mjs';
import { loadDem } from '../lib/hgt.mjs';
import { readCsv, toNumber } from '../lib/csv.mjs';
import { utm52 } from '../lib/utm.mjs';

export const TERRAIN_TYPES = {
  sea: '바다',
  river: '강',
  mountain: '산',
  hill: '언덕',
  flat: '평지',
  field: '외곽 들판',
};
const INHABITABLE = new Set(['hill', 'flat']);

/** GeoJSON 도형의 경위도 상자 */
function lonLatBBox(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** 도형을 조각(바깥 고리 + 구멍) 단위로 투영한다. */
function projectParts(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map((ring) => projectRing(ring, utm52.forward)));
}

/**
 * 고리들을 격자점에 칠한다(주사선 채우기, 짝홀 규칙).
 * lattice: {x0, y0, W, H} — 점 (i, j)의 좌표는 (x0 + 50 + 100i, y0 − 50 − 100j)
 */
function rasterize(rings, bbox, lattice, onPoint) {
  const { x0, y0, W, H } = lattice;
  const jStart = Math.max(0, Math.ceil((y0 - 50 - bbox.maxY) / 100));
  const jEnd = Math.min(H - 1, Math.floor((y0 - 50 - bbox.minY) / 100));
  if (jStart > jEnd) return;
  const rows = Array.from({ length: jEnd - jStart + 1 }, () => []);
  for (const ring of rings) {
    const n = ring.length;
    for (let k = 0, m = n - 2; k < n; m = k, k += 2) {
      const xa = ring[m];
      const ya = ring[m + 1];
      const xb = ring[k];
      const yb = ring[k + 1];
      if (ya === yb) continue;
      const j0 = Math.max(jStart, Math.ceil((y0 - 50 - Math.max(ya, yb)) / 100));
      const j1 = Math.min(jEnd, Math.floor((y0 - 50 - Math.min(ya, yb)) / 100));
      for (let j = j0; j <= j1; j++) {
        const y = y0 - 50 - 100 * j;
        if (ya > y !== yb > y) rows[j - jStart].push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
      }
    }
  }
  for (let r = 0; r < rows.length; r++) {
    const xs = rows[r];
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    const j = jStart + r;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const iStart = Math.max(0, Math.ceil((xs[k] - x0 - 50) / 100));
      const iEnd = Math.min(W - 1, Math.floor((xs[k + 1] - x0 - 50) / 100));
      for (let i = iStart; i <= iEnd; i++) onPoint(i, j);
    }
  }
}

/** OSM 수면 도형을 고리 묶음으로 바꾼다. relation은 조각 way들을 이어 고리로 만든다. */
function waterFeatures(osm, issues) {
  const features = [];
  let openRings = 0;
  for (const e of osm.elements) {
    let coordRings = [];
    if (e.type === 'way' && e.geometry) {
      const coords = e.geometry.map((p) => [p.lon, p.lat]);
      const closed = coords.length > 3 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
      if (!closed) {
        openRings++;
        continue;
      }
      coordRings = [coords];
    } else if (e.type === 'relation') {
      const segments = (e.members ?? [])
        .filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || m.role === ''))
        .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
      for (const ring of assembleRings(segments)) {
        if (ring.closed && ring.coords.length > 3) coordRings.push(ring.coords);
        else openRings++;
      }
    }
    if (coordRings.length === 0) continue;
    const rings = coordRings.map((r) => projectRing(r, utm52.forward));
    features.push({ id: `${e.type}/${e.id}`, name: e.tags?.name ?? null, rings, bbox: ringsBBox(rings) });
  }
  if (openRings > 0) issues.push(`OSM 수면 가운데 닫히지 않은 고리 ${openRings}개는 뺐어요.`);
  return features;
}

/** 몫을 정수로 나눈다(최대 나머지 방식). 합계가 total과 정확히 같다. 동점이면 칸 번호가 작은 쪽이 먼저다. */
export function allocateInteger(total, weights) {
  const entries = [...weights.entries()].sort((a, b) => a[0] - b[0]);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const result = new Map();
  if (sum === 0) return result;
  let given = 0;
  const rest = [];
  for (const [key, w] of entries) {
    const exact = (total * w) / sum;
    const base = Math.floor(exact);
    result.set(key, base);
    given += base;
    rest.push([key, exact - base]);
  }
  rest.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (let k = 0; k < total - given; k++) result.set(rest[k][0], result.get(rest[k][0]) + 1);
  return result;
}

/**
 * 격자를 만든다.
 * @param {object} p
 * @param {(path: string) => string} p.raw data/raw 경로
 * @param {object} p.config scripts/config/terrain.json
 * @param {{lon: number, lat: number, name: string}[]} p.extraPoints 부산 경계 밖이지만 지도에 넣을 점(북정역, 가야대역)
 * @param {object} p.overrides data/edits/terrain-overrides.json
 */
export function buildGrid({ raw, config, extraPoints, overrides }) {
  const issues = [];
  const cell = config.cellSizeM;
  const per = config.samplesPerSide;
  if (cell !== 1000 || per !== 10) throw new Error('지금 코드는 1km 칸, 100m 간격 점만 지원해요.');

  // 1. 행정동 경계
  const fc = JSON.parse(readFileSync(raw('admdongkor/HangJeongDong_ver20260701.geojson'), 'utf8'));
  const allDongs = fc.features.map((f) => ({
    code: f.properties.adm_cd2,
    name: f.properties.adm_nm,
    sido: f.properties.sidonm,
    sgg: f.properties.sggnm,
    sggCode: f.properties.sgg,
    geometry: f.geometry,
    lonLat: lonLatBBox(f.geometry),
  }));

  // 2. 지도 범위: 부산 행정동 전체 + 추가 점 + 여유 칸
  const busan = allDongs.filter((d) => d.code.startsWith('26'));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const d of busan) {
    d.parts = projectParts(d.geometry);
    for (const part of d.parts) {
      const outer = part[0];
      for (let i = 0; i < outer.length; i += 2) grow(outer[i], outer[i + 1]);
    }
  }
  for (const p of extraPoints) {
    const [x, y] = utm52.forward(p.lon, p.lat);
    grow(x, y);
  }
  const margin = config.marginCells * cell;
  const x0 = Math.floor((minX - margin) / cell) * cell;
  const y0 = Math.ceil((maxY + margin) / cell) * cell;
  const cols = Math.ceil((maxX + margin - x0) / cell);
  const rows = Math.ceil((y0 - (minY - margin)) / cell);

  // 3. 확장 격자: 격자에 걸친 동 전체를 덮되, 격자에서 extendKm까지만
  const gridBox = { minX: x0, maxX: x0 + cols * cell, minY: y0 - rows * cell, maxY: y0 };
  const corners = [
    utm52.inverse(gridBox.minX, gridBox.minY),
    utm52.inverse(gridBox.maxX, gridBox.maxY),
    utm52.inverse(gridBox.minX, gridBox.maxY),
    utm52.inverse(gridBox.maxX, gridBox.minY),
  ];
  const gridLonLat = {
    minX: Math.min(...corners.map((c) => c[0])) - 0.01,
    maxX: Math.max(...corners.map((c) => c[0])) + 0.01,
    minY: Math.min(...corners.map((c) => c[1])) - 0.01,
    maxY: Math.max(...corners.map((c) => c[1])) + 0.01,
  };
  const dongs = allDongs.filter((d) => bboxOverlaps(d.lonLat, gridLonLat));
  for (const d of dongs) {
    d.parts ??= projectParts(d.geometry);
    d.rings = d.parts.flat();
    d.bbox = ringsBBox(d.rings);
  }
  const touching = dongs.filter((d) => bboxOverlaps(d.bbox, gridBox));
  const ext = config.extendKm * 1000;
  const exMinX = Math.max(gridBox.minX - ext, Math.min(...touching.map((d) => d.bbox.minX)));
  const exMaxX = Math.min(gridBox.maxX + ext, Math.max(...touching.map((d) => d.bbox.maxX)));
  const exMinY = Math.max(gridBox.minY - ext, Math.min(...touching.map((d) => d.bbox.minY)));
  const exMaxY = Math.min(gridBox.maxY + ext, Math.max(...touching.map((d) => d.bbox.maxY)));
  const offCols = Math.max(0, Math.ceil((x0 - exMinX) / cell));
  const offRows = Math.max(0, Math.ceil((exMaxY - y0) / cell));
  const exCols = offCols + cols + Math.max(0, Math.ceil((exMaxX - gridBox.maxX) / cell));
  const exRows = offRows + rows + Math.max(0, Math.ceil((gridBox.minY - exMinY) / cell));
  const lattice = { x0: x0 - offCols * cell, y0: y0 + offRows * cell, W: exCols * per, H: exRows * per };
  const { W, H } = lattice;
  const exBox = { minX: lattice.x0, maxX: lattice.x0 + exCols * cell, minY: lattice.y0 - exRows * cell, maxY: lattice.y0 };

  // 4. 점마다 행정동 번호(-1이면 어느 동도 아님 = 바다)
  const inBox = dongs.filter((d) => bboxOverlaps(d.bbox, exBox));
  const label = new Int32Array(W * H).fill(-1);
  inBox.forEach((d, index) => rasterize(d.rings, d.bbox, lattice, (i, j) => (label[j * W + i] = index)));

  // 5. 점마다 OSM 수면 여부
  const water = new Uint8Array(W * H);
  const osmWater = JSON.parse(readFileSync(raw('osm/water.json'), 'utf8'));
  for (const f of waterFeatures(osmWater, issues)) {
    if (!bboxOverlaps(f.bbox, exBox)) continue;
    rasterize(f.rings, f.bbox, lattice, (i, j) => (water[j * W + i] = 1));
  }

  // 6. 고도와 경사
  const dem = loadDem(['N34E128', 'N34E129', 'N35E128', 'N35E129'].map((t) => raw(`dem/${t}.hgt.gz`)));
  const elev = new Float32Array(W * H).fill(NaN);
  for (let j = 0; j < H; j++) {
    const y = lattice.y0 - 50 - 100 * j;
    for (let i = 0; i < W; i++) {
      if (label[j * W + i] < 0) continue;
      const [lon, lat] = utm52.inverse(lattice.x0 + 50 + 100 * i, y);
      elev[j * W + i] = dem.elevation(lon, lat);
    }
  }
  const slope = new Float32Array(W * H).fill(NaN);
  const at = (i, j) => (i >= 0 && i < W && j >= 0 && j < H ? elev[j * W + i] : NaN);
  const gradient = (a, c, b) => {
    // a: 앞 점, c: 가운데, b: 뒤 점. 100m 간격. 한쪽이 없으면 한쪽 차이만 쓴다.
    if (!Number.isNaN(a) && !Number.isNaN(b)) return (b - a) / 200;
    if (!Number.isNaN(b)) return (b - c) / 100;
    if (!Number.isNaN(a)) return (c - a) / 100;
    return 0;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = elev[j * W + i];
      if (Number.isNaN(c)) continue;
      const gx = gradient(at(i - 1, j), c, at(i + 1, j));
      const gy = gradient(at(i, j - 1), c, at(i, j + 1));
      slope[j * W + i] = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    }
  }

  // 7. 칸 지형
  const nCells = exCols * exRows;
  const terrain = new Array(nCells);
  const meanElev = new Float64Array(nCells).fill(NaN);
  const meanSlope = new Float64Array(nCells).fill(NaN);
  const cellOf = (i, j) => Math.floor(j / per) * exCols + Math.floor(i / per);
  for (let R = 0; R < exRows; R++) {
    for (let C = 0; C < exCols; C++) {
      let sea = 0;
      let river = 0;
      let eSum = 0;
      let eN = 0;
      let sSum = 0;
      let sN = 0;
      for (let j = R * per; j < (R + 1) * per; j++) {
        for (let i = C * per; i < (C + 1) * per; i++) {
          const k = j * W + i;
          if (label[k] < 0) sea++;
          else if (water[k]) river++;
          else {
            if (!Number.isNaN(elev[k])) {
              eSum += elev[k];
              eN++;
            }
            if (!Number.isNaN(slope[k])) {
              sSum += slope[k];
              sN++;
            }
          }
        }
      }
      const c = R * exCols + C;
      meanElev[c] = eN ? eSum / eN : NaN;
      meanSlope[c] = sN ? sSum / sN : NaN;
      if (sea + river >= config.water.minFraction * per * per) {
        terrain[c] = sea >= river ? 'sea' : 'river';
      } else if (meanElev[c] >= config.mountain.minMeanElevationM || meanSlope[c] >= config.mountain.minMeanSlopeDeg) {
        terrain[c] = 'mountain';
      } else if (meanSlope[c] >= config.hill.minMeanSlopeDeg) {
        terrain[c] = 'hill';
      } else {
        terrain[c] = 'flat';
      }
    }
  }

  // 손으로 고친 칸 (격자 기준 col, row)
  const overridden = new Set();
  for (const o of overrides.cells ?? []) {
    if (!(o.terrain in TERRAIN_TYPES) || o.col < 0 || o.col >= cols || o.row < 0 || o.row >= rows) {
      issues.push(`지형 고침을 쓸 수 없어요: ${JSON.stringify(o)}`);
      continue;
    }
    const c = (o.row + offRows) * exCols + (o.col + offCols);
    terrain[c] = o.terrain;
    overridden.add(c);
  }

  // 8. 인구: 행정동 인구를 살 수 있는 점에 똑같이 나눈다
  const popRows = readCsv(raw('datagokr/15097972.csv')).records;
  const popByCode = new Map(popRows.map((r) => [r['행정기관코드'], toNumber(r['계'])]));
  const busanOfficial = popRows.filter((r) => r['행정기관코드'].startsWith('26')).reduce((s, r) => s + toNumber(r['계']), 0);
  const counts = inBox.map(() => ({ good: new Map(), mountain: new Map(), any: new Map() }));
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const d = label[k];
      if (d < 0) continue;
      const c = cellOf(i, j);
      bump(counts[d].any, c);
      if (water[k]) continue;
      if (INHABITABLE.has(terrain[c])) bump(counts[d].good, c);
      else if (terrain[c] === 'mountain') bump(counts[d].mountain, c);
    }
  }
  const pop = new Int32Array(nCells);
  const popBusan = new Int32Array(nCells);
  const fallback = { mountainToHill: [], waterOnly: [] };
  const unmatchedBoundary = [];
  const usedCodes = new Set();
  inBox.forEach((d, index) => {
    const total = popByCode.get(d.code);
    const reachesGrid = bboxOverlaps(d.bbox, gridBox);
    if (total === undefined) {
      if (reachesGrid) unmatchedBoundary.push(`${d.code} ${d.name}`);
      return;
    }
    usedCodes.add(d.code);
    let weights = counts[index].good;
    if (weights.size === 0 && counts[index].mountain.size > 0) {
      weights = counts[index].mountain;
      for (const c of weights.keys()) terrain[c] = 'hill';
      if (reachesGrid) fallback.mountainToHill.push(d.name);
    }
    if (weights.size === 0) {
      weights = counts[index].any;
      if (reachesGrid) fallback.waterOnly.push(d.name);
    }
    for (const [c, n] of allocateInteger(total, weights)) {
      pop[c] += n;
      if (d.code.startsWith('26')) popBusan[c] += n;
    }
  });
  const busanCodes = popRows.filter((r) => r['행정기관코드'].startsWith('26')).map((r) => r['행정기관코드']);
  const unmatchedPopulation = busanCodes
    .filter((c) => !usedCodes.has(c))
    .map((c) => {
      const r = popRows.find((x) => x['행정기관코드'] === c);
      return `${c} ${r['시군구명']} ${r['읍면동명']}`;
    });

  // 9. 외곽 들판: 평지 가운데 사람이 적고 낮은 칸
  for (let c = 0; c < nCells; c++) {
    if (overridden.has(c) || terrain[c] !== 'flat') continue;
    if (pop[c] < config.field.maxDensityPerKm2 && meanElev[c] < config.field.maxMeanElevationM) terrain[c] = 'field';
  }

  // 10. 칸마다 가장 넓은 구·군
  const districtNames = [];
  const districtIndex = new Map();
  const districtOf = new Int32Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tally = new Map();
      for (let j = (r + offRows) * per; j < (r + offRows + 1) * per; j++) {
        for (let i = (c + offCols) * per; i < (c + offCols + 1) * per; i++) {
          const d = label[j * W + i];
          if (d < 0 || water[j * W + i]) continue;
          const key = `${inBox[d].sido} ${inBox[d].sgg}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
      }
      let best = null;
      for (const [key, n] of [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!best || n > best[1]) best = [key, n];
      }
      if (!best) continue;
      if (!districtIndex.has(best[0])) {
        districtIndex.set(best[0], districtNames.length);
        districtNames.push(best[0]);
      }
      districtOf[r * cols + c] = districtIndex.get(best[0]);
    }
  }

  // 11. 격자 부분만 잘라 낸다
  const out = { terrain: [], population: [], populationBusan: [], elevationM: [], slopeDeg: [] };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = (r + offRows) * exCols + (c + offCols);
      out.terrain.push(terrain[e]);
      out.population.push(pop[e]);
      out.populationBusan.push(popBusan[e]);
      out.elevationM.push(Number.isNaN(meanElev[e]) ? null : Math.round(meanElev[e]));
      out.slopeDeg.push(Number.isNaN(meanSlope[e]) ? null : Math.round(meanSlope[e] * 10) / 10);
    }
  }
  // 격자 안 부산 인구와 격자 밖으로 나간 부산 인구
  let busanInGrid = 0;
  for (const n of out.populationBusan) busanInGrid += n;

  const districts = districtNames.map((name, i) => ({ id: i, name }));
  const grid = {
    projection: 'EPSG:32652 (WGS 84 / UTM zone 52N)',
    cellSizeM: cell,
    cols,
    rows,
    origin: { easting: x0, northing: y0, note: '격자 왼쪽 위(북서쪽) 모서리' },
    order: '행 우선. 0번 칸이 북서쪽이고, 한 행은 서쪽에서 동쪽으로, 행은 북쪽에서 남쪽으로 간다.',
    terrainTypes: TERRAIN_TYPES,
    ...out,
    districts,
    district: [...districtOf],
  };
  const stats = {
    extent: { cols, rows, x0, y0, minLonLat: [gridLonLat.minX + 0.01, gridLonLat.minY + 0.01], maxLonLat: [gridLonLat.maxX - 0.01, gridLonLat.maxY - 0.01] },
    extended: { cols: exCols, rows: exRows, offCols, offRows },
    dongsInExtended: inBox.length,
    busanOfficial,
    busanInGrid,
    unmatchedBoundary,
    unmatchedPopulation,
    fallback,
    terrainCounts: Object.fromEntries(Object.keys(TERRAIN_TYPES).map((t) => [t, out.terrain.filter((x) => x === t).length])),
    populationInGrid: out.population.reduce((s, n) => s + n, 0),
    overrides: overridden.size,
  };
  // 행정동 목록: 격자에 걸치는 동의 가운데 점(땅 점들의 평균)과 인구. 중심지 좌표와 Phase 2 모델에 쓴다.
  const dongList = [];
  inBox.forEach((d, index) => {
    if (!bboxOverlaps(d.bbox, gridBox)) return;
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const [cellIndex, n] of counts[index].any) {
      const C = cellIndex % exCols;
      const R = Math.floor(cellIndex / exCols);
      sx += (C - offCols + 0.5) * n;
      sy += (R - offRows + 0.5) * n;
      count += n;
    }
    if (count === 0) return;
    dongList.push({
      code: d.code,
      name: d.name,
      sido: d.sido,
      sgg: d.sgg,
      x: Math.round((sx / count) * 100) / 100,
      y: Math.round((sy / count) * 100) / 100,
      areaKm2: Math.round((count / (per * per)) * 100) / 100,
      population: popByCode.get(d.code) ?? null,
    });
  });
  dongList.sort((a, b) => a.code.localeCompare(b.code));

  // dongs와 box는 구·군 경계선을 뽑을 때 쓴다(scripts/build/districts.mjs).
  return { grid, stats, issues, dongs: inBox, box: gridBox, dongList };
}
