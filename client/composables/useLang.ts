// 공용 다국어(KOR/ENG) 엔진 — docs/html/assets/i18n.js 를 Nuxt 반응형으로 이식.
// localStorage('mb_lang')에 저장 → 다음 방문에도 유지. 전 컴포넌트가 같은 상태를 공유.
//   const { isEN, t, toggle } = useLang()
//   t('한글', 'English')  →  현재 언어에 맞는 문자열
import { computed } from 'vue'

const KEY = 'mb_lang'

export const useLang = () => {
  // useState: SSR/CSR 공유 + 앱 전역 단일 상태
  const lang = useState<'ko' | 'en'>('lang', () => 'ko')

  const isEN = computed(() => lang.value === 'en')

  const setLang = (l: 'ko' | 'en') => {
    lang.value = l === 'en' ? 'en' : 'ko'
    if (import.meta.client) {
      try { localStorage.setItem(KEY, lang.value) } catch {}
      document.documentElement.classList.toggle('lang-en', lang.value === 'en')
      document.documentElement.setAttribute('lang', lang.value)
    }
  }

  const toggle = () => setLang(isEN.value ? 'ko' : 'en')

  // 현재 언어에 맞는 텍스트 선택
  const t = (ko: string, en: string) => (isEN.value ? en : ko)

  return { lang, isEN, setLang, toggle, t }
}

// 대형 정적 문서(agreement 등)용 — data-en / data-en-html 속성을 현재 언어로 치환.
// 원문(HTML)을 그대로 유지한 채, 최초 실행 시 한글을 data-ko/data-ko-html 로 보관.
// (docs/html/assets/i18n.js 의 applyI18n 을 그대로 이식)
export const applyI18n = (root: HTMLElement, en: boolean) => {
  root.querySelectorAll<HTMLElement>('[data-en]').forEach((el) => {
    if (el.getAttribute('data-ko') === null) el.setAttribute('data-ko', el.textContent || '')
    el.textContent = en ? el.getAttribute('data-en') || '' : el.getAttribute('data-ko') || ''
  })
  root.querySelectorAll<HTMLElement>('[data-en-html]').forEach((el) => {
    if (el.getAttribute('data-ko-html') === null) el.setAttribute('data-ko-html', el.innerHTML)
    el.innerHTML = en ? el.getAttribute('data-en-html') || '' : el.getAttribute('data-ko-html') || ''
  })
}

// 최초 진입 시 저장된 언어 복원 (클라이언트 전용)
export const restoreLang = () => {
  if (!import.meta.client) return
  let saved: 'ko' | 'en' = 'ko'
  try { saved = localStorage.getItem(KEY) === 'en' ? 'en' : 'ko' } catch {}
  useLang().setLang(saved)
}
