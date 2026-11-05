<script setup lang="ts">
// 이미지 상세 모달 — 공개 사이트 images 페이지의 카드 클릭 모달. 대시보드 Images Dir(imagesPage)의 모달과 같은 구성.
//   머리줄(파일명) · 왼쪽: 썸네일 + 저장한 사람/시각 · 오른쪽: 선수 목록(+선수 찾기) · 장면 · 영법/성별 · 캡션 · 삭제/저장
// 저장·삭제는 서버가 로그인(세션 쿠키)을 요구한다. 저장하면 서버가 updatedAt 과 contributor(로그인 계정)를 남긴다.
import { computed, ref, watch } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{ (e: 'uncheck', id: string): void; (e: 'close'): void; (e: 'saved', row: any): void; (e: 'deleted', row: any): void }>()

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const GENDER_OPTS = ['men', 'women', 'mixed']
const TYPE_OPTS = ['', 'ENTER', 'BLOCK', 'START', 'RACE', 'TOUCHPAD', 'CEREMONY', 'EXIT', 'WALK', 'TEAM']
// 화면에는 한국어 설명만 보여주고, 저장 값은 기존 영문 코드를 유지한다.
const TYPE_KO: Record<string, string> = {
  ENTER: '입장 중',
  BLOCK: '블럭에 오르기 전 또는 오른 후',
  START: '스타트 (블럭에서 발이 떨어진 상태)',
  RACE: '경기중&역영중',
  TOUCHPAD: '터치패드를 찍는 중 또는 닿은 후의 장면',
  CEREMONY: '세레모니를 하는 장면',
  EXIT: '퇴수하는 장면',
  WALK: '물 밖에서 걸어나가는 장면',
  TEAM: '단체사진',
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
// 여러 장 모드 — 선택한 사진 목록. 필요 없는 사진은 썸네일의 × 로 뺀다
const bulkRows = ref<any[]>([])
const dropBulk = (img: any) => {
  bulkRows.value = bulkRows.value.filter((x) => x !== img)
  emit('uncheck', String(img._id))
  if (!bulkRows.value.length) emit('close')
}
const hasGender = computed(() => Boolean(String(draft.value.gender || '').trim()))
// 선수 찾기는 성별만 고르면 쓸 수 있다(영법은 '—' 여도 된다 — 수영 중 사진이 아닐 수 있다). 성별이 없으면 회색으로 비활성 표시
const canFind = computed(() => hasGender.value)
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
// 영법·성별은 값이 있어도 항상 고칠 수 있다 (서버도 허용한다)
const locked = (_k: 'discipline' | 'gender') => false
const mine = (a: Athlete) => !a.contributor || a.contributor === user.value?.username || (user.value?.can || []).includes('users')
// updatedAt → KST "yyyy-mm-dd hh:mm"
const fmtTime = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}
// 파일명 앞의 YYYYMMDD_HHMMSS 를 촬영 시각으로 표시한다.
const capturedAt = computed(() => {
  const match = String(props.row?.filename || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!match) return ''
  const [, ys, mos, ds, hs, mis, ss] = match
  const [year, month, day, hour, minute, second] = [ys, mos, ds, hs, mis, ss].map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second
  ) return ''
  const period = hour < 12 ? '오전' : '오후'
  const displayHour = hour % 12 || 12
  return `${year}년 ${month}월 ${day}일 ${period} ${displayHour}시 ${minute}분 ${second}초에 촬영된 사진`
})
const saving = ref(false)
const deleting = ref(false)
const msg = ref('')
const saveConfirmed = ref(true)
const onConfirmChange = () => { if (saveConfirmed.value) msg.value = '' }

