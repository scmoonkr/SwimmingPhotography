<script setup lang="ts">
// 속보 페이지 — docs/html/breakingnews.html 이식.
// 최근 등록분 10개를 골라 날짜별로 묶어 보여준다(내용이 있는 날짜만).
import { computed, onMounted, ref } from 'vue'

const { isEN, t } = useLang()
const { items, load, pick, open } = useBreaking()

// SSR 시엔 items 가 비어 있으므로 마운트 후에만 목록 렌더
const mounted = ref(false)
onMounted(async () => { await load(); mounted.value = true })

useHead({ title: computed(() => (isEN.value ? 'Breaking — Swimming Photography' : '속보 — Swimming Photography')) })

const KO_DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad2 = (n: number) => ('0' + n).slice(-2)

const dayLabel = (d: Date) => isEN.value
  ? EN_DAYS[d.getDay()] + ', ' + pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear()
  : d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + KO_DAYS[d.getDay()]

// 행 일시 풀 표기: "2026년 5월 22일 오후 05시 33분" / EN "22-05-2026 05:33 PM"
const fmtFull = (s: string) => {
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return s || ''
  const H = +m[4], am = H < 12, h12 = ('0' + (H % 12 === 0 ? 12 : H % 12)).slice(-2)
  return isEN.value
    ? m[3] + '-' + m[2] + '-' + m[1] + ' ' + h12 + ':' + m[5] + ' ' + (am ? 'AM' : 'PM')
    : m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일 ' + (am ? '오전' : '오후') + ' ' + h12 + '시 ' + m[5] + '분'
}

type Entry = { kind: 'head'; label: string } | { kind: 'row'; item: any } | { kind: 'none' }

// 이 페이지에 보여줄 최대 건수 — items 는 티커·홈 속보 박스와 공유하는 전역 상태라
// 여기서만 잘라 쓴다. items 는 이미 최신순 정렬돼 있다.
const LIMIT = 10
const recent = computed(() => items.value.slice(0, LIMIT))

// 렌더용 플랫 리스트 — 최근 10개를 날짜별로 묶는다(내용이 있는 날짜만, 최신순).
const entries = computed<Entry[]>(() => {
  if (!mounted.value) return []
  if (!recent.value.length) return [{ kind: 'none' }]
  const out: Entry[] = []
  let curDay: string | null = null
  for (const it of recent.value) {
    const day = (it.publishedAt || '').slice(0, 10)
    if (day !== curDay) {
      curDay = day
      const d = new Date(day + 'T00:00:00')
      // 일시가 비었거나 형식이 이상하면 원문을 헤딩으로 쓴다
      out.push({ kind: 'head', label: Number.isNaN(+d) ? (day || '—') : dayLabel(d) })
    }
    out.push({ kind: 'row', item: it })
  }
  return out
})

const flag = computed(() => (isEN.value ? '[Breaking]' : '[속보]'))
</script>

<template>
  <div class="breaking-page">
    <h1 class="page-title">
      <strong>{{ t('이 시간 속보입니다.', 'Breaking news at this hour. ') }}</strong>
      <span>{{ t(' 가장 빠른 소식을 한 줄로 전합니다. 자세한 내용은 추후 기사로 이어집니다.', 'The fastest updates, one line at a time. Full details follow in upcoming articles.') }}</span>
      <NuxtLink class="back-link" to="/">{{ t(' 전체 기사 보기', ' All articles') }}</NuxtLink>
    </h1>

    <div class="bk-list">
      <template v-for="(e, i) in entries" :key="i">
        <div v-if="e.kind === 'head'" class="day-group">{{ e.label }}</div>
        <div v-else-if="e.kind === 'none'" class="bk-none">{{ t('등록된 내용이 없습니다.', 'No entries.') }}</div>
        <button v-else type="button" class="bk-row" @click="open(e.item)">
          <span class="t">{{ fmtFull(e.item.publishedAt) }}</span>
          <span class="h"><span class="flag">{{ flag }}</span>{{ pick(e.item, 'title') }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 페이지 제목 (search.html의 .result-title과 동일 톤) */
.page-title { font-family: var(--serif); font-size: 13px; font-weight: 500; line-height: 1.6; color: var(--ink-mute); margin: 0 0 14px; }
.page-title strong { color: var(--ink); font-weight: 700; }
.page-title .back-link { color: var(--ink-light); transition: color .15s; }
.page-title .back-link:hover { color: var(--ink); }

/* 속보 리스트 — index 리스트 뷰 감성(날짜 그룹 헤딩 + 행) */
.day-group { font-family: var(--serif); font-size: 12.5px; font-weight: 400; letter-spacing: normal; color: var(--ink-mute); padding: 26px 0 10px; }
.bk-row {
  display: grid; grid-template-columns: 195px 1fr;   /* 일시(풀 표기) / [속보] 제목 */
  column-gap: var(--frame-gap, 38px); align-items: center;
  width: 100%; text-align: left; padding: 14px 0;
  border-bottom: 1px solid var(--line-soft);
  background: none; border-left: none; border-right: none; border-top: none; cursor: pointer;
}
.bk-row .t { font-family: var(--serif); font-size: 12.5px; font-weight: 400; letter-spacing: normal; color: var(--ink-mute); font-variant-numeric: tabular-nums; white-space: nowrap; }
.bk-row .h { font-family: var(--serif); font-weight: 500; font-size: 15.5px; line-height: 1.4; color: var(--ink); }
.bk-row .h .flag { color: var(--orange); font-weight: 700; margin-right: .45em; }
.bk-row:hover .h { color: var(--orange-deep); }
.bk-list { padding-bottom: 8px; }
.bk-list .day-group:first-child { padding-top: var(--frame-gap, 38px); }
.bk-none { font-family: var(--serif); font-size: 13px; color: var(--ink-light); padding: 12px 0; border-bottom: 1px solid var(--line-soft); }

@media (max-width: 640px) {
  .bk-row { display: block; padding: 13px 0; }
  .bk-row .h { display: block; font-size: 16px; margin-bottom: 4px; }
  .bk-row .t { display: block; font-size: 12px; }
  .day-group { font-size: 11.5px; }
}
</style>
