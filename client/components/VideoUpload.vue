<script setup lang="ts">
// 영상 올리기 모달 — 표의 올리기 아이콘에서 연다. 경기 영상 / 응원 영상 중 눌러서 파일을 고르면 올리고, 끝나면 닫는다.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'uploaded'): void }>()

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }

const caption = ref('')
const agreed = ref(true)
const agreedDownload = ref(true)
// 두 안내를 모두 확인해야 올릴 수 있다 — 안 하면 올리기 버튼이 비활성화된다
const confirmed = computed(() => agreed.value && agreedDownload.value)
const addKind = ref<'match' | 'cheer'>('match')
const message = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const progress = ref(0)
const dragging = ref(false)
let dragDepth = 0
let xhr: XMLHttpRequest | null = null

const maxMB = useState<number>('videos:maxMB', () => 0)
const MAX_MB = computed(() => maxMB.value || 499)
if (import.meta.client && !maxMB.value) {
  $fetch<any>('/api/videos/config').then((config) => {
    if (Number(config?.maxMB) > 0) maxMB.value = Number(config.maxMB)
  }).catch(() => {})
}
const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i

const parts = computed(() => {
  const row = props.row || {}
  const names = String(row.name || '').split(',').map((name) => name.trim()).filter(Boolean).join(', ')
  const isRelay = ['FRR', 'MR'].includes(row.discipline) || names.includes(',')
  const subject = isRelay && row.team ? `${row.team}(${names})` : (names || row.team)
  const distance = /^\d+$/.test(String(row.distance || '')) ? `${row.distance}M` : row.distance
  return [
    GENDER_KO[row.gender] || row.gender,
    DISC_KO[row.discipline] || row.discipline,
    distance,
    row.course,
    subject,
  ].filter(Boolean)
})
const title = computed(() => parts.value.join(' '))

const fmtSize = (size: number) => size >= 1048576 ? `${(size / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(size / 1024))}KB`
const makePoster = (file: File): Promise<Blob | null> => new Promise((resolve) => {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  let finished = false
  const finish = (blob: Blob | null) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    URL.revokeObjectURL(url)
    resolve(blob)
  }
  const timer = window.setTimeout(() => finish(null), 8000)
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.onloadeddata = () => {
    try { video.currentTime = Math.min(1, (video.duration || 2) / 2) } catch { finish(null) }
  }
  video.onseeked = () => {
    try {
      const max = 480
      const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', .8)
    } catch { finish(null) }
  }
  video.onerror = () => finish(null)
  video.src = url
})
const putWithProgress = (url: string, file: File, contentType: string) => new Promise<void>((resolve, reject) => {
  xhr = new XMLHttpRequest()
  xhr.open('PUT', url)
  xhr.setRequestHeader('Content-Type', contentType)
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) progress.value = Math.round((event.loaded / event.total) * 100)
  }
  xhr.onload = () => (xhr && xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`스토리지 업로드 실패 (${xhr?.status})`)))
  xhr.onerror = () => reject(new Error('네트워크 오류로 업로드하지 못했습니다.'))
  xhr.onabort = () => reject(new Error('업로드를 취소했습니다.'))
  xhr.send(file)
})
const uploadFile = async (file: File | null | undefined) => {
  const row = props.row
  if (!file || !row || uploading.value) return
  message.value = ''
  if (!confirmed.value) { if (fileInput.value) fileInput.value.value = ''; return }
  const name = file.name.normalize('NFC')
  if (!VIDEO_RE.test(name)) { message.value = '영상 파일(mp4·mov·m4v·webm)만 올릴 수 있습니다.'; return }
  if (file.size > MAX_MB.value * 1048576) {
    message.value = `영상은 ${MAX_MB.value}MB까지 올릴 수 있습니다. (이 파일 ${fmtSize(file.size)})`
    return
  }
  uploading.value = true
  progress.value = 0
  try {
    const presigned = await $fetch<any>('/api/videos/presign', {
      method: 'POST',
      body: { competitionID: row.competitionID, filename: name, contentType: file.type || 'video/mp4', size: file.size },
    })
    const poster = await makePoster(file)
    await putWithProgress(presigned.uploadUrl, file, presigned.contentType)
    if (poster) {
      await fetch(presigned.thumbUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: poster }).catch(() => {})
    }
    let created = await $fetch<any>('/api/videos', {
      method: 'POST',
      body: {
        competitionID: row.competitionID, discipline: row.discipline, gender: row.gender, distance: row.distance,
        key: presigned.key, thumbKey: poster ? presigned.thumbKey : '', filename: name, kind: addKind.value,
      },
    })
    created = await $fetch<any>(`/api/videos/${created._id}`, {
      method: 'PUT',
      body: { athletes: [{ name: row.name, team: row.team, ageGroup: row.ageGroup, timeID: row.timeID }], caption: caption.value.trim() },
    })
    if (Array.isArray(row.videos)) row.videos.push(created)
    emit('uploaded')
    emit('close')
  } catch (error: any) {
    message.value = error?.data?.error || error?.message || '동영상을 올리지 못했습니다.'
  } finally {
    uploading.value = false
    progress.value = 0
    xhr = null
    if (fileInput.value) fileInput.value.value = ''
  }
}
const pickKind = (kind: 'match' | 'cheer') => { addKind.value = kind; pickFile() }
const pickFile = () => {
  if (!confirmed.value) return
  fileInput.value?.click()
}
const onPick = (event: Event) => uploadFile((event.target as HTMLInputElement).files?.[0])
const canDrop = (event: DragEvent) => !uploading.value && !!event.dataTransfer?.types.includes('Files')
const onDragEnter = (event: DragEvent) => {
  if (!canDrop(event)) return
  event.preventDefault()
  dragDepth += 1
  dragging.value = true
}
const onDragOver = (event: DragEvent) => {
  if (!canDrop(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}
const onDragLeave = (event: DragEvent) => {
  if (!dragging.value) return
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
const onDrop = (event: DragEvent) => {
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  if (!uploading.value) uploadFile(event.dataTransfer?.files?.[0])
}
const close = () => { if (!uploading.value) emit('close') }
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); xhr?.abort() })
</script>

