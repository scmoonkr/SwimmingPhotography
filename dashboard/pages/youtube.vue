<script setup lang="ts">
// 유튜브 — SwimmingPhotography DB(youtube) 조회. 대회·매칭여부 필터.
// 'Import' → 일자로 읽어 대회 매칭 드로어. 'times 매칭' → 대회 매칭된 영상을 times 에 붙여 timeID 설정.
// 표의 행을 클릭하면 이름·성별·영법·거리·기록을 인라인 편집하고, ✓ 를 누르면 수정값으로 times 재매칭한다.
import { computed, onMounted, ref, watch } from 'vue'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/youtube${p}`

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const discLabel = (d: string) => DISC_KO[d] || d || ''
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v || ''
const roundLabel = (r: string) => ({
  preliminaries: '예선', prelim: '예선', heats: '예선', semifinals: '준결승', semifinal: '준결승', finals: '결선', final: '결선',
} as Record<string, string>)[String(r || '').toLowerCase()] || r || ''

const GENDER_OPTS = ['men', 'women', 'mixed']
const DISC_OPTS = ['FR', 'BA', 'BR', 'FL', 'IM', 'FRR', 'MR']
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M', '3000M', '5000M', '10000M']

// ── 필터 ──
const competitionID = ref<number | ''>('')
const matched = ref<'' | 'none' | 'has'>('')        // 대회 매칭(competitionID)
const timeMatched = ref<'' | 'none' | 'has'>('')     // times 매칭(timeID)
const name = ref('')
const competitions = ref<any[]>([])

const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')
const notice = ref('')
const importOpen = ref(false)
const timesMatching = ref(false)
const savingArticles = ref(false)

// 인라인 편집 상태
const editing = ref('')                       // 편집 중인 행 _id
const draft = ref<Record<string, string>>({})
const savingId = ref('')

// 체크박스 선택 — 체크한 영상만 기사 저장
const checked = ref<Set<string>>(new Set())
const isChecked = (id: string) => checked.value.has(id)
const toggle = (id: string) => {
  const s = new Set(checked.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  checked.value = s
}
const allChecked = computed(() => rows.value.length > 0 && rows.value.every((r) => checked.value.has(r._id)))
const someChecked = computed(() => rows.value.some((r) => checked.value.has(r._id)) && !allChecked.value)
const toggleAll = () => { checked.value = allChecked.value ? new Set() : new Set(rows.value.map((r) => r._id)) }

const loadCompetitions = async () => {
  try { competitions.value = await $fetch<any[]>(api('/competitions')) } catch { competitions.value = [] }
}
const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (competitionID.value) params.competitionID = competitionID.value
    if (matched.value) params.matched = matched.value
    if (timeMatched.value) params.timeMatched = timeMatched.value
    if (name.value.trim()) params.name = name.value.trim()
    rows.value = await $fetch<any[]>(api(), { params })
    editing.value = ''
    checked.value = new Set()
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}

const openVideo = (r: any) => { if (r?.url) window.open(r.url, '_blank', 'noopener') }

const onImportDone = async (r: any) => {
  notice.value = `${r.matched}건 매칭 완료${r.competitionName ? ` — ${r.competitionName}` : ''}`
  await loadCompetitions()
  await load()
}

// times 매칭(일괄) — competitionID 가 붙은 영상을 times 에 매칭해 timeID 를 설정한다.
const matchTimes = async () => {
  if (timesMatching.value) return
  const scope = competitionID.value ? '선택한 대회' : '대회 매칭된 전체'
  if (!confirm(`${scope}의 유튜브 영상을 times 에 매칭해 timeID 를 설정합니다.\n(대회 매칭이 안 된 영상은 대상이 아닙니다.) 계속할까요?`)) return
  timesMatching.value = true; errorMsg.value = ''; notice.value = ''
  try {
    const body: Record<string, any> = {}
    if (competitionID.value) body.competitionID = competitionID.value
    const res = await $fetch<any>(api('/match-times'), { method: 'POST', body })
    notice.value = `times 매칭 — 대상 ${res.total} · 확정 ${res.ok} · 여러건(결선) ${res.multi} · 없음 ${res.none} · 저장 ${res.modified}`
    await load()
  } catch (err: any) {
    errorMsg.value = 'times 매칭 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    timesMatching.value = false
  }
}

// 기사 저장 — timeID 붙은 영상을 (times.unique 로 찾은) 해당 기사에 youtube:{url,caption} 로 저장.
const saveArticles = async () => {
  if (savingArticles.value) return
  if (!checked.value.size) { notice.value = '체크한 영상이 없습니다.'; return }
  if (!confirm(`체크한 ${checked.value.size}개 영상을 해당 기사에 저장합니다.\n(기사.youtube = { url, caption: 제목 })  계속할까요?`)) return
  savingArticles.value = true; errorMsg.value = ''; notice.value = ''
  try {
    const body: Record<string, any> = { ids: [...checked.value] }
    const res = await $fetch<any>(api('/save-articles'), { method: 'POST', body })
    notice.value = `기사 저장 — 유튜브 ${res.total} · 대상 기사 ${res.articles} · 저장 ${res.saved} · 기사없음 ${res.noArticle}${res.noUnique ? ` · unique없음 ${res.noUnique}` : ''}`
  } catch (err: any) {
    errorMsg.value = '기사 저장 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    savingArticles.value = false
  }
}

// ── 인라인 편집 + 재매칭 (이미지 상세 편집과 같은 방식) ──
const startEdit = (r: any) => {
  if (editing.value === r._id) return
  editing.value = r._id
  draft.value = { name: r.name ?? '', gender: r.gender ?? '', discipline: r.discipline ?? '', distance: r.distance ?? '', time: r.time ?? '' }
}
const cancelEdit = () => { editing.value = '' }
// ✓ — 수정값 저장 후 competitionID 로 times 재매칭 → timeID 설정
const commitEdit = async (r: any) => {
  if (savingId.value) return
  savingId.value = r._id; errorMsg.value = ''
  try {
    const res = await $fetch<any>(api(`/${r._id}`), { method: 'PUT', body: { ...draft.value } })
    Object.assign(r, { name: res.name, gender: res.gender, discipline: res.discipline, distance: res.distance, time: res.time, timeID: res.timeID })
    editing.value = ''
    const st = res.matchStatus
    notice.value = st === 'skip'
      ? `${r.name}: 저장됨 — 대회 매칭을 먼저 해야 timeID 가 붙습니다.`
      : `${r.name}: ${res.timeID ? `timeID ${res.timeID}` : '매칭 없음'}${st === 'multi' ? ' (여러건→결선)' : ''}`
  } catch (err: any) {
    errorMsg.value = '저장 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    savingId.value = ''
  }
}

onMounted(async () => {
  await loadCompetitions()
  await load()
})
watch([competitionID, matched, timeMatched], load)
</script>

<template>
  <div>
    <!-- 툴바: 필터 + Import + times 매칭 -->
    <div class="toolbar">
      <select v-model="competitionID" class="filter-select filter-comp" aria-label="대회">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }}<span v-if="c.datetime"> ({{ c.datetime }})</span> · {{ c.count }}건
        </option>
      </select>
      <select v-model="matched" class="filter-select" aria-label="대회 매칭 여부">
        <option value="">대회매칭 전체</option>
        <option value="has">대회 매칭됨</option>
        <option value="none">대회 미매칭</option>
      </select>
      <select v-model="timeMatched" class="filter-select" aria-label="times 매칭 여부">
        <option value="">times매칭 전체</option>
        <option value="has">timeID 있음</option>
        <option value="none">timeID 없음</option>
      </select>
      <input v-model="name" class="filter-input" type="search" placeholder="선수명·제목 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <span class="toolbar-spacer" />
      <button class="btn btn-primary" type="button" @click="importOpen = true">대회 매칭</button>
      <button class="btn btn-ghost" type="button" :disabled="timesMatching" @click="matchTimes">
        {{ timesMatching ? 'times 매칭 중…' : 'times 매칭' }}
      </button>
      <button class="btn btn-ghost" type="button" :disabled="savingArticles || !checked.size" @click="saveArticles">
        {{ savingArticles ? '기사 저장 중…' : (checked.size ? `기사 저장 (${checked.size})` : '기사 저장') }}
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="notice" class="result-note notice">{{ notice }}</p>
    <p v-if="!loading" class="result-note">총 {{ rows.length }}건 · 행을 클릭하면 이름·성별·영법·거리·기록을 고치고 ✓ 로 다시 매칭합니다.</p>

    <div class="table-card">
      <div class="table-scroll">
        <table class="yt">
          <thead>
            <tr>
              <th class="chk"><input type="checkbox" :checked="allChecked" :indeterminate.prop="someChecked" @change="toggleAll"></th>
              <th>일자</th><th>선수명</th><th>성별</th><th>영법</th><th>거리</th><th>기록</th>
              <th>제목 · 대회</th><th>timeID</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length" class="empty-row"><td colspan="10">데이터가 없습니다.</td></tr>
            <tr
              v-for="r in rows" :key="r._id"
              :class="{ editing: editing === r._id, hasid: !!r.timeID, sel: isChecked(r._id) }" @click="startEdit(r)"
            >
              <td class="chk" @click.stop><input type="checkbox" :checked="isChecked(r._id)" @change="toggle(r._id)"></td>
              <td class="mono">{{ r.datetime }}</td>

              <!-- 편집 중 -->
              <template v-if="editing === r._id">
                <td><input v-model="draft.name" class="cell-input" type="text" placeholder="선수명" @click.stop @keydown.enter="commitEdit(r)" @keydown.esc.stop="cancelEdit"></td>
                <td>
                  <select v-model="draft.gender" class="cell-input" @click.stop>
                    <option value="">—</option>
                    <option v-for="g in GENDER_OPTS" :key="g" :value="g">{{ genderLabel(g) }}</option>
                  </select>
                </td>
                <td>
                  <select v-model="draft.discipline" class="cell-input" @click.stop>
                    <option value="">—</option>
                    <option v-for="d in DISC_OPTS" :key="d" :value="d">{{ discLabel(d) }} ({{ d }})</option>
                  </select>
                </td>
                <td>
                  <select v-model="draft.distance" class="cell-input" @click.stop>
                    <option value="">—</option>
                    <option v-for="d in DIST_OPTS" :key="d" :value="d">{{ d }}</option>
                  </select>
                </td>
                <td><input v-model="draft.time" class="cell-input" type="text" placeholder="기록" @click.stop @keydown.enter="commitEdit(r)" @keydown.esc.stop="cancelEdit"></td>
              </template>

              <!-- 표시 -->
              <template v-else>
                <td class="strong">{{ r.name || '—' }}</td>
                <td class="muted">{{ genderLabel(r.gender) || '—' }}</td>
                <td>{{ discLabel(r.discipline) || '—' }}</td>
                <td>{{ r.distance || '—' }}</td>
                <td class="mono">{{ r.time || '—' }}</td>
              </template>

              <!-- 제목 + 대회명(흐리게) -->
              <td class="title-cell">
                <span class="tt-title">{{ r.title }}</span>
                <span v-if="r.competitionID" class="tt-comp">{{ r.competitionName || r.competitionID }}<span v-if="roundLabel(r.round)"> · {{ roundLabel(r.round) }}</span></span>
              </td>

              <td class="mono" :class="{ bad: editing !== r._id && !r.timeID }">{{ r.timeID ?? '—' }}</td>

              <!-- 작업: 편집 중이면 ✓/✕, 아니면 유튜브 아이콘 -->
              <td class="act" @click.stop>
                <template v-if="editing === r._id">
                  <button class="row-btn ok" type="button" title="적용 · 다시 매칭" :disabled="savingId === r._id" @click="commitEdit(r)">✓</button>
                  <button class="row-btn" type="button" title="취소" @click="cancelEdit">✕</button>
                </template>
                <button v-else class="yt-btn" type="button" title="유튜브 영상 열기" aria-label="유튜브 영상 열기" @click="openVideo(r)">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.8-.5-5.6a2.9 2.9 0 0 0-2-2C18.7 4 12 4 12 4s-6.7 0-8.5.5a2.9 2.9 0 0 0-2 2C1 8.2 1 12 1 12s0 3.8.5 5.6a2.9 2.9 0 0 0 2 2C5.3 20 12 20 12 20s6.7 0 8.5-.5a2.9 2.9 0 0 0 2-2C23 15.8 23 12 23 12ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 유튜브 대회 매칭 드로어 -->
    <YoutubeMatchDrawer
      :open="importOpen" :competitions="competitions"
      @close="importOpen = false" @done="onImportDone"
    />
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

/* 표 */
.table-card { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.table-scroll { overflow-x: auto; }
.yt { width: 100%; border-collapse: collapse; font-size: 13px; }
.yt th, .yt td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.yt th { font-size: 11.5px; font-weight: 600; color: var(--ink-light); background: var(--paper-deep); white-space: nowrap; }
.yt tbody tr { cursor: pointer; }
.yt tbody tr:hover td { background: var(--paper-deep); }
.yt tr.editing td { background: var(--paper-deep); box-shadow: inset 2px 0 0 var(--orange); }
.yt tr.sel td { background: var(--orange-bg); }
.yt th.chk, .yt td.chk { width: 34px; text-align: center; padding-right: 0; }
.yt td.chk input, .yt th.chk input { width: 15px; height: 15px; cursor: pointer; accent-color: var(--orange); }
.yt td.mono { font-family: var(--mono, monospace); white-space: nowrap; }
.yt td.strong { font-weight: 700; }
.yt td.muted { color: var(--ink-mute); }
.yt td.bad { color: var(--bad); }
.yt .empty-row td { text-align: center; color: var(--ink-light); padding: 28px; cursor: default; }

/* 제목 + 대회명(흐리게) */
.title-cell { max-width: 460px; }
.tt-title { display: block; color: var(--ink); line-height: 1.35; }
.tt-comp { display: block; margin-top: 2px; font-size: 11.5px; color: var(--ink-light); }

.cell-input {
  font-family: var(--sans); font-size: 12.5px; color: var(--ink); width: 100%; min-width: 72px;
  background: var(--paper); border: 1px solid var(--line); border-radius: 4px; padding: 5px 7px;
}
.cell-input:focus { outline: none; border-color: var(--orange); }

.act { white-space: nowrap; text-align: right; }
.row-btn { border: none; background: none; cursor: pointer; color: var(--ink-light); font-size: 14px; line-height: 1; padding: 0 4px; }
.row-btn.ok { color: var(--orange); font-weight: 700; }
.row-btn:disabled { opacity: .5; cursor: default; }
.yt-btn { border: none; background: none; cursor: pointer; color: #c00; padding: 0; display: inline-flex; }
.yt-btn svg { width: 22px; height: 22px; }
.yt-btn:hover { color: #f00; }
.btn:disabled { opacity: .5; cursor: default; }
</style>
