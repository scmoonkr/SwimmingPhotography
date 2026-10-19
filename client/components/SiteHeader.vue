<script setup lang="ts">
// 공용 헤더 — 로고(그라데이션 shine)와 태그라인.
</script>

<template>
  <header class="site-head wrap">
    <div class="head-main">
      <NuxtLink class="logo" to="/" lang="ko">Swimmingphotography<span>.com</span></NuxtLink>
      <p class="tagline">대한민국 모든 영자(泳者)에게 한 편의 신문을 선물합니다.</p>
    </div>
  </header>
</template>

<style scoped>
/* 하단정렬 → 토글이 태그라인과 같은 줄높이(오른쪽) · 상·하 패딩 동일로 콘텐츠 시작점 고정 */
.site-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-top: var(--frame-gap); padding-bottom: var(--frame-gap); }

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

@media (max-width: 640px) {
  .logo { font-size: 23px; }
}
</style>