<template>
  <Teleport to="body">
    <div v-if="row" class="vu-wrap">
      <button class="vu-overlay" type="button" aria-label="닫기" @click="close" />
      <div class="vu" role="dialog" aria-modal="true" :aria-label="`${title} 영상 올리기`" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
        <header class="vu-head">
          <h2>{{ title }}</h2>
          <button class="vu-close" type="button" aria-label="닫기" :disabled="uploading" @click="close">×</button>
        </header>
        <div class="vu-body">
          <input ref="fileInput" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden @change="onPick">
          <div v-if="dragging" class="vu-drop">동영상을 여기에 놓으세요</div>
          <label class="vu-agree">
            <input v-model="agreed" type="checkbox" :disabled="uploading">
            <span>지금 여기서 업로드해주시는 내용은 영상을 업로드하신 분의 성함과 함께 메달뱅크아쿠아틱스 유투브 채널에 공개 될 수 있습니다.</span>
          </label>
          <label class="vu-agree">
            <input v-model="agreedDownload" type="checkbox" :disabled="uploading">
            <span>업로드된 영상은 대회 당일과 추후 1~3일간은 원본 다운로드가 가능하지만, 추후 메달뱅크아쿠아틱스 유투브 채널로 이동될 예정입니다. 이동 후에는 영상 원본을 다운로드 할 수 없을 수 있으니 필요한 내용은 기한 내에 다운로드 하시도록 참고 바랍니다.</span>
          </label>
          <p v-if="!confirmed" class="vu-warn">위 내용을 확인해주셔야 진행 가능합니다.</p>
          <div class="vu-pick">
            <template v-if="uploading">
              <span class="vu-t">동영상 올리는 중</span>
              <span class="vu-btn vu-gauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress">
                <i class="vu-gauge-fill" :style="{ width: `${progress}%` }"></i>
                <span class="vu-gauge-t">{{ progress ? `${progress}%` : '준비 중…' }}</span>
              </span>
            </template>
            <template v-else>
              <button class="vu-btn" type="button" :disabled="!confirmed" @click="pickKind('match')">경기 영상 업로드하기</button>
              <button class="vu-btn vu-faint" type="button" :disabled="!confirmed" @click="pickKind('cheer')">응원 영상 올리기</button>
              <span class="vu-hint">mp4 · mov · {{ MAX_MB }}MB 까지 · Wi-Fi 권장</span>
            </template>
          </div>
          <p v-if="message && !uploading" class="vu-msg error">{{ message }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vu-wrap { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; }
.vu-overlay { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(26, 26, 26, .42); cursor: default; }
.vu { position: relative; width: min(520px, calc(100vw - 24px)); max-height: calc(100vh - 40px); overflow-y: auto; background: var(--paper); box-shadow: 0 18px 48px rgba(26, 26, 26, .25); }
.vu-head { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
/* 제목 — 영상 목록 모달·/videos 종목 제목과 같은 스타일 */
.vu-head h2 { flex: 1; min-width: 0; margin: 0; font-family: var(--sans); font-size: 14.5px; font-weight: 700; color: var(--ink); }
.vu-close { padding: 0; border: 0; background: none; color: var(--ink-light); font-size: 27px; line-height: 1; cursor: pointer; }
.vu-close:disabled { opacity: .35; cursor: default; }
.vu-body { position: relative; padding: 20px; }
.vu-drop { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; border: 2px dashed var(--orange); background: rgba(255, 252, 247, .94); color: var(--orange-deep); font-size: 14px; font-weight: 700; pointer-events: none; }
.vu-agree { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; color: var(--ink-mute); font-size: 12.5px; line-height: 1.5; cursor: pointer; }
.vu-agree input { margin-top: 3px; accent-color: var(--orange); }
.vu-warn { margin: -4px 0 10px; color: var(--bad); font-size: 12px; }
.vu-pick { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 24px; border: 1px solid var(--line-soft); background: #fff; color: var(--ink-mute); font-family: var(--sans); }
.vu-t { font-size: 17px; font-weight: 500; line-height: 1.3; }
.vu-btn { width: min(260px, 100%); padding: 14px 24px; border: 0; border-radius: 9px; background: #ff5108; color: #fff; font: 700 15px var(--sans); line-height: 1; cursor: pointer; }
.vu-gauge { padding-top: 7px; padding-bottom: 7px; position: relative; display: block; overflow: hidden; text-align: center; background: rgba(26, 26, 26, .4); color: #fff; cursor: default; }
.vu-gauge-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #ff5108; transition: width .25s ease-out; }
.vu-gauge-t { position: relative; }
.vu-btn:hover:not(:disabled) { background: var(--orange-deep); }
.vu-btn:disabled { opacity: .35; cursor: default; }
.vu-faint { opacity: .45; }
.vu-faint:hover:not(:disabled) { opacity: .8; }
.vu-hint { color: var(--ink-light); font-size: 13px; }
.vu-msg { margin: 12px 0 0; color: var(--ink-mute); font-size: 12px; }
.vu-msg.error { color: var(--bad); }
</style>
