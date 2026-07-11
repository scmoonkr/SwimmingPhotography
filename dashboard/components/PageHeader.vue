<script setup lang="ts">
defineProps<{ title: string; en?: string; subtitle?: string; addLabel?: string }>()
</script>

<template>
  <div class="page-head">
    <div class="ph-main">
      <div v-if="en" class="ph-en">{{ en }}</div>
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="ph-sub">{{ subtitle }}</p>
    </div>
    <div class="ph-actions">
      <button class="btn btn-ghost" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4M3 9V5a2 2 0 0 1 2-2h4"/></svg>
        내보내기
      </button>
      <button class="btn btn-primary" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        {{ addLabel || '추가' }}
      </button>
    </div>
  </div>
</template>
