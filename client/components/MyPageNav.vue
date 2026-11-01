<script setup lang="ts">
defineProps<{ name?: string }>()
</script>

<template>
  <nav class="my-nav" aria-label="마이페이지 메뉴">
    <NuxtLink class="my-tab" exact-active-class="active" to="/my/page">{{ name || '내 정보' }}</NuxtLink>
    <NuxtLink class="my-tab" exact-active-class="active" to="/my/images/">내가 검토한 기사들</NuxtLink>
  </nav>
</template>

<style scoped>
/* 메인 페이지의 분야 메뉴(.filters / .chip)와 같은 골격 */
.my-nav { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; margin: 0; }
.my-tab {
  font-family: var(--serif); font-size: 13px; font-weight: 500; line-height: 1.6;
  color: var(--ink-light); padding: 0 6px; transition: color .15s;
}
.my-tab:first-child { padding-left: 0; }
.my-tab:hover { color: var(--ink); }
.my-tab.active { color: var(--ink); font-weight: 700; }
</style>