// ── 선수 찾기 — 같은 (대회 · 영법 · 성별 · 거리) 의 기록 중 검색 칸의 글자가 들어간 선수 ──
const findQ = ref('')
const findOpen = ref(false)
const findLoading = ref(false)
const findRows = ref<any[]>([])
const findMsg = ref('')
const addingAthlete = ref(false)
const identificationDirty = ref(false)
const pendingIdentifier = computed(() => identificationDirty.value ? (user.value?.name || user.value?.username || '') : '')
const closeFind = () => { findOpen.value = false; findRows.value = []; findMsg.value = '' }
const openAthleteSearch = () => {
  addingAthlete.value = true
  findQ.value = ''
  closeFind()
}
// times.name_unique 는 배열이다 — 개인은 ["홍길동1"], 계영은 멤버 명단. images.name 은 이를 콤마로 이은 값.
const nuOf = (t: any) => (Array.isArray(t?.name_unique) ? t.name_unique.join(',') : String(t?.name_unique ?? t?.name ?? ''))
const findAthletes = async () => {
  const r = props.row
  if (!r) return
  if (!hasGender.value) {
    closeFind()
    findMsg.value = '성별을 먼저 선택해 주세요.'
    return
  }
  const q = findQ.value.normalize('NFC').trim()
  findOpen.value = true; findLoading.value = true; findMsg.value = ''
  try {
    const d = draft.value
    const params = {
      competitionID: r.competitionID ?? '', discipline: d.discipline,
      gender: d.gender, distance: d.distance, q: q || undefined,
    }
    const res = await $fetch<any[]>('/api/times/athlete-options', { params })
    findRows.value = (res || [])
      .sort((a, b) => String(a.unique || nuOf(a)).localeCompare(String(b.unique || nuOf(b)), 'ko', { numeric: true }))
    if (!findRows.value.length) {
      findMsg.value = q
        ? `같은 성별${d.discipline ? '·영법' : ''}${d.distance ? '·거리' : ''}에 '${q}' 가 들어간 선수가 없습니다.`
        : '이 대회에 같은 조건의 기록이 없습니다.'
    }
  } catch (err: any) {
    findRows.value = []
    findMsg.value = '조회 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    findLoading.value = false
  }
}
const eventLabel = (event: any) => {
  const eventName = [DISC_KO[event?.discipline] || event?.discipline, event?.distance].filter(Boolean).join(' ')
  return eventName && event?.time ? `${eventName} - ${event.time}` : eventName
}
const eventLabels = (t: any) => [...new Set<string>((t?.events || []).map(eventLabel).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
// 이미 목록에 있는 기록인가 (찾기 결과에 표시 · 중복 추가 방지)
const isAdded = (t: any) => draft.value.athletes.some((a) => (t.timeID != null ? a.timeID === t.timeID : a.name === nuOf(t)))
// 고르면 선수 목록에 추가한다 — 이름·팀과 함께 그 기록의 timeID·ageGroup 을 잡아 둔다.
// 선택이 끝나면 검색 UI를 닫고, 선택 선수를 빼면 빈 검색 입력이 다시 나타난다.
const pickAthlete = (t: any) => {
  if (!hasGender.value) return
  identificationDirty.value = true
  if (isAdded(t)) {
    // 다시 누르면 뺀다 — 내가 고른 선수만
    draft.value.athletes = draft.value.athletes.filter((a) => !(t.timeID != null ? a.timeID === t.timeID : a.name === nuOf(t)) || !mine(a))
    return
  }
  draft.value.athletes.push({ name: nuOf(t), team: t.team || '', ageGroup: t.ageGroup || '', timeID: t.timeID ?? null, contributor: user.value?.username || '', contributorName: user.value?.name || '' })
  addingAthlete.value = false
  findQ.value = ''
  closeFind()
}
const removeAthlete = (i: number) => {
  if (!mine(draft.value.athletes[i])) return
  identificationDirty.value = true
  draft.value.athletes.splice(i, 1)
  if (!draft.value.athletes.length) {
    addingAthlete.value = false
    findQ.value = ''
    closeFind()
  }
}
// 이름을 손으로 고치면 잡아 둔 기록과 어긋나므로 그 선수의 timeID·ageGroup 을 비운다
const onNameInput = (a: Athlete) => { identificationDirty.value = true; a.timeID = null; a.ageGroup = '' }
const onTeamInput = () => { identificationDirty.value = true }
// 영법·성별을 바꾸면 모든 선수의 기록 연결이 어긋난다
const onClassChange = () => {
  addingAthlete.value = false
  if (!hasGender.value) {
    if (draft.value.athletes.length) identificationDirty.value = true
    draft.value.athletes = []
    findQ.value = ''
  } else {
    draft.value.athletes.filter(mine).forEach(onNameInput)
  }
  closeFind()
}

const close = () => { if (!saving.value && !deleting.value) emit('close') }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
// 행이 들어오면 열림 — 값을 채우고, 열려 있는 동안만 ESC 리스너를 건다
watch(() => props.row, (r) => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onKey)
  if (!r) return
  bulkRows.value = r._bulk ? [...r._rows] : []
  draft.value = r._bulk
    ? { discipline: '', gender: '', distance: '', athletes: [], type: '', caption: '' }
    : {
      discipline: r.discipline ?? '', gender: r.gender ?? '', distance: r.distance ?? '',
      athletes: String(r.gender ?? '').trim() ? athletesOf(r) : [], type: r.type ?? '',
      caption: r.translations?.ko?.caption ?? '',
    }
  findQ.value = ''
  addingAthlete.value = false
  msg.value = ''
  saveConfirmed.value = true
  identificationDirty.value = false
  closeFind()
  window.addEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey) })

