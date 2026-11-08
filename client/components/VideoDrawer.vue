<script setup lang="ts">
// 영상 보기 모달 — 표의 행을 누르면 연다. 그 기록의 영상 썸네일을 경기/응원 영상·올린 사람과 함께 보여주고,
// 썸네일을 누르면 재생 모달이 뜬다. 올리기는 표의 올리기 아이콘(VideoUpload)에서 한다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'deleted'): void; (e: 'add'): void }>()

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const KIND_KO: Record<string, string> = { match: '경기 영상', cheer: '응원 영상' }

// 로그인 계정 — 본인이 올린 영상만 지울 수 있다(관리자는 모두). 서버도 같은 규칙으로 막는다.
const { user } = useAuth()
const canRemove = (video: any) => !video.youtube
  && (!video.uploader || video.uploader === user.value?.username || (user.value?.can || []).includes('users'))

const playId = ref('')
const deletingId = ref('')
const message = ref('')

const videos = computed<any[]>(() => Array.isArray(props.row?.videos) ? props.row.videos : [])
const playing = computed(() => videos.value.find((video) => String(video._id) === playId.value) || null)
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
// 영상 이름 — 남자_계영_200M_LCM_스윔온_신우진_강현수_김기훤_주의현.mp4
const fileLabel = computed(() => {
  const row = props.row || {}
  const names = String(row.name || '').split(',').map((name) => name.trim()).filter(Boolean)
  const distance = /^\d+$/.test(String(row.distance || '')) ? `${row.distance}M` : row.distance
  return [GENDER_KO[row.gender] || row.gender, DISC_KO[row.discipline] || row.discipline, distance, row.course, row.team, ...names]
    .filter(Boolean).join('_').replace(/\s+/g, '') + '.mp4'
})
const kindOf = (video: any) => video.youtube ? 'YouTube' : (KIND_KO[video.kind] || KIND_KO.match)
const uploaderOf = (video: any) => {
  const name = video.uploaderName || video.uploader
  if (!name) return ''
  const ig = String(video.uploaderInstagram || '')
  return ig ? `${name} (${ig.startsWith('@') ? '' : '@'}${ig})` : name
}
// 마이페이지에 인스타그램을 입력한 사람만 링크가 있다 (@ 제거 · URL 이면 그대로)
const igUrl = (video: any) => {
  const ig = String(video.uploaderInstagram || '').trim()
  if (!ig) return ''
  if (/^https?:\/\//i.test(ig)) return ig
  return `https://instagram.com/${ig.replace(/^@/, '')}`
}
const fmtTime = (value: any) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  // 2026년 11월 3일 오전 2시 18분
  const h = date.getHours()
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시 ${date.getMinutes()}분`
}

watch(() => props.row, () => { playId.value = ''; message.value = '' })

const closePlay = () => { playId.value = '' }
const close = () => { if (!deletingId.value) emit('close') }
const remove = async (video: any) => {
  if (!video || !canRemove(video) || deletingId.value) {
    if (video && !video.youtube) message.value = '본인이 올린 영상만 삭제할 수 있습니다.'
    return
  }
  if (!confirm(`'${video.filename || '이 영상'}'을 삭제하시겠습니까?\n업로드된 영상 파일도 함께 삭제됩니다.`)) return
  deletingId.value = String(video._id)
  message.value = ''
  try {
    await $fetch(`/api/videos/${video._id}`, { method: 'DELETE' })
    if (playId.value === String(video._id)) playId.value = ''
    emit('deleted')
  } catch (error: any) {
    message.value = error?.data?.error || error?.message || '삭제하지 못했습니다.'
  } finally {
    deletingId.value = ''
  }
}
// ESC — 재생 모달이 떠 있으면 그것부터 닫는다
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  if (playId.value) closePlay()
  else close()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="row" class="vd-wrap">
      <button class="vd-overlay" type="button" aria-label="닫기" @click="close" />
      <div class="vd" role="dialog" aria-modal="true" :aria-label="`${title} 영상`">
        <header class="vd-head">
          <h2>{{ title }}</h2>
          <button class="vd-close" type="button" aria-label="닫기" @click="close">×</button>
        </header>
        <div class="vd-body">
          <h3>영상 <span>{{ videos.length }}개</span></h3>
          <ul v-if="videos.length" class="vd-list">
            <li v-for="video in videos" :key="video._id" class="vd-item">
              <div class="vd-thumb-wrap">
                <button class="vd-thumb" type="button" :aria-label="`${kindOf(video)} 재생`" @click="playId = String(video._id)">
                  <img v-if="video.thumbnail" :src="video.thumbnail" alt="">
                  <span v-else-if="video.youtube" class="vd-no-thumb vd-yt">▶ YouTube</span>
                  <video v-else :src="`${video.url}#t=0.1`" muted playsinline preload="metadata" />
                </button>
                <button
                  v-if="canRemove(video)" class="vd-remove" type="button" aria-label="영상 삭제" title="영상 삭제"
                  :disabled="!!deletingId" @click.stop="remove(video)"
                >×</button>
              </div>
              <div class="vd-meta">
                <b :class="{ cheer: video.kind === 'cheer' && !video.youtube, yt: video.youtube }">{{ video.youtube ? '시청 가능' : '다운로드 가능' }}</b>
                <span class="vd-file">{{ video.youtube ? '영상제공 메달뱅크' : fileLabel }}</span>
                <a v-if="uploaderOf(video) && igUrl(video)" class="vd-by" :href="igUrl(video)" target="_blank" rel="noopener">영상제공 {{ uploaderOf(video) }}</a>
                <span v-else-if="uploaderOf(video)">영상제공 {{ uploaderOf(video) }}</span>
                <span v-if="video.updatedAt" class="vd-time">{{ fmtTime(video.updatedAt) }}</span>
              </div>
            </li>
            <!-- 마지막 — 영상 추가(올리기 모달) -->
            <li class="vd-item">
              <button class="vd-thumb-wrap vd-add" type="button" aria-label="영상 추가" @click="emit('add')">
                <span class="vd-add-plus">+</span>
              </button>
            </li>
          </ul>
          <template v-else>
            <p class="vd-empty">올라온 영상이 없습니다.</p>
            <button class="vd-add vd-add-solo" type="button" @click="emit('add')"><span class="vd-add-plus">+</span></button>
          </template>
          <p v-if="message" class="vd-err">{{ message }}</p>
        </div>
      </div>
    </div>

    <!-- 재생 모달 -->
    <div v-if="row && playing" class="vp-wrap">
      <button class="vp-overlay" type="button" aria-label="닫기" @click="closePlay" />
      <div class="vp" role="dialog" aria-modal="true" aria-label="영상 재생">
        <iframe
          v-if="playing.youtube" :key="playing._id" :src="`${playing.embed}?autoplay=1&rel=0`" title="YouTube 영상"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
        />
        <video v-else :key="playing._id" :src="playing.url" :poster="playing.thumbnail || undefined" controls autoplay playsinline />
        <div class="vp-foot">
          <div class="vd-meta">
            <b :class="{ cheer: playing.kind === 'cheer' && !playing.youtube, yt: playing.youtube }">{{ kindOf(playing) }}</b>
            <span v-if="uploaderOf(playing)">올린 사람 {{ uploaderOf(playing) }}</span>
            <a v-if="!playing.youtube" class="vp-link" :href="`/api/videos/${playing._id}/download`">다운로드</a>
            <a v-else class="vp-link" :href="playing.url" target="_blank" rel="noopener">YouTube에서 보기</a>
          </div>
          <p v-if="playing.caption" class="vp-cap">{{ playing.caption }}</p>
        </div>
        <button class="vp-x" type="button" aria-label="닫기" @click="closePlay">×</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vd-wrap { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; }
.vd-overlay { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(26, 26, 26, .42); cursor: default; }
.vd { position: relative; display: flex; flex-direction: column; width: min(720px, calc(100vw - 24px)); max-height: calc(100vh - 40px); background: var(--paper); box-shadow: 0 18px 48px rgba(26, 26, 26, .25); }
.vd-head { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
/* 제목 — /videos 목록의 종목 제목(.vt-title)과 같은 스타일 */
.vd-head h2 { flex: 1; min-width: 0; margin: 0; font-family: var(--sans); font-size: 14.5px; font-weight: 700; color: var(--ink); }
.vd-close { flex: 0 0 auto; padding: 0; border: 0; background: none; color: var(--ink-light); font-size: 27px; line-height: 1; cursor: pointer; }
.vd-close:hover { color: var(--ink); }
.vd-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 20px; }
.vd-body h3 { margin: 0 0 12px; font-family: var(--serif); font-size: 14px; }
.vd-body h3 span { color: var(--ink-light); font-size: 12px; font-weight: 500; }
.vd-list { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
.vd-item { display: flex; align-items: center; gap: 14px; }
.vd-thumb-wrap { position: relative; flex: 0 0 168px; }
.vd-thumb { display: block; width: 100%; aspect-ratio: 16 / 9; padding: 0; overflow: hidden; border: 1px solid var(--line); background: #111; cursor: pointer; }
.vd-thumb:hover { border-color: var(--orange); }
.vd-thumb img, .vd-thumb video { display: block; width: 100%; height: 100%; object-fit: cover; }
.vd-no-thumb { display: flex; align-items: center; justify-content: center; height: 100%; color: #fff; font-size: 12px; }
.vd-yt { background: #000; font-weight: 700; }
.vd-remove {
  position: absolute; top: -7px; right: -7px; display: flex; align-items: center; justify-content: center;
  width: 21px; height: 21px; padding: 0; border: 1px solid rgba(255, 255, 255, .9); border-radius: 50%;
  background: var(--ink); color: #fff; font-size: 16px; line-height: 1; cursor: pointer;
}
.vd-remove:hover { background: var(--bad); }
.vd-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; color: var(--ink-mute); font-size: 12.5px; line-height: 1.5; }
.vd-meta b { padding: 2px 9px; background: var(--ink); color: #fff; font-size: 12px; }
.vd-meta b.cheer { background: var(--orange-deep); }
.vd-by { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.vd-by:hover { color: var(--orange-deep); }
.vd-meta b.yt { background: #d62b1f; }
.vd-item .vd-meta { flex-direction: column; align-items: flex-start; }
.vd-file { white-space: nowrap; }
.vd-add {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  aspect-ratio: 16 / 9; padding: 0; border: 1px dashed var(--line); background: var(--paper-deep); color: var(--ink-mute); cursor: pointer;
}
.vd-add:hover { border-color: var(--orange); color: var(--orange-deep); background: var(--paper); }
.vd-add-plus { font-size: 28px; font-weight: 300; line-height: 1; }
.vd-add-solo { width: 168px; }
.vd-time { color: var(--ink-light); font-size: 11.5px; }
.vd-empty { margin: 0; padding: 16px 0; color: var(--ink-light); font-size: 13px; }
.vd-err { margin: 12px 0 0; color: var(--bad); font-size: 12px; }

.vp-wrap { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; }
.vp-overlay { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(0, 0, 0, .7); cursor: default; }
.vp { position: relative; width: min(900px, calc(100vw - 24px)); background: #000; }
.vp video, .vp iframe { display: block; width: 100%; max-height: 74vh; aspect-ratio: 16 / 9; border: 0; background: #000; }
.vp-foot { padding: 12px 16px 14px; background: var(--paper); }
.vp-link { margin-left: auto; color: var(--ink-mute); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.vp-link:hover { color: var(--orange-deep); }
.vp-cap { margin: 8px 0 0; white-space: pre-wrap; color: var(--ink); font: 13.5px/1.55 var(--sans); }
.vp-x { position: absolute; top: -14px; right: -14px; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: #fff; color: var(--ink); font-size: 20px; line-height: 1; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, .3); }

@media (max-width: 640px) {
  .vd-item { flex-direction: column; align-items: stretch; }
  .vd-thumb-wrap { flex-basis: auto; }
  .vd-file { white-space: normal; word-break: break-all; }
  .vp-x { top: 6px; right: 6px; }
}
</style>
