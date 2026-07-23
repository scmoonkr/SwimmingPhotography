<script setup lang="ts">
// 검색 결과 — 쿼리(q > cat > city > competition > event > athlete)로 DB 기사를 필터링해 월별로 렌더.
// 그리드/리스트 토글 · "다른 내용 찾아보기"(재검색) · "전체 기사 보기" 링크.
// 뷰 상태는 index와의 전역 CSS 충돌을 피하려 body 대신 로컬 래퍼(.search-page.view-*) 클래스로 제어.
import { computed, onMounted, ref } from 'vue'
import { normArticle } from '~/utils/articleList'

const { isEN, t } = useLang()
const route = useRoute()

const img = (p: string) => (p ? '/' + p.replace(/^\/?/, '') : '')

// ── 기사 목록 (DB 연동) : 발행 기사 중 검색 노출(showInSearch) 대상 ──
const { data: listData } = await useAsyncData('search:articles', () =>
  $fetch<any[]>('/api/articles', { params: { type: 'article', status: 'published', limit: 500 } })
    .catch(() => [] as any[]),
)
const docs = computed(() => (listData.value || []).filter((d: any) => d.slug && (!d.visibility || d.visibility.showInSearch !== false)))

// ── 뷰(grid/list) ──
const view = ref<'grid' | 'list'>('grid')
onMounted(() => { try { const s = localStorage.getItem('mb_view'); if (s === 'grid' || s === 'list') view.value = s } catch {} })
const setView = (v: 'grid' | 'list') => { view.value = v; try { localStorage.setItem('mb_view', v) } catch {} }

// 뷰 토글 라벨(선택 = 오른쪽/진하게) + 스프링 애니메이션
const vtPreview = ref<'grid' | 'list' | null>(null)
const vtInner = ref<HTMLElement | null>(null)
let vtAnim: Animation | null = null
const shownView = () => vtPreview.value ?? view.value
const vLabel = (v: 'grid' | 'list') => (isEN.value ? (v === 'grid' ? 'Grid' : 'List') : (v === 'grid' ? '그리드' : '리스트'))
const vtCur = computed(() => vLabel(shownView()))
const vtDim = computed(() => vLabel(shownView() === 'grid' ? 'list' : 'grid'))
const rm = () => import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const vtSpring = () => {
  if (!vtInner.value || rm()) return
  vtAnim?.cancel()
  vtAnim = vtInner.value.animate([
    { transform: 'translateX(20px)', opacity: 0.15 },
    { transform: 'translateX(0px)', opacity: 1, offset: 0.45 },
    { transform: 'translateX(-7px)', offset: 0.62 },
    { transform: 'translateX(4px)', offset: 0.77 },
    { transform: 'translateX(-2px)', offset: 0.89 },
    { transform: 'translateX(0)' },
  ], { duration: 720, easing: 'ease-out' })
}
const vtExit = () => {
  if (!vtInner.value || rm()) return
  vtAnim?.cancel()
  vtAnim = vtInner.value.animate([
    { transform: 'translateX(9px)', opacity: 0.5 },
    { transform: 'translateX(0)', opacity: 1 },
  ], { duration: 560, easing: 'ease-out' })
}
const onVtEnter = () => { vtPreview.value = view.value === 'grid' ? 'list' : 'grid'; vtSpring() }
const onVtLeave = () => { vtPreview.value = null; vtExit() }
const onVtClick = () => { setView(view.value === 'grid' ? 'list' : 'grid'); vtPreview.value = null; vtSpring() }

// ── 재검색 패널 ──
const showSearch = ref(false)
const searchQ = ref('')
const onSearchEnter = () => { const q = searchQ.value.trim(); if (q) navigateTo({ path: '/search', query: { q } }) }

