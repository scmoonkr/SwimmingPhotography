<script setup lang="ts">
// 영상 — 올린 영상(videos)을 카드로 훑어보고, 눌러서 선수를 붙인다. images 페이지와 같은 구성.
// 필터: 대회 · 영법 · 성별 · 거리.
// 맨 앞 '영상 올리기' 카드로 지금 고른 대회·종목에 새 영상을 올린다.
// 카드: 영상 왼쪽 위 = 내려받기, 오른쪽 위(또는 영상) = 재생, 아래 글자 = 영상 정보 편집(VideoModal).
// 내부 작업용 화면이라 메뉴에 걸지 않고 검색 노출도 막는다.
import { onMounted, ref, watch } from 'vue'

// 로그인한 사람만 — 아니면 /login 으로 보낸다 (middleware/auth.ts)
definePageMeta({ middleware: 'auth' })
useHead({ title: '영상 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M']

// ── 필터 ──
const competitionID = ref<number | ''>('')
// 기본값 — 자유형 · 남자 · 50M. 영법·성별·거리는 '전체' 없이 항상 하나를 고른다(한 종목씩 본다)
const discipline = ref('FR')
const gender = ref('men')
const distance = ref('50M')

const competitions = ref<any[]>([])
const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const load = async () => {
  if (!competitionID.value) { rows.value = []; return }
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = {
      competitionID: competitionID.value, discipline: discipline.value, gender: gender.value, distance: distance.value,
    }
    rows.value = await $fetch<any[]>('/api/videos', { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  try { competitions.value = await $fetch<any[]>('/api/images/competitions') } catch { competitions.value = [] }
  // 처음에는 가장 최근 대회를 고른다 → watch 가 load 실행
  if (competitions.value.length) competitionID.value = competitions.value[0].competitionID
})
watch([competitionID, discipline, gender, distance], load)

// 여러 명이 찍힌 영상 — 선수들의 값을 콤마로 잇는다(같은 값은 한 번만)
const multi = (r: any, k: 'name' | 'team' | 'ageGroup') =>
  [...new Set((r.athletes || []).map((a: any) => a[k]).filter(Boolean))].join(',')
// 카드 아래 한 줄 — name-gender-team-ageGroup-discipline-distance-저장한 사람 (빈 값은 뺀다)
const caption = (r: any) => [
  multi(r, 'name'), GENDER_KO[r.gender] || r.gender, multi(r, 'team'), multi(r, 'ageGroup'),
  DISC_KO[r.discipline] || r.discipline, r.distance,
  r.contributorName || r.contributor,
].filter(Boolean).join('-')

// ── 재생 모달 — 영상만 크게 본다 ──
const playing = ref<any | null>(null)
const onPlayKey = (e: KeyboardEvent) => { if (e.key === 'Escape') playing.value = null }
watch(playing, (v) => {
  if (typeof window === 'undefined') return
  if (v) window.addEventListener('keydown', onPlayKey)
  else window.removeEventListener('keydown', onPlayKey)
})
onBeforeUnmount(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onPlayKey) })

// ── 상세(편집) 모달 ──
const selected = ref<any | null>(null)
// 새 영상 — 지금 고른 대회·종목으로 올린다 (모달에서 종목은 바꿀 수 있다)
const openNew = () => {
  if (!competitionID.value) return
  selected.value = { _new: true, competitionID: competitionID.value, discipline: discipline.value, gender: gender.value, distance: distance.value }
}
// 필터에 맞는 영상인가 — 모달에서 종목을 바꿨으면 목록에서 뺀다
const fits = (r: any) => r.discipline === discipline.value && r.gender === gender.value && r.distance === distance.value
// 올리면 문서가 생긴다(선수·캡션까지 저장된 상태) — 목록 맨 앞에 넣고 닫는다
const onCreated = (v: any) => {
  if (fits(v)) rows.value = [v, ...rows.value]
  selected.value = null
}
const onSaved = (r: any) => {
  selected.value = null
  if (!fits(r)) rows.value = rows.value.filter((x) => x !== r)
}
const onDeleted = (r: any) => {
  selected.value = null
  rows.value = rows.value.filter((x) => x !== r)
}
</script>

