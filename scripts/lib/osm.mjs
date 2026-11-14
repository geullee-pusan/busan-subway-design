// OpenStreetMap 원본(data/raw/osm/)을 읽는다.
// 지도를 경남·전남광주까지 넓힐 때(2026-11-14) 이미 받은 범위는 그대로 두고, 새로 넓힌 범위만 "<이름>-2.json"으로 받았다.
// 두 파일을 합쳐 읽고, 두 범위가 맞닿은 곳에서 겹친 요소는 한 번만 넣는다.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} root 저장소 맨 위 폴더
 * @param {string} name 'water', 'routes', 'stations', 'rail-lines', 'roads', 'landmarks'
 * @returns {{elements: object[]}}
 */
export function readOsm(root, name) {
  return readOsmFile(resolve(root, `data/raw/osm/${name}.json`));
}

/**
 * 파일 자리로 읽는다(data/raw/osm/water.json이면 곁의 water-2.json, water-3.json도 합친다).
 * -2는 경남·전남광주, -3은 지도 네모 안 북서쪽 띠(scripts/sources.mjs의 OSM_BOXES_2, OSM_BOX_3).
 * @param {string} path
 */
export function readOsmFile(path) {
  const first = JSON.parse(readFileSync(path, 'utf8'));
  const seen = new Set(first.elements.map((e) => `${e.type}/${e.id}`));
  const elements = [...first.elements];
  for (const n of [2, 3]) {
    const morePath = path.replace(/\.json$/, `-${n}.json`);
    if (!existsSync(morePath)) continue;
    for (const e of JSON.parse(readFileSync(morePath, 'utf8')).elements) {
      const id = `${e.type}/${e.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      elements.push(e);
    }
  }
  return { ...first, elements };
}
