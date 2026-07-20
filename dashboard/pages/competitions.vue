<script setup lang="ts">
// 대회 — SwimmingPhotography DB(competitions). 연도·대회명 필터는 서버로 전달.
import { computed, onMounted, ref, watch } from 'vue'
import { useEntity, blankCompetition, SIDO_LIST } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const e = useEntity('competitions')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/competitions${p}`
const timesApi = (p = '') => `${useRuntimeConfig().public.apiBase}/api/times${p}`

// 종목 코드 → 한글
const DISCIPLINE_LABEL: Record<string, string> = {
  FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영',
}
const discLabel = (v: string) => DISCIPLINE_LABEL[v] || v || ''
// disciplines [{discipline,count}] → "자유형 120 · 배영 80"
const fmtDisciplines = (d: any) => Array.isArray(d) ? d.map((x) => `${discLabel(x.discipline)} ${x.count}`).join(' · ') : (d ?? '')

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

// ── 이미지 업로드 (multipart → /api/competitions/:id/images) ──
const fileInput = ref<HTMLInputElement | null>(null)
const queue = ref<{ file: File; preview: string }[]>([])
const uploading = ref(false)
const uploadMsg = ref('')
const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif)$/i
// 저장된(서버) 이미지 목록 — 드로어 대상 대회의 images
const savedImages = computed<any[]>(() => (selected.value?.images || []))

const addFiles = (files: FileList | null) => {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!IMAGE_RE.test(f.name)) continue
    queue.value.push({ file: f, preview: URL.createObjectURL(f) })
  }
}
const onFileChange = (e: Event) => { addFiles((e.target as HTMLInputElement).files); if (fileInput.value) fileInput.value.value = '' }
const onDrop = (e: DragEvent) => addFiles(e.dataTransfer?.files ?? null)
const removeQueued = (i: number) => { URL.revokeObjectURL(queue.value[i].preview); queue.value.splice(i, 1) }

const doUpload = async () => {
  const id = selected.value?._id
  if (!id) { uploadMsg.value = '먼저 대회를 저장하세요.'; return }
  if (!queue.value.length || uploading.value) return
  uploading.value = true; uploadMsg.value = ''
  try {
    const fd = new FormData()
    for (const { file } of queue.value) fd.append('files', file)
    const r = await $fetch<any>(api(`/${id}/images`), { method: 'POST', body: fd })
    if (selected.value) selected.value.images = r.images // 드로어 즉시 반영
    queue.value.forEach((q) => URL.revokeObjectURL(q.preview))
    queue.value = []
    uploadMsg.value = `${r.added}장 업로드 완료`
    await load()
  } catch (err: any) {
    uploadMsg.value = '업로드 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    uploading.value = false
  }
}

const removeSaved = async (url: string) => {
  const id = selected.value?._id
  if (!id || !confirm('이 이미지를 삭제하시겠습니까?')) return
  try {
    const r = await $fetch<any>(api(`/${id}/images`), { method: 'DELETE', body: { url } })
    if (selected.value) selected.value.images = r.images
    await load()
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
  }
}

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
  // 종목별 time count — 기록가져오기로 계산되는 읽기전용 값(폼 저장 시 배열 원본 보존)
  { key: 'disciplines', label: '종목 (종목별 기록수)', type: 'text', half: false, get: (r) => fmtDisciplines(r.disciplines), set: () => {} },
  { key: 'sido', label: '시도', type: 'select', options: SIDO_LIST, half: true, get: (r) => r.sido ?? '', set: (r, v) => { r.sido = v } },
  { key: 'pool', label: '수영장', type: 'text', half: true, get: (r) => r.pool ?? '', set: (r, v) => { r.pool = v } },
  { key: 'course', label: 'Course', type: 'select', options: ['LCM', 'SCM'], half: true, get: (r) => r.course ?? 'LCM', set: (r, v) => { r.course = v } },
  { key: 'isMasters', label: '구분', type: 'select', options: ['일반', '마스터즈'], half: true, get: (r) => (r.isMasters ? '마스터즈' : '일반'), set: (r, v) => { r.isMasters = v === '마스터즈' } },
  // 대회 스케치
  { key: 'notesCompetition', label: '대회 노트', type: 'textarea', rows: 3, half: true, get: (r) => r.notesCompetition ?? '', set: (r, v) => { r.notesCompetition = v } },
  { key: 'notesParking', label: '주차 노트', type: 'textarea', rows: 3, half: true, get: (r) => r.notesParking ?? '', set: (r, v) => { r.notesParking = v } },
  // 수영장 스케치
  { key: 'notesPool', label: '수영장 노트', type: 'textarea', rows: 3, half: true, get: (r) => r.notesPool ?? '', set: (r, v) => { r.notesPool = v } },
  { key: 'notesWeather', label: '날씨 노트', type: 'textarea', rows: 3, half: true, get: (r) => r.notesWeather ?? '', set: (r, v) => { r.notesWeather = v } },
  // 인용(제보)
  { key: 'quotesCompetition', label: '대회 인용', type: 'textarea', rows: 3, half: true, get: (r) => r.quotesCompetition ?? '', set: (r, v) => { r.quotesCompetition = v } },
  { key: 'quotesParking', label: '주차 인용', type: 'textarea', rows: 3, half: true, get: (r) => r.quotesParking ?? '', set: (r, v) => { r.quotesParking = v } },
  { key: 'quotesPool', label: '수영장 인용', type: 'textarea', rows: 3, half: true, get: (r) => r.quotesPool ?? '', set: (r, v) => { r.quotesPool = v } },
  { key: 'quotesWeather', label: '날씨 인용', type: 'textarea', rows: 3, half: true, get: (r) => r.quotesWeather ?? '', set: (r, v) => { r.quotesWeather = v } },
]

const resetUpload = () => { queue.value.forEach((q) => URL.revokeObjectURL(q.preview)); queue.value = []; uploadMsg.value = '' }
const openRow = (r: Record<string, any>) => { isNew.value = false; selected.value = r; open.value = true; importMsg.value = ''; resetUpload() }
const openNew = () => { isNew.value = true; selected.value = blankCompetition(); open.value = true; importMsg.value = ''; resetUpload() }

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
      :fields="fields" :row="selected" width="min(897px, 96vw)"
      @close="open = false" @save="onSave" @delete="onDrawerDelete"
    >
      <template v-if="!isNew" #body-top>
        <div class="comp-stats">
          <div class="stat"><span class="stat-n">{{ selected?.teamCount ?? '—' }}</span><span class="stat-l">팀</span></div>
          <div class="stat"><span class="stat-n">{{ selected?.athleteCount ?? '—' }}</span><span class="stat-l">선수</span></div>
          <div class="stat"><span class="stat-n">{{ selected?.startCount ?? '—' }}</span><span class="stat-l">start</span></div>
        </div>
      </template>
      <template #body-bottom>
        <div class="up-sec">
          <div class="up-head">
            <span class="field-label">이미지</span>
            <span v-if="savedImages.length" class="up-count">{{ savedImages.length }}장</span>
          </div>

          <!-- 저장된 이미지 -->
          <div v-if="savedImages.length" class="up-grid">
            <div v-for="(im, i) in savedImages" :key="i" class="up-cell">
              <img :src="im.url" class="up-thumb" alt="">
              <button class="up-del" type="button" title="삭제" @click="removeSaved(im.url)">✕</button>
            </div>
          </div>

          <!-- 업로드 대기 큐 (미리보기) -->
          <div v-if="queue.length" class="up-grid">
            <div v-for="(q, i) in queue" :key="'q' + i" class="up-cell pending">
              <img :src="q.preview" class="up-thumb" alt="">
              <button class="up-del" type="button" title="빼기" @click="removeQueued(i)">✕</button>
            </div>
          </div>

          <!-- 업로드 컨트롤 -->
          <div class="up-area" @dragover.prevent @drop.prevent="onDrop">
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFileChange">
            <button class="btn btn-ghost" type="button" :disabled="isNew || uploading" @click="fileInput?.click()">파일 선택</button>
            <span class="up-hint">또는 드래그</span>
            <span class="filter-spacer" />
            <button
              v-if="queue.length" class="btn btn-primary" type="button"
              :disabled="isNew || uploading" @click="doUpload"
            >{{ uploading ? '업로드 중…' : `${queue.length}장 업로드` }}</button>
          </div>
          <p v-if="isNew" class="up-note">대회를 먼저 저장하면 이미지를 올릴 수 있습니다.</p>
          <p v-else-if="uploadMsg" class="up-note">{{ uploadMsg }}</p>
        </div>
      </template>

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
/* 드로어 상단 참가규모 (팀·선수·start) — grid 4열을 가득 채움 */
.comp-stats { grid-column: 1 / -1; display: flex; gap: 2px; }
.comp-stats .stat {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 3px 2cqmin; background: var(--paper-deep); border-radius: 8px;
}
.comp-stats .stat-n { font-size: 20px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
.comp-stats .stat-l { font-size: 11.5px; font-weight: 700; color: var(--ink-mute); }

/* 드로어 이미지 업로드 섹션 — grid 전체 폭 */
.up-sec { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; }
.up-head { display: flex; align-items: center; gap: 8px; }
.up-count { font-size: 12px; color: var(--ink-mute); }
.up-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.up-cell { position: relative; width: 104px; height: 78px; }
.up-thumb {
  width: 100%; height: 100%; object-fit: cover; border-radius: 6px;
  border: 1px solid var(--line); background: var(--paper-deep);
}
.up-cell.pending .up-thumb { opacity: .7; border-style: dashed; }
.up-del {
  position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%;
  border: none; background: var(--ink); color: #fff; font-size: 12px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.up-del:hover { background: var(--bad); }
.up-area {
  display: flex; align-items: center; gap: 10px; padding: 12px;
  border: 1px dashed var(--line); border-radius: 8px; background: var(--paper-deep);
}
.up-hint { font-size: 12px; color: var(--ink-mute); }
.up-note { font-size: 12px; color: var(--ink-mute); }
</style>
