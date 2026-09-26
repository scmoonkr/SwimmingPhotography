<script setup lang="ts">
// 대회 목록 — 최근 대회부터. 한 줄 = 대회일자 · 수영장 · 대회명.
// 고르면 홈(/)으로 competitionID 를 달고 간다 → 홈이 그 대회의 기사만 보여준다.
import { computed } from 'vue'

const { isEN, t } = useLang()
useHead({ title: computed(() => (isEN.value ? 'Meets — Swimming Photography' : '대회 목록 — Swimming Photography')) })

// fields=list — images 배열을 뺀 가벼운 응답. sort=date — 대회일자 최신순.
const { data } = await useAsyncData('meets:list', () =>
  $fetch<any[]>('/api/competitions', { params: { fields: 'list', sort: 'date', limit: 500 } })
    .catch(() => [] as any[]),
)
const rows = computed(() => (data.value || []).filter((c: any) => c.competitionID != null))

// ── 종목·거리별 통계 ── 한 칸 = "자유형 50(기사수, start수(start%))"
// 기사수 = 그 종목을 뛴 선수 중 게시 기사가 있는 선수 수 (기사는 종목이 아니라 선수 단위라서)
// start% = 그 대회 전체 start 중 이 종목이 차지하는 비중
const { data: statData } = await useAsyncData('meets:stats', () =>
  $fetch<any>('/api/competitions/stats').catch(() => ({ stats: {} })),
)
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const DISC_EN: Record<string, string> = { FR: 'Free', BA: 'Back', BR: 'Breast', FL: 'Fly', IM: 'IM', FRR: 'Free Relay', MR: 'Medley Relay' }
const discLabel = (d: string) => (isEN.value ? (DISC_EN[d] || d) : (DISC_KO[d] || d)) || ''
const distLabel = (v: string) => String(v || '').replace(/M$/i, '')
const statsOf = (cid: number) => ((statData.value?.stats || {})[String(cid)] || []) as any[]
// 소수 첫째 자리 고정 — 22% 와 22.0% 가 섞이지 않게
const statText = (e: any) => `${discLabel(e.discipline)} ${distLabel(e.distance)}(${e.articles}, ${e.starts}(${Number(e.startPct || 0).toFixed(1)}%))`

// 2026-09-12 → "2026년 9월 12일" / EN "12-09-2026"
const fmtDate = (iso: string) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso || ''
  return isEN.value ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}년 ${+m[2]}월 ${+m[3]}일`
}
</script>

<template>
  <div class="meets">
    <!-- 메뉴와 같은 글꼴 -->
    <div class="mt-bar">
      <span class="mt-head">{{ t('대회 목록', 'Meets') }}</span>
      <NuxtLink class="mt-link" to="/">{{ t('홈으로', 'Home') }}</NuxtLink>
    </div>

    <div class="mt-list">
      <NuxtLink
        v-for="c in rows" :key="c.competitionID" class="mt-row"
        :to="{ path: '/', query: { competitionID: c.competitionID } }"
      >
        <span class="mt-date">{{ fmtDate(c.datetime) }}</span>
        <span class="mt-pool">{{ c.pool || '' }}</span>
        <span class="mt-name">{{ c.competitionName || '' }}</span>
        <!-- 종목 거리(기사수, start수(start%)) -->
        <span v-if="statsOf(c.competitionID).length" class="mt-stats">
          <span v-for="(e, i) in statsOf(c.competitionID)" :key="i" class="mt-stat">{{ statText(e) }}</span>
        </span>
      </NuxtLink>
      <p v-if="!rows.length" class="mt-empty">{{ t('대회가 없습니다.', 'No meets.') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 글꼴은 홈 메뉴(.chip)와 같은 계열 — serif 13px */
.mt-bar { display: flex; align-items: baseline; gap: 10px; font-family: var(--serif); font-size: 13px; line-height: 1.6; }
.mt-head { font-weight: 700; color: var(--ink); }
.mt-link { font-weight: 500; color: var(--ink-light); text-decoration: none; }
.mt-link:hover { color: var(--ink); }

.mt-list { margin-top: 12px; border-top: 1px solid var(--line); }
.mt-row {
  display: grid; grid-template-columns: 160px minmax(0, 1fr) minmax(0, 1.6fr); gap: 14px; align-items: baseline;
  padding: 12px 2px; border-bottom: 1px solid var(--line); font-family: var(--serif); text-decoration: none; color: var(--ink);
}
.mt-row:hover .mt-name { text-decoration: underline; }
.mt-date { font-size: 12.5px; color: var(--ink-light); font-variant-numeric: tabular-nums; }
.mt-pool { font-size: 12.5px; color: var(--ink-light); }
.mt-name { font-size: 14px; font-weight: 700; }
/* 종목·거리 통계 — 행 아래 한 줄로 흘려 쓴다 */
.mt-stats { grid-column: 1 / -1; margin-top: 6px; display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; line-height: 1.7; color: var(--ink-light); }
.mt-stat { white-space: nowrap; }
.mt-empty { padding: 20px 2px; font-family: var(--serif); font-size: 13px; color: var(--ink-light); }

@media (max-width: 640px) {
  .mt-row { grid-template-columns: 1fr; gap: 3px; }
  .mt-name { order: -1; }
}
</style>
