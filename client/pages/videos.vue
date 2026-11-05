<script setup lang="ts">
// 영상(기록표) — 대회의 기록(times)을 종목별 표로 보여주고, 기록마다 영상을 보거나 올린다.
// 필터: 대회 · 성별 · 종목(영법) · 거리 — 성별·종목·거리는 '전체'가 기본.
// 종목(부 · 그룹 · 성별 · 영법 · 거리 · 코스 · 예선/결선)마다 표 하나, 표 안은 기록 빠른 순(같으면 순위 → 이름).
//   열: no · name · ageGroup · gender · team · discipline · distance · time · rank · status · 영상(있으면) · 올리기 (코스는 종목 제목에만)
// 행(영상 아이콘 포함)을 누르면 영상 보기 모달(VideoDrawer), 올리기 아이콘은 올리기 모달(VideoUpload).
// 카드로 훑어보는 화면은 videoscard 페이지. 내부 작업용이라 메뉴에 걸지 않고 검색 노출도 막는다.
import { computed, onMounted, ref, watch } from 'vue'

// 로그인한 사람만 — 아니면 /signin 으로 보낸다 (middleware/auth.ts)
definePageMeta({ middleware: 'auth' })
useHead({ title: '영상 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const DISC_ORDER = Object.keys(DISC_KO)
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const GENDER_ORDER = Object.keys(GENDER_KO)

// ── 필터 ── 성별·종목·거리는 '' = 전체
const competitionID = ref<number | ''>('')
const gender = ref('')
const discipline = ref('')
const distance = ref('')

const competitions = ref<any[]>([])
const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')
const selectedCompetition = computed(() => competitions.value.find((c) => String(c.competitionID) === String(competitionID.value)))
const competitionLabel = computed(() => selectedCompetition.value?.competitionName || String(competitionID.value || '대회 전체'))
const genderLabel = computed(() => gender.value ? (GENDER_KO[gender.value] || gender.value) : '')
const disciplineLabel = computed(() => discipline.value ? (DISC_KO[discipline.value] || discipline.value) : '')
const distanceLabel = computed(() => distance.value || '')
const selectedFilterTitle = computed(() => {
  const date = String(selectedCompetition.value?.datetime || '').slice(0, 10)
  const competition = date ? `${competitionLabel.value} (${date})` : competitionLabel.value
  return [competition, genderLabel.value, disciplineLabel.value, distanceLabel.value].filter(Boolean).join(' · ')
})
const emptyFacets = () => ({
  genderOptions: [] as string[], disciplineOptions: [] as string[], distanceOptions: [] as string[],
  genders: {} as Record<string, number>, genderTotal: 0,
  disciplines: {} as Record<string, number>, disciplineTotal: 0,
  distances: {} as Record<string, number>, distanceTotal: 0,
  distribution: {} as Record<string, number>, distributionTotal: 0,
})
const facetCounts = ref(emptyFacets())
const visibleGenderOptions = computed(() => [...new Set([...facetCounts.value.genderOptions, gender.value].filter(Boolean))]
  .sort((a, b) => GENDER_ORDER.indexOf(a) - GENDER_ORDER.indexOf(b))
  .map((code) => ({ code, label: GENDER_KO[code] || code, count: Number(facetCounts.value.genders[code]) || 0 })))
const visibleDisciplineOptions = computed(() => [...new Set([...facetCounts.value.disciplineOptions, discipline.value].filter(Boolean))]
  .sort((a, b) => DISC_ORDER.indexOf(a) - DISC_ORDER.indexOf(b))
  .map((code) => ({ code, label: DISC_KO[code] || code, count: Number(facetCounts.value.disciplines[code]) || 0 })))
const distanceNumber = (value: string) => Number(String(value).match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER
const visibleDistanceOptions = computed(() => [...new Set([...facetCounts.value.distanceOptions, distance.value].filter(Boolean))]
  .sort((a, b) => distanceNumber(a) - distanceNumber(b) || a.localeCompare(b))
  .map((value) => ({ value, count: Number(facetCounts.value.distances[value]) || 0 })))

const STROKE_GROUPS = [
  { key: 'FR', label: '자유형', codes: ['FR'], color: '#d96f36' },
  { key: 'BA', label: '배영', codes: ['BA'], color: '#52798a' },
  { key: 'BR', label: '평영', codes: ['BR'], color: '#b38a3e' },
  { key: 'FL', label: '접영', codes: ['FL'], color: '#886579' },
  { key: 'IM', label: '개인혼영', codes: ['IM'], color: '#6f8064' },
  { key: 'RELAY', label: '단체전', codes: ['FRR', 'MR'], color: '#515966' },
] as const
const strokeDistribution = computed(() => {
  const counts = facetCounts.value.distribution || {}
  const items = STROKE_GROUPS.map((group) => ({
    ...group,
    count: group.codes.reduce((sum, code) => sum + (Number(counts[code]) || 0), 0),
  }))
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return items.map((item) => {
    const rawPercent = total ? (item.count / total) * 100 : 0
    return {
      ...item,
      width: `${rawPercent}%`,
      percent: rawPercent >= 10 ? Math.round(rawPercent).toString() : rawPercent.toFixed(1).replace(/\.0$/, ''),
    }
  })
})
const strokeDistributionLabel = computed(() => strokeDistribution.value
  .map((item) => `${item.label} ${item.percent}% ${item.count}개`)
  .join(', '))

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
const loadFacets = async () => {
  if (!competitionID.value) { facetCounts.value = emptyFacets(); return }
  const params: Record<string, any> = { competitionID: competitionID.value }
  if (gender.value) params.gender = gender.value
  if (discipline.value) params.discipline = discipline.value
  if (distance.value) params.distance = distance.value
  try {
    facetCounts.value = await $fetch<any>('/api/videos/facets', { params })
  } catch {
    facetCounts.value = emptyFacets()
  }
}
const reload = () => Promise.all([load(), loadFacets()])
onMounted(async () => {
  try { competitions.value = await $fetch<any[]>('/api/images/competitions') } catch { competitions.value = [] }
  // 처음에는 가장 최근 대회를 고른다 → watch 가 load 실행
  if (competitions.value.length) competitionID.value = competitions.value[0].competitionID
  else await reload()
})
watch([competitionID, gender, discipline, distance], reload)

// ── 종목별 묶음 ── 종목 = 부 · 그룹 · 성별 · 영법 · 거리 · 코스 · 라운드 (예: 성인부 1그룹 남자 자유형 50M LCM 예선)
// 라운드(예선/결선)가 없는 기록은 라운드 없이 묶는다.
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
// 라운드 — 기록마다 표기가 섞여 있어(예선·결승·finals·preliminaries …) 예선/준결/결선 으로 맞춘다. 없으면 ''(종목에서 무시)
const roundKo = (v: any) => {
  const t = String(v || '').trim()
  if (!t) return ''
  if (/준결|semi/i.test(t)) return '준결'          // '준결승' 은 '결' 을 포함하니 먼저 거른다
  if (/결|final/i.test(t)) return '결선'
  if (/예선|prelim|heat/i.test(t)) return '예선'
  return t
}
const ROUND_ORDER = ['', '예선', '준결', '결선']
// 그룹 표기 — 앞에 '성인부'를 붙이므로 그룹 이름의 '성인'은 뗀다 (성인1그룹 → 1그룹, 성인 -159 → -159)
// 성인이 아닌 기록은 앞에 '학생부'를 붙이고 그룹 이름은 그대로 둔다 (학생부 초등 3학년 …)
const groupLabel = (r: any) => (r.isAdult ? String(r.ageGroup || '').replace(/^성인\s*/, '') : (r.ageGroup || ''))
const groups = computed(() => {
  const by = new Map<string, any>()
  for (const r of rows.value) {
    const round = roundKo(r.round)
    const key = [r.isAdult ? 1 : 0, r.ageGroup, r.gender, r.discipline, r.distance, r.course, round].join('|')
    if (!by.has(key)) {
      by.set(key, {
        key, isAdult: r.isAdult, ageGroup: r.ageGroup, gender: r.gender, discipline: r.discipline, distance: r.distance, course: r.course, round,
        title: [r.isAdult ? '성인부' : '학생부', groupLabel(r), GENDER_KO[r.gender] || r.gender, DISC_KO[r.discipline] || r.discipline, r.distance, r.course, round].filter(Boolean).join(' '),
        rows: [] as any[],
      })
    }
    by.get(key).rows.push(r)
  }
  const out = [...by.values()]
  // 표 안은 기록(time) 빠른 순 — 같으면 순위(rank), 그다음 이름. 기록이 없거나 실격(status)이면 맨 뒤.
  for (const g of out) {
    g.rows.sort((a: any, b: any) => (timeN(a) - timeN(b)) || (rankN(a) - rankN(b)) || ko(a.name, b.name))
    g.hasRank = g.rows.some((row: any) => Number(row.rank) > 0)
  }
  // 종목 순서 — 그룹 → 성별 → 영법 → 거리 → 코스 → 라운드(예선 → 준결 → 결선)
  return out.sort((a, b) => ko(a.ageGroup, b.ageGroup)
    || (ord(GENDER_ORDER, a.gender) - ord(GENDER_ORDER, b.gender))
    || (ord(DISC_ORDER, a.discipline) - ord(DISC_ORDER, b.discipline))
    || (distN(a.distance) - distN(b.distance))
    || ko(a.course, b.course)
    || (ord(ROUND_ORDER, a.round) - ord(ROUND_ORDER, b.round)))
})
const videoTotal = computed(() => Number(facetCounts.value.distributionTotal) || 0)
const drawerRow = ref<any | null>(null)
const uploadRow = ref<any | null>(null)
// 행 클릭 — 영상이 있으면 영상 목록 모달, 없으면 바로 영상 올리기 모달
const openDrawer = (row: any) => {
  if (row.videos?.length) drawerRow.value = row
  else uploadRow.value = row
}
const refreshDrawer = async () => {
  const timeID = drawerRow.value?.timeID
  await reload()
  if (timeID != null) drawerRow.value = rows.value.find((row) => row.timeID === timeID) || null
}

// 영상이 생기거나 바뀌거나 지워지면 표의 영상 표시가 달라진다(영상 하나가 여러 기록에 걸릴 수 있다) — 다시 받는다
const onDrawerDeleted = async () => { await refreshDrawer() }
</script>

<template>
  <div class="vt">
    <header class="vt-overview">
      <h1 class="vt-page-title">{{ selectedFilterTitle }}</h1>
      <div class="stroke-summary">
        <div class="stroke-meter" role="img" :aria-label="`영법별 영상 분포: ${strokeDistributionLabel}`">
          <span
            v-for="item in strokeDistribution" v-show="item.count" :key="item.key"
            class="stroke-segment" :style="{ width: item.width, backgroundColor: item.color }"
            :title="`${item.label} ${item.percent}% · ${item.count.toLocaleString()}개`"
          />
        </div>
        <div class="stroke-legend">
          <span v-for="item in strokeDistribution" :key="item.key" class="stroke-stat">
            <i class="stroke-dot" :style="{ backgroundColor: item.color }" aria-hidden="true" />
            <span class="stroke-name">{{ item.label }}</span>
            <span class="stroke-value">{{ item.percent }}% · {{ item.count.toLocaleString() }}개</span>
          </span>
        </div>
      </div>
    </header>

    <!-- 필터 -->
    <div class="vt-bar">
      <select v-model="competitionID" class="f-sel f-comp" aria-label="대회">
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }}<template v-if="c.datetime"> ({{ c.datetime }})</template>
        </option>
      </select>
      <select v-model="gender" class="f-sel" aria-label="성별">
        <option value="">전체 {{ facetCounts.genderTotal }}개</option>
        <option v-for="option in visibleGenderOptions" :key="option.code" :value="option.code">
          {{ option.label }} {{ option.count }}개
        </option>
      </select>
      <select v-model="discipline" class="f-sel" aria-label="종목">
        <option value="">전체 {{ facetCounts.disciplineTotal }}개</option>
        <option v-for="option in visibleDisciplineOptions" :key="option.code" :value="option.code">
          {{ option.label }} {{ option.count }}개
        </option>
      </select>
      <select v-model="distance" class="f-sel" aria-label="거리">
        <option value="">전체 {{ facetCounts.distanceTotal }}개</option>
        <option v-for="option in visibleDistanceOptions" :key="option.value" :value="option.value">
          {{ option.value }} {{ option.count }}개
        </option>
      </select>
    </div>

    <p v-if="errorMsg" class="vt-err">{{ errorMsg }}</p>
    <p v-else class="vt-note">
      <template v-if="loading">불러오는 중…</template>
      <template v-else>총 {{ groups.length }}개 종목 · 경기실적 {{ rows.length }}건 · {{ videoTotal }}개 영상</template>
    </p>

    <!-- 종목별 표 -->
    <section v-for="g in groups" :key="g.key" class="vt-group">
      <h2 class="vt-title">{{ g.title }} <span class="vt-n">{{ g.rows.length }}</span></h2>
      <div class="vt-scroll">
        <table class="vt-table">
          <thead>
            <tr>
              <th class="num rk">{{ g.hasRank ? '순위' : '#' }}</th><th>선수명</th><th class="hide-m">그룹</th>
              <th class="hide-m">종목</th><th class="num">경기실적</th><th>-</th>
              <th class="ic" aria-label="영상">-</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, i) in g.rows" :key="r.timeID" :class="{ has: r.videos.length, selected: drawerRow?.timeID === r.timeID }"
              tabindex="0" @click="openDrawer(r)" @keydown.enter.prevent="openDrawer(r)"
            >
              <td class="num rk">{{ g.hasRank ? (r.rank || '—') : Number(i) + 1 }}</td>
              <!-- 소속은 이름 옆에 흐린 회색으로, 성별은 종목 제목에 이미 있어 열을 두지 않는다 -->
              <td class="strong">{{ r.name }} <span v-if="r.team" class="team">{{ r.team }}</span></td>
              <td class="hide-m">{{ r.ageGroup }}</td>
              <td class="hide-m">{{ DISC_KO[r.discipline] || r.discipline }} {{ r.distance }}</td>
              <td class="num mono">{{ r.time }}</td>
              <td class="st">{{ r.status }}</td>
              <!-- 영상 — 있으면 재생 아이콘(여러 개면 개수) -->
              <td class="ic">
                <button v-if="r.videos.length" class="ico ico-play" :class="{ 'ico-yt': r.videos.every((v: any) => v.youtube) }" type="button" :title="`영상 ${r.videos.length}개`" aria-label="영상 보기">
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
                  <span v-if="r.videos.length > 1" class="cnt">{{ r.videos.length }}</span>
                </button>
                <span v-else class="ico ico-play ico-off" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
                </span>
                <button class="ico ico-up" type="button" :title="`${r.name} 영상 올리기`" aria-label="영상 올리기" @click.stop="uploadRow = r">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M5 20h14" /></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-if="!loading && !errorMsg && !rows.length" class="vt-empty">조건에 맞는 기록이 없습니다.</p>

    <VideoUpload v-if="uploadRow" :row="uploadRow" @close="uploadRow = null" @uploaded="refreshDrawer" />
    <VideoDrawer
      v-if="drawerRow && !uploadRow" :row="drawerRow"
      @close="drawerRow = null" @deleted="onDrawerDeleted" @add="uploadRow = drawerRow"
    />
  </div>
