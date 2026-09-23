import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 게임은 dist/index.html 한 파일이다. 스크립트와 스타일을 모두 안에 넣는다.
// 곁들이 파일(manifest, sw.js, 아이콘)은 public/에서 그대로 복사된다. 홈 화면 설치에 필요하다.
export default defineConfig({
  // 상대 주소로 뽑는다. 하위 폴더 주소(GitHub Pages)에서도 열린다.
  base: './',
  plugins: [viteSingleFile()],
  build: {
    // 모듈 미리 읽기 보조 코드(fetch를 쓴다)를 넣지 않는다. 한 파일이라 필요 없다.
    modulePreload: { polyfill: false },
  },
});