<template>
  <div class="vsel">
    <!-- 필터 -->
    <div class="vsel-bar">
      <select v-model="competitionID" class="f-sel f-comp" aria-label="대회">
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }}<template v-if="c.datetime"> ({{ c.datetime }})</template>
        </option>
      </select>
      <select v-model="discipline" class="f-sel" aria-label="영법">
        <option v-for="(ko, code) in DISC_KO" :key="code" :value="code">{{ ko }}</option>
      </select>
      <select v-model="gender" class="f-sel" aria-label="성별">
        <option v-for="(ko, code) in GENDER_KO" :key="code" :value="code">{{ ko }}</option>
      </select>
      <select v-model="distance" class="f-sel" aria-label="거리">
        <option v-for="d in DIST_OPTS" :key="d" :value="d">{{ d }}</option>
      </select>
    </div>

    <p v-if="errorMsg" class="vsel-err">{{ errorMsg }}</p>
    <p v-else class="vsel-note">
      <template v-if="loading">불러오는 중…</template>
      <template v-else>총 {{ rows.length }}개</template>
    </p>

    <!-- 영상 카드 — 맨 앞은 새 영상 올리기 -->
    <div class="vsel-grid">
      <button class="card card-new" type="button" :disabled="!competitionID" @click="openNew">
        <span class="card-vid"><span class="empty">＋ 영상 올리기</span></span>
        <span class="card-cap">{{ [GENDER_KO[gender], DISC_KO[discipline], distance].join('-') }} 에 올립니다</span>
      </button>
      <div v-for="r in rows" :key="r._id" class="card" :class="{ picked: r.timeID != null }">
        <div class="card-vid">
          <!-- 영상을 누르면 재생. 썸네일이 있으면 그것을 첫 화면으로(누르기 전엔 영상을 받지 않는다), 없으면 앞부분만 받아 첫 장면을 그린다 -->
          <button class="vid-btn" type="button" :aria-label="`${r.filename} 재생`" @click="playing = r">
            <video
              :src="r.thumbnail ? r.url : r.url + '#t=0.1'" :poster="r.thumbnail || undefined"
              :preload="r.thumbnail ? 'none' : 'metadata'" muted playsinline tabindex="-1"
            />
          </button>
          <!-- 왼쪽 위 — 내려받기 -->
          <a class="ico ico-dl" :href="`/api/videos/${r._id}/download`" :title="`내려받기 — ${r.filename}`" aria-label="영상 내려받기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>
          </a>
          <!-- 오른쪽 위 — 재생 -->
          <button class="ico ico-play" type="button" title="재생" aria-label="영상 재생" @click="playing = r">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
          </button>
        </div>
        <!-- 글자를 누르면 영상 정보 편집 -->
        <button class="card-cap cap-btn" type="button" title="영상 정보 편집" @click="selected = r">{{ caption(r) || '정보 입력' }}</button>
      </div>
    </div>
    <p v-if="!loading && !errorMsg && !rows.length" class="vsel-empty">이 종목에 올린 영상이 아직 없습니다.</p>

    <!-- 재생 모달 -->
    <div v-if="playing" class="pm">
      <div class="pm-ov" @click="playing = null" />
      <div class="pm-box" role="dialog" aria-modal="true" aria-label="영상 재생">
        <video :key="playing._id" :src="playing.url" :poster="playing.thumbnail || undefined" controls autoplay playsinline />
        <p class="pm-cap">{{ caption(playing) }}</p>
        <button class="pm-x" type="button" aria-label="닫기" @click="playing = null">×</button>
      </div>
    </div>

    <VideoModal :row="selected" @close="selected = null" @created="onCreated" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.vsel { font-family: var(--sans); padding-bottom: 60px; }
.vsel-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.f-sel {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; cursor: pointer;
}
.f-sel:focus { outline: none; border-color: var(--orange); }
.f-comp { flex: 1 1 260px; min-width: 0; max-width: 420px; }
.vsel-note { margin: 0 0 14px; font-size: 12.5px; color: var(--ink-mute); }
.vsel-err { margin: 0 0 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
.vsel-empty { margin: 28px 0; text-align: center; font-size: 13.5px; color: var(--ink-light); }

.vsel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px 12px; }
.card {
  display: flex; flex-direction: column; gap: 6px; padding: 0; text-align: left;
  font-family: var(--sans); color: var(--ink); background: none; border: none;
}
button.card { cursor: pointer; }
.card:disabled { opacity: .5; cursor: default; }
.card-vid { position: relative; display: block; aspect-ratio: 4 / 3; background: var(--paper-deep); border: 1px solid var(--line); overflow: hidden; }
/* 영상 자리 전체가 재생 단추 */
.vid-btn { display: block; width: 100%; height: 100%; padding: 0; border: none; background: #000; cursor: pointer; }
.vid-btn video { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
/* 모서리 아이콘 — 왼쪽 위 내려받기 · 오른쪽 위 재생 */
.ico {
  position: absolute; top: 6px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0;
  color: #fff; background: rgba(0, 0, 0, .55); border: none; border-radius: 50%; cursor: pointer; text-decoration: none;
}
.ico svg { width: 16px; height: 16px; }
.ico-dl { left: 6px; }
.ico-play { right: 6px; }
.ico:hover { background: var(--orange); }
.card-vid .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--ink-mute); }
.card-new .card-vid { border-style: dashed; }
button.card:hover:not(:disabled) .card-vid { border-color: var(--orange); }
.card-new:hover:not(:disabled) .empty { color: var(--orange); }
/* 선택됨(선수 기록에 연결됨) — 테두리로 구분 */
.card.picked .card-vid { border-color: var(--orange); outline: 2px solid var(--orange); outline-offset: -1px; }
.card-cap { font-size: 12px; line-height: 1.45; color: var(--ink-mute); word-break: break-all; }
.card.picked .card-cap { color: var(--ink); }
/* 글자 = 편집 단추 */
.cap-btn { padding: 0; text-align: left; font-family: var(--sans); background: none; border: none; cursor: pointer; }
.cap-btn:hover { color: var(--orange); text-decoration: underline; }

/* 재생 모달 */
.pm { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.pm-ov { position: absolute; inset: 0; background: rgba(0, 0, 0, .85); }
.pm-box { position: relative; display: flex; flex-direction: column; gap: 8px; max-width: min(1100px, 100%); max-height: 100%; }
.pm-box video { display: block; max-width: 100%; max-height: calc(100vh - 90px); background: #000; }
.pm-cap { margin: 0; font-size: 12.5px; color: #ddd; word-break: break-all; }
.pm-x { position: absolute; top: -6px; right: -4px; transform: translateY(-100%); border: none; background: none; color: #fff; font-size: 30px; line-height: 1; cursor: pointer; padding: 0 4px; }
.pm-x:hover { color: var(--orange); }

@media (max-width: 640px) {
  .vsel-grid { grid-template-columns: repeat(2, 1fr); gap: 12px 8px; }
  .f-sel { flex: 1 1 calc(50% - 4px); min-width: 0; }
  .f-comp { flex-basis: 100%; max-width: none; }
}
</style>
