<script setup lang="ts">
// 홈 갤러리 — 그리드/리스트 토글, 분야 필터, featured, 월 그룹.
// 기사 목록·featured 모두 DB(/api/articles) 연동.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normArticle } from '~/utils/articleList'

const { isEN, t } = useLang()

// 이미지 URL 정규화 — http 면 그대로, '/' 나 로컬 'images/' 는 로컬 절대경로,
// 그 외(R2 상대경로 등)는 CLOUD_PUBLIC_URL 을 앞에 붙인다.
const cloudBase = (useRuntimeConfig().public.cloudPublicUrl as string) || ''
const img = (p: string) => {
  const s = String(p || '')
  if (!s) return ''
  if (/^https?:\/\//.test(s) || s.startsWith('/')) return s
  if (/^images\//i.test(s)) return '/' + s
  return cloudBase ? cloudBase.replace(/\/+$/, '') + '/' + s : '/' + s
}

// ── 뷰(grid/list) ──
const view = ref<'grid' | 'list'>('grid')
useHead({
  title: 'Swimming Photography',
  bodyAttrs: { class: computed(() => 'view-' + view.value) },
})
onMounted(() => {
  try { const s = localStorage.getItem('mb_view'); if (s === 'grid' || s === 'list') view.value = s } catch {}
})
const setView = (v: 'grid' | 'list') => {
  view.value = v
  try { localStorage.setItem('mb_view', v) } catch {}
}

// 뷰 토글 라벨 (선택 = 오른쪽/진하게)
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

// ── 분야 필터 ──
const cats = [
  { k: '경기', en: 'Meets' },
  { k: '현장', en: 'On Site' },
  { k: '인물', en: 'Athlete' },
]
const curCat = ref('경기')

// ── 검색 ──
const showSearch = ref(false)
const searchQ = ref('')
const onSearchEnter = () => {
  const q = searchQ.value.trim()
  if (q) navigateTo({ path: '/search', query: { q } })
}

// ── 포맷 헬퍼 (원문 로직 이식) ──
const EN = () => isEN.value
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ymOf = (a: any) => (a.date || '').slice(0, 7)
const labelOf = (ym: string) => {
  const q = ym.split('-')
  return EN() ? MONTHS_EN[(+q[1]) - 1] + ' ' + q[0] : q[0] + '년 ' + (+q[1]) + '월'
}
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
const pick = (a: any, f: string) => {
  const v = EN() ? a[f + 'ENG'] : a[f]
  return (v == null || v === '') ? (a[f] || '') : v
}
const metaLine = (a: any) => [fmtDate(a.date), fmtRecord(a.record), pick(a, 'event'), pick(a, 'athlete')].filter(Boolean).join(' | ')

// ── 기사 목록 (DB 연동) : 발행 기사 최신순, 홈 노출(showInHome) 대상만 ──
const { data: listData } = await useAsyncData('home:articles', () =>
  $fetch<any[]>('/api/articles', { params: { type: 'article', status: 'published', limit: 200 } })
    .catch(() => [] as any[]),
)
const docs = computed(() => (listData.value || []).filter((d: any) => d.slug && (!d.visibility || d.visibility.showInHome !== false)))

// ── 목록/그룹 ──
const sorted = computed(() => docs.value.map(normArticle).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)))
const filtered = computed(() => sorted.value.filter((a) => curCat.value === 'all' || a.cat === curCat.value))
const months = computed(() => {
  const out: string[] = []; let prev = ''
  for (const a of filtered.value) { const ym = ymOf(a); if (ym && ym !== prev) { out.push(ym); prev = ym } }
  return out
})
const groups = computed(() => months.value.map((ym) => ({ ym, label: labelOf(ym), rows: filtered.value.filter((a) => ymOf(a) === ym) })))

// ── featured (그리드 상단, 큰 1 + 옆 2) : visibility.isFeatured 기사 최신순 ──
// 목록과 같은 fetch 에서 파생 — 대시보드에서 isFeatured 를 켜면 자동 반영. 첫 장이 hero(big).
const featImg = (d: any) => d?.media?.coverImage || (d?.media?.images && d.media.images[0]?.url) || d?.media?.thumb || ''
const feat = computed(() => (listData.value || []).filter((d: any) => d.slug && d.visibility?.isFeatured).slice(0, 3).map((d, i) => ({
  slug: d.slug,
  img: featImg(d),
  cat: (d.translations?.ko?.categories || [])[0] || d?.payload?.data?.category || '경기',
  catEN: (d.translations?.en?.categories || [])[0] || '',
  title: d.translations?.ko?.title || '',
  titleEN: d.translations?.en?.title || '',
  date: d?.payload?.data?.date || String(d.publishedAt || '').slice(0, 10),
  big: i === 0,
})))
const featCat = (f: any) => (isEN.value ? (f.catEN || f.cat) : f.cat)
const featTitle = (f: any) => (isEN.value ? (f.titleEN || f.title) : f.title)

