<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void; (e: 'deleted'): void; (e: 'uploaded'): void }>()

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }

const activeId = ref('')
const caption = ref('')
const agreed = ref(true)
const addKind = ref<'match' | 'cheer'>('match')
const KIND_KO: Record<string, string> = { match: '경기 영상', cheer: '응원 영상' }
const saving = ref(false)
const deletingId = ref('')
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

const videos = computed<any[]>(() => Array.isArray(props.row?.videos) ? props.row.videos : [])
const active = computed(() => videos.value.find((video) => String(video._id) === activeId.value) || null)
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
const canSave = computed(() => !!active.value && !active.value.youtube && !saving.value && !deletingId.value && !uploading.value)
const fmtTime = (value: any) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

watch(() => props.row, (row) => {
  const currentId = activeId.value
  const current = row?.videos?.find((video: any) => String(video._id) === currentId)
  activeId.value = current ? currentId : ''
  caption.value = current?.caption || ''
  message.value = ''
}, { immediate: true })
watch(active, (video) => {
  caption.value = video?.caption || ''
  message.value = ''
})

const selectVideo = (video: any) => { activeId.value = String(video._id) }
const openAdd = (kind: 'match' | 'cheer') => {
  if (uploading.value) return
  addKind.value = kind
  agreed.value = true
  activeId.value = ''
  caption.value = ''
  message.value = ''
}
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
  if (!file || !row || uploading.value || saving.value || deletingId.value) return
  message.value = ''
  if (!agreed.value) { message.value = '체크해야 영상을 올릴 수 있습니다.'; if (fileInput.value) fileInput.value.value = ''; return }
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
    activeId.value = String(created._id)
    message.value = '동영상이 추가되었습니다.'
    emit('uploaded')
  } catch (error: any) {
    message.value = error?.data?.error || error?.message || '동영상을 올리지 못했습니다.'
  } finally {
    uploading.value = false
    progress.value = 0
    xhr = null
    if (fileInput.value) fileInput.value.value = ''
  }
}
const pickFile = () => {
  if (!agreed.value) { message.value = '체크해야 영상을 올릴 수 있습니다.'; return }
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
const close = () => { if (!uploading.value && !saving.value && !deletingId.value) emit('close') }
const save = async () => {
  const video = active.value
  if (!video || video.youtube || saving.value) return
  saving.value = true
  message.value = ''
  try {
    const updated = await $fetch<any>(`/api/videos/${video._id}`, { method: 'PUT', body: { caption: caption.value.trim() } })
    Object.assign(video, updated)
    message.value = '입력하신 내용대로 저장되었습니다.'
    emit('saved')
  } catch (error: any) {
    message.value = error?.data?.error || error?.message || '저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}
const remove = async (video: any) => {
  if (!video || video.youtube || deletingId.value) return
  if (!confirm(`'${video.filename || '이 영상'}'을 삭제하시겠습니까?\n업로드된 영상 파일도 함께 삭제됩니다.`)) return
  deletingId.value = String(video._id)
  message.value = ''
  try {
    await $fetch(`/api/videos/${video._id}`, { method: 'DELETE' })
    emit('deleted')
  } catch (error: any) {
    message.value = error?.data?.error || error?.message || '삭제하지 못했습니다.'
  } finally {
    deletingId.value = ''
  }
}
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); xhr?.abort() })
</script>