const onSave = async () => {
  const r = props.row
  if (!r?._id || saving.value) return
  if (!saveConfirmed.value) {
    msg.value = '확인 문구에 체크해야 저장할 수 있습니다.'
    return
  }
  saving.value = true; msg.value = ''
  if (r._bulk) {
    // 여러 장 한번에 — 영법·성별·거리·선수만 같은 값으로 저장한다(장면·캡션은 건드리지 않는다)
    try {
      const body = {
        discipline: draft.value.discipline, gender: draft.value.gender, distance: draft.value.distance,
        athletes: (hasGender.value ? draft.value.athletes : [])
          .map((a) => ({ name: a.name.normalize('NFC').trim(), team: a.team.normalize('NFC').trim(), ageGroup: a.ageGroup, timeID: a.timeID ?? '' }))
          .filter((a) => a.name),
        allowEmptyName: true,
      }
      const failed: string[] = []
      for (const img of bulkRows.value) {
        try {
          const res = await $fetch<any>(`/api/images/${img._id}`, { method: 'PUT', body })
          img.name = res.name; img.team = res.team; img.timeID = res.timeID; img.ageGroup = res.ageGroup
          img.athletes = res.athletes || []; img.discipline = res.discipline; img.gender = res.gender; img.distance = res.distance
          img.contributor = res.contributor; img.contributorName = res.contributorName; img.updatedAt = res.updatedAt
        } catch { failed.push(img.filename) }
      }
      if (failed.length) msg.value = `${failed.length}장은 저장하지 못했습니다.`
      else emit('saved', r)
    } finally {
      saving.value = false
    }
    return
  }
  try {
    // 직접 입력한 이름·팀은 NFC 로 맞춘다 (자모분리면 times.name_unique 와 어긋난다)
    const body = {
      discipline: draft.value.discipline, gender: draft.value.gender, distance: draft.value.distance,
      // 이름이 빈 줄은 뺀다. 서버가 첫 번째 선수를 name·team·ageGroup·timeID 에도 써 둔다
      athletes: (hasGender.value ? draft.value.athletes : [])
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
    saveConfirmed.value = true
    identificationDirty.value = false
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
        <div class="im-title">
          <h2 class="im-file">{{ row._bulk ? `선택한 ${bulkRows.length}장 사진 한번에 식별하기` : row.filename }}</h2>
          <p v-if="capturedAt" class="im-captured">{{ capturedAt }}</p>
        </div>
        <button class="im-x" type="button" aria-label="닫기" @click="close">×</button>
      </header>
      <div class="im-body">
        <div class="im-left">
          <div v-if="row._bulk" class="im-multi">
            <div v-for="img in bulkRows" :key="img._id" class="im-multi-item">
              <img :src="img.thumbnail || img.url" :alt="img.filename" loading="lazy">
              <button class="im-multi-x" type="button" aria-label="선택 취소" title="선택 취소" @click="dropBulk(img)">×</button>
            </div>
          </div>
          <div v-else class="im-img"><img :src="row.thumbnail || row.url" :alt="row.filename"></div>
          <!-- 저장한 사람 · 저장 시각 (표시만) — 이미지 아래 -->
          <div v-if="!row._bulk" class="fld-row fld-row2 im-meta">
            <div class="fld">
              <span class="info-l">식별한 사람</span>
              <span v-if="pendingIdentifier" class="meta-v meta-pending">{{ pendingIdentifier }}(이대로 저장 할 경우 적용 됩니다)</span>
              <span v-else class="meta-v">{{ row.contributorName || row.contributor || '식별되지않음' }}</span>
            </div>
            <div class="fld">
              <span class="info-l">최근 저장된 일시</span>
              <span class="meta-v">{{ fmtTime(row.updatedAt) || '—' }}</span>
            </div>
          </div>
        </div>
        <div class="im-side">
          <!-- 영법 · 성별 먼저 — 이 둘을 골라야 선수를 찾을 수 있다 -->
          <div class="fld-row fld-row2">
            <label class="fld">
              <span class="info-l">영법</span>
              <select v-model="draft.discipline" class="fld-input" :disabled="locked('discipline')" @change="onClassChange">
                <option value="">—</option>
                <option v-for="d in withCur(Object.keys(DISC_KO), draft.discipline)" :key="d" :value="d">{{ DISC_KO[d] || d }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">성별</span>
              <select v-model="draft.gender" class="fld-input" :disabled="locked('gender')" @change="onClassChange">
                <option value="">—</option>
                <option v-for="g in withCur(GENDER_OPTS, draft.gender)" :key="g" :value="g">{{ GENDER_KO[g] || g }}</option>
              </select>
            </label>
          </div>
          <!-- 선수 — 여러 명이 찍힌 사진은 선수마다 한 줄. 각자 자기 기록(timeID)에 붙는다 -->
          <div class="fld" :class="{ 'fld-off': !canFind }">
            <span class="info-l">선수 찾기</span>
            <div v-if="draft.athletes.length" class="ath-list">
              <div v-for="(a, i) in draft.athletes" :key="i" class="ath-row">
                <input v-model="a.name" class="fld-input ath-name" type="text" placeholder="선수명" aria-label="선수명" :disabled="!mine(a)" @input="onNameInput(a)">
                <input v-model="a.team" class="fld-input ath-team" type="text" placeholder="소속" aria-label="소속" :disabled="!mine(a)" @input="onTeamInput">
                <button v-if="mine(a)" class="ath-x" type="button" aria-label="선수 빼기" title="빼기" @click="removeAthlete(i)">×</button>
                <span v-else class="ath-x ath-lock" title="다른 사람이 선택한 선수는 뺄 수 없습니다">·</span>
                <button
                  v-if="i === draft.athletes.length - 1" class="ath-x ath-add" type="button"
                  aria-label="선수 추가" title="선수 추가" @click="openAthleteSearch"
                >+</button>
              </div>
            </div>
            <template v-if="!draft.athletes.length || addingAthlete">
              <div class="name-ctl">
                <input v-model="findQ" class="fld-input" type="search" placeholder="선수 찾기 — 이름 일부 (비우면 전체)" aria-label="선수 찾기" :disabled="!canFind" @keydown.enter.prevent="findAthletes">
                <button
                  class="find-btn" type="button" :class="{ on: findOpen }" :disabled="findLoading || !canFind"
                  aria-label="선수 찾기" title="같은 대회·영법·성별·거리에서, 검색 칸의 글자가 들어간 선수 찾기" @click="findAthletes"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                </button>
              </div>
              <!-- 선수 찾기 결과 — 선수를 고르면 검색 UI 전체를 닫는다. -->
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
                    v-for="t in findRows" :key="t.unique" class="find-row" type="button"
                    :class="{ cur: isAdded(t) }" @click="pickAthlete(t)"
                  >
                    <span class="fr-chk">{{ isAdded(t) ? '✓' : '' }}</span>
                    <span class="fr-person">
                      <b>{{ t.name || nuOf(t) }}</b>
                      <span>{{ t.team || '팀 정보 없음' }}</span>
                      <span>{{ GENDER_KO[t.gender] || t.gender || '성별 정보 없음' }}</span>
                      <span>{{ t.group || t.ageGroup || '그룹 정보 없음' }}</span>
                      <span class="fr-events">{{ eventLabels(t).join(' · ') || '출전 종목 정보 없음' }}</span>
                    </span>
                  </button>
                </template>
              </div>
            </template>
          </div>
          <label v-if="!row._bulk" class="fld">
            <span class="info-l">어떤 장면인가요?</span>
            <select v-model="draft.type" class="fld-input">
              <option v-for="t in TYPE_OPTS" :key="t" :value="t">{{ t ? (TYPE_KO[t] || t) : '—' }}</option>
            </select>
          </label>
          <!-- caption 입력은 당분간 숨긴다. 기존 값은 draft에 보존해 저장 시 지워지지 않게 한다. -->
          <label class="save-confirm">
            <input v-model="saveConfirmed" type="checkbox" @change="onConfirmChange">
            <span>이 사진을 식별한 사람으로 내 이름이 공개적으로 저장되며, 내가 식별한 내용이 사진과 실제 기사와 연결 됨을 확인 함.</span>
          </label>
          <div class="im-foot">
            <button v-if="!row._bulk && (user?.can || []).includes('delete')" class="btn btn-danger" type="button" :disabled="deleting || saving" @click="onDelete">
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
/* 상세 모달 — 메인 페이지의 종이·서체·선 중심 디자인 시스템을 그대로 사용한다. */
.im { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--serif); }
.im-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); }
.im-box {
  position: relative; display: flex; flex-direction: column; width: min(960px, 100%); max-height: 100%;
  background: var(--paper); border: none; border-radius: 0; overflow: hidden;
  box-shadow: 0 18px 50px rgba(26, 26, 26, .18);
}
.im-head { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.im-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.im-body { flex: 1 1 auto; min-height: 0; display: flex; }
.im-left { flex: 0 0 400px; min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 20px; border-right: 1px solid var(--line); background: var(--paper); overflow-y: auto; }
.im-x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 24px; line-height: 1; color: var(--ink-light); padding: 0; }
.im-x:hover { color: var(--orange-deep); }
.im-multi { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; max-height: 62vh; overflow-y: auto; }
.im-multi-item { position: relative; aspect-ratio: 4 / 3; background: var(--paper-deep); }
.im-multi-item img { display: block; width: 100%; height: 100%; object-fit: cover; }
.im-multi-x {
  position: absolute; top: 4px; right: 4px; display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%;
  background: rgba(26, 26, 26, .6); color: #fff; font-size: 15px; line-height: 1; cursor: pointer;
}
.im-multi-x:hover { background: var(--bad); }
.im-img { display: flex; align-items: center; justify-content: center; background: var(--paper-deep); }
.im-img img { display: block; max-width: 100%; max-height: 56vh; object-fit: contain; }
.im-side { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 22px; overflow-y: auto; }
.im-file { margin: 0; font-family: var(--mono); font-size: 13px; font-weight: 500; color: var(--ink); word-break: break-all; }
.im-captured { margin: 0; font-size: 12px; line-height: 1.5; color: var(--ink-light); }
.meta-v { font-size: 13px; line-height: 1.55; color: var(--ink); font-variant-numeric: tabular-nums; word-break: break-all; }
.meta-pending { color: var(--ink-light); }
/* 한 줄에 여러 필드 */
.fld-row { display: grid; gap: 14px; }
.fld-row2 { grid-template-columns: 1.4fr 1fr; }
.fld { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fld-input {
  font-family: var(--serif); font-size: 13.5px; line-height: 1.5; color: var(--ink);
  width: 100%; height: 39px; box-sizing: border-box; padding: 8px 10px;
  background: var(--paper); border: 1px solid var(--line); border-radius: 0;
}
.fld-input:focus { outline: none; border-color: var(--ink-light); box-shadow: inset 0 -2px 0 var(--orange); }
.info-l { font-family: var(--sans); font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--ink-mute); }
/* 선수 목록 — 한 줄에 이름 · 소속 · 기록 연결 · 빼기 */
.ath-list { display: flex; flex-direction: column; gap: 8px; }
.ath-row { display: flex; align-items: center; gap: 6px; }
.ath-row .ath-name { flex: 1 1 0; min-width: 0; font-weight: 600; }
.ath-row .ath-team { flex: 1 1 0; min-width: 0; }
.ath-x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 17px; line-height: 1; color: var(--ink-light); padding: 2px 4px; }
.ath-x:hover { color: var(--bad); }
.ath-add { font-size: 20px; }
.ath-add:hover { color: var(--orange-deep); }
.ath-lock { cursor: default; text-align: center; }
.ath-lock:hover { color: var(--ink-light); }
.ath-row .fld-input:disabled { background: var(--paper-deep); color: var(--ink-mute); }
.fld-off .fld-input, .fld-off .find-btn { opacity: .62; }
.fld-off .fld-input, .fld-off .find-btn { background: #e6e4e1; cursor: not-allowed; }
.ath-empty { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-light); }
.find-row .fr-chk { flex: 0 0 12px; color: var(--orange); font-weight: 700; }
/* 선수 찾기 */
.name-ctl { display: flex; align-items: stretch; gap: 6px; }
.name-ctl .fld-input { flex: 1; min-width: 0; }
.find-btn {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  width: 39px; height: 39px; box-sizing: border-box; padding: 8px 10px;
  background: var(--paper); border: 1px solid var(--line); border-radius: 0; color: var(--ink-light); cursor: pointer;
}
.find-btn svg { width: 16px; height: 16px; }
.find-btn:hover, .find-btn.on { border-color: var(--ink-light); color: var(--orange-deep); }
.find-panel { position: relative; display: flex; flex-direction: column; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 0; background: var(--paper); }
.find-head {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between;
  padding: 5px 6px 5px 12px; font-size: 11.5px; color: var(--ink-light); background: var(--paper-deep); border-bottom: 1px solid var(--line);
}
.find-close { font-family: var(--serif); font-size: 12px; color: var(--ink-mute); cursor: pointer; background: none; border: none; border-bottom: 1px solid transparent; border-radius: 0; padding: 3px 2px; }
.find-close:hover { border-bottom-color: var(--orange); color: var(--ink); }
.find-msg { margin: 0; padding: 10px 12px; font-size: 12.5px; color: var(--ink-mute); }
.find-row {
  display: flex; align-items: baseline; gap: 8px; text-align: left; cursor: pointer;
  font-family: var(--serif); font-size: 13px; color: var(--ink);
  background: none; border: none; border-bottom: 1px solid var(--line-soft); padding: 8px 12px;
}
.find-row:last-child { border-bottom: none; }
.find-row:hover { background: var(--paper-deep); }
.find-row.cur { box-shadow: inset 2px 0 0 var(--orange); }
.fr-person { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
.fr-person > span { color: var(--ink-mute); }
.fr-events { font-size: 11.5px; color: var(--ink-light) !important; line-height: 1.4; }
.save-confirm {
  display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; border: none; border-left: 3px solid var(--orange);
  border-radius: 0; font-family: var(--sans); font-size: 12px; line-height: 1.55; color: var(--ink-mute); cursor: pointer;
  background: var(--paper-deep);
}
.save-confirm input { flex: 0 0 auto; margin: 2px 0 0; accent-color: var(--orange); }
.im-foot { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.im-foot .btn-primary { margin-left: auto; }
.foot-msg { flex: 1; font-size: 12px; color: var(--bad); }
/* 메인 페이지 CTA와 동일하게 각진 2px 골격을 사용한다. */
.btn { font-family: var(--sans); font-size: 13px; font-weight: 700; border: 1px solid transparent; border-radius: 2px; padding: 9px 18px; cursor: pointer; }
.btn-primary { background: var(--orange); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--orange-deep); }
.btn-danger { background: none; border-color: var(--line); color: var(--bad); }
.btn-danger:hover:not(:disabled) { border-color: var(--bad); background: var(--bad-bg); }
.btn:disabled { opacity: .5; cursor: default; }
/* 좁은 화면 — 위아래로 쌓는다 */
@media (max-width: 820px) {
  .im-body { flex-direction: column; overflow-y: auto; }
  .im-left { flex: 0 0 auto; overflow: visible; border-right: none; border-bottom: 1px solid var(--line); }
  .im-img img { max-height: 40vh; }
  .im-side { flex: 0 0 auto; overflow: visible; }
}

@media (max-width: 540px) {
  .im { padding: 0; }
  .im-box { width: 100%; height: 100%; max-height: none; border: none; }
  .im-left, .im-side { padding: 18px; }
  .fld-row2 { grid-template-columns: 1fr; }
}
</style>
