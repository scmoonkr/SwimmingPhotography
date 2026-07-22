export default defineNuxtConfig({
  // devtools 는 프로덕션 빌드에서 rolldown 네이티브 바이너리를 요구해 서버 빌드를 깨뜨림.
  // 개발 때만 켜고 빌드에서는 끈다. (nuxt build 시 NODE_ENV=production)
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  devServer: {
    port: 6642,
  },

  css: ['~/assets/css/dashboard.css'],

  // apiBase 를 비우면 상대경로 '/api/...' 로 호출 → 아래 nitro routeRules 가
  // 같은 오리진에서 받아 서버측에서 Express(127.0.0.1:6640)로 프록시한다.
  // (브라우저는 대시보드와 동일 오리진만 호출 → localhost 문제·CORS 없음)
  // 원격 API 를 직접 부르려면 NUXT_PUBLIC_API_BASE 로 전체 URL 지정.
  runtimeConfig: {
    public: {
      apiBase: '',
      // 이미지 스토리지(R2/iDrive) 공개 베이스 — 드로어 이미지 url 이 http 가 아니면 이 값을 앞에 붙인다. (client 와 동일 기본값)
      cloudPublicUrl: process.env.NUXT_PUBLIC_CLOUD_PUBLIC_URL || process.env.CLOUD_PUBLIC_URL
        || 'https://f3t1.c6.e2-9.dev/swimmingphotography-bucket',
    },
  },

  // /api/** 요청을 로컬 Express API 로 프록시 (dev·프로덕션 공통)
  // /images/** 는 클라이언트(6641) 정적 이미지로 프록시 → 드로어 썸네일 미리보기가
  // 대시보드에서도 상대경로(/images/temp/...)로 그대로 로드된다.
  nitro: {
    routeRules: {
      '/api/**': { proxy: 'http://127.0.0.1:6640/api/**' },
      '/images/temp/**': { proxy: 'http://localhost:6641/images/temp/**' },
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
