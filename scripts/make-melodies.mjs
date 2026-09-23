// 환승역·종착역 가락을 MIDI 파일로 내보낸다(docs/melodies/). 게임은 같은 음표를 브라우저에서 직접 연주한다.
// 들어 보거나 고칠 때 쓴다. 음표를 고치려면 src/content/melodies.json을 고치고 다시 돌린다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { melodyNotes, midiFile } from '../src/sim/melody.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { melodies } = JSON.parse(readFileSync(resolve(ROOT, 'src/content/melodies.json'), 'utf8'));
const out = resolve(ROOT, 'docs/melodies');
mkdirSync(out, { recursive: true });
for (const [key, melody] of Object.entries(melodies)) {
  const bytes = midiFile(melody);
  writeFileSync(resolve(out, `${key}.mid`), bytes);
  console.log(`${key}.mid  ${melody.name}  ${melodyNotes(melody).seconds.toFixed(1)}초  ${bytes.length} B`);
}