</template>

<style scoped>
.vt { font-family: var(--sans); padding-bottom: 60px; }
.vt-overview { margin: 0 0 18px; }
.vt-page-title {
  margin: 0 0 9px; font-family: var(--serif); font-size: 13px; font-weight: 700; line-height: 1.6; color: var(--ink);
  word-break: keep-all;
}
.stroke-summary { display: flex; flex-direction: column; gap: 8px; }
.stroke-meter {
  display: flex; width: 100%; height: 9px; gap: 1px; overflow: hidden;
  border-radius: 999px; background: var(--paper-deep); box-shadow: inset 0 0 0 1px rgba(26, 26, 26, .05);
}
.stroke-segment { display: block; min-width: 2px; height: 100%; }
.stroke-legend { display: flex; align-items: center; gap: 5px 16px; flex-wrap: wrap; }
.stroke-stat { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 11.5px; line-height: 1.5; }
.stroke-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.stroke-name { color: var(--ink-mute); }
.stroke-value { color: var(--ink-light); font-variant-numeric: tabular-nums; }
.vt-bar {
  display: grid; grid-template-columns: minmax(260px, 2fr) repeat(3, minmax(135px, 1fr));
  gap: 18px; align-items: end; padding-bottom: 13px; border-bottom: 1px solid var(--line);
}
.f-sel {
  min-width: 0; width: 100%; font-family: var(--serif); font-size: 13px; font-weight: 500; line-height: 1.6; color: var(--ink);
  background-color: transparent; border: none; border-radius: 0; padding: 4px 24px 4px 0; cursor: pointer;
}
.f-sel:hover { color: var(--orange-deep); }
.f-sel:focus { outline: none; box-shadow: inset 0 -2px 0 var(--orange); }
.f-comp { font-weight: 700; }
.vt-note { margin: 14px 0 20px; font-size: 12.5px; color: var(--ink-mute); }
.vt-err { margin: 14px 0 20px; padding: 9px 14px; border-left: 3px solid var(--bad); background: var(--bad-bg); color: var(--bad); font-size: 13px; }
.vt-empty { margin: 40px 0; text-align: center; font-size: 13.5px; color: var(--ink-light); }

