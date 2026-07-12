<script setup lang="ts">
defineProps<{ title: string; en?: string; subtitle?: string; addLabel?: string }>()
const emit = defineEmits<{ (e: 'add'): void }>()
</script>

<template>
  <div class="page-head">
    <div class="ph-main">
      <div v-if="en" class="ph-en">{{ en }}</div>
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="ph-sub">{{ subtitle }}</p>
    </div>
    <div class="ph-actions">
      <button class="btn btn-primary" type="button" @click="emit('add')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        {{ addLabel || '추가' }}
      </button>
    </div>
  </div>
</template>
