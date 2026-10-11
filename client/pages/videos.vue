<script setup lang="ts">
// 영상(기록표) — 대회의 기록(times)을 종목별 표로 보여주고, 기록마다 영상을 보거나 올린다.
// 필터: 대회 · 성별 · 종목(영법) · 거리 — 성별·종목·거리는 '전체'가 기본.
// 종목(부 · 그룹 · 성별 · 영법 · 거리 · 코스)마다 표 하나, 표 안은 기록 빠른 순(같으면 순위 → 이름).
//   열: no · name · ageGroup · gender · team · discipline · distance · time · rank · status · 영상(있으면) · 올리기 (코스는 종목 제목에만)
// 올리기 아이콘 → 그 선수가 미리 채워진 영상 올리기 모달(VideoModal). 영상 아이콘 → 재생 모달.
// 카드로 훑어보는 화면은 videoscard 페이지. 내부 작업용이라 메뉴에 걸지 않고 검색 노출도 막는다.
import { computed, onMounted, ref, watch } from 'vue'

// 로그인한 사람만 — 아니면 /login 으로 보낸다 (middleware/auth.ts)
definePageMeta({ middleware: 'auth' })
useHead({ title: '영상 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const DISC_ORDER = Object.keys(DISC_KO)
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const GENDER_ORDER = Object.keys(GENDER_KO)
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M']

// ── 필터 ── 성별·종목·거리는 '' = 전체
const competitionID = ref<number | ''>('')
const gender = ref('')
const discipline = ref('')
const distance = ref('')

const competitions = ref<any[]>([])
const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const load = async () => {
  if (!competitionID.value) { rows.value = []; return }
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = { competitionID: competitionID.value }
    if (gender.value) params.gender = gender.value
    if (discipline.value) params.discipline = discipline.value
    if (distance.value) params.distance = distance.value
    rows.value = await $fetch<any[]>('/api/videos/times', { params })
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
watch([competitionID, gender, discipline, distance], load)

// ── 종목별 묶음 ── 종목 = 부 · 그룹 · 성별 · 영법 · 거리 · 코스 (예: 성인부 성인1그룹 남자 자유형 50M LCM)
const ko = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), 'ko', { numeric: true })
const distN = (v: any) => { const m = String(v || '').match(/(\d+)/); return m ? Number(m[1]) : Infinity }
const ord = (list: string[], v: string) => { const i = list.indexOf(v); return i < 0 ? list.length : i }
// 기록을 견줄 수 있는 수로 — 서버의 timeStamp(하루를 1로 본 값)를 쓰고, 없으면 "01:49.04"·"25.34" 글자를 초로 읽는다
const timeN = (r: any) => {
  if (r.status) return Infinity
  if (Number(r.timeStamp) > 0) return Number(r.timeStamp) * 86400
  const m = String(r.time || '').trim().match(/^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/)
  if (!m) return Infinity
  const parts = [m[1], m[2]].filter((v) => v != null).map(Number)
  const sec = parts.reduce((acc, v) => acc * 60 + v, 0) * 60 + Number(m[3])
  return sec > 0 ? sec : Infinity
}
const rankN = (r: any) => (Number(r.rank) > 0 ? Number(r.rank) : Infinity)
const groups = computed(() => {
  const by = new Map<string, any>()
  for (const r of rows.value) {
    const key = [r.isAdult ? 1 : 0, r.ageGroup, r.gender, r.discipline, r.distance, r.course].join('|')
    if (!by.has(key)) {
      by.set(key, {
        key, isAdult: r.isAdult, ageGroup: r.ageGroup, gender: r.gender, discipline: r.discipline, distance: r.distance, course: r.course,
        title: [r.isAdult ? '성인부' : '', r.ageGroup, GENDER_KO[r.gender] || r.gender, DISC_KO[r.discipline] || r.discipline, r.distance, r.course].filter(Boolean).join(' '),
        rows: [] as any[],
      })
    }
    by.get(key).rows.push(r)
  }
  const out = [...by.values()]
  // 표 안은 기록(time) 빠른 순 — 같으면 순위(rank), 그다음 이름. 기록이 없거나 실격(status)이면 맨 뒤.
  for (const g of out) g.rows.sort((a: any, b: any) => (timeN(a) - timeN(b)) || (rankN(a) - rankN(b)) || ko(a.name, b.name))
  // 종목 순서 — 그룹 → 성별 → 영법 → 거리 → 코스
  return out.sort((a, b) => ko(a.ageGroup, b.ageGroup)
    || (ord(GENDER_ORDER, a.gender) - ord(GENDER_ORDER, b.gender))
    || (ord(DISC_ORDER, a.discipline) - ord(DISC_ORDER, b.discipline))
    || (distN(a.distance) - distN(b.distance))
    || ko(a.course, b.course))
})
const withVideo = computed(() => rows.value.filter((r) => r.videos?.length).length)

// ── 재생 모달 — 그 기록의 영상을 본다(여러 개면 번호로 바꾼다) ──
const playRow = ref<any | null>(null)
const playIdx = ref(0)
const playing = computed(() => playRow.value?.videos?.[playIdx.value] || null)
const openPlay = (r: any) => { playRow.value = r; playIdx.value = 0 }
const closePlay = () => { playRow.value = null }
const onPlayKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePlay() }
watch(playRow, (v) => {
  if (typeof window === 'undefined') return
  if (v) window.addEventListener('keydown', onPlayKey)
  else window.removeEventListener('keydown', onPlayKey)
})
onBeforeUnmount(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onPlayKey) })
const rowTitle = (r: any) => [r.name, r.team, r.ageGroup, GENDER_KO[r.gender] || r.gender, DISC_KO[r.discipline] || r.discipline, r.distance, r.time].filter(Boolean).join(' · ')

