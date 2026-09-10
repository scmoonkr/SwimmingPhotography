<script setup lang="ts">
// 대회 기사 — SwimmingPhotography DB(articles, type1=record·breaking_news). Express(/api/articles) 경유.
// 속보(breaking_news) 페이지와 동일 구조, type 만 다름.
import { computed, onMounted, ref } from 'vue'
import { useEntity, slugify, blankArticle, BN_CATEGORIES, ARTICLE_TYPES, typeLabel } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const TYPE = 'article'
// 이 페이지가 다루는 기사 유형(type1). 대회 기록 기사와 속보.
const PAGE_TYPES = ['record', 'breaking_news']
const TYPE_OPTIONS_V = ARTICLE_TYPES.filter((t) => PAGE_TYPES.includes(t.v))   // 필터용 {v,l}
const TYPE_OPTIONS = TYPE_OPTIONS_V.map((t) => t.l)                             // 드로어 select 용 라벨
const type1 = ref('record')          // 필터 — 기본은 경기기록
const e = useEntity('article')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/articles${p}`

// ── 필터 (상태 + 작성일자 + featured + 이미지 + 제목) ──
const q = ref('')
const status = ref('')          // '' 전체 / published 게시됨 / draft 초안
const dateFrom = ref('')        // 작성일자(createdAt) >= 이 날짜
const featured = ref(false)     // visibility.isFeatured 만
const hasImage = ref(false)     // 이미지 있는 기사만

const rows = ref<any[]>([])
const errorMsg = ref('')

// 쪽 나누기 — 기사가 500건이 넘어 한 번에 다 받으면 무겁고, 서버 기본 limit(200) 밖의
// 기사는 아예 목록에 오지도 않았다. 필요한 쪽만 서버에서 받아온다.
const PAGE_SIZE = 1000
const page = ref(1)
const total = ref(0)

const load = async () => {
  errorMsg.value = ''
  try {
    // fields=list — 표가 그리는 열만 받는다. 편집에 필요한 전체 문서는 행을 클릭할 때 따로 받는다.
    // type 대신 type1 로 거른다(기사 유형). 비우면 이 페이지가 다루는 유형 전체.
    const params: Record<string, any> = { type1: type1.value || PAGE_TYPES.join(','), fields: 'list', sort: 'created', withTotal: '1', limit: PAGE_SIZE, skip: (page.value - 1) * PAGE_SIZE }
    // 검색어가 숫자뿐이면 제목이 아니라 대회ID 로 찾는다 (3614 → competitionID: 3614)
    const term = q.value.trim()
    if (term) {
      if (/^\d+$/.test(term)) params.competitionID = Number(term)
      else params.q = term
    }
    if (status.value) params.status = status.value
    if (dateFrom.value) params.dateFrom = dateFrom.value
    if (featured.value) params.featured = 'true'
    if (hasImage.value) params.hasImage = 'true'
    // 정렬(작성일 최근순)은 서버가 한다 — 쪽마다 따로 정렬하면 순서가 어긋난다.
    const data = await $fetch<any>(api(), { params })
    rows.value = data?.rows || []
    total.value = data?.total ?? rows.value.length
  } catch (err: any) {
    rows.value = []
    total.value = 0
    errorMsg.value = err?.data?.error || err?.message || '불러오기 실패'
  }
}

// 쪽 이동 — 다른 쪽의 선택은 화면에 없으니 함께 비운다
const goPage = (p: number) => { page.value = p; checked.value = []; load() }
// 필터가 바뀌면 첫 쪽부터
const reload = () => { page.value = 1; checked.value = []; load() }
onMounted(load)

const selected = ref<Record<string, any> | null>(null)
const open = ref(false)
const isNew = ref(false)

// ── 체크박스 선택 + 일괄 게시/초안 ──
// 게시 버튼: 선택된 '초안' 기사만 게시. 초안 버튼: 선택된 '게시됨' 기사만 초안으로.
const checked = ref<Record<string, any>[]>([])
const busy = ref<'' | 'publish' | 'draft' | 'pubdate'>('')
const draftChecked = computed(() => checked.value.filter((r) => r.status !== 'published'))
const pubChecked = computed(() => checked.value.filter((r) => r.status === 'published'))

const setStatus = async (path: '/publish' | '/unpublish', targets: Record<string, any>[], verb: string, kind: 'publish' | 'draft') => {
  const ids = targets.map((r) => r._id).filter(Boolean)
  if (!ids.length) return
  if (!confirm(`선택한 ${ids.length}건을 ${verb}하시겠습니까?`)) return
  busy.value = kind
  try {
    await $fetch(api(path), { method: 'POST', body: { ids } })
    checked.value = []
    await load()
  } catch (err: any) {
    alert(`${verb} 실패: ` + (err?.data?.error || err?.message || ''))
  } finally {
    busy.value = ''
  }
}
const publishSelected = () => setStatus('/publish', draftChecked.value, '게시', 'publish')
const draftSelected = () => setStatus('/unpublish', pubChecked.value, '초안 전환', 'draft')

// 게시일수정 — 선택한 기사들의 게시일자(publishedAt)를 바꾼다. 상태(게시됨·초안)는 건드리지 않는다.
// 날짜는 모달에서 따로 받는다 — 필터의 날짜를 쓰면 그 날짜로 목록이 걸러져
// 정작 바꾸려는 기사를 고를 수가 없다.
const pdOpen = ref(false)
const pdDate = ref('')
const pdMsg = ref('')
const today = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const openPubDate = () => {
  if (!checked.value.length || busy.value) return
  pdDate.value = today()
  pdMsg.value = ''
  pdOpen.value = true
}
const closePubDate = () => { if (busy.value !== 'pubdate') pdOpen.value = false }
const applyPubDate = async () => {
  if (busy.value) return
  const ids = checked.value.map((r) => r._id).filter(Boolean)
  const date = pdDate.value
  if (!ids.length || !date) return          // 날짜가 비면 버튼이 잠겨 있어 여기 오지 않는다
  busy.value = 'pubdate'; pdMsg.value = ''
  try {
    await $fetch(api('/published-at'), { method: 'POST', body: { ids, date } })
    pdOpen.value = false
    checked.value = []
    await load()                            // 표의 '게시' 열에 바뀐 날짜가 보인다
  } catch (err: any) {
    pdMsg.value = '바꾸지 못했습니다: ' + (err?.data?.error || err?.message || '')
  } finally {
    busy.value = ''
  }
}

const splitList = (v: string) => (v || '').split(',').map((s) => s.trim()).filter(Boolean)

// docs/schema.md 매핑 — 드로어 편집 필드 (get/set)
// ── 유튜브 영상 블록 ──────────────────────────────────────
// 본문 blocks 안의 { type:'video', url } 하나로 다룬다. 렌더러(articleHtml)가 보는 것도 type==='video' 다.
// ko·en blocks 는 같은 인덱스끼리 짝지어 렌더되므로, 넣고 뺄 때 두 배열을 같은 자리에서 함께 손봐야
// 뒤쪽 문단들의 영문이 어긋나지 않는다.
const blocksOf = (r: any, lang: string) => r?.translations?.[lang]?.content?.blocks
const isVideo = (b: any) => b?.type === 'video' || b?.provider === 'youtube'
const findVideoBlock = (r: any) => (blocksOf(r, 'ko') || []).find(isVideo)

// 넣을 자리 — 개요(event.summary) 다음, 첫 경기 결과(event.result) 앞.
// 둘 다 없으면 맨 뒤에 붙인다.
const videoSlot = (blocks: any[]) => {
  const result = blocks.findIndex((b: any) => b?.type === 'event' && b?.source === 'result')
  if (result >= 0) return result
  let summary = -1
  blocks.forEach((b: any, i: number) => { if (b?.type === 'event' && b?.source === 'summary') summary = i })
  return summary >= 0 ? summary + 1 : blocks.length
}

// 영상 캡션 — 렌더러가 ko 블록의 caption 을 figcaption(art-caption) 으로 그린다.
const setVideoCaption = (r: any, caption: string) => {
  const b = findVideoBlock(r)
  if (!b) return                                // 영상이 없으면 캡션만 따로 둘 자리가 없다
  if (caption) b.caption = caption
  else delete b.caption
}

const setVideoBlock = (r: any, url: string) => {
  const ko = blocksOf(r, 'ko')
  if (!Array.isArray(ko)) return
  // 다른 언어는 ko 와 길이가 같을 때만 함께 손댄다 — 어긋난 문서를 더 어긋나게 만들지 않는다.
  const langs = ['ko', 'en', 'ja'].filter((l) => {
    const bs = blocksOf(r, l)
    return Array.isArray(bs) && (l === 'ko' || bs.length === ko.length)
  })
  const at = ko.findIndex(isVideo)

  if (!url) {                                   // 비웠으면 제거
    if (at < 0) return
    for (const l of langs) {
      const bs = blocksOf(r, l)
      if (isVideo(bs[at])) bs.splice(at, 1)
    }
    return
  }
  if (at >= 0) {                                // 이미 있으면 위치는 두고 URL 만 교체
    for (const l of langs) {
      const b = blocksOf(r, l)[at]
      if (isVideo(b)) { b.url = url; b.type = 'video' }
    }
    return
  }
  const pos = videoSlot(ko)                     // 새로 넣기
  for (const l of langs) blocksOf(r, l).splice(pos, 0, { type: 'video', url })
}

const fields: Field[] = [
  {
    key: 'type1', label: '기사 유형', type: 'select', options: TYPE_OPTIONS, span: 1,
    get: (r) => typeLabel(r.type1) || TYPE_OPTIONS[0],
    set: (r, v) => {
      const hit = ARTICLE_TYPES.find((t) => t.l === v)
      if (!hit) return
      r.type1 = hit.v
      // 속보는 문서의 type 도 함께 맞춰야 속보 페이지·공개 티커에 잡힌다.
      r.type = hit.v === 'breaking_news' ? 'breaking_news' : 'article'
    },
  },
  {
    key: 'title', label: '제목', type: 'text', span: 3,
    get: (r) => r.translations?.ko?.title ?? '',
    set: (r, v) => { r.translations.ko.title = v; r.slug = slugify(v); r.translations.ko.seoTitle = v },
  },
  // 이미지 썸네일 줄 (읽기전용) — 출처와 한 줄
  {
    key: 'images', label: '이미지', type: 'thumbs', span: 2,
    get: (r) => {
      const urls = (r.media?.images || []).map((im: any) => im?.url).filter(Boolean)
      if (!urls.length && r.media?.thumb) urls.push(r.media.thumb)
      return urls
    },
    set: () => {},
  },
  {
    key: 'reporter', label: '출처', type: 'text', span: 2,
    get: (r) => r.reporter?.name ?? '',
    set: (r, v) => { r.reporter.name = v; r.reporter.nameEng = v === '편집부' ? 'Editorial Team' : v },
  },
  // 유튜브 URL — 비우면 영상이 빠지고, 넣으면 개요와 첫 경기 결과 사이에 들어간다.
  {
    key: 'youtube', label: '유튜브 URL (개요와 첫 결과 사이)', type: 'text', span: 2,
    get: (r) => findVideoBlock(r)?.url || '',
    set: (r, v) => setVideoBlock(r, String(v ?? '').trim()),
  },
  {
    key: 'youtubeCaption', label: '유튜브 캡션 (영상 아래 설명)', type: 'text', span: 2,
    get: (r) => findVideoBlock(r)?.caption || '',
    set: (r, v) => setVideoCaption(r, String(v ?? '').trim()),
  },
  {
    key: 'status', label: '상태', type: 'checkbox', options: ['게시됨', '초안'], span: 1,
    get: (r) => r.status === 'published',
    set: (r, v) => { r.status = v ? 'published' : 'draft' },
  },
  {
    key: 'publishedAt', label: '게시 (publishedAt)', type: 'text', span: 1,
    get: (r) => r.publishedAt ?? '',
    set: (r, v) => { r.publishedAt = v },
  },
  {
    key: 'categories', label: '분류 (searchCategories)', type: 'text', span: 2,
    get: (r) => (r.searchCategories || []).join(', '),
    set: (r, v) => { const a = splitList(v); r.searchCategories = a; r.translations.ko.categories = a },
  },
  {
    key: 'featured', label: 'featured', type: 'checkbox', options: ['featured', '일반'], span: 1,
    get: (r) => !!r.visibility?.isFeatured,
    set: (r, v) => { if (!r.visibility) r.visibility = {}; r.visibility.isFeatured = !!v },
  },
  // slug (표시전용) — 기사 URL. 저장하면 제목에서 다시 만들어지므로 여기서 고치지는 않는다.
  {
    key: 'slug', label: 'slug (URL)', type: 'meta', span: 1,
    get: (r) => r.slug || '',
    set: () => {},
  },
  {
    key: 'tags', label: '태그 (searchTags)', type: 'text',
    get: (r) => (r.searchTags || []).join(', '),
    set: (r, v) => { const a = splitList(v); r.searchTags = a; r.translations.ko.tags = a },
  },
  // 맨 아래: 기사 내용 (translations JSON 통째)
  {
    key: 'content', label: '기사 내용 (translations JSON)', type: 'textarea', rows: 20,
    get: (r) => JSON.stringify(r.translations ?? {}, null, 2),
    set: (r, v) => {
      const s = String(v).trim()
      if (!s) return
      try { r.translations = JSON.parse(s) } // 유효한 JSON 이면 통째로 교체
      catch { /* 파싱 실패 시 기존 translations 유지 */ }
    },
  },
]

// 목록 행은 표시용 필드만 담고 있다. 편집·저장은 전체 문서라야 하므로
// (부분 문서로 저장하면 빠진 필드가 통째로 날아간다) 열 때 그 기사 하나를 다시 받는다.
const rowLoading = ref(false)
const openRow = async (r: Record<string, any>) => {
  isNew.value = false
  selected.value = r            // 먼저 열어 두고(제목 등 표시), 전체 문서로 교체한다
  open.value = true
  if (!r?._id) return
  rowLoading.value = true
  try {
    selected.value = await $fetch<any>(api(`/${r._id}`))
  } catch (err: any) {
    errorMsg.value = '기사를 불러오지 못했습니다: ' + (err?.data?.error || err?.message || '')
    open.value = false
  } finally {
    rowLoading.value = false
  }
}
const openNew = () => { isNew.value = true; selected.value = { ...blankArticle(TYPE), type1: type1.value || 'record' }; open.value = true }

const nowStamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const onSave = async (v: Record<string, any>) => {
  const base = isNew.value ? blankArticle(TYPE) : JSON.parse(JSON.stringify(selected.value))
  // 'content'(translations JSON 통째 교체)를 먼저 적용한 뒤, 제목·분류·태그 등 세부 필드가 덮어쓰도록.
  const ordered = [...fields].sort((a, b) => (a.key === 'content' ? -1 : b.key === 'content' ? 1 : 0))
  ordered.forEach((f) => f.set(base, v[f.key]))
  try {
    if (isNew.value) {
      if (!base.publishedAt) base.publishedAt = nowStamp()
      await $fetch(api(), { method: 'POST', body: base })
    } else {
      const id = selected.value?._id
      const body = { ...base }
      delete body._id
      await $fetch(api(`/${id}`), { method: 'PUT', body })
    }
    await load()
    open.value = false
    isNew.value = false
  } catch (err: any) {
    alert('저장 실패: ' + (err?.data?.error || err?.message || ''))
  }
}

const onDelete = async (r: Record<string, any>) => {
  if (!confirm('이 기사를 삭제하시겠습니까?')) return false
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    await load()
    return true
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
    return false
  }
}
const onDrawerDelete = async () => {
  if (selected.value && (await onDelete(selected.value))) open.value = false
}
</script>

<template>
  <div>
    <!-- 필터 바: 분류 + 제목 검색 + 기사 등록 -->
    <div class="filter-bar">
      <select v-model="type1" class="filter-select" aria-label="기사 유형" @change="reload">
        <option value="">유형 전체</option>
        <option v-for="t in TYPE_OPTIONS_V" :key="t.v" :value="t.v">{{ t.l }}</option>
      </select>
      <select v-model="status" class="filter-select" aria-label="상태" @change="reload">
        <option value="">전체</option>
        <option value="published">게시됨</option>
        <option value="draft">초안</option>
      </select>
      <input v-model="dateFrom" class="filter-select" type="date" aria-label="작성일자(이후)" title="작성일자 ≥" @change="reload">
      <label class="filter-check"><input v-model="featured" type="checkbox" @change="reload"> featured</label>
      <label class="filter-check"><input v-model="hasImage" type="checkbox" @change="reload"> 이미지</label>
      <input v-model="q" class="filter-input" type="search" placeholder="제목 검색 · 숫자는 대회ID…" @keydown.enter="reload">
      <button class="btn btn-ghost" type="button" @click="reload">검색</button>
      <span class="filter-spacer" />
      <button
        class="btn btn-ghost" type="button"
        :disabled="!draftChecked.length || !!busy" @click="publishSelected"
      >{{ busy === 'publish' ? '게시 중…' : (draftChecked.length ? `게시 (${draftChecked.length})` : '게시') }}</button>
      <button
        class="btn btn-ghost" type="button"
        :disabled="!pubChecked.length || !!busy" @click="draftSelected"
      >{{ busy === 'draft' ? '초안 전환 중…' : (pubChecked.length ? `초안 (${pubChecked.length})` : '초안') }}</button>
      <button
        class="btn btn-ghost" type="button" title="선택한 기사의 게시일자를 바꿉니다"
        :disabled="!checked.length || !!busy" @click="openPubDate"
      >{{ checked.length ? `게시일수정 (${checked.length})` : '게시일수정' }}</button>
      <button class="btn btn-primary" type="button" @click="openNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        기사 등록
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">데이터를 불러오지 못했습니다: {{ errorMsg }}</p>

    <DataTable
      :columns="e.columns" :rows="rows" clickable hide-search hide-actions
      selectable :selected="checked" @update:selected="checked = $event"
      :page="page" :total="total" :page-size="PAGE_SIZE"
      @row-click="openRow" @update:page="goPage"
    />

    <!-- 게시일자 변경 — 선택한 기사에 적용할 날짜를 여기서 받는다 -->
    <div v-if="pdOpen" class="pd" @keydown.esc="closePubDate">
      <div class="pd-ov" @click="closePubDate" />
      <div class="pd-box" role="dialog" aria-modal="true" aria-label="게시일자 변경">
        <div class="pd-head">
          <h2>게시일자 변경</h2>
          <button class="pd-x" type="button" aria-label="닫기" @click="closePubDate">×</button>
        </div>
        <div class="pd-body">
          <p class="pd-note">선택한 <b>{{ checked.length }}건</b>의 게시일자를 아래 날짜로 바꿉니다. 상태(게시됨·초안)는 그대로 둡니다.</p>
          <input v-model="pdDate" class="pd-input" type="date" aria-label="게시일자" @keydown.enter="applyPubDate">
          <p v-if="pdMsg" class="pd-msg">{{ pdMsg }}</p>
        </div>
        <div class="pd-foot">
          <button class="btn btn-ghost" type="button" :disabled="busy === 'pubdate'" @click="closePubDate">취소</button>
          <button class="btn btn-primary" type="button" :disabled="!pdDate || busy === 'pubdate'" @click="applyPubDate">
            {{ busy === 'pubdate' ? '바꾸는 중…' : '변경' }}
          </button>
        </div>
      </div>
    </div>

    <DetailDrawer
      :open="open" :title="isNew ? '기사 등록' : '기사 상세 · 편집'"
      :fields="fields" :row="selected"
      @close="open = false" @save="onSave" @delete="onDrawerDelete"
    />
  </div>
</template>

<style scoped>
.filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.filter-select {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px;
  padding: 9px 12px; cursor: pointer;
}
.filter-input {
  flex: 0 1 300px; font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-input:focus, .filter-select:focus { outline: none; border-color: var(--orange); }
.filter-check { display: inline-flex; align-items: center; gap: 5px; font-family: var(--sans); font-size: 13.5px; color: var(--ink); cursor: pointer; white-space: nowrap; }
.filter-check input { width: 15px; height: 15px; cursor: pointer; accent-color: var(--orange); }
.filter-spacer { flex: 1; }
.load-error {
  margin-bottom: 14px; padding: 10px 14px; border-radius: 6px;
  background: var(--bad-bg); color: var(--bad); font-size: 13px;
}

/* 게시일자 변경 모달 */
.pd { position: fixed; inset: 0; z-index: 1200; }
.pd-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .38); }
.pd-box {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(420px, 94vw); background: var(--paper);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 24px 60px rgba(26, 26, 26, .22);
}
.pd-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--line); }
.pd-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); }
.pd-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.pd-x:hover { color: var(--ink); }
.pd-body { padding: 18px 20px; }
.pd-note { margin: 0 0 12px; font-size: 13px; color: var(--ink); line-height: 1.6; }
.pd-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink); background: var(--paper);
  border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px; width: 100%;
}
.pd-input:focus { outline: none; border-color: var(--orange); }
.pd-msg { margin: 10px 0 0; font-size: 12.5px; color: var(--bad); }
.pd-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 0 20px 18px; }
</style>
