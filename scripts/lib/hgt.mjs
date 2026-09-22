// SRTM HGT 고도 타일 읽기.
// 한 타일은 위도·경도 1도 × 1도, 3601 × 3601칸(1초 간격)이다. 값은 big-endian 16비트 정수(m)이고,
// 첫 행이 북쪽 끝, 첫 열이 서쪽 끝이다. -32768은 값이 없는 칸이다.
// 형식: https://github.com/tilezen/joerd/blob/master/docs/formats.md
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync } from 'node:zlib';

const SIZE = 3601;
const VOID = -32768;

/** 타일 파일들을 읽어 elevation(경도, 위도) 함수를 돌려준다. 타일 밖이나 빈 값이면 NaN이다. */
export function loadDem(files) {
  const tiles = new Map();
  for (const file of files) {
    const m = /^([NS])(\d{2})([EW])(\d{3})\.hgt(\.gz)?$/.exec(basename(file));
    if (!m) throw new Error(`HGT 파일 이름이 아니에요: ${file}`);
    const lat = (m[1] === 'N' ? 1 : -1) * Number(m[2]);
    const lon = (m[3] === 'E' ? 1 : -1) * Number(m[4]);
    let buf = readFileSync(file);
    if (m[5]) buf = gunzipSync(buf);
    if (buf.length !== SIZE * SIZE * 2) throw new Error(`HGT 크기가 달라요: ${file} (${buf.length} B)`);
    tiles.set(`${lat},${lon}`, buf);
  }

  function sample(tile, row, col) {
    const v = tile.readInt16BE(2 * (row * SIZE + col));
    return v === VOID ? NaN : v;
  }

  /** 이웃한 네 값을 거리에 따라 섞는다(쌍선형 보간). 빈 값은 빼고 섞는다. */
  function elevation(lon, lat) {
    const tileLat = Math.floor(lat);
    const tileLon = Math.floor(lon);
    const tile = tiles.get(`${tileLat},${tileLon}`);
    if (!tile) return NaN;
    const fx = (lon - tileLon) * (SIZE - 1);
    const fy = (tileLat + 1 - lat) * (SIZE - 1);
    const c0 = Math.min(Math.floor(fx), SIZE - 2);
    const r0 = Math.min(Math.floor(fy), SIZE - 2);
    const dx = fx - c0;
    const dy = fy - r0;
    const corners = [
      [sample(tile, r0, c0), (1 - dx) * (1 - dy)],
      [sample(tile, r0, c0 + 1), dx * (1 - dy)],
      [sample(tile, r0 + 1, c0), (1 - dx) * dy],
      [sample(tile, r0 + 1, c0 + 1), dx * dy],
    ];
    let sum = 0;
    let weight = 0;
    for (const [v, w] of corners) {
      if (!Number.isNaN(v)) {
        sum += v * w;
        weight += w;
      }
    }
    return weight > 0 ? sum / weight : NaN;
  }

  return { elevation, tiles: [...tiles.keys()] };
}
