<script setup lang="ts">
// 이미지 상세 모달 — 공개 사이트 images 페이지의 카드 클릭 모달. 대시보드 Images Dir(imagesPage)의 모달과 같은 구성.
//   머리줄(파일명) · 왼쪽: 영법/성별/거리 + 썸네일 + 저장한 사람/시각 · 오른쪽: 선수 목록(+선수 찾기) · 장면 · 캡션 · 삭제/저장
// 저장·삭제는 서버가 로그인(세션 쿠키)을 요구한다. 저장하면 서버가 updatedAt 과 contributor(로그인 계정)를 남긴다.
import { ref, watch } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', row: any): void; (e: 'deleted', row: any): void }>()

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const GENDER_OPTS = ['men', 'women', 'mixed']
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M']
const TYPE_OPTS = ['', 'ENTER', 'BLOCK', 'START', 'RACE', 'TOUCHPAD', 'CEREMONY', 'EXIT', 'WALK', 'TEAM']
// select 에는 '한글(영문)' 으로 보여준다 (예: 경기(RACE)) — 저장 값은 영문 코드 그대로
const TYPE_KO: Record<string, string> = {
  ENTER: '입장', BLOCK: '출발대', START: '출발', RACE: '경기', TOUCHPAD: '터치패드',
  CEREMONY: '시상', EXIT: '퇴장', WALK: '이동', TEAM: '단체',
}
// 저장된 값이 목록에 없으면(예: 3000M) 그 값도 고를 수 있게 끼워 넣는다
const withCur = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [...opts, cur] : opts)

// 사진 한 장에 여러 선수가 찍힐 수 있다 — 선수마다 자기 기록(times)에 따로 붙는다.
// 한 사진의 선수는 모두 같은 종목(영법·성별·거리)이라 종목은 사진에 한 번만 둔다.
// timeID·ageGroup 은 입력칸이 없다 — 선수 찾기에서 고른 기록의 값을 들고 있다가 함께 저장한다.
// contributor — 그 선수를 고른 계정(username). 남이 고른 선수는 빼거나 고칠 수 없다(서버도 막는다).
type Athlete = { name: string; team: string; ageGroup: string; timeID: number | null; contributor?: string; contributorName?: string }
const draft = ref({
  discipline: '', gender: '', distance: '',
  athletes: [] as Athlete[], type: '', caption: '',
})
// athletes 가 없는 예전 사진은 단일 필드(name·team·ageGroup·timeID)를 한 명짜리 목록으로 본다
const athletesOf = (r: any): Athlete[] => {
  if (Array.isArray(r?.athletes) && r.athletes.length) {
    return r.athletes.map((a: any) => ({
      name: a.name ?? '', team: a.team ?? '', ageGroup: a.ageGroup ?? '', timeID: a.timeID ?? null,
      contributor: a.contributor ?? '', contributorName: a.contributorName ?? '',
    }))
  }
  return r?.name ? [{ name: r.name, team: r.team ?? '', ageGroup: r.ageGroup ?? '', timeID: r.timeID ?? null, contributor: r.contributor ?? '', contributorName: r.contributorName ?? '' }] : []
}
// 로그인 계정 — 내가 고른 선수만 빼거나 고칠 수 있다. 관리자(계정 관리 권한)는 모두 가능.
const { user } = useAuth()
const mine = (a: Athlete) => !a.contributor || a.contributor === user.value?.username || (user.value?.can || []).includes('users')
// updatedAt → KST "yyyy-mm-dd hh:mm"
const fmtTime = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}
const saving = ref(false)
const deleting = ref(false)
const msg = ref('')