// ── 속보 박스 (메뉴 바로 밑, 높이 = 그리드 썸네일과 동일 · 그리드·리스트 공통) ──
const { items: bkItems, hasItems: hasBreaking, load: loadBreaking, pick: bkPick, open: bkOpen } = useBreaking()
const bkFlag = computed(() => (isEN.value ? '[Breaking]' : '[속보]'))
const topBreaking = computed(() => bkItems.value.slice(0, 3))   // 속보 3줄 고정
const bbBox = ref<HTMLElement | null>(null)
const bbList = ref<HTMLElement | null>(null)

// 휴먼타임: N분 전 · N시간 전 · N일 전 · N주 전 · N달 전 · N년 전
function humanTime(s: string) {
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return ''
  const sec = Math.max(0, (Date.now() - new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime()) / 1000)
  const mn = Math.floor(sec / 60), hr = Math.floor(mn / 60), dy = Math.floor(hr / 24)
  const wk = Math.floor(dy / 7), mo = Math.floor(dy / 30), yr = Math.floor(dy / 365)
  const en = isEN.value
  if (mn < 60)  return en ? mn + ' min ago' : mn + '분 전'
  if (hr < 24)  return en ? hr + (hr === 1 ? ' hour' : ' hours') + ' ago' : hr + '시간 전'
  if (dy < 7)   return en ? dy + (dy === 1 ? ' day' : ' days') + ' ago' : dy + '일 전'
  if (dy < 30)  return en ? wk + (wk === 1 ? ' week' : ' weeks') + ' ago' : wk + '주 전'
  if (dy < 365) return en ? mo + (mo === 1 ? ' month' : ' months') + ' ago' : mo + '달 전'
  return en ? yr + (yr === 1 ? ' year' : ' years') + ' ago' : yr + '년 전'
}

// 높이 = 그리드 썸네일(4:3) 높이 + 4줄(속보 3 + 링크 1)이 flex로 균등하게 꽉 채움.
// 실제 썸네일 offsetHeight 측정 대신 컨테이너 폭에서 공식으로 계산 — body의 view-grid 클래스
// 적용 타이밍(클라이언트 라우팅 시 useHead 지연)과 무관하게 결정적이라, 뷰가 아직 안 잡힌 순간
// 전체폭 썸네일 높이(수백px)가 박제되는 버그를 막는다. (minmax(190px,1fr)·gap 20 / 모바일 2열·gap 14)
function syncBBHeight() {
  const box = bbBox.value, list = bbList.value
  if (!box || !list || !hasBreaking.value) return
  const itemsEl = document.getElementById('items')
  const w = (itemsEl && itemsEl.clientWidth) || box.clientWidth
  if (w) {
    const mobile = window.matchMedia('(max-width:640px)').matches
    const n = mobile ? 2 : Math.max(1, Math.floor((w + 20) / 210))
    const gap = mobile ? 14 : 20
    box.style.height = Math.round(((w - gap * (n - 1)) / n) * 3 / 4) + 'px'
  }
  const els = [...list.children] as HTMLElement[]
  els.forEach((el, i) => { el.style.flex = '1 1 0'; el.classList.toggle('bb-last', i === els.length - 1) })
}

onMounted(async () => {
  await loadBreaking()
  await nextTick()
  syncBBHeight()
  window.addEventListener('resize', syncBBHeight)
})
onBeforeUnmount(() => { if (import.meta.client) window.removeEventListener('resize', syncBBHeight) })
// 목록 변화·뷰 전환·언어 전환 시 높이 재동기
watch([bkItems, view, isEN], () => nextTick().then(syncBBHeight))
</script>

