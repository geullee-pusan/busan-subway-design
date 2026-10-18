// npm run api-key: 공공데이터포털 인증키를 저장하고, 열차 API 두 개가 되는지 시험한다(네트워크를 쓴다).
//
//   npm run api-key            키를 물어보고 저장한 뒤 시험한다(이미 저장했으면 엔터만 쳐도 시험만 한다)
//   npm run api-key -- --test  저장한 키로 시험만 한다
//
// 키는 프로젝트 맨 위 .data-go-kr-key 파일에만 둔다. 이 파일은 git에 넣지 않고(.gitignore), 게임(dist)에도 들어가지 않는다.
// 다른 스크립트는 scripts/lib/api-key.mjs의 readApiKey()로 읽는다. 환경 변수 DATA_GO_KR_KEY가 있으면 그것을 먼저 쓴다.
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { KEY_FILE, readApiKey } from './lib/api-key.mjs';

/** 시험할 API: 공공데이터포털 인증키 하나로 둘 다 쓴다. */
const CHECKS = [
  {
    name: '국토교통부 TAGO 열차정보(15098552)',
    page: 'https://www.data.go.kr/data/15098552/openapi.do',
    url: (key) => `https://apis.data.go.kr/1613000/TrainInfo/GetVhcleKndList?serviceKey=${encodeURIComponent(key)}&_type=json`,
    read: (json) => {
      const items = json?.response?.body?.items?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      return list.length ? `열차 종류 ${list.length}가지: ${list.map((i) => i.vehiclekndnm).join(', ')}` : null;
    },
  },
  {
    name: '한국철도공사 열차운행정보(15125762)',
    page: 'https://www.data.go.kr/data/15125762/openapi.do',
    url: (key) =>
      `https://apis.data.go.kr/B551457/run/v2/codes2?serviceKey=${encodeURIComponent(key)}&returnType=JSON&numOfRows=100&pageNo=1&${encodeURIComponent('cond[type::EQ]')}=mrnt_cd`,
    read: (json) => {
      const items = json?.response?.body?.items?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      return list.length ? `노선 코드 ${list.length}개: ${list.slice(0, 8).map((i) => i.value).join(', ')}…` : null;
    },
  },
];

/** 공공데이터포털이 돌려주는 오류를 알아듣기 쉬운 말로 바꾼다. */
function explain(text, status) {
  if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE KEY IS NOT REGISTERED|Unauthorized|401/.test(text) || status === 401) {
    return '키가 아직 이 API에 등록되지 않았어요. 활용신청을 했는지 확인해요. 신청한 지 얼마 안 됐다면 1~2시간 뒤에 다시 해 봐요.';
  }
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS|429/.test(text) || status === 429) return '오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해 봐요.';
  if (/NO_OPENAPI_SERVICE/.test(text)) return 'API 주소가 바뀐 것 같아요. 이 스크립트를 고쳐야 해요.';
  return `알 수 없는 답이 왔어요(HTTP ${status}): ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
}

async function check(key) {
  let allOk = true;
  for (const api of CHECKS) {
    process.stdout.write(`- ${api.name}: `);
    try {
      const res = await fetch(api.url(key), { signal: AbortSignal.timeout(30_000) });
      const text = await res.text();
      let summary = null;
      try {
        summary = api.read(JSON.parse(text));
      } catch {
        summary = null;
      }
      if (res.ok && summary) {
        console.log(`돼요. ${summary}`);
      } else {
        allOk = false;
        console.log(`안 돼요. ${explain(text, res.status)}`);
        console.log(`  활용신청 페이지: ${api.page}`);
      }
    } catch (error) {
      allOk = false;
      console.log(`연결하지 못했어요(${error.message}). 인터넷 연결을 확인해요.`);
    }
  }
  return allOk;
}

const testOnly = process.argv.includes('--test');
let key = readApiKey();
if (!testOnly) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('공공데이터포털 마이페이지 → 개발계정 → 인증키(일반 인증키)를 복사해 붙여 넣어요.');
  console.log('Encoding 키와 Decoding 키 어느 것이든 괜찮아요.');
  const answer = (await rl.question(key ? '새 인증키(그대로 두려면 엔터): ' : '인증키: ')).trim();
  rl.close();
  if (answer) {
    // Encoding 키(%2B 같은 글자가 들어 있다)는 풀어서 저장한다. 부를 때 다시 encodeURIComponent 한다.
    key = /%[0-9A-Fa-f]{2}/.test(answer) ? decodeURIComponent(answer) : answer;
    writeFileSync(KEY_FILE, `${key}\n`, { mode: 0o600 });
    console.log(`저장했어요: ${KEY_FILE} (git에 넣지 않는 파일이에요)`);
  }
}
if (!key) {
  console.log('저장한 인증키가 없어요. npm run api-key 로 먼저 저장해요.');
  process.exit(1);
}
console.log('\n열차 API를 시험해요.');
const ok = await check(key);
console.log(ok ? '\n두 API 모두 돼요. 이제 열차 시각표를 받을 수 있어요.' : '\n안 되는 API가 있어요. 위 안내를 보고 다시 해 봐요.');
process.exit(ok ? 0 : 1);
