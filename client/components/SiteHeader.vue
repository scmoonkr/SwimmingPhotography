<script setup lang="ts">
// 공용 헤더 — docs/html/assets/header.js 를 Vue 컴포넌트로 이식.
// 로고(그라데이션 shine), 태그라인, 언어 토글(hover 미리보기 + 스프링).
import { ref } from 'vue'

const { isEN, toggle, t } = useLang()

// 언어 토글: 현재 언어 = 진하게. hover 시 반대 언어 미리보기.
const preview = ref<'ko' | 'en' | null>(null)
const ltInner = ref<HTMLElement | null>(null)
let ltAnim: Animation | null = null

const curMode = () => (isEN.value ? 'en' : 'ko')
// 표시 모드(hover 중이면 미리보기, 아니면 현재 언어)
const shownMode = () => preview.value ?? curMode()
const label = (which: 'ko' | 'en') => (which === 'ko' ? (isEN.value ? 'KOR' : '한국어') : (isEN.value ? 'ENG' : '영어'))
const isCur = (which: 'ko' | 'en') => shownMode() === which

const rm = () => import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function spring() {   // 오른쪽에서 슬라이드 인 + 탄성 오버슈트
  if (!ltInner.value || rm()) return
  ltAnim?.cancel()
  ltAnim = ltInner.value.animate([
    { transform: 'translateX(20px)', opacity: 0.15 },
    { transform: 'translateX(0px)', opacity: 1, offset: 0.45 },
    { transform: 'translateX(-7px)', offset: 0.62 },
    { transform: 'translateX(4px)', offset: 0.77 },
    { transform: 'translateX(-2px)', offset: 0.89 },
    { transform: 'translateX(0)' },
  ], { duration: 720, easing: 'ease-out' })
}
function exit() {   // mouse-out 부드러운 복귀
  if (!ltInner.value || rm()) return
  ltAnim?.cancel()
  ltAnim = ltInner.value.animate([
    { transform: 'translateX(9px)', opacity: 0.5 },
    { transform: 'translateX(0)', opacity: 1 },
  ], { duration: 560, easing: 'ease-out' })
}

const onEnter = () => { preview.value = curMode() === 'en' ? 'ko' : 'en'; spring() }
const onLeave = () => { preview.value = null; exit() }
const onClick = () => { toggle(); preview.value = null; spring() }
</script>

<template>
  <header class="site-head wrap">
    <div class="head-main">
      <!-- lang="ko" 고정 → 한/영 전환 시 로고 글자 간격 불변 -->
      <NuxtLink class="logo" to="/" lang="ko">Swimmingphotography<span>.com</span></NuxtLink>
      <p class="tagline">{{ t('대한민국 모든 영자(泳者)에게 한 편의 신문을 선물합니다.', 'A newspaper for every swimmer in Korea.') }}</p>
    </div>

    <button
      type="button" class="lang-toggle" aria-label="Language / 언어"
      @mouseenter="onEnter" @mouseleave="onLeave" @click="onClick"
    >
      <span ref="ltInner" class="lt-inner">
        <span class="lt-word" :class="{ 'is-cur': isCur('ko') }">{{ label('ko') }}</span>
        <span class="lt-sep" aria-hidden="true">·</span>
        <span class="lt-word" :class="{ 'is-cur': isCur('en') }">{{ label('en') }}</span>
      </span>
    </button>
  </header>
</template>

<style scoped>
/* 하단정렬 → 토글이 태그라인과 같은 줄높이(오른쪽) · 상·하 패딩 동일로 콘텐츠 시작점 고정 */
.site-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-top: var(--frame-gap); padding-bottom: var(--frame-gap); }

/* 언어 토글 */
.lang-toggle { flex: 0 0 auto; font-family: var(--serif); font-size: 13px; line-height: 1.4; background: none; border: none; padding: 0; cursor: pointer; color: var(--ink-light); }
.lang-toggle .lt-inner { display: inline-flex; will-change: transform; }
.lang-toggle .lt-word { color: var(--ink-light); font-weight: 500; }
.lang-toggle .lt-word.is-cur { color: var(--ink); font-weight: 700; }
.lang-toggle .lt-sep { color: var(--ink-light); margin: 0 .3em; }
.lang-toggle:hover .lt-word:not(.is-cur),
.lang-toggle:hover .lt-sep { color: var(--ink-mute); }

/* 로고 — 기본부터 그라데이션(글자 클립) 흐름, hover 시 멈춤 */
.logo {
  font-family: var(--serif); font-weight: 700; font-size: 26px; line-height: 1.2; letter-spacing: .01em;
  display: inline-block; padding-bottom: 0.18em;
  background: linear-gradient(90deg, var(--ink) 0%, var(--orange) 50%, var(--ink) 100%);
  background-size: 200% auto; background-position: 0% center;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  animation: logo-shine 4s linear infinite;
}
.logo:hover { animation-play-state: paused; }
@keyframes logo-shine { 0% { background-position: 0% center; } 100% { background-position: -200% center; } }
.tagline { font-family: var(--serif); font-size: 13px; line-height: 1.4; color: var(--ink-mute); margin-top: 6px; letter-spacing: .01em; }

@media (max-width: 640px) { .logo { font-size: 23px; } }
</style>