<template>
  <div class="home">
    <!-- 툴바: 필터(좌) + 보기 전환(우) -->
    <div class="toolbar">
      <div v-show="!showSearch" class="filters" role="group" aria-label="분야 필터">
        <button
          v-for="c in cats" :key="c.k" class="chip"
          :class="{ active: curCat === c.k }" @click="curCat = c.k"
        >{{ t(c.k, c.en) }}</button>
        <NuxtLink class="chip chip-link" to="/breakingnews">{{ t('속보', 'Breaking') }}</NuxtLink>
        <button class="chip chip-search" type="button" @click="showSearch = true">{{ t('검색', 'Search') }}</button>
      </div>
      <button
        v-show="!showSearch" class="view-toggle" type="button" aria-label="그리드/리스트 보기 전환"
        @click="onVtClick" @mouseenter="onVtEnter" @mouseleave="onVtLeave"
      >
        <span ref="vtInner" class="vt-inner"><span class="vt-dim">{{ vtDim }}</span><span class="vt-sep" aria-hidden="true">·</span><span class="vt-cur">{{ vtCur }}</span></span>
      </button>
    </div>

    <!-- 검색 패널 -->
    <div v-show="showSearch" class="search-panel">
      <div class="search-heading">{{ t('도시, 대회, 종목, 선수, 제목 검색', 'Search by city, meet, event, athlete, or title') }}</div>
      <input
        v-model="searchQ" type="search" class="search-input" aria-label="검색"
        :placeholder="t('검색어를 입력한 후 엔터를 눌러주세요.', 'Type your search, then press Enter.')"
        @keydown.enter="onSearchEnter" @blur="showSearch = false"
      >
    </div>

    <!-- 속보 박스 (그리드·리스트 공통 · 메뉴 바로 밑 · 높이 = 그리드 썸네일과 동일 · 헤드 없음) -->
    <div v-show="hasBreaking" ref="bbBox" class="breaking-box">
      <div ref="bbList" class="bb-list">
        <button
          v-for="it in topBreaking" :key="it.id" type="button" class="bb-item"
          @click="bkOpen(it)"
        >
          <span class="bb-line"><span class="flag">{{ bkFlag }}</span>{{ bkPick(it, 'title') }}<span v-if="humanTime(it.publishedAt)" class="tm">{{ humanTime(it.publishedAt) }}</span></span>
        </button>
        <NuxtLink class="bb-item bb-more-row" to="/breakingnews"><span class="bb-line">{{ t('속보 전체 보기', 'All breaking news') }}</span></NuxtLink>
      </div>
    </div>

    <!-- featured (그리드 전용) · visibility.isFeatured 기사 최신순 · 없으면 숨김 -->
    <div v-if="feat.length" class="featured" id="featured">
      <template v-for="(f, i) in feat" :key="f.slug || i">
        <NuxtLink v-if="f.big" class="feat-item feat-big" :to="'/article/' + f.slug">
          <img class="on" :src="img(f.img)" alt="">
          <span class="feat-cap"><span class="fc-cat">{{ featCat(f) }}</span><span class="fc-date">{{ fmtDate(f.date) }}</span><span class="fc-title">{{ featTitle(f) }}</span></span>
        </NuxtLink>
      </template>
      <div class="feat-side">
        <template v-for="(f, i) in feat" :key="'s' + (f.slug || i)">
          <NuxtLink v-if="!f.big" class="feat-item" :to="'/article/' + f.slug">
            <img class="on" :src="img(f.img)" alt="">
            <span class="feat-cap"><span class="fc-cat">{{ featCat(f) }}</span><span class="fc-date">{{ fmtDate(f.date) }}</span><span class="fc-title">{{ featTitle(f) }}</span></span>
          </NuxtLink>
        </template>
      </div>
    </div>

    <!-- 콘텐츠 (그리드/리스트 공용 · CSS로 뷰별 표시 제어) -->
    <div class="items" id="items">
      <!-- 인스타 프로모 (그리드 전용) -->
      <a class="row promo-row" href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">
        <span class="thumb promo-thumb" aria-hidden="true"><img :src="'/images/logo_medalbankaquatics_black.png'" alt="메달뱅크 아쿠아틱스"></span>
        <span class="c-title"><span class="c-cat">{{ t('안내', 'Notice') }}</span><span class="c-bar"> | </span>{{ t('또 다른 수영 이야기가 모여있는 곳', 'Where more swimming stories gather') }}</span>
        <span class="c-meta" /><span class="c-date" /><span class="c-athlete" /><span class="c-event" /><span class="c-record" />
      </a>

      <template v-for="g in groups" :key="g.ym">
        <div class="month-group">{{ g.label }}</div>
        <NuxtLink
          v-for="(a, i) in g.rows" :key="g.ym + i" class="row" :class="{ 'no-thumb': !a.thumb }" :to="'/article/' + a.slug"
          :data-cat="a.cat" :data-region="a.region" :data-competition="a.competition"
        >
          <span class="thumb" aria-hidden="true" :style="a.thumb ? { backgroundImage: `url('${img(a.thumb)}')` } : undefined">
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

      <p v-if="!groups.length" class="empty">{{ t('해당하는 기사가 없습니다.', 'No matching articles.') }}</p>
    </div>
  </div>
