<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Column } from '~/composables/useMock'
import { badgeVariant } from '~/composables/useMock'

const props = defineProps<{
  columns: Column[]
  rows: Record<string, any>[]
  searchPlaceholder?: string
  clickable?: boolean
  hideSearch?: boolean
  hideActions?: boolean
  selectable?: boolean
  selected?: Record<string, any>[]
}>()
const emit = defineEmits<{
  (e: 'rowClick', row: Record<string, any>): void
  (e: 'deleteRow', row: Record<string, any>): void
  (e: 'update:selected', rows: Record<string, any>[]): void
}>()

// 컬럼 값 (중첩 스키마는 c.get 접근자 사용)
const cellVal = (r: Record<string, any>, c: Column) => (c.get ? c.get(r) : r[c.key])

const q = ref('')
const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return props.rows
  return props.rows.filter((r) =>
    props.columns.some((c) => String(cellVal(r, c) ?? '').toLowerCase().includes(term)),
  )
})

// ── 체크박스 선택 (selectable) ──
const idOf = (r: Record<string, any>) => r._id ?? r.id ?? JSON.stringify(r)
const selIds = computed(() => new Set((props.selected || []).map(idOf)))
const isSel = (r: Record<string, any>) => selIds.value.has(idOf(r))
const toggleRow = (r: Record<string, any>) => {
  const cur = [...(props.selected || [])]
  const i = cur.findIndex((x) => idOf(x) === idOf(r))
  if (i >= 0) cur.splice(i, 1); else cur.push(r)
  emit('update:selected', cur)
}
const allSel = computed(() => filtered.value.length > 0 && filtered.value.every(isSel))
const someSel = computed(() => filtered.value.some(isSel) && !allSel.value)
const toggleAll = () => emit('update:selected', allSel.value ? [] : [...filtered.value])
</script>

<template>
  <div class="table-card">
    <div class="table-tools">
      <input v-if="!hideSearch" v-model="q" class="table-search" type="search" :placeholder="searchPlaceholder || '검색…'">
      <span class="table-count">{{ filtered.length }} / {{ rows.length }}</span>
    </div>

    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th v-if="selectable" class="chk">
              <input type="checkbox" :checked="allSel" :indeterminate.prop="someSel" @change="toggleAll">
            </th>
            <th v-for="c in columns" :key="c.key" :class="{ num: c.cls === 'num' }">{{ c.label }}</th>
            <th v-if="!hideActions" class="num">작업</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filtered.length" class="empty-row">
            <td :colspan="columns.length + (selectable ? 1 : 0) + (hideActions ? 0 : 1)">검색 결과가 없습니다.</td>
          </tr>
          <tr
            v-for="(r, i) in filtered" :key="i"
            :class="{ clickable, sel: isSel(r) }" @click="clickable && emit('rowClick', r)"
          >
            <td v-if="selectable" class="chk" @click.stop>
              <input type="checkbox" :checked="isSel(r)" @change="toggleRow(r)">
            </td>
            <td
              v-for="c in columns" :key="c.key"
              :class="[c.cls, { num: c.cls === 'num' }]"
            >
              <!-- 뱃지(상태) -->
              <span v-if="c.type === 'badge'" class="badge" :class="badgeVariant(cellVal(r, c))">{{ cellVal(r, c) }}</span>
              <!-- 썸네일(이미지) -->
              <span v-else-if="c.type === 'thumb'" class="thumb-cell">
                <span class="th" />
                <span class="strong">{{ cellVal(r, c) }}</span>
              </span>
              <!-- 일반 -->
              <template v-else>{{ cellVal(r, c) }}</template>
            </td>
            <td v-if="!hideActions" class="num">
              <span class="row-act">
                <button title="편집" aria-label="편집" @click.stop="emit('rowClick', r)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="del" title="삭제" aria-label="삭제" @click.stop="emit('deleteRow', r)">
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

<style scoped>
.data th.chk, .data td.chk { width: 34px; text-align: center; padding-right: 0; }
.data td.chk input, .data th.chk input { width: 15px; height: 15px; cursor: pointer; accent-color: var(--orange); }
.data tr.sel td { background: var(--orange-bg); }
</style>
