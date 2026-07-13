<script setup lang="ts">
// 기록(Times) — 대상: SwimmingPhotography DB 의 times 컬렉션.
// 필터: 대회(SP.competitions)·일자·성별·영법·거리 + 검색. row 클릭 편집/삭제, 기록추가(수동).
// 기록가져오기(모달): 원본 Breaststroke.competitions 를 검색해 선택 → 가져오기
//   (대회정보가 SP 에 없으면 추가 + mergedTimes → SP.times upsert).
import { onMounted, ref, watch } from 'vue'
import type { Column, Field } from '~/composables/useMock'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/times${p}`

// ── 필터 옵션 ──
const GENDERS = [{ v: '', l: '성별 전체' }, { v: 'men', l: '남자' }, { v: 'women', l: '여자' }, { v: 'mixed', l: '혼성' }]
const DISCIPLINE_LABEL: Record<string, string> = {
  FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영',
  BK: '배영(BK)', BRMS: '평영(MS)', BROS: '평영(OS)', BROW: '평영(OW)', BRUW: '평영(UW)', BRZS: '평영(ZS)',
}
const DISCIPLINES = ['', 'FR', 'BA', 'BR', 'FL', 'IM', 'FRR', 'MR', 'BK', 'BRMS', 'BROS', 'BROW', 'BRUW', 'BRZS']
const disciplineLabel = (v: string) => (v ? (DISCIPLINE_LABEL[v] ? `${DISCIPLINE_LABEL[v]} (${v})` : v) : '영법 전체')
const DISTANCES = ['', '25M', '50M', '100M', '200M', '400M', '500M', '800M', '1000M', '1500M', '3000M', '5000M', '10000M']
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v

const name = ref('')
const gender = ref('')
const discipline = ref('')
const distance = ref('')
const competitionID = ref<number | ''>('')
const date = ref('')

// ── 대회 select 옵션 (SP.competitions) ──
const competitions = ref<any[]>([])
const loadCompetitions = async () => {
  try { competitions.value = await $fetch<any[]>(api('/competitions'), { params: { limit: 2000 } }) } catch { competitions.value = [] }
}

// ── 결과 테이블 컬럼 ──
const columns: Column[] = [
  { key: 'name', label: '선수명', cls: 'strong' },
  { key: 'gender', label: '성별', cls: 'muted', get: (r) => genderLabel(r.gender) },
  { key: 'discipline', label: '영법', get: (r) => disciplineLabel(r.discipline).replace(/ \(.*\)$/, '') },
  { key: 'distance', label: '거리' },
  { key: 'competitionName', label: '대회명', cls: 'strong' },
  { key: 'datetime', label: '일자', cls: 'mono' },
  { key: 'rank', label: '순위', cls: 'num' },
  { key: 'time', label: '기록', cls: 'mono' },
  { key: 'team', label: '소속', cls: 'muted' },
  { key: 'ageGroup', label: '부', cls: 'muted' },
  { key: 'course', label: '코스', cls: 'muted' },
]

// ── 목록 (SP.times) ──
const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')
const notice = ref('')

const load = async () => {
  errorMsg.value = ''
  loading.value = true
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (name.value.trim()) params.name = name.value.trim()
    if (competitionID.value) params.competitionID = competitionID.value
    if (gender.value) params.gender = gender.value
    if (discipline.value) params.discipline = discipline.value
    if (distance.value) params.distance = distance.value
    if (date.value.trim()) params.date = date.value.trim()
    const data = await $fetch<any[]>(api(), { params })
    rows.value = (data || []).slice().sort((a, b) => (a.timeStamp || Infinity) - (b.timeStamp || Infinity))
    selectedRows.value = []
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
watch([competitionID, gender, discipline, distance], load)

// ── 체크박스 선택 + 일괄삭제 ──
const selectedRows = ref<any[]>([])
const deleteSelected = async () => {
  if (!selectedRows.value.length) return
  if (!confirm(`선택한 ${selectedRows.value.length}건을 삭제하시겠습니까?`)) return
  try {
    const ids = selectedRows.value.map((r) => r._id).filter(Boolean)
    const r = await $fetch<any>(api('/delete-many'), { method: 'POST', body: { ids } })
    notice.value = `${r.deleted}건 삭제됨`
    selectedRows.value = []
    await load()
  } catch (err: any) {
    errorMsg.value = '삭제 실패: ' + (err?.data?.error || err?.message || '')
  }
}

// ── 드로어 (생성/편집) ──
const blankTime = () => ({
  competitionName: '', competitionID: null as number | null, datetime: '', discipline: '', distance: '',
  course: 'LCM', gender: '', ageGroup: '', round: 'finals', name: '', team: '', sido: '',
  lane: null as number | null, rank: null as number | null, time: '',
})
const numOrNull = (v: any) => (v === '' || v == null ? null : Number(v))
const fields: Field[] = [
  { key: 'competitionName', label: '대회', get: (r) => r.competitionName ?? '', set: (r, v) => { r.competitionName = v } },
  { key: 'competitionID', label: '대회 ID', get: (r) => r.competitionID ?? '', set: (r, v) => { r.competitionID = numOrNull(v) } },
  { key: 'datetime', label: '일자', get: (r) => r.datetime ?? '', set: (r, v) => { r.datetime = v } },
  { key: 'discipline', label: '영법', type: 'select', options: DISCIPLINES, get: (r) => r.discipline ?? '', set: (r, v) => { r.discipline = v } },
  { key: 'distance', label: '거리', type: 'select', options: DISTANCES, get: (r) => r.distance ?? '', set: (r, v) => { r.distance = v } },
  { key: 'course', label: '코스', type: 'select', options: ['LCM', 'SCM'], get: (r) => r.course ?? '', set: (r, v) => { r.course = v } },
  { key: 'gender', label: '성별', type: 'select', options: ['', 'men', 'women', 'mixed'], get: (r) => r.gender ?? '', set: (r, v) => { r.gender = v } },
  { key: 'ageGroup', label: '부(ageGroup)', get: (r) => r.ageGroup ?? '', set: (r, v) => { r.ageGroup = v } },
  { key: 'round', label: '라운드', get: (r) => r.round ?? '', set: (r, v) => { r.round = v } },
  { key: 'name', label: '선수', get: (r) => r.name ?? '', set: (r, v) => { r.name = v } },
  { key: 'team', label: '소속', get: (r) => r.team ?? '', set: (r, v) => { r.team = v } },
  { key: 'sido', label: '시도', get: (r) => r.sido ?? '', set: (r, v) => { r.sido = v } },
  { key: 'lane', label: '레인', get: (r) => r.lane ?? '', set: (r, v) => { r.lane = numOrNull(v) } },
  { key: 'rank', label: '순위', get: (r) => r.rank ?? '', set: (r, v) => { r.rank = numOrNull(v) } },
  { key: 'time', label: '기록', get: (r) => r.time ?? '', set: (r, v) => { r.time = v } },
]

const selected = ref<Record<string, any> | null>(null)
const open = ref(false)
const isNew = ref(false)
const openRow = (r: Record<string, any>) => { isNew.value = false; selected.value = r; open.value = true }
const openNew = () => { isNew.value = true; selected.value = blankTime(); open.value = true }

const onSave = async (form: Record<string, any>) => {
  try {
    const base = isNew.value ? blankTime() : { ...selected.value }
    for (const f of fields) f.set(base, form[f.key])
    if (isNew.value) {
      await $fetch(api(), { method: 'POST', body: base })
    } else {
      const body = { ...base }; delete body._id
      await $fetch(api(`/${selected.value!._id}`), { method: 'PUT', body })
    }
    open.value = false; isNew.value = false
    await load()
  } catch (err: any) {
    alert('저장 실패: ' + (err?.data?.error || err?.message || ''))
  }
}
const onDelete = async (r: Record<string, any>) => {
  if (!confirm('이 기록을 삭제하시겠습니까?')) return false
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    await load()
    return true
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
    return false
  }
}
const onDrawerDelete = async () => { if (selected.value && (await onDelete(selected.value))) open.value = false }

onMounted(() => { loadCompetitions(); load() })
</script>

<template>
  <div>
    <!-- 툴바: 필터 + 액션 (한 줄) — 선수명·성별·영법·거리·대회명·일자 순 -->
    <div class="toolbar">
      <input v-model="name" class="filter-input filter-name" type="search" placeholder="선수명 검색…" @keydown.enter="load">
      <select v-model="gender" class="filter-select" aria-label="성별">
        <option v-for="g in GENDERS" :key="g.v" :value="g.v">{{ g.l }}</option>
      </select>
      <select v-model="discipline" class="filter-select" aria-label="영법">
        <option v-for="d in DISCIPLINES" :key="d" :value="d">{{ disciplineLabel(d) }}</option>
      </select>
      <select v-model="distance" class="filter-select" aria-label="거리">
        <option v-for="d in DISTANCES" :key="d" :value="d">{{ d || '거리 전체' }}</option>
      </select>
      <select v-model="competitionID" class="filter-select filter-comp" aria-label="대회명">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName }}<span v-if="c.datetime"> ({{ c.datetime }})</span>
        </option>
      </select>
      <input v-model="date" class="filter-input filter-date" type="search" placeholder="일자 (예: 2022 또는 2022-03)" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <button class="btn btn-danger" type="button" :disabled="!selectedRows.length" @click="deleteSelected">
        삭제<span v-if="selectedRows.length"> ({{ selectedRows.length }})</span>
      </button>
      <span class="t-spacer" />
      <button class="btn btn-ghost t-add" type="button" @click="openNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        기록추가
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="!loading" class="result-note">총 {{ rows.length }}건 · 기록 빠른순</p>

    <DataTable
      :columns="columns" :rows="rows" clickable hide-search hide-actions selectable
      v-model:selected="selectedRows"
      @row-click="openRow"
    />

    <DetailDrawer
      :open="open" :title="isNew ? '기록추가' : '기록 편집'"
      :fields="fields" :row="selected"
      @close="open = false" @save="onSave" @delete="onDrawerDelete"
    />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.t-spacer { flex: 1 1 auto; }
.t-add svg { width: 15px; height: 15px; }

.filter-select {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px; cursor: pointer;
}
.filter-comp { flex: 0 1 340px; max-width: 340px; }
.filter-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-date { flex: 0 1 220px; }
.filter-name { flex: 0 1 180px; }
.filter-input:focus, .filter-select:focus { outline: none; border-color: var(--orange); }
.btn-danger { background: var(--bad-bg); color: var(--bad); }
.btn-danger:hover:not(:disabled) { background: var(--bad); color: #fff; }
.btn-danger:disabled { opacity: .5; cursor: default; }

.load-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
.notice { margin-bottom: 12px; padding: 10px 14px; border-radius: 6px; background: var(--good-bg); color: var(--good); font-size: 13px; }
.result-note { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 12px; }
</style>
