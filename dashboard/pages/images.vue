<script setup lang="ts">
// 이미지 — SwimmingPhotography DB(images) 조회. 대회·영법·선수명 필터, 행 클릭 시 상세 드로어.
import { onMounted, ref, watch } from 'vue'
import type { Column } from '~/composables/useMock'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/images${p}`

// ── 필터 ──
const competitionID = ref<number | ''>('')
const discipline = ref('')
const name = ref('')

const competitions = ref<any[]>([])
const disciplines = ref<string[]>([])

// 영법 코드 → 한글
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const discLabel = (d: string) => DISC_KO[d] || d || ''
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v || ''

// ── 테이블 ──
const columns: Column[] = [
  { key: 'filename', label: '파일', cls: 'mono' },
  { key: 'name', label: '선수명', cls: 'strong' },
  { key: 'genderAge', label: '성별·부', cls: 'muted', get: (r) => [genderLabel(r.gender), r.ageGroup].filter(Boolean).join(' · ') },
  { key: 'team', label: '팀', cls: 'muted' },
  { key: 'discipline', label: '영법', get: (r) => discLabel(r.discipline) },
  { key: 'scene', label: '장면', cls: 'muted', get: (r) => r.sceneType || r.type || '' },
  { key: 'caption', label: '캡션', get: (r) => r.translations?.ko?.caption || '' },
]

const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const loadFilters = async () => {
  try { competitions.value = await $fetch<any[]>(api('/competitions')) } catch { competitions.value = [] }
  try { disciplines.value = await $fetch<string[]>(api('/disciplines')) } catch { disciplines.value = [] }
}
const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (competitionID.value) params.competitionID = competitionID.value
    if (discipline.value) params.discipline = discipline.value
    if (name.value.trim()) params.name = name.value.trim()
    rows.value = await $fetch<any[]>(api(), { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
onMounted(async () => { await loadFilters(); await load() })
watch([competitionID, discipline], load)

// ── 상세 드로어 (편집) ──
const selected = ref<any | null>(null)
const open = ref(false)
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }

// 편집 대상 필드 — 서버 PUT /api/images/:id 의 EDITABLE 과 같은 목록.
// name 은 선수 매칭 키(times.name_unique)라 동명이인이면 "홍길동1" 처럼 번호가 붙은 이름을 넣어야 한다.
const EDIT_FIELDS = ['name', 'gender', 'discipline', 'distance', 'type'] as const
const GENDER_OPTS = ['', 'men', 'women', 'mixed']
const DIST_OPTS = ['', '25M', '50M', '100M', '200M', '400M', '800M', '1500M']
const draft = ref<Record<string, string>>({})
const saving = ref(false)
const deleting = ref(false)
const drawerMsg = ref('')

const openRow = (r: any) => {
  selected.value = r
  draft.value = Object.fromEntries(EDIT_FIELDS.map((k) => [k, r?.[k] ?? '']))
  drawerMsg.value = ''
  closeHomonyms()
  open.value = true
}

// ── 동명이인 — 이미지의 name 은 times.name_unique 와 같아야 매칭된다.
// (competitionID + name_unique) 가 없으면 번호가 붙은 이름을 써야 하는 상태이므로 후보를 보여준다.
const timesApi = (p = '') => `${useRuntimeConfig().public.apiBase}/api/times${p}`
const homOpen = ref(false)
const homLoading = ref(false)
const homRows = ref<any[]>([])
const homIsHomonym = ref(false)
const homMsg = ref('')
const closeHomonyms = () => { homOpen.value = false; homRows.value = []; homMsg.value = ''; homIsHomonym.value = false }
// 후보 클릭 → name 입력에 채운다(저장은 하단 '저장' 버튼으로).
const applyHomonym = (h: any) => {
  if (!h?.name_unique) return
  draft.value.name = h.name_unique
  homIsHomonym.value = false
}
const showHomonyms = async () => {
  const r = selected.value
  const nm = String(draft.value.name || '').trim()
  if (!nm) { homMsg.value = '선수명이 비어 있습니다.'; homOpen.value = true; return }
  homOpen.value = true; homLoading.value = true; homMsg.value = ''
  try {
    const res = await $fetch<any>(timesApi('/homonyms'), { params: { competitionID: r?.competitionID ?? '', name: nm } })
    homRows.value = res.candidates || []
    homIsHomonym.value = !!res.isHomonym
    if (!homRows.value.length) homMsg.value = `'${nm}' 에 해당하는 기록을 찾지 못했습니다.`
  } catch (err: any) {
    homRows.value = []
    homMsg.value = '조회 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    homLoading.value = false
  }
}

// 읽기전용 라벨 — 가져오기가 정하는 값이라 편집하지 않는다
const labelRows = () => {
  const r = selected.value
  if (!r) return [] as [string, any][][]
  return [
    [['competitionID', r.competitionID], ['competitionName', r.competition]],
    [['thumbnail', r.thumbPath || r.thumbnail], ['url', r.path || r.url]],
  ]
}

const onSave = async () => {
  const r = selected.value
  if (!r?._id || saving.value) return
  if (!String(draft.value.name || '').trim()) { drawerMsg.value = '선수명을 입력하세요.'; return }
  saving.value = true; drawerMsg.value = ''
  try {
    const res = await $fetch<any>(api(`/${r._id}`), { method: 'PUT', body: { ...draft.value } })
    for (const k of EDIT_FIELDS) r[k] = res[k]   // 드로어·목록 즉시 반영(같은 객체 참조)
    drawerMsg.value = '저장됨'
  } catch (err: any) {
    drawerMsg.value = '저장 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    saving.value = false
  }
}

const onDelete = async () => {
  const r = selected.value
  if (!r?._id || deleting.value) return
  if (!confirm(`'${r.filename}' 이미지를 삭제하시겠습니까?\n원본·썸네일 파일도 함께 삭제됩니다.`)) return
  deleting.value = true; drawerMsg.value = ''
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    open.value = false
    await load()
  } catch (err: any) {
    drawerMsg.value = '삭제 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <!-- 툴바: 필터 -->
    <div class="toolbar">
      <select v-model="competitionID" class="filter-select filter-comp" aria-label="대회">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }} ({{ c.count }})
        </option>
      </select>
      <select v-model="discipline" class="filter-select" aria-label="영법">
        <option value="">영법 전체</option>
        <option v-for="d in disciplines" :key="d" :value="d">{{ discLabel(d) }}</option>
      </select>
      <input v-model="name" class="filter-input" type="search" placeholder="선수명 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
    </div>

    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="!loading" class="result-note">총 {{ rows.length }}장</p>

    <DataTable :columns="columns" :rows="rows" clickable hide-search hide-actions @row-click="openRow" />

    <!-- 상세 드로어 -->
    <div class="drawer-root" :class="{ open }" @keydown="onKey">
      <div class="drawer-ov" @click="open = false" />
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="이미지 상세">
        <header class="drawer-head">
          <h2>{{ selected?.filename || '이미지' }}</h2>
          <button class="drawer-x" aria-label="닫기" @click="open = false">×</button>
        </header>
        <div class="drawer-body">
          <div v-if="selected" class="img-wrap">
            <img :src="selected.url" :alt="selected.filename">
          </div>

          <!-- 편집 필드 -->
          <div v-if="selected" class="edit-grid">
            <div class="fld fld-wide">
              <span class="info-l">name</span>
              <div class="name-ctl">
                <input v-model="draft.name" class="fld-input" type="text" placeholder="선수명 (동명이인이면 홍길동1)">
                <button class="btn btn-ghost" type="button" :disabled="homLoading" @click="showHomonyms">
                  {{ homLoading ? '조회 중…' : '동명이인' }}
                </button>
                <button v-if="homOpen" class="btn btn-ghost" type="button" @click="closeHomonyms">닫기</button>
              </div>

              <!-- 동명이인 후보 — times 의 같은 이름 선수들 -->
              <div v-if="homOpen" class="hom-panel">
                <p v-if="homMsg" class="hom-msg">{{ homMsg }}</p>
                <p v-else-if="homIsHomonym" class="hom-note">
                  동명이인입니다 — 이 대회에 <b>{{ draft.name }}</b> 이름의 기록이 없습니다. 아래 name_unique 중 하나로 바꿔주세요.
                </p>
                <p v-else class="hom-note ok">
                  <b>{{ draft.name }}</b> 로 매칭되는 기록이 있습니다.
                </p>
                <table v-if="homRows.length" class="hom-table">
                  <thead>
                    <tr><th>name</th><th>name_unique</th><th>gender</th><th>ageGroup</th><th>team</th><th class="num">기록</th></tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(h, i) in homRows" :key="i"
                      :class="{ cur: h.name_unique === draft.name }"
                      :title="`name 을 '${h.name_unique}' 로 채웁니다`"
                      @click="applyHomonym(h)"
                    >
                      <td>{{ h.name || '—' }}</td>
                      <td class="strong">{{ h.name_unique || '—' }}</td>
                      <td>{{ h.gender ? genderLabel(h.gender) : '—' }}</td>
                      <td>{{ h.ageGroup || '—' }}</td>
                      <td>{{ h.team || '—' }}</td>
                      <td class="num">{{ h.timeCount }}</td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="homRows.length" class="hom-hint">행을 클릭하면 name 에 채워집니다. 반영하려면 아래 <b>저장</b> 을 누르세요.</p>
              </div>
            </div>
            <label class="fld">
              <span class="info-l">gender</span>
              <select v-model="draft.gender" class="fld-input">
                <option v-for="g in GENDER_OPTS" :key="g" :value="g">{{ g ? genderLabel(g) : '—' }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">discipline</span>
              <select v-model="draft.discipline" class="fld-input">
                <option value="">—</option>
                <option v-for="d in disciplines" :key="d" :value="d">{{ discLabel(d) }} ({{ d }})</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">distance</span>
              <select v-model="draft.distance" class="fld-input">
                <option v-for="d in DIST_OPTS" :key="d" :value="d">{{ d || '—' }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">type</span>
              <input v-model="draft.type" class="fld-input" type="text" placeholder="BLOCK · SWIM …">
            </label>
          </div>

          <!-- 읽기전용 라벨 -->
          <div v-for="(row, ri) in labelRows()" :key="ri" class="info-duo">
            <div v-for="([label, val], ci) in row" :key="ci" class="info-cell">
              <span class="info-l">{{ label }}</span>
              <span class="info-v">{{ (val ?? '') === '' ? '—' : val }}</span>
            </div>
          </div>
        </div>

        <footer class="drawer-foot">
          <button class="btn btn-danger" type="button" :disabled="!selected || deleting || saving" @click="onDelete">
            {{ deleting ? '삭제 중…' : '삭제' }}
          </button>
          <span class="foot-msg">{{ drawerMsg }}</span>
          <button class="btn btn-primary" type="button" :disabled="!selected || saving || deleting" @click="onSave">
            {{ saving ? '저장 중…' : '저장' }}
          </button>
        </footer>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.filter-select, .filter-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-input { flex: 0 1 240px; }
.filter-comp { max-width: 320px; }
.filter-select:focus, .filter-input:focus { outline: none; border-color: var(--orange); }
.result-note { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 12px; }
.load-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }

/* 드로어 */
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(1120px, 96vw); background: var(--paper);
  border-left: 1px solid var(--line); box-shadow: -18px 0 50px rgba(26, 26, 26, .12);
  display: flex; flex-direction: column; transform: translateX(100%); transition: transform .26s cubic-bezier(.4, 0, .2, 1);
}
.drawer-root.open { pointer-events: auto; }
.drawer-root.open .drawer-ov { opacity: 1; }
.drawer-root.open .drawer { transform: translateX(0); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.drawer-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); word-break: break-all; }
.drawer-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.img-wrap { margin-bottom: 14px; background: var(--paper-deep); border-radius: 6px; overflow: hidden; }
.img-wrap img { display: block; width: 100%; height: auto; }
/* 편집 필드 — name 은 한 줄 전체, 나머지는 2열 */
.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; padding: 10px 0 14px; border-bottom: 1px solid var(--line-soft); }
.fld { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fld-wide { grid-column: 1 / -1; }
.fld-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 11px; width: 100%;
}
.fld-input:focus { outline: none; border-color: var(--orange); }
.name-ctl { display: flex; align-items: center; gap: 8px; }
.name-ctl .fld-input { flex: 1; }

/* 동명이인 후보 패널 */
.hom-panel { margin-top: 8px; padding: 10px 12px; background: var(--paper-deep); border-radius: 6px; }
.hom-note { margin: 0 0 8px; font-size: 12.5px; color: var(--bad); line-height: 1.5; }
.hom-note.ok { color: var(--ink-mute); }
.hom-msg { margin: 0; font-size: 12.5px; color: var(--ink-mute); }
.hom-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.hom-table th, .hom-table td { padding: 5px 8px; text-align: left; border-bottom: 1px solid var(--line-soft); }
.hom-table th { font-size: 11.5px; font-weight: 600; color: var(--ink-light); }
.hom-table td { color: var(--ink); }
.hom-table td.strong { font-weight: 700; }
.hom-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.hom-table tbody tr { cursor: pointer; }
.hom-table tbody tr:hover td { background: var(--paper); }
.hom-table tr.cur td { background: var(--paper); box-shadow: inset 2px 0 0 var(--orange); }
.hom-hint { margin: 8px 0 0; font-size: 11.5px; color: var(--ink-light); }

/* 드로어 하단 액션 */
.drawer-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-top: 1px solid var(--line); background: var(--paper);
}
.foot-msg { flex: 1; font-size: 12px; color: var(--ink-mute); }
/* btn-danger 는 전역(dashboard.css)에 없어 페이지마다 정의한다 */
.btn-danger { background: var(--bad-bg); color: var(--bad); }
.btn-danger:hover:not(:disabled) { background: var(--bad); color: #fff; }
.btn:disabled { opacity: .5; cursor: default; }
.info-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.info-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.info-l { font-size: 11.5px; color: var(--ink-light); }
.info-v { font-size: 13.5px; color: var(--ink); word-break: break-all; }
.cap-block { padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
.cap-text { margin: 4px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--ink); }
</style>
