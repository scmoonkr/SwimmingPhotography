// 최초 진입 시 저장된 언어(localStorage 'mb_lang')를 복원한다.
export default defineNuxtPlugin(() => {
  restoreLang()
})