/* 종목 하나 = 제목 + 표 */
.vt-group { margin-bottom: 26px; max-width: 760px; } /* 열 사이가 벌어지지 않도록 표 너비를 제한 */
.vt-title { margin: 0 0 6px; font-size: 14.5px; font-weight: 700; color: var(--ink); }
.vt-n { margin-left: 4px; font-size: 12px; font-weight: 400; color: var(--ink-light); }
.vt-scroll { overflow-x: auto; border-top: 2px solid var(--ink); }
.vt-table { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
.vt-table th, .vt-table td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--line-soft); }
.vt-table th { font-size: 11.5px; font-weight: 600; color: var(--ink-light); border-bottom-color: var(--line); }
.vt-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.vt-table .mono { font-family: var(--mono); }
.vt-table td.strong { font-weight: 700; }
.vt-table .team { margin-left: 2px; font-weight: 400; color: var(--ink-light); }
/* 순위 — 숫자 폭만큼만 차지한다 */
.vt-table th.rk, .vt-table td.rk { width: 1%; padding-left: 8px; padding-right: 2px; }
/* 영상이 없는 기록 — 글씨만 20% 흐리게 (영상 열의 아이콘은 그대로) */
.vt-table tbody tr:not(.has) td:not(.ic) { opacity: .8; }
.vt-table td.st { color: var(--bad); font-weight: 600; }
.vt-table .ic { width: 34px; padding: 3px 4px; text-align: center; }
.vt-table tbody tr { cursor: pointer; }
.vt-table tbody tr:nth-child(even) td { background: rgba(26, 26, 26, .018); }
.vt-table tbody tr:hover td, .vt-table tbody tr:focus td, .vt-table tbody tr.selected td { background: var(--paper-deep); }
.vt-table tbody tr:focus { outline: none; }
/* 영상이 있는 기록 — 왼쪽에 주황 표시 */
.vt-table tr.has td:first-child { box-shadow: inset 2px 0 0 var(--orange); }

