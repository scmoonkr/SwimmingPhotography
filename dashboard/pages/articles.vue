<script setup lang="ts">
// 기사 — SwimmingPhotography DB(articles, type=article). Express(/api/articles) 경유.
// 속보(breaking_news) 페이지와 동일 구조, type 만 다름.
import { onMounted, ref } from 'vue'
import { useEntity, slugify, blankArticle, BN_CATEGORIES } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const TYPE = 'article'
const e = useEntity('article')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/articles${p}`

// ── 필터 (분류 + 제목) ──
const category = ref('')
const q = ref('')

const rows = ref<any[]>([])
const errorMsg = ref('')

const load = async () => {
  errorMsg.value = ''
  try {
    const params: Record<string, any> = { type: TYPE }
    if (category.value) params.category = category.value
    if (q.value.trim()) params.q = q.value.trim()
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

// ── 체크박스 선택 + 일괄 게시 ──
const checked = ref<Record<string, any>[]>([])
const publishing = ref(false)
const publishSelected = async () => {
  const ids = checked.value.map((r) => r._id).filter(Boolean)
  if (!ids.length) return
  if (!confirm(`선택한 ${ids.length}건을 게시하시겠습니까?`)) return
  publishing.value = true
  try {
    await $fetch(api('/publish'), { method: 'POST', body: { ids } })
    checked.value = []
    await load()
  } catch (err: any) {
    alert('게시 실패: ' + (err?.data?.error || err?.message || ''))
  } finally {
    publishing.value = false
  }
}

const splitList = (v: string) => (v || '').split(',').map((s) => s.trim()).filter(Boolean)

// docs/schema.md 매핑 — 드로어 편집 필드 (get/set)
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
  // 이미지 썸네일 줄 (읽기전용)
  {
    key: 'images', label: '이미지', type: 'thumbs',
    get: (r) => {
      const urls = (r.media?.images || []).map((im: any) => im?.url).filter(Boolean)
      if (!urls.length && r.media?.thumb) urls.push(r.media.thumb)
      return urls
    },
    set: () => {},
  },
  // 유튜브 URL (읽기전용) — content 블록에서 추출
  {
    key: 'youtube', label: '유튜브', type: 'link',
    get: (r) => {
      const b = (r.translations?.ko?.content?.blocks || []).find((x: any) => x?.provider === 'youtube' || /youtu\.?be/i.test(String(x?.url || '')))
      return b?.url || ''
    },
    set: () => {},
  },
  {
    key: 'reporter', label: '출처', type: 'text', span: 2,
    get: (r) => r.reporter?.name ?? '',
    set: (r, v) => { r.reporter.name = v; r.reporter.nameEng = v === '편집부' ? 'Editorial Team' : v },
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
      <input v-model="q" class="filter-input" type="search" placeholder="제목 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <span class="filter-spacer" />
      <button
        class="btn btn-ghost" type="button"
        :disabled="!checked.length || publishing" @click="publishSelected"
      >{{ publishing ? '게시 중…' : (checked.length ? `게시 (${checked.length})` : '게시') }}</button>
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
.filter-spacer { flex: 1; }
.load-error {
  margin-bottom: 14px; padding: 10px 14px; border-radius: 6px;
  background: var(--bad-bg); color: var(--bad); font-size: 13px;
}
</style>
