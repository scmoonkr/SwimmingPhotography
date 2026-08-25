<script setup lang="ts">
// 로그인 화면 전용 레이아웃 — 사이드바·상단바 없이 가운데 카드만.
</script>

<template>
  <div class="auth-shell">
    <slot />
  </div>
</template>

<style>
.auth-shell {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--paper-deep); padding: 24px;
}
</style>
