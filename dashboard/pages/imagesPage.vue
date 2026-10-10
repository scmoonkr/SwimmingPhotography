<script setup lang="ts">
// 이미지(Images Dir) — images 페이지를 복제한 화면. SwimmingPhotography DB(images) 조회. 대회·영법·성별·거리·선택 여부 필터 + 이름/contributor 검색, 행 클릭 시 상세 모달.
import { onMounted, ref, watch } from 'vue'
import type { Column } from '~/composables/useMock'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/images${p}`

// ── 필터 ──
const competitionID = ref<number | ''>('')
// 기본값 — 자유형 · 남자 · 50M (가장 사진이 많은 종목부터 본다). '전체' 는 select 에서 고른다
const discipline = ref('FR')
const gender = ref('men')
const distance = ref('50M')
// 선택 여부 — 선수 기록(times)에 연결된 사진인가(timeID 유무). '' 전체 / has 선택됨 / none 선택안됨
const matched = ref<'' | 'none' | 'has'>('')
// 검색 — 선수명 또는 저장한 사람(contributor)
const q = ref('')
const GENDER_OPTS = ['men', 'women', 'mixed']
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M']

const competitions = ref<any[]>([])

// 영법 코드 → 한글
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const discLabel = (d: string) => DISC_KO[d] || d || ''
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v || ''
// updatedAt(저장일) → KST yyyy-mm-dd
const fmtDate = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

// 여러 명이 찍힌 사진 — 선수들의 값을 콤마로 잇는다(같은 값은 한 번만). athletes 가 없으면 단일 필드.
const multi = (r: any, k: 'name' | 'team' | 'ageGroup') => (Array.isArray(r.athletes) && r.athletes.length
  ? [...new Set(r.athletes.map((a: any) => a[k]).filter(Boolean))].join(',')
  : (r[k] || ''))

// ── 테이블 ──
const columns: Column[] = [
  { key: 'thumbnail', label: '', type: 'image' },   // 체크박스 다음 — 작은 썸네일
  { key: 'filename', label: '파일', cls: 'mono' },
  { key: 'name', label: '선수명', cls: 'strong', get: (r) => multi(r, 'name') },
  { key: 'genderAge', label: '성별·부', cls: 'muted', get: (r) => [genderLabel(r.gender), multi(r, 'ageGroup')].filter(Boolean).join(' · ') },
  { key: 'team', label: '팀', cls: 'muted', get: (r) => multi(r, 'team') },
  { key: 'discipline', label: '영법', get: (r) => discLabel(r.discipline) },
  { key: 'distance', label: '거리' },
  // 기록(times) 연결 — 비어 있으면 미매칭
  { key: 'timeID', label: 'timeID', cls: 'mono', get: (r) => r.timeID ?? '—' },
  { key: 'scene', label: '장면', cls: 'muted', get: (r) => r.sceneType || r.type || '' },
  { key: 'caption', label: '캡션', get: (r) => r.translations?.ko?.caption || '' },
  // 기사 사진 여부 — 이 사진의 기사에 media.images 가 1장 이상 있으면 ○
  { key: 'articleHasImages', label: '기사', get: (r) => (r.articleHasImages ? '○' : '') },
  { key: 'contributor', label: 'contributor', cls: 'muted', get: (r) => r.contributorName || r.contributor || '' },
  { key: 'updatedAt', label: '저장일', cls: 'mono', get: (r) => fmtDate(r.updatedAt) },
]

const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')
const importOpen = ref(false)   // 사진 가져오기 드로어
const notice = ref('')
const checked = ref<any[]>([])          // 체크한 이미지 — 기사 저장 대상
const savingArticles = ref(false)
const onImportDone = async (r: any) => {
  importOpen.value = false
  notice.value = `${r.count}장 저장 완료 — 신규 ${r.upserted} · 수정 ${r.modified}`
    + (r.failed?.length ? ` · 실패 ${r.failed.length}` : '')
  await loadFilters()   // 대회 옵션의 장수 갱신
  await load()
}

// 기사 저장 — 체크한 이미지를 (competitionID + name==unique) 로 찾은 기사의 media.images 에 추가.
const saveArticles = async () => {
  if (savingArticles.value) return
  if (!checked.value.length) { notice.value = '체크한 이미지가 없습니다.'; return }
  if (!confirm(`체크한 ${checked.value.length}장을 해당 기사의 media 에 저장합니다. 계속할까요?`)) return
  savingArticles.value = true; errorMsg.value = ''; notice.value = ''
  try {
    const ids = checked.value.map((r) => r._id).filter(Boolean)
    const res = await $fetch<any>(api('/save-articles'), { method: 'POST', body: { ids } })
    await load()          // '기사' 열 갱신 (load 가 체크도 비운다)
    notice.value = `기사 저장 — 이미지 ${res.total} · 대상 기사 ${res.articles} · 저장 ${res.saved} · 기사없음 ${res.noArticle}${res.skipped ? ` · 제외 ${res.skipped}` : ''}`
  } catch (err: any) {
    errorMsg.value = '기사 저장 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    savingArticles.value = false
  }
}

const loadFilters = async () => {
  try { competitions.value = await $fetch<any[]>(api('/competitions')) } catch { competitions.value = [] }
}
const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (competitionID.value) params.competitionID = competitionID.value
    if (discipline.value) params.discipline = discipline.value
    if (gender.value) params.gender = gender.value
    if (distance.value) params.distance = distance.value
    if (matched.value) params.matched = matched.value
    if (q.value.trim()) params.q = q.value.normalize('NFC').trim()
    rows.value = await $fetch<any[]>(api(), { params })
    checked.value = []
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await loadFilters()
  // 처음에는 최근 대회(competitionID 내림차순 첫 항목)를 자동 선택 → watch 가 load 실행 (times 와 동일)
  if (competitions.value.length) competitionID.value = competitions.value[0].competitionID
  else await load()
})
watch([competitionID, discipline, gender, distance, matched], load)

// ── 상세 모달 (행 클릭) — ImageEditModal ──
const selected = ref<any | null>(null)
const openRow = (r: any) => { selected.value = r }
const onSaved = (r: any) => { selected.value = null; notice.value = `${r.filename} 저장됨` }
const onDeleted = async () => { selected.value = null; await load() }
</script>

<template>
  <div>
    <!-- 툴바: 필터 -->
    <div class="toolbar">
      <select v-model="competitionID" class="filter-select filter-comp" aria-label="대회">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }}<span v-if="c.datetime"> ({{ c.datetime }})</span> · {{ c.count }}장
        </option>
      </select>
      <select v-model="discipline" class="filter-select" aria-label="영법">
        <option value="">영법 전체</option>
        <option v-for="d in Object.keys(DISC_KO)" :key="d" :value="d">{{ discLabel(d) }}</option>
      </select>
      <select v-model="gender" class="filter-select" aria-label="성별">
        <option value="">성별 전체</option>
        <option v-for="g in GENDER_OPTS" :key="g" :value="g">{{ genderLabel(g) }}</option>
      </select>
      <select v-model="distance" class="filter-select" aria-label="거리">
        <option value="">거리 전체</option>
        <option v-for="d in DIST_OPTS" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="matched" class="filter-select" aria-label="선택 여부">
        <option value="">전체</option>
        <option value="has">선택됨</option>
        <option value="none">선택안됨</option>
      </select>
      <input v-model="q" class="filter-input" type="search" placeholder="이름 · contributor 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <span class="toolbar-spacer" />
      <button class="btn btn-primary" type="button" @click="importOpen = true">Import</button>
      <button class="btn btn-ghost" type="button" :disabled="savingArticles || !checked.length" @click="saveArticles">
        {{ savingArticles ? '기사 저장 중…' : (checked.length ? `기사 저장 (${checked.length})` : '기사 저장') }}
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="notice" class="result-note notice">{{ notice }}</p>
    <p v-if="!loading" class="result-note">총 {{ rows.length }}장</p>

    <DataTable
      :columns="columns" :rows="rows" clickable hide-search hide-actions
      selectable :selected="checked" @update:selected="checked = $event"
      @row-click="openRow"
    />

    <!-- 폴더별 사진 가져오기 드로어 (폴더명 {discipline}_{gender}_{distance}) -->
    <ImageDirImportDrawer
      :open="importOpen" :competitions="competitions" :competition-i-d="competitionID"
      @close="importOpen = false" @done="onImportDone"
    />

    <!-- 상세 모달 — 머리줄(파일명) · 영법/성별/거리 + 썸네일 · 이름/팀/장면/저장한 사람/캡션 -->
    <ImageEditModal :row="selected" @close="selected = null" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.toolbar-spacer { flex: 1; }
.filter-select, .filter-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-input { flex: 0 1 240px; }
.filter-comp { max-width: 320px; }
.filter-select:focus, .filter-input:focus { outline: none; border-color: var(--orange); }
.result-note { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 12px; }
.result-note.notice { color: var(--orange); font-weight: 600; }
.load-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
</style>
