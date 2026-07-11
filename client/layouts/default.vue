<script setup lang="ts">
// 전 페이지 공용 레이아웃 — 헤더 + 본문(slot) + 푸터.
// 본문 하단은 마퀴 높이만큼 여백을 확보한다.
</script>

<template>
  <div class="site">
    <SiteHeader />
    <main class="wrap">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style>
/* 하단 고정 안내 마퀴(38px)가 콘텐츠를 가리지 않도록 body 여백 확보 */
body { padding-bottom: 38px; }
@media (max-width: 720px) { body { padding-bottom: 34px; } }
</style>