// ── 선수 찾기 — 같은 (대회 · 영법 · 성별 · 거리) 의 기록 중 검색 칸의 글자가 들어간 선수 ──
const findQ = ref('')
const findOpen = ref(false)
const findLoading = ref(false)
const findRows = ref<any[]>([])
const findMsg = ref('')
const closeFind = () => { findOpen.value = false; findRows.value = []; findMsg.value = '' }
// times.name_unique 는 배열이다 — 개인은 ["홍길동1"], 계영은 멤버 명단. images.name 은 이를 콤마로 이은 값.
const nuOf = (t: any) => (Array.isArray(t?.name_unique) ? t.name_unique.join(',') : String(t?.name_unique ?? t?.name ?? ''))
const findAthletes = async () => {
  const r = props.row
  if (!r) return
  const q = findQ.value.normalize('NFC').trim()
  findOpen.value = true; findLoading.value = true; findMsg.value = ''
  try {
    const d = draft.value
    const params = { competitionID: r.competitionID ?? '', discipline: d.discipline, gender: d.gender, distance: d.distance }
    const res = await $fetch<any[]>('/api/times', { params })
    // 이름 대조는 여기서 한다 — 계영은 name_unique 가 멤버 명단이라 멤버 중 한 명만 맞아도 잡힌다
    findRows.value = (res || [])
      .filter((t) => !q || nuOf(t).includes(q) || String(t.name || '').includes(q))
      .sort((a, b) => nuOf(a).localeCompare(nuOf(b), 'ko', { numeric: true }))
    if (!findRows.value.length) {
      findMsg.value = q
        ? `같은 영법·성별·거리에 '${q}' 가 들어간 선수가 없습니다.`
        : '이 대회에 같은 영법·성별·거리의 기록이 없습니다.'
    }
  } catch (err: any) {
    findRows.value = []
    findMsg.value = '조회 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    findLoading.value = false
  }
}
// 이미 목록에 있는 기록인가 (찾기 결과에 표시 · 중복 추가 방지)
const isAdded = (t: any) => draft.value.athletes.some((a) => (t.timeID != null ? a.timeID === t.timeID : a.name === nuOf(t)))
// 고르면 선수 목록에 추가한다 — 이름·팀과 함께 그 기록의 timeID·ageGroup 을 잡아 둔다.
// 목록은 열어 둔다(여러 명을 이어서 고를 수 있게). 이미 있는 선수를 다시 누르면 뺀다.
const pickAthlete = (t: any) => {
  if (isAdded(t)) {
    // 다시 누르면 뺀다 — 내가 고른 선수만
    draft.value.athletes = draft.value.athletes.filter((a) => !(t.timeID != null ? a.timeID === t.timeID : a.name === nuOf(t)) || !mine(a))
    return
  }
  draft.value.athletes.push({ name: nuOf(t), team: t.team || '', ageGroup: t.ageGroup || '', timeID: t.timeID ?? null, contributor: user.value?.username || '', contributorName: user.value?.name || '' })
}
// 기록 없이 직접 적는 선수 — 빈 줄을 하나 붙인다
const addBlank = () => { draft.value.athletes.push({ name: findQ.value.normalize('NFC').trim(), team: '', ageGroup: '', timeID: null, contributor: user.value?.username || '', contributorName: user.value?.name || '' }) }
const removeAthlete = (i: number) => { if (mine(draft.value.athletes[i])) draft.value.athletes.splice(i, 1) }
// 이름을 손으로 고치면 잡아 둔 기록과 어긋나므로 그 선수의 timeID·ageGroup 을 비운다
const onNameInput = (a: Athlete) => { a.timeID = null; a.ageGroup = '' }
// 영법·성별·거리를 바꾸면 모든 선수의 기록 연결이 어긋난다
const onClassChange = () => { draft.value.athletes.filter(mine).forEach(onNameInput); closeFind() }

const close = () => { if (!saving.value && !deleting.value) emit('close') }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
// 행이 들어오면 열림 — 값을 채우고, 열려 있는 동안만 ESC 리스너를 건다
watch(() => props.row, (r) => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onKey)
  if (!r) return
  draft.value = {
    discipline: r.discipline ?? '', gender: r.gender ?? '', distance: r.distance ?? '',
    athletes: athletesOf(r), type: r.type ?? '',
    caption: r.translations?.ko?.caption ?? '',
  }
  findQ.value = ''
  msg.value = ''
  closeFind()
  window.addEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey) })

const onSave = async () => {
  const r = props.row
  if (!r?._id || saving.value) return
  saving.value = true; msg.value = ''
  try {
    // 직접 입력한 이름·팀은 NFC 로 맞춘다 (자모분리면 times.name_unique 와 어긋난다)
    const body = {
      discipline: draft.value.discipline, gender: draft.value.gender, distance: draft.value.distance,
      // 이름이 빈 줄은 뺀다. 서버가 첫 번째 선수를 name·team·ageGroup·timeID 에도 써 둔다
      athletes: draft.value.athletes
        .map((a) => ({ name: a.name.normalize('NFC').trim(), team: a.team.normalize('NFC').trim(), ageGroup: a.ageGroup, timeID: a.timeID ?? '' }))
        .filter((a) => a.name),
      type: draft.value.type, caption: draft.value.caption.trim(),
    }
    // 폴더별 가져오기 사진은 이름이 비어 있을 수 있다 — 빈 이름 저장을 허용한다
    const res = await $fetch<any>(`/api/images/${r._id}`, { method: 'PUT', body: { ...body, allowEmptyName: true } })
    // 카드에 즉시 반영(같은 객체 참조)
    r.name = res.name; r.team = res.team; r.type = res.type
    r.timeID = res.timeID; r.ageGroup = res.ageGroup; r.athletes = res.athletes || []
    r.discipline = res.discipline; r.gender = res.gender; r.distance = res.distance
    // 저장한 사람 — 서버가 로그인 계정으로 기록한다
    r.contributor = res.contributor; r.contributorName = res.contributorName; r.updatedAt = res.updatedAt
    r.translations = { ...(r.translations || {}), ko: { ...(r.translations?.ko || {}), caption: res.caption ?? body.caption } }
    emit('saved', r)
  } catch (err: any) {
    msg.value = '저장 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    saving.value = false
  }
}