// ── 올리기·편집 모달 (VideoModal) ──
const selected = ref<any | null>(null)
// 올리기 — 그 기록의 선수를 미리 채운 새 영상. 종목은 기록에서 정해진다.
const openUpload = (r: any) => {
  selected.value = {
    _new: true, competitionID: r.competitionID, discipline: r.discipline, gender: r.gender, distance: r.distance,
    athletes: [{ name: r.name, team: r.team, ageGroup: r.ageGroup, timeID: r.timeID }],
  }
}
// 재생 모달에서 '정보 편집' — 그 영상의 상세로
const openEdit = (v: any) => { closePlay(); selected.value = v }
// 영상이 생기거나 바뀌거나 지워지면 표의 영상 표시가 달라진다(영상 하나가 여러 기록에 걸릴 수 있다) — 다시 받는다
const onChanged = async () => { selected.value = null; await load() }
</script>

<template>
  <div class="vt">
    <!-- 필터 -->
    <div class="vt-bar">
      <select v-model="competitionID" class="f-sel f-comp" aria-label="대회">
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }}<template v-if="c.datetime"> ({{ c.datetime }})</template>
        </option>
      </select>
      <select v-model="gender" class="f-sel" aria-label="성별">
        <option value="">성별 전체</option>
        <option v-for="(label, code) in GENDER_KO" :key="code" :value="code">{{ label }}</option>
      </select>
      <select v-model="discipline" class="f-sel" aria-label="종목">
        <option value="">종목 전체</option>
        <option v-for="(label, code) in DISC_KO" :key="code" :value="code">{{ label }}</option>
      </select>
      <select v-model="distance" class="f-sel" aria-label="거리">
        <option value="">거리 전체</option>
        <option v-for="d in DIST_OPTS" :key="d" :value="d">{{ d }}</option>
      </select>
    </div>

    <p v-if="errorMsg" class="vt-err">{{ errorMsg }}</p>
    <p v-else class="vt-note">
      <template v-if="loading">불러오는 중…</template>
      <template v-else>종목 {{ groups.length }}개 · 기록 {{ rows.length }}건 · 영상 있음 {{ withVideo }}</template>
    </p>

    <!-- 종목별 표 -->
    <section v-for="g in groups" :key="g.key" class="vt-group">
      <h2 class="vt-title">{{ g.title }} <span class="vt-n">{{ g.rows.length }}</span></h2>
      <div class="vt-scroll">
        <table class="vt-table">
          <thead>
            <tr>
              <th class="num">no</th><th>name</th><th>ageGroup</th><th>gender</th><th>team</th>
              <th>discipline</th><th>distance</th><th class="num">time</th><th class="num">rank</th><th>status</th>
              <th class="ic" aria-label="영상" /><th class="ic" aria-label="올리기" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in g.rows" :key="r.timeID" :class="{ has: r.videos.length }">
              <td class="num">{{ Number(i) + 1 }}</td>
              <td class="strong">{{ r.name }}</td>
              <td>{{ r.ageGroup }}</td>
              <td>{{ GENDER_KO[r.gender] || r.gender }}</td>
              <td>{{ r.team }}</td>
              <td>{{ DISC_KO[r.discipline] || r.discipline }}</td>
              <td>{{ r.distance }}</td>
              <td class="num mono">{{ r.time }}</td>
              <td class="num">{{ r.rank }}</td>
              <td class="st">{{ r.status }}</td>
              <!-- 영상 — 있으면 재생 아이콘(여러 개면 개수) -->
              <td class="ic">
                <button v-if="r.videos.length" class="ico ico-play" type="button" :title="`영상 ${r.videos.length}개 — 재생`" aria-label="영상 재생" @click="openPlay(r)">
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
                  <span v-if="r.videos.length > 1" class="cnt">{{ r.videos.length }}</span>
                </button>
              </td>
              <!-- 올리기 -->
              <td class="ic">
                <button class="ico ico-up" type="button" :title="`${r.name} 영상 올리기`" aria-label="영상 올리기" @click="openUpload(r)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M5 20h14" /></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-if="!loading && !errorMsg && !rows.length" class="vt-empty">조건에 맞는 기록이 없습니다.</p>

    <!-- 재생 모달 -->
    <div v-if="playRow && playing" class="pm">
      <div class="pm-ov" @click="closePlay" />
      <div class="pm-box" role="dialog" aria-modal="true" aria-label="영상 재생">
        <video :key="playing._id" :src="playing.url" :poster="playing.thumbnail || undefined" controls autoplay playsinline />
        <div class="pm-foot">
          <p class="pm-cap">{{ rowTitle(playRow) }}</p>
          <!-- 영상이 여러 개면 번호로 바꿔 본다 -->
          <span v-if="playRow.videos.length > 1" class="pm-nums">
            <button v-for="(v, i) in playRow.videos" :key="v._id" class="pm-num" type="button" :class="{ on: Number(i) === playIdx }" @click="playIdx = Number(i)">{{ Number(i) + 1 }}</button>
          </span>
          <a class="pm-link" :href="`/api/videos/${playing._id}/download`">내려받기</a>
          <button class="pm-link" type="button" @click="openEdit(playing)">정보 편집</button>
        </div>
        <button class="pm-x" type="button" aria-label="닫기" @click="closePlay">×</button>
      </div>
    </div>

    <VideoModal :row="selected" @close="selected = null" @created="onChanged" @saved="onChanged" @deleted="onChanged" />
  </div>
