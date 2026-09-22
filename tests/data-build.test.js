// 같은 원본으로 두 번 가공하면 결과가 완전히 같아야 한다. 원본이 없으면(npm run fetch 전) 건너뛴다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildGrid } from '../scripts/build/grid.mjs';
import { buildNetwork } from '../scripts/build/network.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => resolve(ROOT, 'data/raw', p);
const missing = ['admdongkor/HangJeongDong_ver20260701.geojson', 'dem/N35E129.hgt.gz', 'osm/water.json'].filter((p) => !existsSync(raw(p)));
const skip = missing.length > 0 && `원본이 없어요(npm run fetch): ${missing.join(', ')}`;

test('역·노선 가공은 결정론적이다', { skip }, () => {
  const run = () => JSON.stringify(buildNetwork(raw));
  assert.equal(run(), run());
});

test('격자 가공은 결정론적이다', { skip }, () => {
  const config = JSON.parse(readFileSync(resolve(ROOT, 'scripts/config/terrain.json'), 'utf8'));
  const extraPoints = [{ name: '시험 점', lon: 129.04, lat: 35.36 }];
  const run = () => JSON.stringify(buildGrid({ raw, config, extraPoints, overrides: { cells: [] } }).grid);
  assert.equal(run(), run());
});
