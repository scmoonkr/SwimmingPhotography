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
  // 쪽 나누기 (서버 페이징) — page/total/pageSize 를 주면 표 아래에 쪽 이동이 붙는다.
  // 주지 않으면 지금까지처럼 받은 rows 를 통째로 보여준다.
  page?: number
  total?: number
  pageSize?: number
}>()
const emit = defineEmits<{
  (e: 'rowClick', row: Record<string, any>): void
  (e: 'deleteRow', row: Record<string, any>): void
  (e: 'update:selected', rows: Record<string, any>[]): void
  (e: 'update:page', page: number): void
}>()

// 컬럼 값 (중첩 스키마는 c.get 접근자 사용)
// 삭제 아이콘은 delete 능력이 있는 계정에만 (서버에서도 같은 능력으로 막는다)
const { can } = useAuth()

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
// ── 쪽 나누기 ──
const paged = computed(() => !!props.pageSize && (props.total ?? 0) > props.pageSize)
const pageCount = computed(() => Math.max(1, Math.ceil((props.total ?? 0) / (props.pageSize || 1))))
const curPage = computed(() => Math.min(Math.max(1, props.page || 1), pageCount.value))
const rangeFrom = computed(() => (curPage.value - 1) * (props.pageSize || 0) + 1)
const rangeTo = computed(() => Math.min(curPage.value * (props.pageSize || 0), props.total ?? 0))
const go = (p: number) => {
  const next = Math.min(Math.max(1, p), pageCount.value)
  if (next !== curPage.value) emit('update:page', next)
}
// 현재 쪽 둘레만 번호로 — 쪽이 많아도 버튼이 넘치지 않는다
const pageNums = computed(() => {
  const last = pageCount.value, cur = curPage.value
  const out: (number | '…')[] = []
  const add = (n: number) => { if (!out.includes(n)) out.push(n) }
  add(1)
  if (cur - 2 > 2) out.push('…')
  for (let n = Math.max(2, cur - 2); n <= Math.min(last - 1, cur + 2); n++) add(n)
  if (cur + 2 < last - 1) out.push('…')
  if (last > 1) add(last)
  return out
})

const allSel = computed(() => filtered.value.length > 0 && filtered.value.every(isSel))
const someSel = computed(() => filtered.value.some(isSel) && !allSel.value)
const toggleAll = () => emit('update:selected', allSel.value ? [] : [...filtered.value])
</script>

<template>
  <div class="table-card">
    <div class="table-tools">
      <input v-if="!hideSearch" v-model="q" class="table-search" type="search" :placeholder="searchPlaceholder || '검색…'">
      <span v-if="paged" class="table-count">{{ rangeFrom }}–{{ rangeTo }} / {{ total }}</span>
      <span v-else class="table-count">{{ filtered.length }} / {{ rows.length }}</span>
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
                <button v-if="can('delete')" class="del" title="삭제" aria-label="삭제" @click.stop="emit('deleteRow', r)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 쪽 이동 (page/total/pageSize 를 받은 표에만) -->
    <div v-if="paged" class="table-pager">
      <button class="pg" type="button" :disabled="curPage <= 1" @click="go(curPage - 1)">이전</button>
      <template v-for="(n, i) in pageNums" :key="i">
        <span v-if="n === '…'" class="pg-gap">…</span>
        <button v-else class="pg" type="button" :class="{ on: n === curPage }" @click="go(n as number)">{{ n }}</button>
      </template>
      <button class="pg" type="button" :disabled="curPage >= pageCount" @click="go(curPage + 1)">다음</button>
    </div>
  </div>
</template>

<style scoped>
/* 쪽 이동 */
.table-pager { display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; padding: 12px 14px; border-top: 1px solid var(--line-soft); }
.pg {
  font-family: var(--sans); font-size: 12.5px; color: var(--ink-mute); cursor: pointer;
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; min-width: 32px;
}
.pg:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-light); }
.pg.on { color: #fff; background: var(--orange); border-color: var(--orange); font-weight: 700; }
.pg:disabled { opacity: .45; cursor: default; }
.pg-gap { font-size: 12.5px; color: var(--ink-light); padding: 0 2px; }

.data th.chk, .data td.chk { width: 34px; text-align: center; padding-right: 0; }
.data td.chk input, .data th.chk input { width: 15px; height: 15px; cursor: pointer; accent-color: var(--orange); }
.data tr.sel td { background: var(--orange-bg); }
</style>