</template>

<style scoped>
.vt { font-family: var(--sans); padding-bottom: 60px; }
.vt-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.f-sel {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; cursor: pointer;
}
.f-sel:focus { outline: none; border-color: var(--orange); }
.f-comp { flex: 1 1 260px; min-width: 0; max-width: 420px; }
.vt-note { margin: 0 0 16px; font-size: 12.5px; color: var(--ink-mute); }
.vt-err { margin: 0 0 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
.vt-empty { margin: 40px 0; text-align: center; font-size: 13.5px; color: var(--ink-light); }

/* 종목 하나 = 제목 + 표 */
.vt-group { margin-bottom: 26px; }
.vt-title { margin: 0 0 6px; font-size: 14.5px; font-weight: 700; color: var(--ink); }
.vt-n { margin-left: 4px; font-size: 12px; font-weight: 400; color: var(--ink-light); }
.vt-scroll { overflow-x: auto; border-top: 2px solid var(--ink); }
.vt-table { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
.vt-table th, .vt-table td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--line-soft); }
.vt-table th { font-size: 11.5px; font-weight: 600; color: var(--ink-light); border-bottom-color: var(--line); }
.vt-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.vt-table .mono { font-family: var(--mono); }
.vt-table td.strong { font-weight: 700; }
.vt-table td.st { color: var(--bad); font-weight: 600; }
.vt-table .ic { width: 34px; padding: 3px 4px; text-align: center; }
.vt-table tbody tr:hover td { background: var(--paper-deep); }
/* 영상이 있는 기록 — 왼쪽에 주황 표시 */
.vt-table tr.has td:first-child { box-shadow: inset 2px 0 0 var(--orange); }

.ico {
  position: relative; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0;
  color: var(--ink-mute); background: none; border: 1px solid var(--line); border-radius: 6px; cursor: pointer;
}
.ico svg { width: 15px; height: 15px; }
.ico:hover { border-color: var(--orange); color: var(--orange); }
.ico-play { color: #fff; background: var(--orange); border-color: var(--orange); }
.ico-play:hover { color: #fff; background: var(--orange-deep); border-color: var(--orange-deep); }
.ico .cnt {
  position: absolute; right: -6px; top: -6px; min-width: 16px; padding: 0 4px; font-size: 10.5px; font-weight: 700; line-height: 16px;
  color: #fff; background: var(--ink); border-radius: 8px;
}

/* 재생 모달 */
.pm { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.pm-ov { position: absolute; inset: 0; background: rgba(0, 0, 0, .85); }
.pm-box { position: relative; display: flex; flex-direction: column; gap: 8px; max-width: min(1100px, 100%); max-height: 100%; }
.pm-box video { display: block; max-width: 100%; max-height: calc(100vh - 100px); background: #000; }
.pm-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.pm-cap { flex: 1 1 200px; margin: 0; font-size: 12.5px; color: #ddd; word-break: break-all; }
.pm-nums { display: inline-flex; gap: 4px; }
.pm-num { min-width: 26px; height: 26px; padding: 0 6px; font-size: 12px; color: #ddd; background: none; border: 1px solid #666; border-radius: 5px; cursor: pointer; }
.pm-num.on { color: #fff; background: var(--orange); border-color: var(--orange); }
.pm-link { font-family: var(--sans); font-size: 12.5px; color: #fff; background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
.pm-link:hover { color: var(--orange); }
.pm-x { position: absolute; top: -6px; right: -4px; transform: translateY(-100%); border: none; background: none; color: #fff; font-size: 30px; line-height: 1; cursor: pointer; padding: 0 4px; }
.pm-x:hover { color: var(--orange); }

@media (max-width: 640px) {
  .f-sel { flex: 1 1 calc(33% - 6px); min-width: 0; }
  .f-comp { flex-basis: 100%; max-width: none; }
  .vt-table th, .vt-table td { padding: 7px 7px; }
}
</style>