</template>

<style>
/* ── 홈 갤러리 스타일 (docs/html/index.html <style> 이식) ── */
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; padding: 0; margin-bottom: 0; }
.filters { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.chip { font-family: var(--serif); font-size: 13px; font-weight: 500; line-height: 1.6; color: var(--ink-light); background: none; padding: 0 6px; cursor: pointer; transition: color .15s; border: none; }
.chip:hover { color: var(--ink); }
.chip.active { color: var(--ink); font-weight: 700; }
.filters .chip:first-child { padding-left: 0; }

.view-toggle { display: inline-flex; flex: 0 0 auto; font-family: var(--serif); font-size: 13px; line-height: 1.6; background: none; border: none; padding: 0; cursor: pointer; }
.view-toggle .vt-inner { display: inline-flex; will-change: transform; }
.view-toggle .vt-dim { color: var(--ink-light); font-weight: 500; }
.view-toggle .vt-sep { color: var(--ink-light); margin: 0 0.3em; }
.view-toggle .vt-cur { color: var(--ink); font-weight: 700; }
.view-toggle:hover .vt-dim, .view-toggle:hover .vt-sep { color: var(--ink-mute); }

/* 검색 */
.search-panel { padding: 0; }
.search-heading { font-family: var(--serif); font-size: 12.5px; font-weight: 400; color: var(--ink-mute); padding: 26px 0 10px; }
.search-input { width: 100%; font-family: var(--serif); font-size: 22px; color: var(--ink); background: var(--paper-deep); border: none; border-radius: 2px; padding: 18px 20px; line-height: 1.3; }
.search-input::placeholder { color: var(--ink-light); font-size: 16px; }
.search-input:focus { outline: none; box-shadow: inset 0 -2px 0 var(--orange); }

/* 속보 박스 (그리드·리스트 공통, 메뉴 바로 밑) — 상단 티커와 같은 배경(#FBFBFB), 높이는 JS가 그리드 썸네일 높이와 동기화. 헤드 없음 */
.breaking-box { display: flex; flex-direction: column; background: #FBFBFB; border: none; margin-top: var(--frame-gap); padding: 6px 22px; overflow: hidden; }
.bb-list { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.bb-item { display: flex; align-items: center; width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-family: var(--serif); font-size: 13.5px; line-height: 1.5; color: var(--ink); padding: 6px 0; border-bottom: 1px solid rgba(26,26,26,.05); transition: color .15s; }
.bb-item.bb-last { border-bottom: none; }
.bb-item .bb-line { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-item .flag { color: var(--orange); font-weight: 700; margin-right: .45em; }
.bb-item .tm { color: var(--ink-light); font-size: 12px; margin-left: .6em; font-variant-numeric: tabular-nums; }
.bb-item:hover { color: var(--orange-deep); }
.bb-item.bb-more-row { color: var(--ink-light); }

/* featured */
.featured { display: none; }
body.view-grid .featured { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: 1fr 1fr; gap: 20px; margin: 20px 0 0; }
.feat-big { grid-column: 1 / 4; grid-row: 1 / 3; aspect-ratio: 3 / 2; }
.feat-side { grid-column: 4 / 6; grid-row: 1 / 3; display: flex; flex-direction: column; gap: 20px; }
.feat-side .feat-item { flex: 1; min-height: 0; }
.feat-item { position: relative; display: block; overflow: hidden; color: var(--paper); }
.feat-item img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; }
.feat-item img.on { opacity: 1; }
.feat-item:hover img.on { opacity: .9; }
.feat-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 40px 22px 16px; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.62)); }
.feat-cap .fc-cat { font-family: var(--serif); font-size: 13px; font-weight: 700; color: var(--orange); }
.feat-cap .fc-date { font-family: var(--serif); font-size: 13px; color: #fff; mix-blend-mode: difference; margin-left: 0.5em; }
.feat-cap .fc-title { display: block; font-family: var(--serif); font-size: 21px; font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; margin-top: 6px; }
.feat-big .feat-cap { padding: 56px 28px 24px; }
.feat-big .fc-title { font-size: 30px; }

/* 콘텐츠 공통 */
.items { margin: 6px 0 8px; }
.row { color: var(--ink); }
.thumb { background-color: var(--paper-deep); background-size: cover; background-position: center; position: relative; overflow: hidden; }
.thumb-date { position: absolute; left: 9px; bottom: 8px; font-family: var(--serif); font-size: 12px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); letter-spacing: .01em; pointer-events: none; display: none; }

