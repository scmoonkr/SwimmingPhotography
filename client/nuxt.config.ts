export default defineNuxtConfig({
  devtools: { enabled: true },

  devServer: {
    port: 6641,
  },

  nitro: {
    devProxy: {
      '/api': {
        target: 'http://127.0.0.1:6640',
        changeOrigin: true,
      },
    },
  },
})
