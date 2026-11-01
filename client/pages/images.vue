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
const competitionLabel = computed(() => {
  if (!competitionID.value) return '대회 전체'
  const selectedCompetition = competitions.value.find((c) => String(c.competitionID) === String(competitionID.value))
  return selectedCompetition?.competitionName || String(competitionID.value)
})
const genderLabel = computed(() => gender.value ? (GENDER_KO[gender.value] || gender.value) : '전체 성별')
const disciplineLabel = computed(() => discipline.value ? (DISC_KO[discipline.value] || discipline.value) : '전체 종목')
const facetCounts = ref({
  genders: {} as Record<string, number>,
  genderTotal: 0,
  disciplines: {} as Record<string, number>,
  disciplineTotal: 0,
  identification: {} as Record<string, number>,
  identificationTotal: 0,
})

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
        <option v-for="(ko, code) in GENDER_KO" :key="code" :value="code">
          {{ ko }} {{ facetCounts.genders[code] || 0 }}장
        </option>
      </select>
      <select v-model="discipline" class="f-sel" aria-label="영법">
        <option value="">전체 {{ facetCounts.disciplineTotal }}장</option>
        <option v-for="(ko, code) in DISC_KO" :key="code" :value="code">
          {{ ko }} {{ facetCounts.disciplines[code] || 0 }}장
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
      <button
        v-for="r in rows" :key="r._id" class="card" type="button"
        :class="{ picked: isIdentified(r), unidentified: !isIdentified(r) }" :title="r.filename" @click="selected = r"
      >
        <span class="card-img"><img :src="r.thumbnail || r.url" alt="" loading="lazy" decoding="async"></span>
        <span class="card-cap">{{ cardCaption(r) }}</span>
      </button>
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

    <ImageEditModal :row="selected" @close="selected = null" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.isel { font-family: var(--serif); padding-bottom: 60px; }
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
  .isel-bar { grid-template-columns: 1fr 1fr; gap: 8px 14px; }
  .f-comp { grid-column: 1 / -1; }
  .isel-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 14px; }
  .card-cap { font-size: 13px; }
}
</style>
