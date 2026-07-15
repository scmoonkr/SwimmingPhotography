<script setup lang="ts">
// 대회 — SwimmingPhotography DB(competitions). 연도·대회명 필터는 서버로 전달.
import { onMounted, ref, watch } from 'vue'
import { useEntity, blankCompetition, SIDO_LIST } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const e = useEntity('competitions')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/competitions${p}`
const timesApi = (p = '') => `${useRuntimeConfig().public.apiBase}/api/times${p}`

// ── 이 대회 기록 가져오기 (mergedTimes → SP.times upsert) ──
const importing = ref(false)
const importMsg = ref('')
const importTimes = async () => {
  const cid = selected.value?.competitionID
  if (cid == null || cid === '') { importMsg.value = '대회 ID가 없습니다. 먼저 저장하세요.'; return }
  importing.value = true; importMsg.value = ''
  try {
    const r = await $fetch<any>(timesApi('/import'), { method: 'POST', body: { competitionID: Number(cid) } })
    let msg = `가져오기 완료 — 원본 ${r.matched}건 · 신규 ${r.inserted} · 중복제외 ${r.skipped}`
    if (r.stats) {
      msg += ` / 팀 ${r.stats.teamCount} · 선수 ${r.stats.athleteCount} · start ${r.stats.startCount}`
      if (selected.value) Object.assign(selected.value, r.stats) // 드로어 표시 갱신
    }
    importMsg.value = msg
    await load()
  } catch (err: any) {
    importMsg.value = '가져오기 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    importing.value = false
  }
}

// ── 필터 (연도 + 대회 검색) ──
const nowYear = new Date().getFullYear()
const years = Array.from({ length: 10 }, (_, i) => nowYear + 1 - i) // 내년 ~ 8년 전
const year = ref<string>('')
const q = ref('')

const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 300 }
    if (year.value) params.year = year.value
    if (q.value.trim()) params.q = q.value.trim()
    rows.value = await $fetch(api(), { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '불러오기 실패'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(year, load) // 연도 바꾸면 즉시 재조회

const selected = ref<Record<string, any> | null>(null)
const open = ref(false)
const isNew = ref(false)

// ── 원본(Breaststroke) 대회 검색 모달 (필터 바의 연도·대회명 사용) ──
const pickerOpen = ref(false)
const pickerRows = ref<any[]>([])
const pickerLoading = ref(false)
const pickerSubtitle = ref('')
const pickerCols = [
  { key: 'competitionName', label: '대회명', cls: 'strong' },
  { key: 'datetime', label: '일자', cls: 'mono' },
  { key: 'sido', label: '지역', cls: 'muted' },
  { key: 'course', label: 'course', cls: 'muted' },
]

// 대회검색 클릭 → 필터 바의 year·q 로 Breaststroke 조회 후 모달 표시
const openPicker = async () => {
  pickerOpen.value = true
  pickerLoading.value = true
  pickerRows.value = []
  const parts: string[] = []
  if (year.value) parts.push(`${year.value}년`)
  if (q.value.trim()) parts.push(`"${q.value.trim()}"`)
  pickerSubtitle.value = parts.length ? parts.join(' · ') : '전체'
  try {
    pickerRows.value = await $fetch<any[]>(api('/source'), {
      params: { q: q.value.trim() || undefined, year: year.value || undefined, limit: 200 },
    })
  } catch {
    pickerRows.value = []
  } finally {
    pickerLoading.value = false
  }
}

// 원본 대회 선택 → 드로어에 채워서 SP로 등록(신규)
const onPickSource = (row: Record<string, any>) => {
  const doc: Record<string, any> = { ...row }
  delete doc._id // SP에 새 문서로 등록
  pickerOpen.value = false
  isNew.value = true
  selected.value = doc
  open.value = true
}

// 편집 필드 (competitions 스키마) — competitionID 는 원본(BR) 키. 대회검색으로 채워 저장·기록가져오기에 사용.
const fields: Field[] = [
  { key: 'competitionID', label: '대회 ID (원본 competitionID)', type: 'text', half: true, get: (r) => r.competitionID ?? '', set: (r, v) => { r.competitionID = (v === '' || v == null) ? null : Number(v) } },
  { key: 'datetime', label: '일자 (YYYY-MM-DD)', type: 'text', half: true, get: (r) => r.datetime ?? '', set: (r, v) => { r.datetime = v } },
  { key: 'competitionName', label: '대회명', type: 'text', get: (r) => r.competitionName ?? '', set: (r, v) => { r.competitionName = v } },
  { key: 'sido', label: '시도', type: 'select', options: SIDO_LIST, half: true, get: (r) => r.sido ?? '', set: (r, v) => { r.sido = v } },
  { key: 'pool', label: '수영장', type: 'text', half: true, get: (r) => r.pool ?? '', set: (r, v) => { r.pool = v } },
  { key: 'course', label: 'Course', type: 'select', options: ['LCM', 'SCM'], half: true, get: (r) => r.course ?? 'LCM', set: (r, v) => { r.course = v } },
  { key: 'isMasters', label: '구분', type: 'select', options: ['일반', '마스터즈'], half: true, get: (r) => (r.isMasters ? '마스터즈' : '일반'), set: (r, v) => { r.isMasters = v === '마스터즈' } },
  { key: 'sketch', label: '대회 스케치', type: 'textarea', rows: 5, get: (r) => r.sketch ?? '', set: (r, v) => { r.sketch = v } },
  { key: 'poolSketch', label: '수영장 스케치', type: 'textarea', rows: 5, get: (r) => r.poolSketch ?? '', set: (r, v) => { r.poolSketch = v } },
]

const openRow = (r: Record<string, any>) => { isNew.value = false; selected.value = r; open.value = true; importMsg.value = '' }
const openNew = () => { isNew.value = true; selected.value = blankCompetition(); open.value = true; importMsg.value = '' }

const onSave = async (v: Record<string, any>) => {
  const base = isNew.value ? blankCompetition() : JSON.parse(JSON.stringify(selected.value))
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
  if (!confirm(`'${r.competitionName}' 대회를 삭제하시겠습니까?`)) return false
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    await load()
    return true
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
    return false
  }
}
// 드로어에서 삭제 → 삭제되면 드로어 닫기
const onDrawerDelete = async () => {
  if (selected.value && (await onDelete(selected.value))) open.value = false
}
</script>

<template>
  <div>
    <!-- 필터 바: 연도 + 대회 검색 + 추가 -->
    <div class="filter-bar">
      <select v-model="year" class="filter-select" aria-label="연도">
        <option value="">전체 연도</option>
        <option v-for="y in years" :key="y" :value="String(y)">{{ y }}년</option>
      </select>
      <input
        v-model="q" class="filter-input" type="search" placeholder="대회 검색…"
        @keydown.enter="load"
      >
      <button class="btn btn-ghost filter-search" type="button" @click="load">검색</button>
      <button class="btn btn-ghost" type="button" @click="openPicker">대회검색</button>
      <span class="filter-spacer" />
      <button class="btn btn-primary" type="button" @click="openNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        대회 추가
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">데이터를 불러오지 못했습니다: {{ errorMsg }}</p>

    <DataTable
      :columns="e.columns" :rows="rows" clickable hide-search
      @row-click="openRow" @delete-row="onDelete"
    />

    <DetailDrawer
      :open="open" :title="isNew ? '대회 추가' : '대회 상세 · 편집'"
      :fields="fields" :row="selected"
      @close="open = false" @save="onSave" @delete="onDrawerDelete"
    >
      <template #foot-actions>
        <button
          v-if="!isNew && selected?.competitionID != null && selected?.competitionID !== ''"
          class="btn btn-ghost" type="button" :disabled="importing" @click="importTimes"
        >{{ importing ? '가져오는 중…' : '기록가져오기' }}</button>
        <span v-if="importMsg" class="imp-msg">{{ importMsg }}</span>
      </template>
    </DetailDrawer>

    <!-- 원본(Breaststroke) 대회 검색 모달 -->
    <SearchPickerModal
      :open="pickerOpen" title="대회 검색 (원본 · Breaststroke)"
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
  flex: 0 1 300px; font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-input:focus, .filter-select:focus { outline: none; border-color: var(--orange); }
.filter-search { padding: 9px 14px; }
.filter-spacer { flex: 1; }
.load-error {
  margin-bottom: 14px; padding: 10px 14px; border-radius: 6px;
  background: var(--bad-bg); color: var(--bad); font-size: 13px;
}
.imp-msg { font-size: 12px; color: var(--ink-mute); line-height: 1.4; flex-basis: 100%; }
</style>