.ico {
  position: relative; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0;
  color: var(--ink-mute); background: none; border: 1px solid var(--line); border-radius: 6px; cursor: pointer;
}
.ico svg { width: 15px; height: 15px; }
.ico:hover { border-color: var(--orange); color: var(--orange); }
.ic .ico + .ico, .ic .ico-off + .ico { margin-left: 5px; }
.ico-play { color: #fff; background: var(--orange); border-color: var(--orange); }
.ico-play:hover { color: #fff; background: var(--orange-deep); border-color: var(--orange-deep); }
.ico-play.ico-off { opacity: .18; pointer-events: none; }
.ico-play.ico-yt { background: #000; border-color: #000; }
.ico-play.ico-yt:hover { background: #333; border-color: #333; }
.ico .cnt {
  position: absolute; right: -6px; top: -6px; min-width: 16px; padding: 0 4px; font-size: 10.5px; font-weight: 700; line-height: 16px;
  color: #fff; background: var(--ink); border-radius: 8px;
}

/* 재생 모달 */
.pm { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.pm-ov { position: absolute; inset: 0; background: rgba(0, 0, 0, .85); }
.pm-box { position: relative; display: flex; flex-direction: column; gap: 8px; max-width: min(1100px, 100%); max-height: 100%; }
.pm-box video { display: block; max-width: 100%; max-height: calc(100vh - 100px); background: #000; }
.pm-box .pm-yt { display: block; width: min(1000px, calc(100vw - 32px)); aspect-ratio: 16 / 9; max-height: calc(100vh - 100px); border: 0; background: #000; }
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
  .vt-overview { margin-bottom: 16px; }
  .stroke-legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 14px; }
  .stroke-stat { justify-content: flex-start; }
  .vt-bar { grid-template-columns: 1fr 1fr; gap: 8px 14px; }
  .f-comp { grid-column: 1 / -1; }
  .vt-table th, .vt-table td { padding: 7px 7px; }
  .vt-table th.rk, .vt-table td.rk { padding-left: 6px; padding-right: 2px; }
  .vt-table .hide-m { display: none; } /* 그룹 · 종목(자유형 100M)은 모바일에서 숨긴다 */
}
</style>
