<script setup lang="ts">
// 이미지 선택 — 대회 사진(images)을 카드로 훑어보고, 눌러서 선수·장면·캡션을 붙인다.
// 필터: 대회 · 성별 · 영법(각각 '전체' 가능 — 분류 안 된 사진 포함) · 식별 여부(선수 기록에 연결됐는가 = timeID 유무).
// 카드를 누르면 대시보드 Images Dir 와 같은 상세 모달(ImageEditModal)이 열린다.
// 내부 작업용 화면이라 메뉴에 걸지 않고 검색 노출도 막는다.
import { computed, onMounted, ref, watch } from 'vue'

// 로그인한 사람만 — 아니면 /signin 으로 보낸다 (middleware/auth.ts)
definePageMeta({ middleware: 'auth' })
useHead({ title: '이미지 선택 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
// ── 필터 ──
const competitionID = ref<number | ''>('')
// 기본값 — 영법·성별 모두 '전체'. 전체는 조건을 걸지 않으므로 분류 안 된(빈 값) 사진도 같이 나온다.
const discipline = ref('')
const gender = ref('')
// 식별 여부 — 선수 기록(times)에 연결된 사진인가. '' 전체 / has 식별완료 / none 식별되지않음
const picked = ref<'' | 'has' | 'none'>('')

const competitions = ref<any[]>([])
const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')
const selectedCompetition = computed(() => competitions.value.find((c) => String(c.competitionID) === String(competitionID.value)))
const competitionLabel = computed(() => {
  if (!competitionID.value) return '대회 전체'
  return selectedCompetition.value?.competitionName || String(competitionID.value)
})
const genderLabel = computed(() => gender.value ? (GENDER_KO[gender.value] || gender.value) : '전체 성별')
const disciplineLabel = computed(() => discipline.value ? (DISC_KO[discipline.value] || discipline.value) : '전체 영법')
const selectedFilterTitle = computed(() => {
  const date = String(selectedCompetition.value?.datetime || '').slice(0, 10)
  const competition = date ? `${competitionLabel.value} (${date})` : competitionLabel.value
  return `${competition} · ${genderLabel.value} · ${disciplineLabel.value} · 전체 거리`
})
const facetCounts = ref({
  genders: {} as Record<string, number>,
  genderTotal: 0,
  disciplines: {} as Record<string, number>,
  disciplineTotal: 0,
  identification: {} as Record<string, number>,
  identificationTotal: 0,
  distribution: {} as Record<string, number>,
  distributionTotal: 0,
})
const visibleGenderOptions = computed(() => Object.entries(GENDER_KO)
  .map(([code, label]) => ({ code, label, count: Number(facetCounts.value.genders[code]) || 0 }))
  .filter((option) => option.count > 0 || option.code === gender.value))
const visibleDisciplineOptions = computed(() => Object.entries(DISC_KO)
  .map(([code, label]) => ({ code, label, count: Number(facetCounts.value.disciplines[code]) || 0 }))
  .filter((option) => option.count > 0 || option.code === discipline.value))

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
  .map((item) => `${item.label} ${item.percent}% ${item.count}장`)
  .join(', '))

const PAGE_SIZE = 5000
const page = ref(1)
const total = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const visiblePages = computed(() => {
  const size = Math.min(5, pageCount.value)
  const start = Math.max(1, Math.min(page.value - 2, pageCount.value - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
})
const goPage = (next: number) => {
  const target = Math.min(Math.max(1, next), pageCount.value)
  if (target === page.value) return
  page.value = target
  load()
}

const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = {
      limit: PAGE_SIZE,
      skip: (page.value - 1) * PAGE_SIZE,
      withTotal: '1',
    }
    if (competitionID.value) params.competitionID = competitionID.value
    if (discipline.value) params.discipline = discipline.value
    if (gender.value) params.gender = gender.value
    if (picked.value) params.matched = picked.value
    const data = await $fetch<any>('/api/images', { params })
    rows.value = data?.rows || []
    total.value = data?.total ?? rows.value.length
  } catch (err: any) {
    rows.value = []
    total.value = 0
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
const loadFacets = async () => {
  const params: Record<string, any> = {}
  if (competitionID.value) params.competitionID = competitionID.value
  if (discipline.value) params.discipline = discipline.value
  if (gender.value) params.gender = gender.value
  if (picked.value) params.matched = picked.value
  try {
    facetCounts.value = await $fetch<any>('/api/images/facets', { params })
  } catch {
    facetCounts.value = {
      genders: {}, genderTotal: 0, disciplines: {}, disciplineTotal: 0,
      identification: {}, identificationTotal: 0,
      distribution: {}, distributionTotal: 0,
    }
  }
}
const reload = () => Promise.all([load(), loadFacets()])
onMounted(async () => {
  try { competitions.value = await $fetch<any[]>('/api/images/competitions') } catch { competitions.value = [] }
  // 처음에는 사진이 있는 가장 최근 대회를 고른다 → watch 가 load 실행
  const first = competitions.value.find((c) => c.count > 0) || competitions.value[0]
  if (first) competitionID.value = first.competitionID
  else await reload()
})
watch([competitionID, discipline, gender, picked], () => {
  page.value = 1
  reload()
})
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

// 여러 명이 찍힌 사진은 선수명을 콤마로 잇는다(같은 이름은 한 번만). athletes 가 없으면 단일 필드.
const athleteNames = (r: any) => (Array.isArray(r.athletes) && r.athletes.length
  ? [...new Set(r.athletes.map((a: any) => a.name).filter(Boolean))].join(', ')
  : (r.name || ''))
// 식별된 사진의 카드 아래 한 줄 — 성별 영법 선수명.
const caption = (r: any) => [
  GENDER_KO[r.gender] || r.gender,
  DISC_KO[r.discipline] || r.discipline,
  athleteNames(r),
].filter(Boolean).join(' ')
const isIdentified = (r: any) => Boolean(String(r.gender || '').trim()) && r.timeID != null
const cardCaption = (r: any) => isIdentified(r) ? (caption(r) || '—') : '식별되지않음'

// ── 여러 장 선택 — 썸네일 왼쪽 위 동그라미를 눌러 체크하고 한번에 식별한다 ──
const checked = ref<Set<string>>(new Set())
const toggleCheck = (r: any) => {
  const next = new Set(checked.value)
  if (next.has(String(r._id))) next.delete(String(r._id)); else next.add(String(r._id))
  checked.value = next
}
const uncheckOne = (id: string) => {
  const next = new Set(checked.value)
  next.delete(id)
  checked.value = next
}
const clearChecked = () => { checked.value = new Set() }
const checkedRows = computed(() => rows.value.filter((r) => checked.value.has(String(r._id))))
const openBulk = () => {
  const list = checkedRows.value
  if (!list.length) return
  selected.value = { ...list[0], _bulk: true, _rows: list, filename: `선택한 ${list.length}장 사진 한번에 식별하기` }
}
watch([competitionID, discipline, gender, picked, page], clearChecked)

// ── 상세 모달 ──
const selected = ref<any | null>(null)
// 저장하면 식별 여부가 바뀔 수 있다 — 식별완료/식별되지않음 필터 중이면 현재 목록을 다시 불러온다
const removeAndReload = async () => {
  total.value = Math.max(0, total.value - 1)
  page.value = Math.min(page.value, pageCount.value)
  await reload()
}
const onSaved = async (r: any) => {
  selected.value = null
  if (r._bulk) { clearChecked(); await reload(); return }
  const has = isIdentified(r)
  if ((picked.value === 'has' && !has) || (picked.value === 'none' && has)) await removeAndReload()
}
const onDeleted = async () => {
  selected.value = null
  await removeAndReload()
}
</script>

<template>
  <div class="isel">
    <header class="isel-overview">
      <h1 class="isel-title">{{ selectedFilterTitle }}</h1>
      <div class="stroke-summary">
        <div class="stroke-meter" role="img" :aria-label="`영법별 사진 분포: ${strokeDistributionLabel}`">
          <span
            v-for="item in strokeDistribution" v-show="item.count" :key="item.key"
            class="stroke-segment" :style="{ width: item.width, backgroundColor: item.color }"
            :title="`${item.label} ${item.percent}% · ${item.count.toLocaleString()}장`"
          />
        </div>
        <div class="stroke-legend">
          <span v-for="item in strokeDistribution" :key="item.key" class="stroke-stat">
            <i class="stroke-dot" :style="{ backgroundColor: item.color }" aria-hidden="true" />
            <span class="stroke-name">{{ item.label }}</span>
            <span class="stroke-value">{{ item.percent }}% · {{ item.count.toLocaleString() }}장</span>
          </span>
        </div>
      </div>
    </header>

    <!-- 필터 -->
    <div class="isel-bar">
      <select v-model="competitionID" class="f-sel f-comp" aria-label="대회">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }}<template v-if="c.datetime"> ({{ c.datetime }})</template> · {{ c.count }}장
        </option>
      </select>
      <select v-model="gender" class="f-sel" aria-label="성별">
        <option value="">전체 {{ facetCounts.genderTotal }}장</option>
        <option v-for="option in visibleGenderOptions" :key="option.code" :value="option.code">
          {{ option.label }} {{ option.count }}장
        </option>
      </select>
      <select v-model="discipline" class="f-sel" aria-label="영법">
        <option value="">전체 {{ facetCounts.disciplineTotal }}장</option>
        <option v-for="option in visibleDisciplineOptions" :key="option.code" :value="option.code">
          {{ option.label }} {{ option.count }}장
        </option>
      </select>
      <select v-model="picked" class="f-sel" aria-label="식별 여부">
        <option value="">전체 {{ facetCounts.identificationTotal }}장</option>
        <option value="has">식별완료 {{ facetCounts.identification.has || 0 }}장</option>
        <option value="none">식별되지않음 {{ facetCounts.identification.none || 0 }}장</option>
      </select>
    </div>

    <p v-if="errorMsg" class="isel-err">{{ errorMsg }}</p>
    <p v-else class="isel-note">
      <template v-if="loading">불러오는 중…</template>
      <template v-else>
        {{ competitionLabel }} {{ genderLabel }} {{ disciplineLabel }} 사진 총 {{ facetCounts.identificationTotal }}장
        · 식별 완료된 사진 {{ facetCounts.identification.has || 0 }}장
        · 식별되지 않은 사진 {{ facetCounts.identification.none || 0 }}장
      </template>
    </p>

    <!-- 이미지 카드 -->
    <div class="isel-grid">
      <div v-for="r in rows" :key="r._id" class="card-wrap">
        <button
          class="card" type="button"
          :class="{ picked: isIdentified(r), unidentified: !isIdentified(r) }" :title="r.filename" @click="selected = r"
        >
          <span class="card-img"><img :src="r.thumbnail || r.url" alt="" loading="lazy" decoding="async"></span>
          <span class="card-cap">{{ cardCaption(r) }}</span>
        </button>
        <button
          class="card-check" :class="{ on: checked.has(String(r._id)) }" type="button"
          :aria-pressed="checked.has(String(r._id))" aria-label="사진 선택" @click="toggleCheck(r)"
        ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></button>
      </div>
    </div>
    <p v-if="!loading && !errorMsg && !rows.length" class="isel-empty">조건에 맞는 사진이 없습니다.</p>

    <nav v-if="!loading && pageCount > 1" class="isel-pager" aria-label="이미지 목록 페이지">
      <button type="button" class="pg" :disabled="page === 1" @click="goPage(page - 1)">이전</button>
      <button
        v-for="p in visiblePages" :key="p" type="button" class="pg pg-num"
        :class="{ active: p === page }" :aria-current="p === page ? 'page' : undefined"
        @click="goPage(p)"
      >{{ p }}</button>
      <button type="button" class="pg" :disabled="page === pageCount" @click="goPage(page + 1)">다음</button>
    </nav>

    <div v-if="checked.size" class="bulk-bar">
      <button class="bulk-go" type="button" @click="openBulk">선택한 {{ checked.size }}장 사진 한번에 식별하기</button>
      <button class="bulk-clear" type="button" @click="clearChecked">전체 선택 취소하기</button>
    </div>

    <ImageEditModal :row="selected" @uncheck="uncheckOne" @close="selected = null" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.isel { font-family: var(--serif); padding-bottom: 60px; }
.isel-overview { margin: 0 0 18px; }
.isel-title {
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
.isel-bar {
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
.isel-note { margin: 14px 0 20px; font-size: 13px; line-height: 1.6; color: var(--ink-mute); }
.isel-err { margin: 14px 0 20px; padding: 9px 14px; border-left: 3px solid var(--bad); background: var(--bad-bg); color: var(--bad); font-family: var(--sans); font-size: 13px; }
.isel-empty { margin: 48px 0; text-align: center; font-size: 14px; color: var(--ink-light); }
.isel-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 38px; }
.pg {
  min-width: 24px; padding: 3px 2px; border: none; border-bottom: 1px solid transparent; border-radius: 0;
  font-family: var(--serif); font-size: 13px; line-height: 1.6; color: var(--ink-light); background: none; cursor: pointer;
}
.pg:hover:not(:disabled) { color: var(--ink); }
.pg.active { border-bottom-color: var(--orange); color: var(--ink); font-weight: 700; }
.pg:disabled { opacity: .4; cursor: default; }

.isel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 20px; }
.card-wrap { position: relative; min-width: 0; }
.card-check {
  position: absolute; top: 8px; left: 8px; z-index: 2; display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: 2px solid rgba(255, 255, 255, .9); border-radius: 50%;
  background: rgba(26, 26, 26, .28); color: transparent; cursor: pointer; transition: background .12s;
}
.card-check svg { width: 14px; height: 14px; }
.card-check:hover { background: rgba(26, 26, 26, .5); }
.card-check.on { background: var(--orange); border-color: #fff; color: #fff; }
.bulk-bar {
  position: fixed; left: 50%; bottom: 28px; z-index: 900; display: flex; align-items: center; gap: 10px;
  max-width: calc(100vw - 24px); transform: translateX(-50%);
}
.bulk-go {
  padding: 13px 22px; border: 0; border-radius: 999px; background: var(--ink); color: #fff;
  font: 700 14px var(--sans); box-shadow: 0 8px 24px rgba(26, 26, 26, .28); cursor: pointer; white-space: nowrap;
}
.bulk-go:hover { background: var(--orange-deep); }
.bulk-clear {
  padding: 11px 16px; border: 1px solid rgba(26, 26, 26, .18); border-radius: 999px; background: rgba(255, 255, 255, .6);
  color: var(--ink-mute); font: 600 12.5px var(--sans); cursor: pointer; white-space: nowrap; backdrop-filter: blur(6px);
}
.bulk-clear:hover { background: rgba(255, 255, 255, .92); color: var(--ink); }
.card {
  display: flex; flex-direction: column; gap: 9px; padding: 0; text-align: left; cursor: pointer;
  font-family: var(--serif); color: var(--ink); background: none; border: none;
}
.card-img { position: relative; display: block; aspect-ratio: 4 / 3; background: var(--paper-deep); overflow: hidden; }
.card-img img { display: block; width: 100%; height: 100%; object-fit: cover; transition: opacity .15s; }
.card:hover .card-img img { opacity: .9; }
/* 메인 페이지의 주황 카테고리 강조처럼, 식별완료 상태만 얇은 주황 규칙으로 표시한다. */
.card.picked .card-img { box-shadow: inset 0 -2px 0 var(--orange); }
.card-cap { font-size: 13.5px; font-weight: 500; line-height: 1.45; color: var(--ink-mute); word-break: keep-all; }
.card.picked .card-cap { color: var(--ink); font-weight: 700; }
.card.unidentified .card-cap { color: var(--ink-light); }
.card:hover .card-cap { color: var(--orange-deep); }

@media (max-width: 640px) {
  .isel-overview { margin-bottom: 16px; }
  .stroke-legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 14px; }
  .stroke-stat { justify-content: flex-start; }
  .isel-bar { grid-template-columns: 1fr 1fr; gap: 8px 14px; }
  .f-comp { grid-column: 1 / -1; }
  .isel-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 14px; }
  .card-cap { font-size: 13px; }
}
</style>
