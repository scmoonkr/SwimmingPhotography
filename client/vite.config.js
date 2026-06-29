import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
// public/ 하위에 index.html이 있는 디렉터리(racingcaps, racingcaps1 등)를
// 짧은 경로로 접근할 수 있게, 확장자 없는 디렉터리 요청을 해당 index.html로 리라이트한다.
// public에 폴더를 복사하기만 하면 별도 설정 없이 자동으로 동작한다.
// (Vite 기본 SPA fallback이 가로채서 Vue 앱을 반환하는 것을 방지)
const publicDir = fileURLToPath(new URL('./public', import.meta.url))
function serveStaticHtmlDirs() {
  return {
    name: 'serve-static-html-dirs',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url.split('?')[0]
        // 확장자가 없는 경로만 대상으로 한다 (예: /racingcaps, /racingcaps1/)
        const segment = decodeURIComponent(url.replace(/^\/+|\/+$/g, ''))
        if (segment && !segment.includes('/') && !path.extname(segment)) {
          const indexPath = path.join(publicDir, segment, 'index.html')
          if (fs.existsSync(indexPath)) {
            req.url = `/${segment}/index.html`
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    serveStaticHtmlDirs(),
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 6641,
    proxy: {
      '/api': 'http://localhost:6640',
    },
  },
})