<template>
  <Teleport to="body">
    <div v-if="row" class="vd-wrap">
      <button class="vd-overlay" type="button" aria-label="닫기" @click="close" />
      <aside class="vd" role="dialog" aria-modal="true" :aria-label="`${title} 영상 상세`">
        <header class="vd-head">
          <h2><span v-for="(part, i) in parts" :key="i" class="vd-chip">{{ part }}</span></h2>
          <button class="vd-close" type="button" aria-label="닫기" :disabled="uploading" @click="close">×</button>
        </header>

        <div class="vd-body">
          <input
            ref="fileInput" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
            hidden @change="onPick"
          >
          <section class="vd-videos">
            <h3>업로드된 동영상 <span>{{ videos.length }}개</span></h3>
            <div v-if="videos.length" class="vd-thumbs">
              <div v-for="video in videos" :key="video._id" class="vd-thumb-wrap">
                <button
                  class="vd-thumb" :class="{ active: String(video._id) === String(active?._id) }"
                  type="button" :aria-label="`${video.filename || video.caption || '영상'} 보기`" @click="selectVideo(video)"
                >
                  <span v-if="video.youtube" class="vd-no-thumb vd-yt">▶ YouTube</span>
                  <img v-else-if="video.thumbnail" :src="video.thumbnail" alt="">
                  <video v-else :src="`${video.url}#t=0.1`" muted playsinline preload="metadata" />
                </button>
                <button
                  v-if="!video.youtube" class="vd-remove" type="button" aria-label="영상 삭제" title="영상 삭제"
                  :disabled="!!deletingId || uploading" @click.stop="remove(video)"
                >×</button>
              </div>
              <div class="vd-add-pair">
                <button class="vd-thumb vd-add" type="button" aria-label="경기 영상 업로드하기" :disabled="uploading" @click="openAdd('match')">
                  <small>경기 영상 업로드하기</small>+
                </button>
                <button class="vd-thumb vd-add" type="button" aria-label="응원 영상 올리기" :disabled="uploading" @click="openAdd('cheer')">
                  <small>응원 영상 올리기</small>+
                </button>
              </div>
            </div>
          </section>

          <section
            class="vd-player-zone" :class="{ dragging }"
            @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
          >
            <div v-if="dragging" class="vd-drop-overlay">동영상을 여기에 놓으세요</div>
            <div v-if="active" class="vd-player">
              <div class="vd-kind">
                <b :class="{ cheer: active.kind === 'cheer' }">{{ active.youtube ? 'YouTube' : (KIND_KO[active.kind] || KIND_KO.match) }}</b>
                <span v-if="active.uploaderName || active.uploader">올린 사람 {{ active.uploaderName || active.uploader }}<template v-if="active.uploaderInstagram"> ({{ active.uploaderInstagram.startsWith('@') ? '' : '@' }}{{ active.uploaderInstagram }})</template></span>
              </div>
              <iframe
                v-if="active.youtube" :key="active._id" :src="active.embed" title="YouTube 영상"
                allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen
              />
              <video v-else :key="active._id" :src="active.url" :poster="active.thumbnail || undefined" controls playsinline preload="metadata" />
              <div class="vd-file-info">
                <span>{{ title || active.filename || 'YouTube 영상' }}</span>
                <span v-if="active.updatedAt">{{ fmtTime(active.updatedAt) }}</span>
                <a v-if="!active.youtube" class="vd-download" :href="`/api/videos/${active._id}/download`">다운로드</a>
              </div>
              <label v-if="!active.youtube" class="vd-field">
                <span>제보자의 한마디</span>
                <textarea v-model="caption" rows="5" placeholder="제보자의 한마디" :disabled="uploading" />
              </label>
              <div v-else-if="active.caption" class="vd-field">
                <span>제보자의 한마디</span>
                <p class="vd-caption">{{ active.caption }}</p>
              </div>
            </div>
            <template v-else>
            <label class="vd-agree">
              <input v-model="agreed" type="checkbox" :disabled="uploading">
              <span>여기 적어주신 내용은 영상을 업로드하신 분의 성함과 함께 공개됩니다.</span>
            </label>
            <p v-if="!agreed" class="vd-agree-warn">체크해야 영상을 올릴 수 있습니다.</p>
            <button class="vd-player-empty" type="button" :disabled="uploading" @click="pickFile">
              <template v-if="uploading">
                <span class="vd-upload-title">동영상 올리는 중</span>
                <span class="vd-upload-button">{{ progress ? `${progress}%` : '준비 중…' }}</span>
              </template>
              <template v-else>
                <span class="vd-upload-title">{{ KIND_KO[addKind] }}을 선택하세요</span>
                <span class="vd-upload-button">영상 선택</span>
                <span class="vd-upload-hint">mp4 · mov · {{ MAX_MB }}MB 까지 · Wi-Fi 권장</span>
              </template>
            </button>
            <label class="vd-field vd-field-add">
              <span>제보자의 한마디</span>
              <textarea v-model="caption" rows="5" placeholder="제보자의 한마디" :disabled="uploading" />
            </label>
            </template>
          </section>
        </div>

        <footer class="vd-foot">
          <p :class="{ error: message && !message.includes('저장되었습니다') && !message.includes('추가되었습니다') }">
            {{ uploading ? `동영상 올리는 중 ${progress}%` : message }}
          </p>
          <button class="vd-save" type="button" :disabled="!canSave" @click="save">
            {{ saving ? '저장 중…' : '저장' }}
          </button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.vd-wrap { position: fixed; inset: 0; z-index: 1100; }
