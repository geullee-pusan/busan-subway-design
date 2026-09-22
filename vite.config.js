import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 배포물은 dist/index.html 한 파일이다. 스크립트와 스타일을 모두 안에 넣는다.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // 모듈 미리 읽기 보조 코드(fetch를 쓴다)를 넣지 않는다. 한 파일이라 필요 없다.
    modulePreload: { polyfill: false },
  },
});
