# CLAUDE.md

## 프로젝트
부산 도시철도 설계 게임이다. 대상은 철도를 좋아하는 초등 3~4학년이고, 태블릿 브라우저에서 돌아가는 오프라인 HTML 게임을 만든다.

전체 기획은 `docs/SPEC.md`에 있다. 작업을 시작하기 전에 그 문서의 2장(절대 원칙)과 이번 Phase 절을 반드시 읽는다.

## 작업 방식
- 한 세션에는 한 Phase만 진행한다.
- 시작할 때 계획을 먼저 보여주고 확인을 받는다.
- 끝나면 해당 Phase의 완료 기준을 하나씩 확인해 결과를 보고하고, 커밋한다.
- 새 의존성을 추가하기 전에는 이유를 설명하고 허락을 받는다.
- 역 수, 날짜, 비용, 인구 같은 사실은 `data/SOURCES.md`에 적힌 출처에서만 가져온다.
  - 기억으로 채우지 않는다.
  - 확인이 안 되면 `TODO(확인 필요)`로 남기고 보고한다.

## 절대 규칙
- `src/sim/`은 순수 함수만 둔다.
  - DOM에 접근하지 않는다.
  - `Math.random`을 쓰지 않는다.
  - 현재 시각에 따라 결과가 달라지면 안 된다.
  - 같은 입력은 항상 같은 출력을 낸다.
- 다음 기능은 넣지 않는다: 점수, 별, 배지, 등급, 순위표, 연속 접속 보상, 알림, 제한 시간, 카운트다운, 자동으로 이어지는 다음 판.
- 광고, 외부 링크, 결제, 사용 추적을 넣지 않는다. 배포물은 네트워크 요청 없이 오프라인으로 동작해야 한다.
  - 서비스 워커(`public/sw.js`)는 깔 때 우리 파일을 한 번 받아 두는 것만 한다. 바깥 주소를 부르지 않고 `fetch`도 쓰지 않는다.
- 화면 문구 규칙:
  - 초등 3~4학년 수준으로 쓴다. "~해요"체, 한 문장에 한 가지 뜻.
  - 어려운 낱말은 `src/content/words.json`의 낱말 카드로 연결한다.
- 숫자 표시 규칙:
  - 숫자는 항상 그림(막대나 아이콘)과 함께 보여준다.
  - 시간은 "2분 20초", 거리는 "1km 600m" 형식으로 쓴다.
  - 큰 수는 기본 모드에서 "약 4만 2천 명", 진짜 숫자 모드에서 "42,380명"으로 쓴다.
- 색만으로 뜻을 전하지 않는다. 노선에는 번호를 붙이고, 붐빔은 아이콘 개수로 보여준다.
- `localStorage`를 읽고 쓸 때는 항상 try/catch로 감싼다. 저장된 값이 없어도 화면이 정상으로 떠야 한다.
- OpenStreetMap 자료를 쓰면 화면에 "© OpenStreetMap contributors"를 표시한다.

## 명령
- `npm run dev`: 개발 서버
- `npm run build`: 게임을 `dist/index.html` 한 파일로 만든다. 홈 화면 설치에 필요한 곁들이 파일(`manifest.webmanifest`, `sw.js`, 아이콘)이 함께 나온다
- `npm run preview`: 빌드한 것을 localhost로 띄운다(서비스 워커 확인)
- `npm run tablet`: 같은 와이파이의 태블릿에서 열 수 있게 띄운다
- `npm run icons`: 홈 화면 아이콘을 다시 만든다
- `npm test`: 시뮬레이션 테스트(결정론, 경로, 공사비, 보정, 성능)
- `npm run fetch`: `scripts/sources.mjs` 목록대로 원본을 `data/raw/`에 받는다(네트워크를 쓴다)
- `npm run data`: `data/raw/`를 처리해 `data/build/`를 만든다
- `npm run bus`: 시내버스 원본으로 `data/build/bus.json`을 만든다(실제 버스 노선과 정류장)
- `npm run station-sounds`: 역사 안내방송 원본에서 승강장 소리(열차진입 안내음, 진입 방송)를 `data/build/station-sounds.json`으로 만든다
- `npm run validate`: 데이터 검증
- `npm run calibrate`: 모델을 실제 승하차 자료와 맞추고 `docs/calibration.md`를 쓴다

## 폴더
- `data/raw/`: 받은 원본. 고치지 않는다.
- `data/build/`: 게임용 JSON.
- `data/SOURCES.md`: 출처, 받은 날짜, 이용 조건.
- `data/raw-lock.json`: 원본 파일의 주소, 크기, SHA-256.
- `data/facts.json`: 웹 페이지에서 확인한 사실과 출처.
- `data/edits/`: 원본의 빠진 곳이나 틀린 곳을 손으로 고친 기록. 항목마다 출처를 적는다.
- `scripts/`: 수집, 처리, 검증 스크립트.
- `src/sim/`: 격자, 경로, 이동 모델, 붐빔, 공사비.
- `src/ui/`: 화면.
- `src/content/`: 과제 카드, 규칙 카드, 낱말 카드 JSON.
- `public/`: 그대로 복사되는 파일. 홈 화면 설치에 쓰는 manifest, 서비스 워커, 아이콘.
- `tests/`: 테스트.
