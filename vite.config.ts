import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 강제 새로고침이 아니라 물어본다 — 회화/선생님 스트리밍 중이거나 2GB Gemma 모델을
      // 받는 중에 배포가 화면을 갈아치우면 안 된다(PwaUpdatePrompt.tsx가 짝이다).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico'],
      manifest: {
        name: '김계승 일본어',
        short_name: '김계승 일본어',
        description: '온디바이스 AI로 배우는 일본어',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        // HomePage.tsx의 배경색과 정확히 같다(hero.png와 경계가 안 보이게 맞춘 색).
        background_color: '#faf4e4',
        // src/index.css의 --color-primary.
        theme_color: '#58cc02',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 앱 셸(작은/중간 청크)만 설치 시 미리 받는다. dictionary/kanjivg/kanji 세 청크는
        // 프로젝트가 이미 갖고 있는 "큰 정적 데이터는 실제로 그 페이지를 열 때만 받는다"
        // 원칙을 지키려고 제외한다(CLAUDE.md "번들 최적화" 절과 같은 이유) — 대신 아래
        // runtimeCaching이 그 페이지를 처음 열 때 캐시에 넣는다. dictionary 청크(~3MB)는
        // 빼지 않으면 Workbox의 기본 프리캐시 용량 제한(2MB)에 걸려 빌드가 실패한다.
        globIgnores: ['**/dictionary-*.js', '**/kanjivg-*.js', '**/kanji-*.js'],
        // 오프라인 상태에서 /kanji 같은 경로로 직접 들어와도 캐시된 셸을 돌려주고
        // react-router가 이어받게 한다.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // dictionary-*.js / kanjivg-*.js / kanji-*.js — 그 페이지를 실제로 한 번 열었을
            // 때만 캐시에 들어간다(위 globIgnores와 짝).
            urlPattern: /\/assets\/(dictionary|kanjivg|kanji)-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'reference-data-v1',
              expiration: {
                maxEntries: 6, // 세 파일의 배포 전/후 해시가 잠깐 같이 남아도 되게 여유를 둠
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // index.html이 쓰는 Google Fonts(Jua/Kosugi Maru)는 cross-origin이라 프리캐시
            // 대상이 아니다 — 이게 없으면 오프라인에서 시스템 폰트로 떨어진다.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      // 개발 서버(vite dev)에는 서비스워커를 켜지 않는다 — 사용자가 직접 띄워 쓰는 HMR
      // 루프를 건드리지 않기 위함. 오프라인 테스트는 `npm run build && npm run preview`로.
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
