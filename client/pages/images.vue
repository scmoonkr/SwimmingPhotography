<script setup lang="ts">
// 이미지 선택 — 대회 사진(images)을 카드로 훑어보고, 눌러서 선수·장면·캡션을 붙인다.
// 필터: 대회 · 성별 · 영법 · 거리 · 선택 여부(선수 기록에 연결됐는가 = timeID 유무).
// 카드를 누르면 대시보드 Images Dir 와 같은 상세 모달(ImageEditModal)이 열린다.
// 내부 작업용 화면이라 메뉴에 걸지 않고 검색 노출도 막는다.
import { computed, onMounted, ref, watch } from 'vue'

// 로그인한 사람만 — 아니면 /login 으로 보낸다 (middleware/auth.ts)
definePageMeta({ middleware: 'auth' })
useHead({ title: '이미지 선택 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const DIST_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M']

// ── 필터 ──
const competitionID = ref<number | ''>('')
// 기본값 — 자유형 · 남자 · 50M. 영법·성별·거리는 '전체' 없이 항상 하나를 고른다(한 종목씩 본다)
const discipline = ref('FR')
const gender = ref('men')
const distance = ref('50M')
// 선택 여부 — 선수 기록(times)에 연결된 사진인가. '' 전체 / has 선택됨 / none 선택안됨
const picked = ref<'' | 'has' | 'none'>('')

const competitions = ref<any[]>([])
const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (competitionID.value) params.competitionID = competitionID.value
    if (discipline.value) params.discipline = discipline.value
    if (gender.value) params.gender = gender.value
    if (distance.value) params.distance = distance.value
    if (picked.value) params.matched = picked.value
    rows.value = await $fetch<any[]>('/api/images', { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  try { competitions.value = await $fetch<any[]>('/api/images/competitions') } catch { competitions.value = [] }
  // 처음에는 사진이 있는 가장 최근 대회를 고른다 → watch 가 load 실행
  const first = competitions.value.find((c) => c.count > 0) || competitions.value[0]
  if (first) competitionID.value = first.competitionID
  else await load()
})
watch([competitionID, discipline, gender, distance, picked], load)

// 여러 명이 찍힌 사진 — 선수들의 값을 콤마로 잇는다(같은 값은 한 번만). athletes 가 없으면 단일 필드.
const multi = (r: any, k: 'name' | 'team' | 'ageGroup') => (Array.isArray(r.athletes) && r.athletes.length
  ? [...new Set(r.athletes.map((a: any) => a[k]).filter(Boolean))].join(',')
  : (r[k] || ''))
// 카드 아래 한 줄 — name-gender-team-ageGroup-discipline-distance-type-저장한 사람 (빈 값은 뺀다)
const caption = (r: any) => [
  multi(r, 'name'), GENDER_KO[r.gender] || r.gender, multi(r, 'team'), multi(r, 'ageGroup'),
  DISC_KO[r.discipline] || r.discipline, r.distance, r.type,
  r.contributorName || r.contributor,
].filter(Boolean).join('-')

const pickedCount = computed(() => rows.value.filter((r) => r.timeID != null).length)

// ── 상세 모달 ──
const selected = ref<any | null>(null)
// 저장하면 선택 여부가 바뀔 수 있다 — 선택됨/선택안됨 필터 중이면 맞지 않게 된 카드를 뺀다
const onSaved = (r: any) => {
  selected.value = null
  const has = r.timeID != null
  if ((picked.value === 'has' && !has) || (picked.value === 'none' && has)) rows.value = rows.value.filter((x) => x !== r)
}
const onDeleted = (r: any) => {
  selected.value = null
  rows.value = rows.value.filter((x) => x !== r)
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
        <option v-for="(ko, code) in GENDER_KO" :key="code" :value="code">{{ ko }}</option>
      </select>
      <select v-model="discipline" class="f-sel" aria-label="영법">
        <option v-for="(ko, code) in DISC_KO" :key="code" :value="code">{{ ko }}</option>
      </select>
      <select v-model="distance" class="f-sel" aria-label="거리">
        <option v-for="d in DIST_OPTS" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="picked" class="f-sel" aria-label="선택 여부">
        <option value="">전체</option>
        <option value="has">선택됨</option>
        <option value="none">선택안됨</option>
      </select>
    </div>

    <p v-if="errorMsg" class="isel-err">{{ errorMsg }}</p>
    <p v-else class="isel-note">
      <template v-if="loading">불러오는 중…</template>
      <template v-else>총 {{ rows.length }}장 · 선택됨 {{ pickedCount }}</template>
    </p>

    <!-- 이미지 카드 -->
    <div class="isel-grid">
      <button
        v-for="r in rows" :key="r._id" class="card" type="button"
        :class="{ picked: r.timeID != null }" :title="r.filename" @click="selected = r"
      >
        <span class="card-img"><img :src="r.thumbnail || r.url" alt="" loading="lazy" decoding="async"></span>
        <span class="card-cap">{{ caption(r) || '—' }}</span>
      </button>
    </div>
    <p v-if="!loading && !errorMsg && !rows.length" class="isel-empty">조건에 맞는 사진이 없습니다.</p>

    <ImageEditModal :row="selected" @close="selected = null" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.isel { font-family: var(--sans); padding-bottom: 60px; }
.isel-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.f-sel {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; cursor: pointer;
}
.f-sel:focus { outline: none; border-color: var(--orange); }
.f-comp { flex: 1 1 260px; min-width: 0; max-width: 420px; }
.isel-note { margin: 0 0 14px; font-size: 12.5px; color: var(--ink-mute); }
.isel-err { margin: 0 0 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
.isel-empty { margin: 40px 0; text-align: center; font-size: 13.5px; color: var(--ink-light); }

.isel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px 12px; }
.card {
  display: flex; flex-direction: column; gap: 6px; padding: 0; text-align: left; cursor: pointer;
  font-family: var(--sans); color: var(--ink); background: none; border: none;
}
.card-img { display: block; aspect-ratio: 4 / 3; background: var(--paper-deep); border: 1px solid var(--line); overflow: hidden; }
.card-img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.card:hover .card-img { border-color: var(--orange); }
/* 선택됨(선수 기록에 연결됨) — 테두리로 구분 */
.card.picked .card-img { border-color: var(--orange); outline: 2px solid var(--orange); outline-offset: -1px; }
.card-cap { font-size: 12px; line-height: 1.45; color: var(--ink-mute); word-break: break-all; }
.card.picked .card-cap { color: var(--ink); }

@media (max-width: 640px) {
  .isel-grid { grid-template-columns: repeat(2, 1fr); gap: 12px 8px; }
  .f-sel { flex: 1 1 calc(50% - 4px); min-width: 0; }
  .f-comp { flex-basis: 100%; max-width: none; }
}
</style>
