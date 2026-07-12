<script setup lang="ts">
// 경기장 — SwimmingPhotography DB(venues). 원본 검색은 Breaststroke.pools.
import { onMounted, ref } from 'vue'
import { useEntity, blankVenue, SIDO_LIST } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const e = useEntity('venues')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/venues${p}`

// ── 필터 (시도 + 수영장명) ──
const sido = ref('')
const q = ref('')

const rows = ref<any[]>([])
const errorMsg = ref('')

const load = async () => {
  errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 300 }
    if (sido.value) params.sido = sido.value
    if (q.value.trim()) params.q = q.value.trim()
    rows.value = await $fetch(api(), { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '불러오기 실패'
  }
}
onMounted(load)

const selected = ref<Record<string, any> | null>(null)
const open = ref(false)
const isNew = ref(false)

// 편집 필드 (venues 스키마)
const fields: Field[] = [
  { key: 'pool', label: '수영장명', type: 'text', get: (r) => r.pool ?? '', set: (r, v) => { r.pool = v } },
  { key: 'sido', label: '시도', type: 'select', options: SIDO_LIST, get: (r) => r.sido ?? '', set: (r, v) => { r.sido = v } },
  { key: 'lanes', label: '레인 수', type: 'text', get: (r) => (r.lanes ?? ''), set: (r, v) => { r.lanes = v === '' ? null : Number(v) } },
  { key: 'length', label: '규격 (예: 50m, 25m)', type: 'text', get: (r) => r.length ?? '', set: (r, v) => { r.length = v } },
  { key: 'address', label: '위치 (주소)', type: 'text', get: (r) => r.address ?? '', set: (r, v) => { r.address = v } },
]

const openRow = (r: Record<string, any>) => { isNew.value = false; selected.value = r; open.value = true }
const openNew = () => { isNew.value = true; selected.value = blankVenue(); open.value = true }

const onSave = async (v: Record<string, any>) => {
  const base = isNew.value ? blankVenue() : JSON.parse(JSON.stringify(selected.value))
  fields.forEach((f) => f.set(base, v[f.key]))
  try {
    if (isNew.value) {
      await $fetch(api(), { method: 'POST', body: base })
    } else {
      const id = selected.value?._id
      const body = { ...base }
      delete body._id
      await $fetch(api(`/${id}`), { method: 'PUT', body })
    }
    await load()
    open.value = false
    isNew.value = false
  } catch (err: any) {
    alert('저장 실패: ' + (err?.data?.error || err?.message || ''))
  }
}

const onDelete = async (r: Record<string, any>) => {
  if (!confirm(`'${r.pool}' 경기장을 삭제하시겠습니까?`)) return false
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    await load()
    return true
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
    return false
  }
}
const onDrawerDelete = async () => {
  if (selected.value && (await onDelete(selected.value))) open.value = false
}

// ── 원본(Breaststroke.pools) 수영장 검색 모달 ──
const pickerOpen = ref(false)
const pickerRows = ref<any[]>([])
const pickerLoading = ref(false)
const pickerSubtitle = ref('')
const pickerCols = [
  { key: 'pool', label: '수영장명', cls: 'strong' },
  { key: 'sido', label: '시도', cls: 'muted' },
]

// 수영장검색 클릭 → 필터의 시도·수영장명으로 pools 조회
const openPicker = async () => {
  pickerOpen.value = true
  pickerLoading.value = true
  pickerRows.value = []
  const parts: string[] = []
  if (sido.value) parts.push(sido.value)
  if (q.value.trim()) parts.push(`"${q.value.trim()}"`)
  pickerSubtitle.value = parts.length ? parts.join(' · ') : '전체'
  try {
    pickerRows.value = await $fetch<any[]>(api('/source'), {
      params: { sido: sido.value || undefined, q: q.value.trim() || undefined, limit: 300 },
    })
  } catch {
    pickerRows.value = []
  } finally {
    pickerLoading.value = false
  }
}

// 원본 수영장 선택 → 드로어에 채워서 SP로 등록(신규)
const onPickSource = (row: Record<string, any>) => {
  const doc: Record<string, any> = { ...row }
  delete doc._id
  pickerOpen.value = false
  isNew.value = true
  selected.value = doc
  open.value = true
}
</script>

<template>
  <div>
    <!-- 필터 바: 시도 + 수영장 검색 + 수영장검색 + 추가 -->
    <div class="filter-bar">
      <select v-model="sido" class="filter-select" aria-label="시도" @change="load">
        <option value="">전체 시도</option>
        <option v-for="s in SIDO_LIST" :key="s" :value="s">{{ s }}</option>
      </select>
      <input v-model="q" class="filter-input" type="search" placeholder="수영장 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <button class="btn btn-ghost" type="button" @click="openPicker">수영장검색</button>
      <span class="filter-spacer" />
      <button class="btn btn-primary" type="button" @click="openNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        경기장 추가
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">데이터를 불러오지 못했습니다: {{ errorMsg }}</p>

    <DataTable
      :columns="e.columns" :rows="rows" clickable hide-search
      @row-click="openRow" @delete-row="onDelete"
    />

    <DetailDrawer
      :open="open" :title="isNew ? '경기장 추가' : '경기장 상세 · 편집'"
      :fields="fields" :row="selected"
      @close="open = false" @save="onSave" @delete="onDrawerDelete"
    />

    <!-- 원본(Breaststroke.pools) 수영장 검색 모달 -->
    <SearchPickerModal
      :open="pickerOpen" title="수영장 검색 (원본 · Breaststroke.pools)"
      :subtitle="pickerSubtitle" :loading="pickerLoading"
      :columns="pickerCols" :rows="pickerRows"
      @close="pickerOpen = false" @select="onPickSource"
    />
  </div>
</template>

<style scoped>
.filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.filter-select {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px;
  padding: 9px 12px; cursor: pointer;
}
.filter-input {
  flex: 0 1 280px; font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-input:focus, .filter-select:focus { outline: none; border-color: var(--orange); }
.filter-spacer { flex: 1; }
.load-error {
  margin-bottom: 14px; padding: 10px 14px; border-radius: 6px;
  background: var(--bad-bg); color: var(--bad); font-size: 13px;
}
</style>
