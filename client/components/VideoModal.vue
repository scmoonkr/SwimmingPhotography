<script setup lang="ts">
// 영상 모달 — videoscard 페이지의 카드 클릭 모달. 이미지 모달(ImageEditModal)과 같은 구성에서 사진 자리가 영상이다.
//   머리줄(파일명) · 왼쪽: 영법/성별/거리 + 영상(없으면 올리기) + 저장한 사람/시각 · 오른쪽: 고른 선수 · 부/팀 · 이름 초성(ㄱ…ㅎ·a)으로 선수 고르기 · 캡션 · 삭제/저장
// row 가 { _new: true, competitionID, discipline, gender, distance } 면 '새 영상' — 영상 자리에서 파일을 고르고(미리보기),
//   선수·캡션을 먼저 입력한 뒤 '올리기'를 누른다. 올리면 영상 문서가 만들어지고 입력한 정보가 함께 저장된다(created).
//   row.athletes 로 선수가 이미 정해져 오면(기록표의 올리기) 선수 고르기 없이 영상·캡션만 받는 간단한 화면이 된다.
// 파일은 서버를 거치지 않는다 — 서버에서 올릴 주소를 받아 스토리지로 직접 올린 뒤(진행률 표시) 등록한다.
// 저장·삭제는 서버가 로그인(세션 쿠키)을 요구한다. 저장하면 서버가 updatedAt 과 contributor(로그인 계정)를 남긴다.
import { computed, ref, watch } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{
  (e: 'close'): void; (e: 'saved', row: any): void; (e: 'deleted', row: any): void
  (e: 'created', row: any): void          // 새 영상을 올려 문서가 생겼다(선수·캡션 포함) — 부모가 목록에 넣고 닫는다
}>()
const isNew = computed(() => !!props.row && !props.row._id)
// 간단 올리기 — 선수가 이미 정해진 새 영상(기록표에서 올리기를 누른 경우). 선수·종목을 고를 것이 없으므로
// 머리줄(누구의 어느 종목인지) · 영상 · 캡션 · [다른 영상 선택 / 올리기] 만 보여준다.
const simple = computed(() => isNew.value && Array.isArray(props.row?.athletes) && props.row.athletes.length > 0)
// 머리줄 — name-ageGroup-gender-team-discipline-distance
const simpleTitle = computed(() => {
  const r = props.row
  const a = r?.athletes?.[0] || {}
  return [a.name, a.ageGroup, GENDER_KO[r?.gender] || r?.gender, a.team, DISC_KO[r?.discipline] || r?.discipline, r?.distance].filter(Boolean).join('-')
})
// 용량 한도(MB) — 서버의 VIDEO_MAX_MB. 한 번 받아 두고 쓴다(받기 전·실패 시 500). 최종 검사는 서버가 한다.
const maxMB = useState<number>('videos:maxMB', () => 0)
const MAX_MB = computed(() => maxMB.value || 500)
if (import.meta.client && !maxMB.value) {
  $fetch<any>('/api/videos/config').then((c) => { if (Number(c?.maxMB) > 0) maxMB.value = Number(c.maxMB) }).catch(() => {})
}
const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const GENDER_OPTS = ['men', 'women', 'mixed']
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M']
// 저장된 값이 목록에 없으면(예: 3000M) 그 값도 고를 수 있게 끼워 넣는다
const withCur = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [...opts, cur] : opts)