// ── 포맷 헬퍼 (index와 동일) ──
const EN = () => isEN.value
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ymOf = (a: any) => (a.date || '').slice(0, 7)
const labelOf = (ym: string) => { const q = ym.split('-'); return EN() ? MONTHS_EN[(+q[1]) - 1] + ' ' + q[0] : q[0] + '년 ' + (+q[1]) + '월' }
const fmtDate = (iso: string) => {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso || ''
  return EN() ? m[3] + '-' + m[2] + '-' + m[1] : m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일'
}
const fmtRecord = (r: string) => {
  if (!r) return ''
  if (!EN()) return r
  const mm = String(r).match(/(?:(\d+)\s*분)?\s*(\d+)\s*초\s*(\d+)/)
  if (!mm) return r
  const sec = ('0' + mm[2]).slice(-2), hun = (mm[3] + '00').slice(0, 2)
  return mm[1] ? mm[1] + ':' + sec + '.' + hun : (+mm[2]) + '.' + hun
}
const pick = (a: any, f: string) => { const v = EN() ? a[f + 'ENG'] : a[f]; return (v == null || v === '') ? (a[f] || '') : v }
const metaLine = (a: any) => [fmtDate(a.date), fmtRecord(a.record), pick(a, 'event'), pick(a, 'athlete')].filter(Boolean).join(' | ')

// ── 쿼리 파싱 & 필터 ──
const sorted = computed(() => docs.value.map(normArticle).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)))
const query = computed(() => {
  for (const f of ['q', 'cat', 'city', 'competition', 'event', 'athlete']) {
    const raw = route.query[f]
    if (raw != null) { const v = Array.isArray(raw) ? raw[0] : raw; return { field: f, term: (v || '').trim() } }
  }
  return { field: null as string | null, term: '' }
})
const matches = (a: any) => {
  const { field, term } = query.value
  if (!field || !term) return true
  if (field === 'cat') return a.cat === term
  if (field === 'city') return a.region === term
  if (field === 'competition') return a.competition === term
  if (field === 'event') return a.event === term
  if (field === 'athlete') return a.athlete === term
  const hay = [a.cat, a.region, a.competition, a.athlete, a.event, a.title].join(' ').toLowerCase()
  return hay.includes(term.toLowerCase())
}
const results = computed(() => sorted.value.filter(matches))

// 월 그룹
const groups = computed(() => {
  const out: { ym: string; label: string; rows: any[] }[] = []
  let prev = ''
  for (const a of results.value) {
    const ym = ymOf(a)
    if (ym && ym !== prev) { out.push({ ym, label: labelOf(ym), rows: [] }); prev = ym }
    if (out.length) out[out.length - 1].rows.push(a)
  }
  return out
})

// 결과 타이틀
const FIELD_ENG: Record<string, string> = { cat: 'catENG', city: 'regionENG', competition: 'competitionENG', event: 'eventENG', athlete: 'athleteENG' }
const termLabel = () => {
  const { field, term } = query.value
  if (!EN()) return term
  const k = field ? FIELD_ENG[field] : ''
  return (k && results.value[0] && results.value[0][k]) ? results.value[0][k] : term
}
const resultTitle = computed(() => {
  const { field, term } = query.value
  const n = results.value.length
  if (field === 'competition' && term) {
    const region = EN() ? (results.value[0]?.regionENG || '') : (results.value[0]?.region || '')
    const dates = results.value.map((a) => a.date).filter(Boolean).sort()
    let dateLabel = ''
    if (dates.length) {
      const mn = dates[0], mx = dates[dates.length - 1]
      dateLabel = (mn.slice(0, 7) === mx.slice(0, 7)) ? labelOf(mx.slice(0, 7)) : labelOf(mn.slice(0, 7)) + ' ~ ' + labelOf(mx.slice(0, 7))
    }
    return { html: [region ? esc(region) : null, '<strong>' + esc(termLabel()) + '</strong>', dateLabel ? esc(dateLabel) : null].filter(Boolean).join(' | ') }
  }
  if (!term) return { html: EN() ? 'All articles.' : '전체 게시글입니다.' }
  return {
    html: EN()
      ? esc(n.toLocaleString()) + ' article' + (n === 1 ? '' : 's') + ' found for &lsquo;<strong>' + esc(termLabel()) + '</strong>&rsquo;.'
      : '‘<strong>' + esc(term) + '</strong>’(으)로 검색된 기사 총 ' + n.toLocaleString() + '건.',
  }
})
function esc(s: any) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]) }

useHead({ title: computed(() => (isEN.value ? 'Search — Swimming Photography' : '검색 — Swimming Photography')) })
</script>

