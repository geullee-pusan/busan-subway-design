// 환승역·종착역 가락 테스트
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { melodyNotes, midiFile, midiToHz } from '../src/sim/melody.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { melodies } = JSON.parse(readFileSync(resolve(ROOT, 'src/content/melodies.json'), 'utf8'));

test('가락: 환승역과 종착역 두 개가 있고, 줄마다 길이가 같다', () => {
  assert.deepEqual(Object.keys(melodies).sort(), ['terminal', 'transfer']);
  for (const melody of Object.values(melodies)) {
    const lengths = melody.tracks.map((track) => track.reduce((sum, [, beats]) => sum + beats, 0));
    assert.ok(lengths.every((n) => n === lengths[0]), `${melody.name}: ${lengths}`);
  }
});

test('가락: 환승역은 짧고(5초 안) 종착역은 조금 길다(10초 안)', () => {
  const transfer = melodyNotes(melodies.transfer).seconds;
  const terminal = melodyNotes(melodies.terminal).seconds;
  assert.ok(transfer > 2 && transfer <= 5, `환승 ${transfer}`);
  assert.ok(terminal > transfer && terminal <= 10, `종착 ${terminal}`);
});

test('환승역 가락은 가야금 오음계(도 레 미 솔 라), 종착역 로고송은 오음계가 아니다', () => {
  const pentatonic = new Set([0, 2, 4, 7, 9]);
  const pitches = (melody) => melody.tracks.flat().map(([midi]) => midi).filter((midi) => midi !== null);
  assert.equal(melodies.transfer.instrument, '가야금');
  for (const midi of pitches(melodies.transfer)) assert.ok(pentatonic.has(midi % 12), `환승 ${midi}`);
  assert.notEqual(melodies.terminal.instrument, '가야금');
  assert.ok(pitches(melodies.terminal).some((midi) => !pentatonic.has(midi % 12)), '종착역에 파나 시가 있어야 한다');
});

test('MIDI 파일: 머리와 트랙이 맞고, 켠 음은 모두 끈다', () => {
  assert.equal(midiToHz(69), 440);
  for (const melody of Object.values(melodies)) {
    const bytes = midiFile(melody);
    const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
    assert.equal(text(0, 4), 'MThd');
    assert.equal(text(14, 18), 'MTrk');
    const length = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
    assert.equal(bytes.length, 22 + length);
    assert.deepEqual([...bytes.slice(-3)], [0xff, 0x2f, 0x00]);
    // 사건을 차례로 읽는다: 가변 길이 시간, 그다음 사건
    let on = 0;
    let off = 0;
    let i = 22;
    while (i < bytes.length) {
      while (bytes[i] & 0x80) i += 1;
      i += 1;
      const status = bytes[i];
      if (status === 0xff) {
        i += 3 + bytes[i + 2];
      } else if ((status & 0xf0) === 0xc0) {
        i += 2;
      } else {
        if ((status & 0xf0) === 0x90 && bytes[i + 2] > 0) on += 1;
        if ((status & 0xf0) === 0x80) off += 1;
        i += 3;
      }
    }
    const notes = melodyNotes(melody).notes.length;
    assert.equal(on, notes);
    assert.equal(off, notes);
    assert.deepEqual(midiFile(melody), bytes, '늘 같은 파일');
  }
});
