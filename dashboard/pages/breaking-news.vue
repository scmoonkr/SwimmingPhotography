<script setup lang="ts">
// 속보 — MongoDB(articles, type=breaking_news)에 연결. Express(/api/articles) 경유.
import { onMounted, ref } from 'vue'
import { useEntity, slugify, blankArticle, BN_CATEGORIES } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const e = useEntity('breakingNews') // 컬럼 등 메타는 그대로 사용
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/articles${p}`

// ── 필터 (분류 + 제목) ──
const category = ref('')
const q = ref('')

const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const params: Record<string, any> = { type: 'breaking_news' }
    if (category.value) params.category = category.value
    if (q.value.trim()) params.q = q.value.trim()
    rows.value = await $fetch(api(), { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '불러오기 실패'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const selected = ref<Record<string, any> | null>(null)
const open = ref(false)
const isNew = ref(false)
const saving = ref(false)

const splitList = (v: string) => (v || '').split(',').map((s) => s.trim()).filter(Boolean)

// docs/schema.md 매핑 — 드로어 편집 필드 (get/set)
const fields: Field[] = [
  {
    key: 'title', label: '헤드라인', type: 'text',
    get: (r) => r.translations?.ko?.title ?? '',
    set: (r, v) => { r.translations.ko.title = v; r.slug = slugify(v); r.translations.ko.seoTitle = v },
  },
  {
    key: 'content', label: '내용', type: 'textarea',
    get: (r) => (r.translations?.ko?.content?.blocks || []).filter((b: any) => b.type === 'paragraph').map((b: any) => b.text).join('\n\n'),
    set: (r, v) => { r.translations.ko.content.blocks = String(v).split(/\n\s*\n/).map((t) => ({ type: 'paragraph', text: t.trim() })).filter((b) => b.text) },
  },
  {
    key: 'reporter', label: '출처', type: 'text',
    get: (r) => r.reporter?.name ?? '',
    set: (r, v) => { r.reporter.name = v; r.reporter.nameEng = v === '편집부' ? 'Editorial Team' : v },
  },
  {
    key: 'categories', label: '분류 (searchCategories)', type: 'text',
    get: (r) => (r.searchCategories || []).join(', '),
    set: (r, v) => { const a = splitList(v); r.searchCategories = a; r.translations.ko.categories = a },
  },
  {
    key: 'tags', label: '태그 (searchTags)', type: 'text',
    get: (r) => (r.searchTags || []).join(', '),
    set: (r, v) => { const a = splitList(v); r.searchTags = a; r.translations.ko.tags = a },
  },
  {
    key: 'publishedAt', label: '게시 (publishedAt)', type: 'text',
    get: (r) => r.publishedAt ?? '',
    set: (r, v) => { r.publishedAt = v },
  },
]

const openRow = (r: Record<string, any>) => { isNew.value = false; selected.value = r; open.value = true }
const openNew = () => { isNew.value = true; selected.value = blankArticle(); open.value = true }

const nowStamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const onSave = async (v: Record<string, any>) => {
  // 편집 대상은 깊은 복사본에 적용 (원본은 재조회로 갱신)
  const base = isNew.value ? blankArticle() : JSON.parse(JSON.stringify(selected.value))
  fields.forEach((f) => f.set(base, v[f.key]))
  saving.value = true
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
  } finally {
    saving.value = false
  }
}

const onDelete = async (r: Record<string, any>) => {
  if (!confirm('이 속보를 삭제하시겠습니까?')) return false
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    await load()
    return true
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
    return false
  }
}
// 드로어에서 삭제 → 삭제되면 드로어 닫기
const onDrawerDelete = async () => {
  if (selected.value && (await onDelete(selected.value))) open.value = false
}
</script>

<template>
  <div>
    <!-- 필터 바: 분류 + 제목 검색 + 속보 등록 -->
    <div class="filter-bar">
      <select v-model="category" class="filter-select" aria-label="분류" @change="load">
        <option value="">전체 분류</option>
        <option v-for="c in BN_CATEGORIES" :key="c.v" :value="c.v">{{ c.l }}</option>
      </select>
      <input v-model="q" class="filter-input" type="search" placeholder="제목 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <span class="filter-spacer" />
      <button class="btn btn-primary" type="button" @click="openNew">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        속보 등록
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">데이터를 불러오지 못했습니다: {{ errorMsg }}</p>

    <DataTable
      :columns="e.columns" :rows="rows" clickable hide-search
      @row-click="openRow" @delete-row="onDelete"
    />

    <DetailDrawer
      :open="open" :title="isNew ? '속보 등록' : '속보 상세 · 편집'"
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