/* 그리드 뷰 */
body.view-grid .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 20px; margin-top: 0; padding-top: 20px; }
body.view-grid .row { display: flex; flex-direction: column; gap: 9px; }
/* 사진 없는 기사: 그리드에서는 숨기고 리스트에서만 노출 */
body.view-grid .row.no-thumb { display: none; }
body.view-grid .thumb { display: block; aspect-ratio: 4 / 3; border-radius: 0; }
body.view-grid .promo-thumb { background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
body.view-grid .promo-thumb img { display: block; width: 100%; height: auto; }
body.view-grid .row:hover .thumb { opacity: .9; }
.c-cat { color: var(--orange); font-weight: 700; margin-right: 0.4em; }
.c-bar { display: none; }
body.view-grid .c-title { font-family: var(--serif); font-weight: 700; font-size: 16px; line-height: 1.45; color: var(--ink); }
body.view-grid .row:hover .c-title { color: var(--orange-deep); }
body.view-grid .c-date { display: none; }
body.view-grid .thumb-date { display: block; }
body.view-grid .c-athlete, body.view-grid .c-event, body.view-grid .c-record, body.view-grid .c-meta { display: none; }

/* 리스트 뷰 */
body.view-list .row { display: grid; grid-template-columns: 122px 1fr 80px 185px 98px; column-gap: var(--frame-gap); align-items: center; padding: 14px 0; border-bottom: 1px solid var(--line-soft); }
body.view-list .items { padding-top: 0; margin-top: 0; }
body.view-list .thumb { display: none; }
body.view-list .promo-row { display: none; }
body.view-list .c-meta { display: none; }
body.view-list .c-date { font-size: 12.5px; color: var(--ink-light); font-variant-numeric: tabular-nums; white-space: nowrap; order: 1; }
body.view-list .c-title { font-family: var(--serif); font-weight: 500; font-size: 15.5px; line-height: 1.4; color: var(--ink); order: 2; }
body.view-list .row:hover .c-title { color: var(--orange-deep); }
body.view-list .c-athlete { font-size: 13px; color: var(--ink-mute); order: 3; }
body.view-list .c-event { font-size: 13px; color: var(--ink-mute); order: 4; }
body.view-list .c-record { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--ink); text-align: right; font-size: 13px; order: 5; }
body.view-list .row:last-child { border-bottom: none; }

/* 월별 그룹 헤더 */
.month-group { display: none; }
body.view-list .month-group { display: block; font-family: var(--serif); font-size: 12.5px; font-weight: 400; color: var(--ink-mute); padding: 26px 0 10px; }
body.view-list .month-group:first-child { padding-top: var(--frame-gap); }
body.view-grid .month-group { display: none; }

.empty { text-align: center; color: var(--ink-light); font-size: 14px; padding: 48px 0; }

@media (max-width: 640px) {
  .toolbar { gap: 12px; }
  .view-toggle { margin-left: auto; }
  body.view-grid .items { grid-template-columns: 1fr 1fr; gap: 20px 14px; }
  body.view-grid .featured { grid-template-columns: 1fr; grid-template-rows: auto; gap: 20px; }
  .feat-big { grid-column: 1; grid-row: auto; aspect-ratio: 16 / 9; }
  .feat-side { grid-column: 1; grid-row: auto; }
  .feat-side .feat-item { flex: none; aspect-ratio: 16 / 9; }
  .feat-cap { padding: 40px 18px 16px; }
  .feat-cap .fc-title, .feat-big .fc-title { font-size: 18px; }
  .feat-big .feat-cap { padding: 40px 18px 16px; }
  body.view-list .row { display: block; padding: 13px 0; }
  body.view-list .c-date { display: none; }
  body.view-list .c-title { display: block; font-size: 16px; margin-bottom: 4px; }
  body.view-list .c-meta { display: block; font-size: 12px; color: var(--ink-light); font-variant-numeric: tabular-nums; line-height: 1.5; }
  body.view-list .c-athlete, body.view-list .c-event, body.view-list .c-record { display: none; }
  body.view-list .month-group { font-size: 11.5px; }
}
</style>
