<script setup lang="ts">
// 전 페이지 공용 레이아웃 — 상단 속보 티커 + 헤더 + 본문(slot) + 푸터.
// 속보 티커는 문서 흐름 맨 위(고정 아님), 하단 안내 마퀴는 푸터 뒤 문서 흐름 맨 아래에 놓인다.
</script>

<template>
  <div class="site">
    <BreakingTicker />
    <SiteHeader />
    <main class="wrap">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
