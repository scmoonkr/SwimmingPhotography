<script setup lang="ts">
// 대회 목록 — 홈 리스트와 같은 행 구조(월 헤더 · 왼쪽 날짜 · 대회 라벨 + 대회명 | 수영장).
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

// ── 종목·거리별 통계 ── 한 칸 = "자유형 50 831(32.2%)"
// start 수와 그 대회 전체 start 중 비중.
const { data: statData } = await useAsyncData('meets:stats', () =>
  $fetch<any>('/api/competitions/stats').catch(() => ({ stats: {} })),
)
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const DISC_EN: Record<string, string> = { FR: 'Free', BA: 'Back', BR: 'Breast', FL: 'Fly', IM: 'IM', FRR: 'Free Relay', MR: 'Medley Relay' }
const discLabel = (d: string) => (isEN.value ? (DISC_EN[d] || d) : (DISC_KO[d] || d)) || ''
const distLabel = (v: string) => String(v || '').replace(/M$/i, '')
const statsOf = (cid: number) => ((statData.value?.stats || {})[String(cid)] || []) as any[]
// 소수 첫째 자리 고정 — 23% 와 23.0% 가 섞이지 않게
const statText = (e: any) => `${discLabel(e.discipline)} ${distLabel(e.distance)} ${e.starts}(${Number(e.startPct || 0).toFixed(1)}%)`

// ── 날짜 ──
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmtDate = (iso: string) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso || ''
  return isEN.value ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}년 ${+m[2]}월 ${+m[3]}일`
}
const ymOf = (c: any) => String(c?.datetime || '').slice(0, 7)
const monthLabel = (ym: string) => {
  const q = ym.split('-')
  if (q.length < 2) return ym
  return isEN.value ? `${MONTHS_EN[(+q[1]) - 1]} ${q[0]}` : `${q[0]}년 ${+q[1]}월`
}
// 월별 묶음 — 이미 일자 최신순이라 순서대로 훑으며 끊는다
const groups = computed(() => {
  const out: { ym: string; label: string; rows: any[] }[] = []
  for (const c of rows.value) {
    const ym = ymOf(c)
    const last = out[out.length - 1]
    if (!last || last.ym !== ym) out.push({ ym, label: monthLabel(ym), rows: [c] })
    else last.rows.push(c)
  }
  return out
})
</script>

<template>
  <div class="meets">
    <template v-for="g in groups" :key="g.ym">
      <div class="mt-month">{{ g.label }}</div>
      <NuxtLink
        v-for="c in g.rows" :key="c.competitionID" class="mt-row"
        :to="{ path: '/', query: { competitionID: c.competitionID } }"
      >
        <span class="mt-date">{{ fmtDate(c.datetime) }}</span>
        <span class="mt-main">
          <span class="mt-title">
            <span class="mt-cat">{{ t('대회', 'Meet') }}</span>{{ c.competitionName || '' }}<template v-if="c.pool"> | {{ c.pool }}</template>
          </span>
          <span v-if="statsOf(c.competitionID).length" class="mt-stats">
            <span v-for="(e, i) in statsOf(c.competitionID)" :key="i" class="mt-stat">{{ statText(e) }}</span>
          </span>
        </span>
      </NuxtLink>
    </template>
    <p v-if="!rows.length" class="mt-empty">{{ t('대회가 없습니다.', 'No meets.') }}</p>
  </div>
</template>

<style scoped>
/* 홈 리스트(body.view-list) 행과 같은 치수 */
.mt-month { font-family: var(--serif); font-size: 12.5px; font-weight: 400; color: var(--ink-mute); padding: 26px 0 10px; }
.mt-month:first-child { padding-top: var(--frame-gap); }

.mt-row {
  display: grid; grid-template-columns: 122px 1fr; column-gap: var(--frame-gap);
  padding: 14px 0; border-bottom: 1px solid var(--line-soft); text-decoration: none;
}
.mt-date { font-size: 12.5px; color: var(--ink-light); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mt-main { min-width: 0; }
.mt-title { font-family: var(--serif); font-weight: 700; font-size: 15.5px; line-height: 1.4; color: var(--ink); }
.mt-cat { color: var(--orange); font-weight: 700; margin-right: 0.4em; }
.mt-row:hover .mt-title { color: var(--orange-deep); }

/* 종목·거리 통계 — 제목 아래 한 줄로 흘려 쓴다 */
.mt-stats { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 5px; font-family: var(--serif); font-size: 12.5px; line-height: 1.7; color: var(--ink-light); }
.mt-stat { white-space: nowrap; font-variant-numeric: tabular-nums; }

.mt-empty { padding: 20px 2px; font-family: var(--serif); font-size: 13px; color: var(--ink-light); }

@media (max-width: 640px) {
  .mt-row { display: block; padding: 13px 0; }
  .mt-date { display: block; margin-bottom: 3px; }
  .mt-month { font-size: 11.5px; }
}
</style>
