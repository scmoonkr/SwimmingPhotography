<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Column } from '~/composables/useMock'
import { badgeVariant } from '~/composables/useMock'

const props = defineProps<{
  columns: Column[]
  rows: Record<string, any>[]
  searchPlaceholder?: string
}>()

const q = ref('')
const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return props.rows
  return props.rows.filter((r) =>
    props.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(term)),
  )
})
</script>

<template>
  <div class="table-card">
    <div class="table-tools">
      <input v-model="q" class="table-search" type="search" :placeholder="searchPlaceholder || '검색…'">
      <span class="table-count">{{ filtered.length }} / {{ rows.length }}</span>
    </div>

    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="{ num: c.cls === 'num' }">{{ c.label }}</th>
            <th class="num">작업</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filtered.length" class="empty-row">
            <td :colspan="columns.length + 1">검색 결과가 없습니다.</td>
          </tr>
          <tr v-for="(r, i) in filtered" :key="i">
            <td
              v-for="c in columns" :key="c.key"
              :class="[c.cls, { num: c.cls === 'num' }]"
            >
              <!-- 뱃지(상태) -->
              <span v-if="c.type === 'badge'" class="badge" :class="badgeVariant(r[c.key])">{{ r[c.key] }}</span>
              <!-- 썸네일(이미지) -->
              <span v-else-if="c.type === 'thumb'" class="thumb-cell">
                <span class="th" />
                <span class="strong">{{ r[c.key] }}</span>
              </span>
              <!-- 일반 -->
              <template v-else>{{ r[c.key] }}</template>
            </td>
            <td class="num">
              <span class="row-act">
                <button title="편집" aria-label="편집">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="del" title="삭제" aria-label="삭제">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