// 영상 하나에 여러 선수가 찍힐 수 있다 — 선수마다 자기 기록(times)에 따로 붙는다(기록 하나에 영상도 여러 개 붙는다).
// 한 영상의 선수는 모두 같은 종목(영법·성별·거리)이라 종목은 영상에 한 번만 둔다.
// timeID·ageGroup 은 입력칸이 없다 — 선수 찾기에서 고른 기록의 값을 들고 있다가 함께 저장한다.
// contributor — 그 선수를 고른 계정(username). 남이 고른 선수는 빼거나 고칠 수 없다(서버도 막는다).
type Athlete = { name: string; team: string; ageGroup: string; timeID: number | null; contributor?: string; contributorName?: string }
const draft = ref({
  discipline: '', gender: '', distance: '',
  athletes: [] as Athlete[], caption: '',
})
const athletesOf = (r: any): Athlete[] => {
  if (Array.isArray(r?.athletes) && r.athletes.length) {
    return r.athletes.map((a: any) => ({
      name: a.name ?? '', team: a.team ?? '', ageGroup: a.ageGroup ?? '', timeID: a.timeID ?? null,
      contributor: a.contributor ?? '', contributorName: a.contributorName ?? '',
    }))
  }
  return []
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
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round((n || 0) / 1024))}KB`)
const saving = ref(false)
const deleting = ref(false)
const msg = ref('')
// 종목·캡션은 새 영상이거나, 올린 사람·운영진일 때만 고친다 — 그 밖에는 잠근다(서버도 무시한다)
const canMeta = computed(() => {
  const r = props.row
  return !r?._id || !r.uploader || r.uploader === user.value?.username || (user.value?.can || []).includes('data')
})
// 영상 삭제는 올린 사람만(관리자는 모두) — 서버도 같은 규칙으로 막는다
const canDelete = computed(() => {
  const r = props.row
  return !!r?._id && (!r.uploader || r.uploader === user.value?.username || (user.value?.can || []).includes('users'))
})

// ── 올리기 (새 영상) ──
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const progress = ref(0)          // 0~100
const stage = ref('')            // 진행 단계 문구
let xhr: XMLHttpRequest | null = null

// 첫 화면(썸네일) — 영상에서 한 장면을 뽑아 jpeg 로. 브라우저가 못 읽는 코덱이면 null (썸네일 없이 올린다)
const makePoster = (file: File): Promise<Blob | null> => new Promise((resolve) => {
  const url = URL.createObjectURL(file)
  const v = document.createElement('video')
  let done = false
  const finish = (b: Blob | null) => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); resolve(b) }
  const timer = setTimeout(() => finish(null), 8000)
  v.muted = true; v.playsInline = true; v.preload = 'auto'
  v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2) } catch { finish(null) } }
  v.onseeked = () => {
    try {
      const max = 480
      const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(v.videoWidth * scale)); c.height = Math.max(1, Math.round(v.videoHeight * scale))
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
      c.toBlob((b) => finish(b), 'image/jpeg', 0.8)
    } catch { finish(null) }
  }
  v.onerror = () => finish(null)
  v.src = url
})

// 스토리지로 직접 올리기 — fetch 는 올리는 진행률을 알려주지 않아 XHR 을 쓴다
const putWithProgress = (url: string, file: File, contentType: string) => new Promise<void>((resolve, reject) => {
  xhr = new XMLHttpRequest()
  xhr.open('PUT', url)
  xhr.setRequestHeader('Content-Type', contentType)       // 서버가 서명한 값과 같아야 한다
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100) }
  xhr.onload = () => (xhr && xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`스토리지 업로드 실패 (${xhr?.status})`)))
  xhr.onerror = () => reject(new Error('네트워크 오류로 올리지 못했습니다.'))
  xhr.onabort = () => reject(new Error('취소했습니다.'))
  xhr.send(file)
})

// 새 영상은 '파일 고르기 → 선수·캡션 입력 → 올리기' 순서다. 고른 파일은 올리기 전에 이 기기에서 바로 미리 본다.
const pending = ref<File | null>(null)
const previewUrl = ref('')
const clearPending = () => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  pending.value = null; previewUrl.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
const choose = (file: File | null | undefined) => {
  if (!file || uploading.value) return
  msg.value = ''
  const name = file.name.normalize('NFC')
  if (!VIDEO_RE.test(name)) { msg.value = '영상 파일(mp4·mov·m4v·webm)만 올릴 수 있습니다.'; return }
  if (file.size > MAX_MB.value * 1048576) { msg.value = `영상은 ${MAX_MB.value}MB 까지 올릴 수 있습니다. (이 파일 ${fmtSize(file.size)})`; return }
  clearPending()
  pending.value = file
  previewUrl.value = URL.createObjectURL(file)
}
const onPick = (e: Event) => choose((e.target as HTMLInputElement).files?.[0])
const onDrop = (e: DragEvent) => choose(e.dataTransfer?.files?.[0])
const cancelUpload = () => { xhr?.abort() }
// 올리려면 영상과 선수가 모두 있어야 한다 — 누구의 영상인지 모르는 채로 올라가지 않게
const canUpload = computed(() => !!pending.value && draft.value.athletes.length > 0 && !uploading.value)
const needHint = computed(() => (!pending.value ? '영상을 선택하세요.' : (!draft.value.athletes.length ? '선수를 선택하세요.' : '')))

const upload = async () => {
  const r = props.row
  const file = pending.value
  if (!file || !r || !isNew.value || !canUpload.value) return
  msg.value = ''
  if (!r.competitionID) { msg.value = '대회를 먼저 선택하세요.'; return }
  const name = file.name.normalize('NFC')
  uploading.value = true; progress.value = 0; stage.value = '준비 중…'
  try {
    const pre = await $fetch<any>('/api/videos/presign', {
      method: 'POST',
      body: { competitionID: r.competitionID, filename: name, contentType: file.type || 'video/mp4', size: file.size },
    })
    const poster = await makePoster(file)
    stage.value = '올리는 중'
    await putWithProgress(pre.uploadUrl, file, pre.contentType)
    if (poster) {
      // 썸네일은 실패해도 영상 등록은 계속한다
      await fetch(pre.thumbUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: poster }).catch(() => {})
    }
    stage.value = '등록 중…'
    let v = await $fetch<any>('/api/videos', {
      method: 'POST',
      body: {
        competitionID: r.competitionID, discipline: draft.value.discipline, gender: draft.value.gender, distance: draft.value.distance,
        key: pre.key, thumbKey: poster ? pre.thumbKey : '', filename: name,
      },
    })
    // 미리 입력해 둔 선수·캡션을 이어서 저장한다. 여기서 실패해도 영상은 올라가 있다 — 목록에서 다시 열어 붙이면 된다.
    try {
      v = await $fetch<any>(`/api/videos/${v._id}`, { method: 'PUT', body: saveBody() })
    } catch (err: any) {
      alert('영상은 올라갔지만 선수 정보를 저장하지 못했습니다. 목록에서 영상을 눌러 다시 저장해 주세요.\n' + (err?.data?.error || err?.message || ''))
    }
    clearPending()
    emit('created', v)       // 부모가 목록에 넣고 모달을 닫는다
  } catch (err: any) {
    msg.value = '올리지 못했습니다: ' + (err?.data?.error || err?.message || '')
  } finally {
    uploading.value = false; stage.value = ''; xhr = null
  }
}

// ── 선수 고르기 — 같은 (대회 · 영법 · 성별 · 거리) 의 기록에서, 부·팀으로 좁히고 이름 첫 글자(초성)로 찾는다 ──
// 휴대폰에서 이름을 타이핑하지 않고 누르기만 해서 고를 수 있게 한다.
const pool = ref<any[]>([])            // 이 종목의 기록 전체
const poolLoading = ref(false)
const poolMsg = ref('')
const fAge = ref('')                   // 부(ageGroup)
const fTeam = ref('')                  // 팀
const fInit = ref('')                  // 초성 — 'ㄱ'…'ㅎ', 'a'(한글이 아닌 이름)
const INITIALS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ', 'a']
// 한글 음절의 초성 19자 — 된소리는 예사소리 단추에 묶는다(ㄲ→ㄱ)
const CHO = ['ㄱ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂ', 'ㅅ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const initialOf = (name: string) => {
  const c = String(name || '').trim().normalize('NFC').charCodeAt(0)
  return c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : 'a'
}
// times.name_unique 는 배열이다 — 개인은 ["홍길동1"], 계영은 멤버 명단. videos 의 선수 이름은 이를 콤마로 이은 값.
const nuOf = (t: any) => (Array.isArray(t?.name_unique) ? t.name_unique.join(',') : String(t?.name_unique ?? t?.name ?? ''))
const uniq = (arr: any[]) => [...new Set(arr.filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y), 'ko', { numeric: true }))

const loadPool = async () => {
  const r = props.row
  pool.value = []; poolMsg.value = ''
  if (!r?.competitionID) return
  poolLoading.value = true
  try {
    const d = draft.value
    const params = { competitionID: r.competitionID ?? '', discipline: d.discipline, gender: d.gender, distance: d.distance }
    pool.value = (await $fetch<any[]>('/api/times', { params })) || []
    if (!pool.value.length) poolMsg.value = '이 대회에 같은 영법·성별·거리의 기록이 없습니다.'
  } catch (err: any) {
    poolMsg.value = '선수 목록을 불러오지 못했습니다: ' + (err?.data?.error || err?.message || '')
  } finally {
    poolLoading.value = false
  }
}
// 부를 고르면 팀 목록이 그 부의 팀으로 줄고, 부·팀을 고르면 초성 단추도 그 안에 있는 것만 켜진다
const ageOpts = computed(() => uniq(pool.value.map((t) => t.ageGroup)))
const teamOpts = computed(() => uniq(pool.value.filter((t) => !fAge.value || t.ageGroup === fAge.value).map((t) => t.team)))
const narrowed = computed(() => pool.value.filter((t) => (!fAge.value || t.ageGroup === fAge.value) && (!fTeam.value || t.team === fTeam.value)))
const hasInit = computed(() => new Set(narrowed.value.map((t) => initialOf(nuOf(t)))))
// 초성을 눌렀거나 팀을 골랐을 때 이름이 나온다 (부만 고른 상태는 너무 많아 초성을 기다린다)
const candidates = computed(() => {
  if (!fInit.value && !fTeam.value) return []
  return narrowed.value
    .filter((t) => !fInit.value || initialOf(nuOf(t)) === fInit.value)
    .sort((x, y) => nuOf(x).localeCompare(nuOf(y), 'ko', { numeric: true }))
})
watch(fAge, () => { if (fTeam.value && !teamOpts.value.includes(fTeam.value)) fTeam.value = '' })
const pickInit = (ch: string) => { fInit.value = fInit.value === ch ? '' : ch }

// 이미 목록에 있는 기록인가 (이름 목록에 표시 · 중복 추가 방지)
const isAdded = (t: any) => draft.value.athletes.some((a) => (t.timeID != null ? a.timeID === t.timeID : a.name === nuOf(t)))
// 누르면 선수 목록에 추가한다 — 이름·팀과 함께 그 기록의 timeID·ageGroup 을 잡아 둔다. 다시 누르면 뺀다(내가 고른 선수만).
const pickAthlete = (t: any) => {
  if (isAdded(t)) {
    draft.value.athletes = draft.value.athletes.filter((a) => !(t.timeID != null ? a.timeID === t.timeID : a.name === nuOf(t)) || !mine(a))
    return
  }
  draft.value.athletes.push({ name: nuOf(t), team: t.team || '', ageGroup: t.ageGroup || '', timeID: t.timeID ?? null, contributor: user.value?.username || '', contributorName: user.value?.name || '' })
}
const removeAthlete = (i: number) => { if (mine(draft.value.athletes[i])) draft.value.athletes.splice(i, 1) }
// 영법·성별·거리를 바꾸면 고른 선수의 기록 연결이 어긋난다 — 연결을 풀고, 새 종목의 선수 목록을 다시 받는다
const onClassChange = () => {
  draft.value.athletes.filter(mine).forEach((a) => { a.timeID = null; a.ageGroup = '' })
  fAge.value = ''; fTeam.value = ''; fInit.value = ''
  loadPool()
}

// 올리는 중에는 닫지 않는다 — 닫으면 업로드가 끊긴다
const close = () => { if (!saving.value && !deleting.value && !uploading.value) emit('close') }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
// 행이 들어오면 열림 — 값을 채우고, 열려 있는 동안만 ESC 리스너를 건다
watch(() => props.row, (r) => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onKey)
  if (!r) { clearPending(); return }
  draft.value = {
    discipline: r.discipline ?? '', gender: r.gender ?? '', distance: r.distance ?? '',
    athletes: athletesOf(r), caption: r.caption ?? '',
  }
  fAge.value = ''; fTeam.value = ''; fInit.value = ''
  msg.value = ''
  clearPending()
  loadPool()
  window.addEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey); xhr?.abort(); clearPending() })

// 저장 본문 — 종목 · 선수 · 캡션. 이름·팀은 NFC 로 맞춘다(자모분리면 times.name_unique 와 어긋난다).
// 서버가 첫 번째 선수를 name·team·ageGroup·timeID 에도 써 둔다.
const saveBody = () => ({
  discipline: draft.value.discipline, gender: draft.value.gender, distance: draft.value.distance,
  athletes: draft.value.athletes
    .map((a) => ({ name: a.name.normalize('NFC').trim(), team: a.team.normalize('NFC').trim(), ageGroup: a.ageGroup, timeID: a.timeID ?? '' }))
    .filter((a) => a.name),
  caption: draft.value.caption.trim(),
})

const onSave = async () => {
  const r = props.row
  if (!r?._id || saving.value) return
  saving.value = true; msg.value = ''
  try {
    const res = await $fetch<any>(`/api/videos/${r._id}`, { method: 'PUT', body: saveBody() })
    Object.assign(r, res)      // 카드에 즉시 반영(같은 객체 참조) — 선수 · 종목 · 저장한 사람 · 시각
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
  if (!confirm(`'${r.filename}' 영상을 삭제하시겠습니까?\n영상 파일도 함께 삭제됩니다.`)) return
  deleting.value = true; msg.value = ''
  try {
    await $fetch(`/api/videos/${r._id}`, { method: 'DELETE' })
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
    <div class="im-box" :class="{ 'im-narrow': simple }" role="dialog" aria-modal="true" aria-label="영상 상세">
      <!-- 머리줄 — 파일명 -->
      <header class="im-head">
        <h2 class="im-file" :class="{ 'im-who': simple }">{{ simple ? simpleTitle : (isNew ? '새 영상 올리기' : row.filename) }}</h2>
        <button class="im-x" type="button" aria-label="닫기" :disabled="uploading" @click="close">×</button>
      </header>
      <!-- 간단 올리기 — 영상 · 캡션 · [다른 영상 선택 / 올리기] -->
      <div v-if="simple" class="im-simple">
        <input ref="fileInput" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden @change="onPick">
        <template v-if="pending">
          <div class="im-video"><video :key="previewUrl" :src="previewUrl" controls playsinline preload="metadata" /></div>
          <p class="im-up">{{ pending.name }} · {{ fmtSize(pending.size) }} · 아직 올리지 않음</p>
        </template>
        <div v-else class="im-drop" @dragover.prevent @drop.prevent="onDrop">
          <p class="drop-t">올릴 영상을 선택하세요</p>
          <button class="btn btn-primary" type="button" @click="fileInput?.click()">영상 선택</button>
          <p class="drop-h">mp4 · mov · {{ MAX_MB }}MB 까지 · Wi-Fi 권장</p>
        </div>
        <label class="fld">
          <span class="info-l">caption</span>
          <textarea v-model="draft.caption" class="fld-input fld-area" rows="3" placeholder="영상 설명" :disabled="uploading" />
        </label>
        <p v-if="msg" class="up-msg">{{ msg }}</p>
        <div class="im-foot">
          <template v-if="uploading">
            <div class="bar"><span :style="{ width: progress + '%' }" /></div>
            <span class="up-prog">{{ stage }} {{ progress }}%</span>
            <button class="btn btn-ghost" type="button" @click="cancelUpload">취소</button>
          </template>
          <template v-else>
            <button v-if="pending" class="btn btn-ghost" type="button" @click="fileInput?.click()">다른 영상 선택</button>
            <button class="btn btn-primary" type="button" :disabled="!canUpload" @click="upload">올리기</button>
          </template>
        </div>
        <p v-if="uploading" class="ath-empty">올리는 동안 이 창을 닫거나 다른 앱으로 넘어가면 업로드가 끊길 수 있습니다.</p>
      </div>
      <div v-else class="im-body">
        <div class="im-left">
          <!-- 영법 · 성별 · 거리 — 한 줄 -->
          <div class="fld-row fld-row3">
            <label class="fld">
              <span class="info-l">영법</span>
              <select v-model="draft.discipline" class="fld-input" :disabled="!canMeta" @change="onClassChange">
                <option value="">—</option>
                <option v-for="d in withCur(Object.keys(DISC_KO), draft.discipline)" :key="d" :value="d">{{ DISC_KO[d] || d }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">성별</span>
              <select v-model="draft.gender" class="fld-input" :disabled="!canMeta" @change="onClassChange">
                <option value="">—</option>
                <option v-for="g in withCur(GENDER_OPTS, draft.gender)" :key="g" :value="g">{{ GENDER_KO[g] || g }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">거리</span>
              <select v-model="draft.distance" class="fld-input" :disabled="!canMeta" @change="onClassChange">
                <option value="">—</option>
                <option v-for="d in withCur(DIST_OPTS, draft.distance)" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
          </div>
          <!-- 영상 — 있으면 재생, 새 영상이면 이 자리에서 올린다 -->
          <div v-if="!isNew" class="im-video">
            <video :key="row._id" :src="row.url" :poster="row.thumbnail || undefined" controls playsinline preload="metadata" />
          </div>
          <template v-else>
            <input ref="fileInput" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden @change="onPick">
            <!-- 고른 영상 미리보기 (아직 올라가지 않았다) -->
            <template v-if="pending">
              <div class="im-video"><video :key="previewUrl" :src="previewUrl" controls playsinline preload="metadata" /></div>
              <p class="im-up">{{ pending.name }} · {{ fmtSize(pending.size) }} · 아직 올리지 않음</p>
              <button class="btn btn-ghost pick-again" type="button" :disabled="uploading" @click="fileInput?.click()">다른 영상 선택</button>
            </template>
            <div v-else class="im-drop" @dragover.prevent @drop.prevent="onDrop">
              <p class="drop-t">올릴 영상을 선택하세요</p>
              <button class="btn btn-primary" type="button" @click="fileInput?.click()">영상 선택</button>
              <p class="drop-h">mp4 · mov · {{ MAX_MB }}MB 까지 · Wi-Fi 권장</p>
            </div>
          </template>
          <!-- 저장한 사람 · 저장 시각 (표시만) — 영상 아래 -->
          <div v-if="!isNew" class="fld-row fld-row2 im-meta">
            <div class="fld">
              <span class="info-l">contributor</span>
              <span class="meta-v">{{ row.contributorName || row.contributor || '—' }}</span>
            </div>
            <div class="fld">
              <span class="info-l">updatedAt</span>
              <span class="meta-v">{{ fmtTime(row.updatedAt) || '—' }}</span>
            </div>
          </div>
          <p v-if="!isNew" class="im-up">올린 사람 {{ row.uploaderName || row.uploader || '—' }} · {{ fmtSize(row.size) }}</p>
        </div>
        <!-- 오른쪽 — 새 영상도 선수·캡션을 먼저 입력한다 -->
        <div class="im-side">
          <!-- 고른 선수 — 여러 명이 찍힌 영상은 선수마다 한 줄. 각자 자기 기록(timeID)에 붙는다 -->
          <div class="fld">
            <span class="info-l">선수<template v-if="draft.athletes.length"> {{ draft.athletes.length }}명</template></span>
            <div v-if="draft.athletes.length" class="ath-list">
              <div v-for="(a, i) in draft.athletes" :key="i" class="ath-row">
                <b class="ath-name">{{ a.name }}</b>
                <span class="ath-team">{{ a.team }}</span>
                <span class="ath-link" :class="{ none: !a.timeID }" :title="a.timeID ? `timeID ${a.timeID}` : '기록에 연결되지 않았습니다'">
                  {{ a.timeID ? (a.ageGroup || a.timeID) : '미연결' }}
                </span>
                <!-- 고른 사람 — 남이 고른 선수는 뺄 수 없다 -->
                <span class="ath-by" :title="`선택한 사람: ${a.contributorName || a.contributor || '기록 없음'}`">{{ a.contributorName || a.contributor || '' }}</span>
                <button v-if="mine(a)" class="ath-x" type="button" aria-label="선수 빼기" title="빼기" @click="removeAthlete(i)">×</button>
                <span v-else class="ath-x ath-lock" title="다른 사람이 선택한 선수는 뺄 수 없습니다">·</span>
              </div>
            </div>
            <p v-else class="ath-empty">아직 고른 선수가 없습니다. 아래에서 골라 주세요.</p>
          </div>
          <!-- 부 · 팀 — 선수 목록을 좁힌다 -->
          <div class="fld-row fld-row2">
            <label class="fld">
              <span class="info-l">ageGroup</span>
              <select v-model="fAge" class="fld-input">
                <option value="">부 전체</option>
                <option v-for="g in ageOpts" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label class="fld">
              <span class="info-l">team</span>
              <select v-model="fTeam" class="fld-input">
                <option value="">팀 전체</option>
                <option v-for="t in teamOpts" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
          </div>
          <!-- 이름 — 첫 글자 초성을 누르면 그 이름들이 나온다. 'a' 는 한글이 아닌 이름 -->
          <div class="fld">
            <span class="info-l">name</span>
            <div class="init-bar">
              <button
                v-for="ch in INITIALS" :key="ch" class="init-btn" type="button"
                :class="{ on: fInit === ch }" :disabled="!hasInit.has(ch)" @click="pickInit(ch)"
              >{{ ch }}</button>
            </div>
            <p v-if="poolLoading" class="find-msg">선수 목록을 불러오는 중…</p>
            <p v-else-if="poolMsg" class="find-msg">{{ poolMsg }}</p>
            <div v-else-if="candidates.length" class="find-panel">
              <button
                v-for="t in candidates" :key="t.timeID ?? t._id" class="find-row" type="button"
                :class="{ cur: isAdded(t) }" @click="pickAthlete(t)"
              >
                <span class="fr-chk">{{ isAdded(t) ? '✓' : '' }}</span>
                <b>{{ nuOf(t) }}</b>
                <span class="fr-team">{{ t.team }}</span>
                <span class="fr-meta">{{ [t.ageGroup, t.round, t.time].filter(Boolean).join(' · ') }}</span>
              </button>
            </div>
            <p v-else class="find-msg">{{ fInit || fTeam ? '해당하는 선수가 없습니다.' : '이름의 첫 글자를 누르면 선수가 나옵니다.' }}</p>
          </div>
          <label class="fld fld-grow">
            <span class="info-l">caption</span>
            <textarea v-model="draft.caption" class="fld-input fld-area" rows="5" placeholder="영상 설명" :disabled="!canMeta" />
          </label>
          <!-- 새 영상 — 영상과 선수가 정해지면 올린다 -->
          <div v-if="isNew" class="im-foot">
            <template v-if="uploading">
              <div class="bar"><span :style="{ width: progress + '%' }" /></div>
              <span class="up-prog">{{ stage }} {{ progress }}%</span>
              <button class="btn btn-ghost" type="button" @click="cancelUpload">취소</button>
            </template>
            <template v-else>
              <span class="foot-msg" :class="{ hint: !msg }">{{ msg || needHint }}</span>
              <button class="btn btn-primary" type="button" :disabled="!canUpload" @click="upload">올리기</button>
            </template>
          </div>
          <p v-if="isNew && uploading" class="ath-empty">올리는 동안 이 창을 닫거나 다른 앱으로 넘어가면 업로드가 끊길 수 있습니다.</p>
          <div v-if="!isNew" class="im-foot">
            <button v-if="canDelete" class="btn btn-danger" type="button" :disabled="deleting || saving" @click="onDelete">
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
/* 상세 모달 — 왼쪽 영상, 오른쪽 정보·편집 */
.im { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--sans); }
.im-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .5); }
.im-box {
  position: relative; display: flex; flex-direction: column; width: min(1040px, 100%); max-height: 100%;
  background: var(--paper); border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(26, 26, 26, .25);
}
.im-head { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 20px; border-bottom: 1px solid var(--line); }
.im-body { flex: 1 1 auto; min-height: 0; display: flex; }
.im-left { flex: 0 0 48%; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--paper-deep); overflow-y: auto; }
.im-x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 24px; line-height: 1; color: var(--ink-light); padding: 0; }
.im-x:hover { color: var(--ink); }
.im-video { display: flex; justify-content: center; background: #000; border-radius: 6px; overflow: hidden; }
.im-video video { display: block; width: 100%; max-height: 56vh; }
.im-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 240px; padding: 24px;
  border: 1px dashed var(--line); border-radius: 8px; background: var(--paper); text-align: center;
}
.drop-t { margin: 0; font-size: 13.5px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.drop-h { margin: 0; font-size: 12px; color: var(--ink-light); }
.bar { width: 100%; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--orange); transition: width .2s; }
.im-up { margin: 0; font-size: 11.5px; color: var(--ink-light); }
.up-msg { margin: 0; font-size: 12.5px; color: var(--bad); }
.pick-again { align-self: flex-start; }
/* 간단 올리기 — 한 칸짜리 좁은 모달 */
.im-box.im-narrow { width: min(560px, 100%); }
.im-simple { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 18px; overflow-y: auto; }
.im-simple .im-video video { max-height: 50vh; }
.im-simple .fld-area { min-height: 64px; }
.im-file.im-who { font-family: var(--sans); font-size: 14px; font-weight: 700; }
.up-prog { font-size: 12px; color: var(--ink-mute); white-space: nowrap; font-variant-numeric: tabular-nums; }
.foot-msg.hint { color: var(--ink-light); }
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
.ath-row { padding: 7px 4px 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); }
.ath-row .ath-name { flex: 0 1 auto; min-width: 0; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-row .ath-team { flex: 1 1 0; min-width: 0; font-size: 12.5px; color: var(--orange); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
/* 이름 초성 단추 — 한 줄에 15개(ㄱ…ㅎ, a). 손가락으로 누르기 좋게 */
.init-bar { display: grid; grid-template-columns: repeat(15, 1fr); gap: 4px; }
.init-btn {
  min-width: 0; height: 36px; padding: 0; font-family: var(--sans); font-size: 14px; color: var(--ink); cursor: pointer;
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px;
}
.init-btn:hover:not(:disabled) { border-color: var(--orange); color: var(--orange); }
.init-btn.on { background: var(--orange); border-color: var(--orange); color: #fff; }
.init-btn:disabled { opacity: .3; cursor: default; }
.find-msg { padding-left: 2px !important; }
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
.im-foot .btn-primary { margin-left: auto; }
/* 올리는 중 — 진행 막대가 남는 폭만 쓰고, 퍼센트와 취소 단추는 한 줄에 그대로 둔다 */
.im-foot .bar { flex: 1 1 0; width: auto; min-width: 40px; }
.im-foot .btn { flex: 0 0 auto; white-space: nowrap; }
.foot-msg { flex: 1; font-size: 12px; color: var(--bad); }
/* 공개 사이트에는 전역 버튼 스타일이 없어 여기서 정의한다 */
.btn { font-family: var(--sans); font-size: 13.5px; font-weight: 500; border: 1px solid transparent; border-radius: 6px; padding: 8px 16px; cursor: pointer; }
.btn-primary { background: var(--orange); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--orange-deep); }
.btn-ghost { background: var(--paper); color: var(--ink); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { border-color: var(--orange); color: var(--orange); }
.btn-danger { background: var(--bad-bg); color: var(--bad); }
.btn-danger:hover:not(:disabled) { background: var(--bad); color: #fff; }
.btn:disabled { opacity: .5; cursor: default; }
/* 좁은 화면 — 위아래로 쌓는다 */
@media (max-width: 820px) {
  .im-body { flex-direction: column; overflow-y: auto; }
  .im-left { flex: 0 0 auto; overflow: visible; }
  .im-video video { max-height: 40vh; }
  /* 초성 단추 15개가 휴대폰에서도 한 줄에 들어가게 — 모달 바깥·안쪽 여백과 단추 사이를 줄인다 */
  .im { padding: 8px; }
  .im-left { padding: 12px; }
  .im-side { padding: 14px 12px; }
  .init-bar { gap: 2px; }
  .init-btn { height: 38px; font-size: 13px; border-radius: 4px; letter-spacing: -.02em; }
  .im-side { flex: 0 0 auto; overflow: visible; }
}
</style>