<template>
  <div class="search-page" :class="'view-' + view">
    <!-- 툴바: 결과 타이틀(좌) + 보기 전환(우) -->
    <div class="toolbar">
      <div v-show="!showSearch" class="result-head">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <h1 class="result-title" v-html="resultTitle.html" />
        <button class="research-link" type="button" @click="showSearch = true">{{ t('다른 내용 찾아보기', 'Search for something else') }}</button>
        <NuxtLink class="research-link" to="/">{{ t('전체 기사 보기', 'All articles') }}</NuxtLink>
      </div>
      <button
        v-show="!showSearch" class="view-toggle" type="button" aria-label="그리드/리스트 보기 전환"
        @click="onVtClick" @mouseenter="onVtEnter" @mouseleave="onVtLeave"
      >
        <span ref="vtInner" class="vt-inner"><span class="vt-dim">{{ vtDim }}</span><span class="vt-sep" aria-hidden="true">·</span><span class="vt-cur">{{ vtCur }}</span></span>
      </button>
    </div>

    <!-- 재검색 패널 -->
    <div v-show="showSearch" class="search-panel">
      <input
        v-model="searchQ" type="search" class="search-input" aria-label="검색"
        :placeholder="t('검색어를 입력한 후 엔터를 눌러주세요.', 'Type your search, then press Enter.')"
        @keydown.enter="onSearchEnter" @blur="showSearch = false"
      >
    </div>

    <!-- 콘텐츠 -->
    <div class="items">
      <template v-for="g in groups" :key="g.ym">
        <div class="month-group">{{ g.label }}</div>
        <NuxtLink v-for="(a, i) in g.rows" :key="g.ym + i" class="row" :to="'/article/' + a.slug">
          <span class="thumb" aria-hidden="true">
            <img v-if="a.thumb" class="thumb-img" :src="img(a.thumb)" alt="" loading="lazy">
            <span class="thumb-date">{{ fmtDate(a.date) }}</span>
          </span>
          <span class="c-title"><span class="c-cat">{{ pick(a, 'cat') }}</span><span class="c-bar"> | </span>{{ pick(a, 'title') }}</span>
          <span class="c-meta">{{ metaLine(a) }}</span>
          <span class="c-date">{{ fmtDate(a.date) }}</span>
          <span class="c-athlete">{{ pick(a, 'athlete') }}</span>
          <span class="c-event">{{ pick(a, 'event') }}</span>
          <span class="c-record">{{ fmtRecord(a.record) }}</span>
        </NuxtLink>
      </template>
    </div>

    <p v-if="!results.length" class="empty">{{ t('찾으시는 내용에 해당하는 기사가 없습니다.', 'No articles match your search.') }}</p>
  </div>
</template>

<style scoped>
/* 툴바 */
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; padding: 0 0 14px; margin-bottom: 4px; }
.result-head { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.result-title { font-family: var(--serif); font-size: 13px; font-weight: 500; line-height: 1.6; color: var(--ink-mute); margin: 0; }
.result-title :deep(strong) { color: var(--ink); font-weight: 700; }
.research-link { font-family: var(--serif); font-size: 13px; font-weight: 500; line-height: 1.6; color: var(--ink-light); background: none; border: none; padding: 0; cursor: pointer; transition: color .15s; }
.research-link:hover { color: var(--ink); }

.view-toggle { display: inline-flex; flex: 0 0 auto; font-family: var(--serif); font-size: 13px; line-height: 1.6; background: none; border: none; padding: 0; cursor: pointer; }
.view-toggle .vt-inner { display: inline-flex; will-change: transform; }
.view-toggle .vt-dim { color: var(--ink-light); font-weight: 500; }
.view-toggle .vt-sep { color: var(--ink-light); margin: 0 0.3em; }
.view-toggle .vt-cur { color: var(--ink); font-weight: 700; }
.view-toggle:hover .vt-dim, .view-toggle:hover .vt-sep { color: var(--ink-mute); }

/* 재검색 인풋 */
.search-panel { padding: 6px 0 16px; }
.search-input { width: 100%; font-family: var(--serif); font-size: 22px; color: var(--ink); background: none; border: none; border-bottom: 2px solid var(--ink); padding: 10px 2px; line-height: 1.3; }
.search-input::placeholder { color: var(--ink-light); font-size: 16px; }
.search-input:focus { outline: none; border-bottom-color: var(--orange); }

/* 콘텐츠 공통 */
.items { margin: 6px 0 8px; }
.row { color: var(--ink); }
.thumb { background-color: var(--paper-deep); background-size: cover; background-position: center; position: relative; overflow: hidden; }
/* 썸네일을 실제 <img> 로 렌더 — 인라인 background-image 하이드레이션 유실 방지 */
.thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-date { position: absolute; left: 9px; bottom: 8px; font-family: var(--serif); font-size: 12px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); letter-spacing: .01em; pointer-events: none; display: none; }
.c-cat { color: var(--orange); font-weight: 700; margin-right: 0.4em; }
.c-bar { display: none; }

