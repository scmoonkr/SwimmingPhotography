<script setup lang="ts">
import { useEntity } from '~/composables/useMock'
const e = useEntity('images')
</script>

<template>
  <div>
    <PageHeader :title="e.title" :en="e.en" :subtitle="e.subtitle" add-label="사진 업로드" />
    <DataTable :columns="e.columns" :rows="e.rows" :search-placeholder="`${e.title} 검색…`" />
  </div>
</template>