.vd-overlay { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(26, 26, 26, .42); cursor: default; }
.vd {
  position: absolute; top: 0; right: 0; bottom: 0; display: flex; flex-direction: column;
  width: min(620px, 100vw); background: var(--paper); border-left: 1px solid var(--line);
  box-shadow: -18px 0 48px rgba(26, 26, 26, .18);
}
.vd-head { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
.vd-head h2 { flex: 1; min-width: 0; margin: 0; font-family: var(--serif); font-size: 18px; line-height: 1.45; word-break: break-word; }
.vd-head h2 { display: flex; flex-wrap: wrap; gap: 6px; }
.vd-chip { padding: 2px 10px; border: 1px solid var(--line); background: var(--paper-deep); font-size: 15px; line-height: 1.5; }
.vd-close { flex: 0 0 auto; padding: 0; border: 0; background: none; color: var(--ink-light); font-size: 27px; line-height: 1; cursor: pointer; }
.vd-close:hover { color: var(--ink); }
.vd-close:disabled { opacity: .35; cursor: default; }
.vd-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 20px; }
.vd-videos { padding: 0 0 20px; }
.vd-videos h3 { margin: 0 0 10px; font-family: var(--serif); font-size: 14px; }
.vd-videos h3 span { color: var(--ink-light); font-size: 12px; font-weight: 500; }
.vd-thumbs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.vd-thumb-wrap { position: relative; min-width: 0; }
.vd-thumb { display: block; width: 100%; aspect-ratio: 16 / 9; padding: 0; overflow: hidden; border: 1px solid var(--line); background: #111; cursor: pointer; }
.vd-thumb.active { border-color: var(--orange); box-shadow: 0 0 0 2px rgba(217, 111, 54, .18); }
.vd-thumb img, .vd-thumb video { display: block; width: 100%; height: 100%; object-fit: cover; }
.vd-add { display: flex; align-items: center; justify-content: center; background: var(--paper-deep); color: var(--ink-mute); border-style: dashed; font-size: 28px; font-weight: 300; line-height: 1; }
.vd-add:hover:not(:disabled) { border-color: var(--orange); color: var(--orange-deep); background: var(--paper); }
.vd-add:disabled { cursor: progress; opacity: .7; }
.vd-no-thumb { display: flex; align-items: center; justify-content: center; height: 100%; color: #fff; font-size: 11px; }
.vd-yt { background: #000; font-weight: 700; }
.vd-remove {
  position: absolute; top: -7px; right: -7px; display: flex; align-items: center; justify-content: center;
  width: 21px; height: 21px; padding: 0; border: 1px solid rgba(255, 255, 255, .9); border-radius: 50%;
  background: var(--ink); color: #fff; font-size: 16px; line-height: 1; cursor: pointer;
}
.vd-remove:hover { background: var(--bad); }
.vd-player-zone { position: relative; min-height: 140px; }
.vd-player-zone.dragging { outline: 2px solid var(--orange); outline-offset: 3px; }
.vd-drop-overlay {
  position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
  border: 2px dashed var(--orange); background: rgba(255, 252, 247, .94); color: var(--orange-deep);
  font-size: 14px; font-weight: 700; pointer-events: none;
}
.vd-player { display: flex; flex-direction: column; gap: 10px; padding-top: 2px; }
.vd-player video, .vd-player iframe { display: block; width: 100%; aspect-ratio: 16 / 9; border: 0; background: #000; object-fit: contain; }
.vd-player-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  width: 100%; aspect-ratio: 16 / 9; padding: 24px;
  border: 1px solid var(--line-soft); background: #fff; color: var(--ink-mute); font-family: var(--sans); cursor: pointer;
}
.vd-player-empty:hover:not(:disabled) { border-color: var(--orange); color: var(--orange-deep); }
.vd-player-empty:disabled { cursor: progress; }
.vd-upload-title { font-size: 17px; font-weight: 500; line-height: 1.3; }
.vd-upload-button { padding: 14px 24px; border-radius: 9px; background: #ff5108; color: #fff; font-size: 15px; font-weight: 700; line-height: 1; }
.vd-upload-hint { color: var(--ink-light); font-size: 13px; line-height: 1.3; }
.vd-player-empty:hover:not(:disabled) .vd-upload-button { background: var(--orange-deep); }
.vd-file-info { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--ink-light); font-size: 11.5px; }
.vd-file-info span:first-child { flex: 1 1 100%; color: var(--ink-mute); word-break: break-all; }
.vd-download { margin-left: auto; color: var(--ink-mute); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.vd-download:hover { color: var(--orange-deep); }
.vd-field { display: flex; flex-direction: column; gap: 5px; }
.vd-field > span { color: var(--ink-light); font-size: 11.5px; }
.vd-field textarea { width: 100%; resize: vertical; padding: 9px 11px; border: 1px solid var(--line); border-radius: 0; background: var(--paper); color: var(--ink); font: 13.5px/1.55 var(--sans); }
.vd-field textarea:focus { outline: none; border-color: var(--orange); }
.vd-add-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; min-width: 0; }
.vd-add-pair .vd-add { flex-direction: column; gap: 2px; aspect-ratio: auto; height: 100%; min-height: 62px; font-size: 22px; }
.vd-add small { padding: 0 3px; font-size: 10px; font-weight: 600; line-height: 1.25; word-break: keep-all; }
.vd-kind { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--ink-mute); }
.vd-kind b { padding: 2px 9px; background: var(--ink); color: #fff; font-size: 12px; }
.vd-kind b.cheer { background: var(--orange-deep); }
.vd-agree { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; color: var(--ink-mute); font-size: 12.5px; line-height: 1.5; cursor: pointer; }
.vd-agree-warn { margin: -4px 0 10px; color: var(--bad); font-size: 12px; }
.vd-agree input { margin-top: 3px; accent-color: var(--orange); }
.vd-field-add { margin-top: 10px; }
.vd-caption { margin: 0; white-space: pre-wrap; color: var(--ink); font: 13.5px/1.55 var(--sans); }
.vd-empty { margin: 0; padding: 16px 0; color: var(--ink-light); font-size: 13px; }
.vd-foot { display: flex; align-items: center; gap: 16px; min-height: 64px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--paper); }
.vd-foot p { flex: 1; margin: 0; color: var(--ink-mute); font-size: 12px; }
.vd-foot p.error { color: var(--bad); }
.vd-save { min-width: 88px; padding: 9px 18px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font: 700 13px var(--sans); cursor: pointer; }
.vd-save:hover:not(:disabled) { border-color: var(--orange-deep); background: var(--orange-deep); }
.vd-save:disabled { opacity: .4; cursor: default; }

@media (max-width: 640px) {
  .vd { width: 100vw; }
  .vd-head, .vd-body, .vd-foot { padding-left: 16px; padding-right: 16px; }
  .vd-head h2 { font-size: 16px; }
  .vd-thumbs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