/* 그리드 뷰 */
.search-page.view-grid .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 26px 20px; padding-top: 22px; }
.search-page.view-grid .row { display: flex; flex-direction: column; gap: 9px; }
.search-page.view-grid .thumb { display: block; aspect-ratio: 4 / 3; border-radius: 0; }
.search-page.view-grid .row:hover .thumb { opacity: .9; }
.search-page.view-grid .c-title { font-family: var(--serif); font-weight: 700; font-size: 16px; line-height: 1.45; color: var(--ink); }
.search-page.view-grid .row:hover .c-title { color: var(--orange-deep); }
.search-page.view-grid .c-date { display: none; }
.search-page.view-grid .thumb-date { display: block; }
.search-page.view-grid .c-athlete, .search-page.view-grid .c-event, .search-page.view-grid .c-record, .search-page.view-grid .c-meta { display: none; }
.search-page.view-grid .month-group { display: block; grid-column: 1 / -1; font-family: var(--serif); font-size: 13px; font-weight: 400; color: var(--ink-mute); padding: 34px 0 14px; }
.search-page.view-grid .month-group:first-child { padding-top: 0; }

/* 리스트 뷰 */
.search-page.view-list .row { display: grid; grid-template-columns: 122px 1fr 80px 185px 98px; column-gap: var(--frame-gap); align-items: center; padding: 14px 0; border-bottom: 1px solid var(--line-soft); }
.search-page.view-list .items { padding-top: 0; }
.search-page.view-list .row:hover { background: rgba(0,0,0,0.018); }
.search-page.view-list .thumb { display: none; }
.search-page.view-list .c-meta { display: none; }
.search-page.view-list .c-date { font-size: 12.5px; color: var(--ink-light); font-variant-numeric: tabular-nums; white-space: nowrap; order: 1; }
.search-page.view-list .c-title { font-family: var(--serif); font-weight: 500; font-size: 15.5px; line-height: 1.4; color: var(--ink); order: 2; }
.search-page.view-list .row:hover .c-title { color: var(--orange-deep); }
.search-page.view-list .c-athlete { font-size: 13px; color: var(--ink-mute); order: 3; }
.search-page.view-list .c-event { font-size: 13px; color: var(--ink-mute); order: 4; }
.search-page.view-list .c-record { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--ink); text-align: right; font-size: 13px; order: 5; }
.search-page.view-list .row:last-of-type { border-bottom: none; }
.search-page.view-list .month-group { display: block; font-family: var(--serif); font-size: 12.5px; font-weight: 400; letter-spacing: normal; color: var(--ink-mute); padding: 26px 0 10px; }

.month-group { display: none; }
.empty { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 16 / 9; margin: 24px 0; padding: 24px; background: var(--paper-deep); color: var(--ink-light); font-size: 14px; text-align: center; line-height: 1.6; }

@media (max-width: 640px) {
  .toolbar { gap: 12px; }
  .view-toggle { margin-left: auto; }
  .search-page.view-grid .items { grid-template-columns: 1fr 1fr; gap: 20px 14px; }
  .search-page.view-list .row { display: block; padding: 13px 0; }
  .search-page.view-list .c-date { display: none; }
  .search-page.view-list .month-group { font-size: 11.5px; }
  .search-page.view-list .c-title { display: block; font-size: 16px; margin-bottom: 4px; }
  .search-page.view-list .c-meta { display: block; font-size: 12px; color: var(--ink-light); font-variant-numeric: tabular-nums; line-height: 1.5; }
  .search-page.view-list .c-athlete, .search-page.view-list .c-event, .search-page.view-list .c-record { display: none; }
}
</style>
