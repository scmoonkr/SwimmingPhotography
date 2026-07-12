export default defineNuxtConfig({
  // devtools 는 프로덕션 빌드에서 rolldown 네이티브 바이너리를 요구해 서버 빌드를 깨뜨림.
  // 개발 때만 켜고 빌드에서는 끈다. (nuxt build 시 NODE_ENV=production)
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  devServer: {
    port: 6641,
  },

  // 사이트 전역 스타일 (디자인 토큰 + 리셋 + 본문 타이포)
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Swimming Photography',
      meta: [
        { charset: 'UTF-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        {
          name: 'description',
          content:
            'Swimming Photography by Medalbank. 우리나라 대한민국의 수영 이야기와 수영대회 이야기를 전합니다. 운영, 촬영, 취재, 작성, 배포까지 오직 수영인의 마음으로만 운영됩니다.',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/images/favicon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=Noto+Sans+KR:wght@400;500;700&display=swap',
        },
      ],
    },
  },

  // /api/** 를 로컬 Express(6640)로 프록시 (dev·프로덕션 공통). SSE 스트림 포함.
  nitro: {
    routeRules: {
      '/api/**': { proxy: 'http://127.0.0.1:6640/api/**' },
    },
  },
})
