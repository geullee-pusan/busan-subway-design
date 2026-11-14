// 랜드마크 장면의 특징 그림(src/ui/landmark-props.js). 게임 자료 JSON을 함께 읽어야 해서 vite로 불러온다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let props;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  props = await server.ssrLoadModule('/src/ui/landmark-props.js');
});
after(() => server?.close());

test('손으로 정한 특징 그림과 분위기는 있는 것만 쓴다', () => {
  const { looks } = JSON.parse(readFileSync(new URL('../src/content/landmark-looks.json', import.meta.url), 'utf8'));
  const moods = new Set(['sunset', 'night', 'dawn', 'autumn', 'spring', 'winter']);
  for (const [id, look] of Object.entries(looks)) {
    for (const name of look.props ?? []) assert.ok(props.PROPS[name], `${id}: ${name} 그림이 없어요`);
    if (look.mood) assert.ok(moods.has(look.mood), `${id}: ${look.mood}`);
  }
});

test('사진을 보고 그린 곳이 아니면 랜드마크마다 특징 그림이나 분위기가 하나 이상 있다', () => {
  const { landmarks } = JSON.parse(readFileSync(new URL('../data/build/landmarks.json', import.meta.url), 'utf8'));
  const plain = landmarks.filter((lm) => !lm.scene).filter((lm) => {
    const look = props.looksFor(lm);
    return look.props.length === 0 && !look.mood;
  });
  // 종류 그림만으로도 충분한 곳이 조금 있을 수 있다. 너무 많으면 규칙이나 손으로 정한 것을 늘린다.
  assert.ok(plain.length <= landmarks.length * 0.35, `특징이 없는 곳 ${plain.length}곳: ${plain.map((l) => l.name).join(', ')}`);
});
