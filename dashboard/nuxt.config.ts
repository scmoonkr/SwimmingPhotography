export default defineNuxtConfig({
  // devtools 는 프로덕션 빌드에서 rolldown 네이티브 바이너리를 요구해 서버 빌드를 깨뜨림.
  // 개발 때만 켜고 빌드에서는 끈다. (nuxt build 시 NODE_ENV=production)
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  devServer: {
    port: 6642,
  },

  css: ['~/assets/css/dashboard.css'],

  // API 서버(Express 6640) 주소 — NUXT_PUBLIC_API_BASE 로 오버라이드(프로덕션).
  // 개발: http://localhost:6640, 프로덕션: https://api.swimmingphotography.com 등
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:6640',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Swimming Photography · Dashboard',
      meta: [
        { charset: 'UTF-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/images/favicon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@700&display=swap',
        },
      ],
    },
  },

})