const onDelete = async () => {
  const r = props.row
  if (!r?._id || deleting.value) return
  if (!confirm(`'${r.filename}' 이미지를 삭제하시겠습니까?\n원본·썸네일 파일도 함께 삭제됩니다.`)) return
  deleting.value = true; msg.value = ''
  try {
    await $fetch(`/api/images/${r._id}`, { method: 'DELETE' })
    emit('deleted', r)
  } catch (err: any) {
    msg.value = '삭제 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="row" class="im">
    <div class="im-ov" @click="close" />
    <div class="im-box" role="dialog" aria-modal="true" aria-label="이미지 상세">
      <!-- 머리줄 — 파일명 -->
      <header class="im-head">
        <h2 class="im-file">{{ row.filename }}</h2>
        <button class="im-x" type="button" aria-label="닫기" @click="close">×</button>
      </header>
      <div class="im-body">
        <div class="im-left">
          <!-- 영법 · 성별 · 거리 — 한 줄 -->
          <div class="fld-row fld-row3">
            <label class="fld">
              <span class="info-l">영법</span>
              <select v-model="draft.discipline" class="fld-input" @change="onClassChange">
                <option value="">—</option>
                <option v-for="d in withCur(Object.keys(DISC_KO), draft.discipline)" :key="d" :value="d">{{ DISC_KO[d] || d }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">성별</span>
              <select v-model="draft.gender" class="fld-input" @change="onClassChange">
                <option value="">—</option>
                <option v-for="g in withCur(GENDER_OPTS, draft.gender)" :key="g" :value="g">{{ GENDER_KO[g] || g }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">거리</span>
              <select v-model="draft.distance" class="fld-input" @change="onClassChange">
                <option value="">—</option>
                <option v-for="d in withCur(DIST_OPTS, draft.distance)" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
          </div>
          <div class="im-img"><img :src="row.thumbnail || row.url" :alt="row.filename"></div>
          <!-- 저장한 사람 · 저장 시각 (표시만) — 이미지 아래 -->
          <div class="fld-row fld-row2 im-meta">
            <div class="fld">
              <span class="info-l">contributor</span>
              <span class="meta-v">{{ row.contributorName || row.contributor || '—' }}</span>
            </div>
            <div class="fld">
              <span class="info-l">updatedAt</span>
              <span class="meta-v">{{ fmtTime(row.updatedAt) || '—' }}</span>
            </div>
          </div>
        </div>
        <div class="im-side">
          <!-- 선수 — 여러 명이 찍힌 사진은 선수마다 한 줄. 각자 자기 기록(timeID)에 붙는다 -->
          <div class="fld">
            <span class="info-l">선수<template v-if="draft.athletes.length"> {{ draft.athletes.length }}명</template></span>
            <div v-if="draft.athletes.length" class="ath-list">
              <div v-for="(a, i) in draft.athletes" :key="i" class="ath-row">
                <input v-model="a.name" class="fld-input ath-name" type="text" placeholder="선수명" aria-label="선수명" :disabled="!mine(a)" @input="onNameInput(a)">
                <input v-model="a.team" class="fld-input ath-team" type="text" placeholder="소속" aria-label="소속" :disabled="!mine(a)">
                <span class="ath-link" :class="{ none: !a.timeID }" :title="a.timeID ? `timeID ${a.timeID}` : '기록에 연결되지 않았습니다'">
                  {{ a.timeID ? (a.ageGroup || a.timeID) : '미연결' }}
                </span>
                <!-- 고른 사람 — 남이 고른 선수는 뺄 수 없다 -->
                <span class="ath-by" :title="`선택한 사람: ${a.contributorName || a.contributor || '기록 없음'}`">{{ a.contributorName || a.contributor || '' }}</span>
                <button v-if="mine(a)" class="ath-x" type="button" aria-label="선수 빼기" title="빼기" @click="removeAthlete(i)">×</button>
                <span v-else class="ath-x ath-lock" title="다른 사람이 선택한 선수는 뺄 수 없습니다">·</span>
              </div>
            </div>
            <p v-else class="ath-empty">아직 고른 선수가 없습니다. 아래에서 찾아 추가하세요.</p>
            <div class="name-ctl">
              <input v-model="findQ" class="fld-input" type="search" placeholder="선수 찾기 — 이름 일부 (비우면 전체)" aria-label="선수 찾기" @keydown.enter.prevent="findAthletes">
              <button
                class="find-btn" type="button" :class="{ on: findOpen }" :disabled="findLoading"
                aria-label="선수 찾기" title="같은 대회·영법·성별·거리에서, 검색 칸의 글자가 들어간 선수 찾기" @click="findAthletes"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </button>
              <button class="add-btn" type="button" title="기록 없이 선수를 직접 적습니다" @click="addBlank">직접 추가</button>
            </div>
            <!-- 선수 찾기 결과 — 누르면 선수 목록에 추가(다시 누르면 빠짐). 여러 명을 이어서 고를 수 있다 -->
            <div v-if="findOpen" class="find-panel">
              <!-- 머리줄 — 스크롤해도 위에 붙어 있다 -->
              <div class="find-head">
                <span>{{ findLoading ? '' : `${findRows.length}명` }}</span>
                <button class="find-close" type="button" @click="closeFind">닫기</button>
              </div>
              <p v-if="findLoading" class="find-msg">조회 중…</p>
              <p v-else-if="findMsg" class="find-msg">{{ findMsg }}</p>
              <template v-else>
                <button
                  v-for="t in findRows" :key="t.timeID ?? t._id" class="find-row" type="button"
                  :class="{ cur: isAdded(t) }" @click="pickAthlete(t)"
                >
                  <span class="fr-chk">{{ isAdded(t) ? '✓' : '' }}</span>
                  <b>{{ nuOf(t) }}</b>
                  <span class="fr-team">{{ t.team }}</span>
                  <span class="fr-meta">{{ [t.ageGroup, t.round, t.time].filter(Boolean).join(' · ') }}</span>
                </button>
              </template>
            </div>
          </div>
          <label class="fld">
            <span class="info-l">장면 (type)</span>
            <select v-model="draft.type" class="fld-input">
              <option v-for="t in TYPE_OPTS" :key="t" :value="t">{{ t ? (TYPE_KO[t] ? `${TYPE_KO[t]}(${t})` : t) : '—' }}</option>
            </select>
          </label>
          <label class="fld fld-grow">
            <span class="info-l">caption</span>
            <textarea v-model="draft.caption" class="fld-input fld-area" rows="5" placeholder="사진 설명" />
          </label>
          <div class="im-foot">
            <button class="btn btn-danger" type="button" :disabled="deleting || saving" @click="onDelete">
              {{ deleting ? '삭제 중…' : '삭제' }}
            </button>
            <span class="foot-msg">{{ msg }}</span>
            <button class="btn btn-primary" type="button" :disabled="saving || deleting" @click="onSave">
              {{ saving ? '저장 중…' : '저장' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 상세 모달 — 왼쪽 썸네일, 오른쪽 정보·편집 */
.im { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--sans); }
.im-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .5); }
.im-box {
  position: relative; display: flex; flex-direction: column; width: min(900px, 100%); max-height: 100%;
  background: var(--paper); border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(26, 26, 26, .25);
}
.im-head { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 20px; border-bottom: 1px solid var(--line); }
.im-body { flex: 1 1 auto; min-height: 0; display: flex; }
.im-left { flex: 0 0 380px; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--paper-deep); overflow-y: auto; }
.im-x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 24px; line-height: 1; color: var(--ink-light); padding: 0; }
.im-x:hover { color: var(--ink); }
.im-img { display: flex; align-items: center; justify-content: center; }
.im-img img { display: block; max-width: 100%; max-height: 56vh; object-fit: contain; }
.im-side { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 20px; overflow-y: auto; }
.im-file { flex: 1; min-width: 0; margin: 0; font-family: var(--mono); font-size: 13px; font-weight: 500; color: var(--ink); word-break: break-all; }
.meta-v { font-size: 13.5px; color: var(--ink); font-variant-numeric: tabular-nums; word-break: break-all; }
/* 한 줄에 여러 필드 */
.fld-row { display: grid; gap: 10px; }
.fld-row3 { grid-template-columns: 1.3fr 1fr 1fr; }
.fld-row2 { grid-template-columns: 1.4fr 1fr; }
.fld { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fld-grow { flex: 1; }
.fld-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 11px; width: 100%;
}
.fld-input:focus { outline: none; border-color: var(--orange); }
.fld-area { resize: vertical; line-height: 1.55; min-height: 96px; }
.info-l { font-size: 11.5px; color: var(--ink-light); }
/* 선수 목록 — 한 줄에 이름 · 소속 · 기록 연결 · 빼기 */
.ath-list { display: flex; flex-direction: column; gap: 6px; }
.ath-row { display: flex; align-items: center; gap: 6px; }
.ath-row .ath-name { flex: 1 1 0; min-width: 0; font-weight: 600; }
.ath-row .ath-team { flex: 1 1 0; min-width: 0; }
.ath-link { flex: 0 0 auto; min-width: 58px; text-align: center; font-size: 11.5px; font-weight: 600; color: var(--orange); white-space: nowrap; }
.ath-link.none { color: var(--ink-light); font-weight: 400; }
.ath-x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 17px; line-height: 1; color: var(--ink-light); padding: 2px 4px; }
.ath-x:hover { color: var(--bad); }
.ath-by { flex: 0 0 auto; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--ink-light); }
.ath-lock { cursor: default; text-align: center; }
.ath-lock:hover { color: var(--ink-light); }
.ath-row .fld-input:disabled { background: var(--paper-deep); color: var(--ink-mute); }
.ath-empty { margin: 0; font-size: 12.5px; color: var(--ink-light); }
.add-btn {
  flex: 0 0 auto; height: 36px; padding: 0 10px; font-family: var(--sans); font-size: 12.5px; color: var(--ink-mute); cursor: pointer; white-space: nowrap;
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px;
}
.add-btn:hover { border-color: var(--orange); color: var(--orange); }
.find-row .fr-chk { flex: 0 0 12px; color: var(--orange); font-weight: 700; }
/* 선수 찾기 */
.name-ctl { display: flex; align-items: center; gap: 6px; }
.name-ctl .fld-input { flex: 1; min-width: 0; }
.find-btn {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px;
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; color: var(--ink-light); cursor: pointer;
}
.find-btn svg { width: 16px; height: 16px; }
.find-btn:hover, .find-btn.on { border-color: var(--orange); color: var(--orange); }
.find-panel { position: relative; display: flex; flex-direction: column; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); }
.find-head {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between;
  padding: 5px 6px 5px 12px; font-size: 11.5px; color: var(--ink-light); background: var(--paper-deep); border-bottom: 1px solid var(--line);
}
.find-close { font-family: var(--sans); font-size: 12px; color: var(--ink); cursor: pointer; background: var(--paper); border: 1px solid var(--line); border-radius: 5px; padding: 3px 10px; }
.find-close:hover { border-color: var(--orange); color: var(--orange); }
.find-msg { margin: 0; padding: 10px 12px; font-size: 12.5px; color: var(--ink-mute); }
.find-row {
  display: flex; align-items: baseline; gap: 8px; text-align: left; cursor: pointer;
  font-family: var(--sans); font-size: 13px; color: var(--ink);
  background: none; border: none; border-bottom: 1px solid var(--line-soft); padding: 8px 12px;
}
.find-row:last-child { border-bottom: none; }
.find-row:hover { background: var(--paper-deep); }
.find-row.cur { box-shadow: inset 2px 0 0 var(--orange); }
.find-row .fr-team { color: var(--orange); font-weight: 600; }
.find-row .fr-meta { margin-left: auto; font-size: 11.5px; color: var(--ink-light); white-space: nowrap; }
.im-foot { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.foot-msg { flex: 1; font-size: 12px; color: var(--bad); }
/* 공개 사이트에는 전역 버튼 스타일이 없어 여기서 정의한다 */
.btn { font-family: var(--sans); font-size: 13.5px; font-weight: 500; border: 1px solid transparent; border-radius: 6px; padding: 8px 16px; cursor: pointer; }
.btn-primary { background: var(--orange); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--orange-deep); }
.btn-danger { background: var(--bad-bg); color: var(--bad); }
.btn-danger:hover:not(:disabled) { background: var(--bad); color: #fff; }
.btn:disabled { opacity: .5; cursor: default; }
/* 좁은 화면 — 위아래로 쌓는다 */
@media (max-width: 820px) {
  .im-body { flex-direction: column; overflow-y: auto; }
  .im-left { flex: 0 0 auto; overflow: visible; }
  .im-img img { max-height: 40vh; }
  .im-side { flex: 0 0 auto; overflow: visible; }
}
</style>
