// 시승 모드에 쓰는 것을 만든다: 역명판 글꼴(프리텐다드)의 이용 허락 글(data/build/fonts/Pretendard-OFL.txt).
// 예전에는 공공데이터포털 3033578의 열차 진입 알림음도 꺼냈지만, 승강장 소리라서 차내 시승에는 쓰지 않는다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 역명판 글꼴(프리텐다드)의 이용 허락 글. OFL은 글꼴과 함께 저작권 표시와 이용 허락 전문을 주어야 한다.
// 게임 파일에는 바깥 주소를 넣지 않으므로(CLAUDE.md) 머리글의 주소만 빼고 전문을 그대로 둔다.
// 원문은 data/raw/fonts/Pretendard-LICENSE.txt에 그대로 있다.
{
  const license = readFileSync(resolve(ROOT, 'data/raw/fonts/Pretendard-LICENSE.txt'), 'utf8');
  const clean = license
    .replace(/\s*\(https?:\/\/[^)]*\)/g, '')
    .replace(/This license is copied below, and is also available with a FAQ at:\s*\n\s*https?:\/\/\S+/, 'This license is copied below.');
  if (/https?:\/\//.test(clean)) throw new Error('글꼴 이용 허락 글에 주소가 남았어요');
  const fonts = resolve(ROOT, 'data/build/fonts');
  mkdirSync(fonts, { recursive: true });
  writeFileSync(resolve(fonts, 'Pretendard-OFL.txt'), clean);
  console.log(`Pretendard-OFL.txt  ${clean.length.toLocaleString()} 글자`);
}
