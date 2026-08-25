<script setup lang="ts">
// 기사 — SwimmingPhotography DB(articles, type=article). Express(/api/articles) 경유.
// 속보(breaking_news) 페이지와 동일 구조, type 만 다름.
import { computed, onMounted, ref } from 'vue'
import { useEntity, slugify, blankArticle, BN_CATEGORIES } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const TYPE = 'article'
const e = useEntity('article')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/articles${p}`

// ── 필터 (분류 + 상태 + 작성일자 + featured + 이미지 + 제목) ──
const category = ref('')
const q = ref('')
const status = ref('')          // '' 전체 / published 게시됨 / draft 초안
const dateFrom = ref('')        // 작성일자(createdAt) >= 이 날짜
const featured = ref(false)     // visibility.isFeatured 만
const hasImage = ref(false)     // 이미지 있는 기사만

const rows = ref<any[]>([])
const errorMsg = ref('')

const load = async () => {
  errorMsg.value = ''
  try {
    const params: Record<string, any> = { type: TYPE }
    if (category.value) params.category = category.value
    if (q.value.trim()) params.q = q.value.trim()
    if (status.value) params.status = status.value
    if (dateFrom.value) params.dateFrom = dateFrom.value
    if (featured.value) params.featured = 'true'
    if (hasImage.value) params.hasImage = 'true'
    const data = await $fetch<any[]>(api(), { params })
    // 작성일(createdAt) 최근순
    rows.value = (data || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '불러오기 실패'
  }
}
onMounted(load)

const selected = ref<Record<string, any> | null>(null)
const open = ref(false)
const isNew = ref(false)

// ── 체크박스 선택 + 일괄 게시/초안 ──
// 게시 버튼: 선택된 '초안' 기사만 게시. 초안 버튼: 선택된 '게시됨' 기사만 초안으로.
const checked = ref<Record<string, any>[]>([])
const busy = ref<'' | 'publish' | 'draft'>('')
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
    key: 'type', label: '기사 유형', type: 'select', options: ['기사', '속보'], span: 1,
    get: (r) => (r.type === 'breaking_news' ? '속보' : '기사'),
    set: (r, v) => { r.type = v === '속보' ? 'breaking_news' : 'article' },
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

const openRow = (r: Record<string, any>) => { isNew.value = false; selected.value = r; open.value = true }
const openNew = () => { isNew.value = true; selected.value = blankArticle(TYPE); open.value = true }

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
      <select v-model="category" class="filter-select" aria-label="분류" @change="load">
        <option value="">전체 분류</option>
        <option v-for="c in BN_CATEGORIES" :key="c.v" :value="c.v">{{ c.l }}</option>
      </select>
      <select v-model="status" class="filter-select" aria-label="상태" @change="load">
        <option value="">전체</option>
        <option value="published">게시됨</option>
        <option value="draft">초안</option>
      </select>
      <input v-model="dateFrom" class="filter-select" type="date" aria-label="작성일자(이후)" title="작성일자 ≥" @change="load">
      <label class="filter-check"><input v-model="featured" type="checkbox" @change="load"> featured</label>
      <label class="filter-check"><input v-model="hasImage" type="checkbox" @change="load"> 이미지</label>
      <input v-model="q" class="filter-input" type="search" placeholder="제목 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <span class="filter-spacer" />
      <button
        class="btn btn-ghost" type="button"
        :disabled="!draftChecked.length || !!busy" @click="publishSelected"
      >{{ busy === 'publish' ? '게시 중…' : (draftChecked.length ? `게시 (${draftChecked.length})` : '게시') }}</button>
      <button
        class="btn btn-ghost" type="button"
        :disabled="!pubChecked.length || !!busy" @click="draftSelected"
      >{{ busy === 'draft' ? '초안 전환 중…' : (pubChecked.length ? `초안 (${pubChecked.length})` : '초안') }}</button>
      <button class="btn btn-primary" type="button" @click="openNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        기사 등록
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">데이터를 불러오지 못했습니다: {{ errorMsg }}</p>

    <DataTable
      :columns="e.columns" :rows="rows" clickable hide-search hide-actions
      selectable :selected="checked" @update:selected="checked = $event"
      @row-click="openRow"
    />

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
</style>
