// 공공데이터포털 인증키 읽기. 키는 git에 넣지 않는 .data-go-kr-key 파일이나 환경 변수 DATA_GO_KR_KEY에만 둔다.
// 게임 코드(src/)에서는 쓰지 않는다. 받기 스크립트(scripts/)에서만 쓴다.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEY_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../.data-go-kr-key');

/** @returns {string|null} 풀린(Decoding) 인증키. 없으면 null */
export function readApiKey() {
  const fromEnv = process.env.DATA_GO_KR_KEY?.trim();
  if (fromEnv) return /%[0-9A-Fa-f]{2}/.test(fromEnv) ? decodeURIComponent(fromEnv) : fromEnv;
  try {
    if (!existsSync(KEY_FILE)) return null;
    return readFileSync(KEY_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** 서울 열린데이터광장 인증키 파일(git에 넣지 않는다. 사용자가 2026-11-22에 둠) */
export const SEOUL_KEY_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../seoul_api.txt');

/** @returns {string|null} 서울 열린데이터광장 인증키(환경 변수 SEOUL_OPEN_KEY 또는 seoul_api.txt). 없으면 null */
export function readSeoulKey() {
  const fromEnv = process.env.SEOUL_OPEN_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    if (!existsSync(SEOUL_KEY_FILE)) return null;
    return readFileSync(SEOUL_KEY_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}
