<script setup lang="ts">
// 읽을거리 — SwimmingPhotography DB(articles, type1=athlete·venue·notice·column). Express(/api/articles) 경유.
// 속보(breaking_news) 페이지와 동일 구조, type 만 다름.
import { computed, onMounted, ref } from 'vue'
import { useEntity, slugify, blankArticle, BN_CATEGORIES, ARTICLE_TYPES, STORY_TYPES, typeLabel } from '~/composables/useMock'
import type { Field } from '~/composables/useMock'

const TYPE = 'article'
// 읽을거리 — 인물·현장·안내·칼럼
const PAGE_TYPES = STORY_TYPES
const TYPE_OPTIONS_V = ARTICLE_TYPES.filter((t) => PAGE_TYPES.includes(t.v))   // 필터용 {v,l}
const TYPE_OPTIONS = TYPE_OPTIONS_V.map((t) => t.l)                             // 드로어 select 용 라벨
const type1 = ref('')                // 필터 — 기본은 이 페이지 유형 전체
const e = useEntity('article')
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/articles${p}`

// ── 필터 (기사 유형 + 상태 + 작성일자 + featured + 이미지 + 제목) ──
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
  // 읽을거리는 본문이 마크다운 한 덩어리다 — 영상은 그 앞(기사 위쪽)에 둔다.
  const md = blocks.findIndex((b: any) => b?.type === 'markdown')
  if (md >= 0) return md
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

// 읽을거리는 사람이 쓰는 기사라 본문을 마크다운 블록 하나로 둔다.
// 한글(ko)·영문(en) 을 같은 구조로 나란히 저장한다.
const ensureContent = (r: any, lang = 'ko') => {
  if (!r.translations) r.translations = {}
  if (!r.translations[lang]) r.translations[lang] = {}
  if (!r.translations[lang].content) r.translations[lang].content = {}
  return r.translations[lang].content
}

// content.{title|subtitle|lead|excerpt} — 한 곳에서 읽고 쓴다.
const getText = (r: any, lang: string, key: string) => r?.translations?.[lang]?.content?.[key] ?? ''
const setText = (r: any, lang: string, key: string, v: any) => { ensureContent(r, lang)[key] = String(v ?? '') }

// 본문 — content.blocks 안의 { type:'markdown', text } 한 덩어리.
// 유튜브(video) 블록과 같은 배열을 쓰므로 배열을 통째로 갈아끼우지 않고 그 블록만 손본다.
const getMarkdown = (r: any, lang: string) =>
  ((r?.translations?.[lang]?.content?.blocks) || []).find((b: any) => b?.type === 'markdown')?.text ?? ''
const setMarkdown = (r: any, lang: string, v: any) => {
  const c = ensureContent(r, lang)
  if (!Array.isArray(c.blocks)) c.blocks = []
  const text = String(v ?? '')
  const i = c.blocks.findIndex((b: any) => b?.type === 'markdown')
  if (!text.trim()) { if (i >= 0) c.blocks.splice(i, 1); return }
  if (i >= 0) c.blocks[i] = { ...c.blocks[i], type: 'markdown', text }
  else c.blocks.push({ type: 'markdown', text })
}

const fields: Field[] = [
  // 기사 유형 · slug
  {
    key: 'type1', label: '기사 유형', type: 'select', options: TYPE_OPTIONS, span: 2,
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
    // 저장하면 제목에서 다시 만들어지므로 보여주기만 한다
    key: 'slug', label: 'slug (URL)', type: 'meta', span: 2,
    get: (r) => r.slug || '',
    set: () => {},
  },
  // 제목
  // 제목 — 왼쪽 한글 / 오른쪽 영문. 목록·카드가 읽는 translations.{lang}.title 에도 함께 넣는다.
  {
    key: 'title', label: '제목 (한글)', type: 'text', span: 2,
    action: { icon: 'search', title: '제목으로 slug 를 만들고 중복을 확인합니다' },
    get: (r) => getText(r, 'ko', 'title') || r.translations?.ko?.title || '',
    set: (r, v) => {
      setText(r, 'ko', 'title', v)
      r.translations.ko.title = String(v ?? '')
      r.translations.ko.seoTitle = String(v ?? '')
      r.slug = slugify(String(v ?? ''))
    },
  },
  {
    key: 'titleEn', label: 'Title (English)', type: 'text', span: 2,
    get: (r) => getText(r, 'en', 'title') || r.translations?.en?.title || '',
    set: (r, v) => {
      setText(r, 'en', 'title', v)
      r.translations.en.title = String(v ?? '')
      r.translations.en.seoTitle = String(v ?? '')
    },
  },
  // 부제
  {
    key: 'subtitle', label: '부제 (한글)', type: 'text', span: 2,
    get: (r) => getText(r, 'ko', 'subtitle'),
    set: (r, v) => setText(r, 'ko', 'subtitle', v),
  },
  {
    key: 'subtitleEn', label: 'Subtitle (English)', type: 'text', span: 2,
    get: (r) => getText(r, 'en', 'subtitle'),
    set: (r, v) => setText(r, 'en', 'subtitle', v),
  },
  // 유튜브
  {
    key: 'youtube', label: '유튜브 URL', type: 'text', span: 2,
    get: (r) => findVideoBlock(r)?.url || '',
    set: (r, v) => setVideoBlock(r, String(v ?? '').trim()),
  },
  {
    key: 'youtubeCaption', label: '유튜브 캡션 (영상 아래 설명)', type: 'text', span: 2,
    get: (r) => findVideoBlock(r)?.caption || '',
    set: (r, v) => setVideoCaption(r, String(v ?? '').trim()),
  },
  // 상태 · 게시 · 분류
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
  // featured · 출처
  {
    key: 'featured', label: 'featured', type: 'checkbox', options: ['featured', '일반'], span: 2,
    get: (r) => !!r.visibility?.isFeatured,
    set: (r, v) => { if (!r.visibility) r.visibility = {}; r.visibility.isFeatured = !!v },
  },
  {
    key: 'reporter', label: '출처', type: 'text', span: 2,
    get: (r) => r.reporter?.name ?? '',
    set: (r, v) => { r.reporter.name = v; r.reporter.nameEng = v === '편집부' ? 'Editorial Team' : v },
  },
  // 태그
  {
    key: 'tags', label: '태그 (searchTags)', type: 'text',
    get: (r) => (r.searchTags || []).join(', '),
    set: (r, v) => { const a = splitList(v); r.searchTags = a; r.translations.ko.tags = a },
  },
  // 리드 — 기사 첫 문단
  {
    key: 'lead', label: '리드 (한글)', type: 'textarea', rows: 4, span: 2,
    get: (r) => getText(r, 'ko', 'lead'),
    set: (r, v) => setText(r, 'ko', 'lead', v),
  },
  {
    key: 'leadEn', label: 'Lead (English)', type: 'textarea', rows: 4, span: 2,
    get: (r) => getText(r, 'en', 'lead'),
    set: (r, v) => setText(r, 'en', 'lead', v),
  },
  // 요약
  {
    key: 'excerpt', label: '요약 (한글)', type: 'textarea', rows: 3, span: 2,
    get: (r) => getText(r, 'ko', 'excerpt'),
    set: (r, v) => setText(r, 'ko', 'excerpt', v),
  },
  {
    key: 'excerptEn', label: 'Excerpt (English)', type: 'textarea', rows: 3, span: 2,
    get: (r) => getText(r, 'en', 'excerpt'),
    set: (r, v) => setText(r, 'en', 'excerpt', v),
  },
  // 본문 — content.blocks 의 { type:'markdown', text }
  {
    key: 'body', label: '본문 · 마크다운 (한글)', type: 'textarea', rows: 18, span: 2,
    get: (r) => getMarkdown(r, 'ko'),
    set: (r, v) => setMarkdown(r, 'ko', v),
  },
  {
    key: 'bodyEn', label: 'Body · markdown (English)', type: 'textarea', rows: 18, span: 2,
    get: (r) => getMarkdown(r, 'en'),
    set: (r, v) => setMarkdown(r, 'en', v),
  },
]


// ── 이미지 업로드 (multipart → /api/articles/:id/images) — competitions 드로어와 같은 방식 ──
const fileInput = ref<HTMLInputElement | null>(null)
const queue = ref<{ file: File; preview: string }[]>([])
const uploading = ref(false)
const uploadMsg = ref('')
const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif)$/i
const savedImages = computed<any[]>(() => (selected.value?.media?.images || []))

const addFiles = (files: FileList | null) => {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!IMAGE_RE.test(f.name)) continue
    queue.value.push({ file: f, preview: URL.createObjectURL(f) })
  }
}
const onFileChange = (e: Event) => { addFiles((e.target as HTMLInputElement).files); if (fileInput.value) fileInput.value.value = '' }
const onDrop = (e: DragEvent) => addFiles(e.dataTransfer?.files ?? null)
const removeQueued = (i: number) => { URL.revokeObjectURL(queue.value[i].preview); queue.value.splice(i, 1) }
const resetUpload = () => { queue.value.forEach((q) => URL.revokeObjectURL(q.preview)); queue.value = []; uploadMsg.value = '' }

const doUpload = async () => {
  const id = selected.value?._id
  if (!id) { uploadMsg.value = '먼저 기사를 저장하세요.'; return }
  if (!queue.value.length || uploading.value) return
  uploading.value = true; uploadMsg.value = ''
  try {
    const fd = new FormData()
    for (const { file } of queue.value) fd.append('files', file)
    const r = await $fetch<any>(api(`/${id}/images`), { method: 'POST', body: fd })
    if (selected.value) selected.value.media = r.media || selected.value.media   // 드로어 즉시 반영
    resetUpload()
    uploadMsg.value = `${r.added}장 업로드 완료`
    await load()
  } catch (err: any) {
    uploadMsg.value = '업로드 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    uploading.value = false
  }
}

const removeSaved = async (url: string) => {
  const id = selected.value?._id
  if (!id || !confirm('이 이미지를 삭제하시겠습니까?')) return
  try {
    const r = await $fetch<any>(api(`/${id}/images`), { method: 'DELETE', body: { url } })
    if (selected.value) selected.value.media = r.media || selected.value.media
    await load()
  } catch (err: any) {
    alert('삭제 실패: ' + (err?.data?.error || err?.message || ''))
  }
}


// 클립보드 복사 — HTTPS/localhost 는 Clipboard API, HTTP(비보안) 는 execCommand 폴백.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true }
  } catch { /* 아래 폴백 */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

// ── slug 중복 확인 ────────────────────────────────────────
// 제목 칸의 돋보기 → 제목으로 slug 를 만들고 articles.slug 에 같은 값이 있는지 본다.
// 저장할 때도 제목에서 slug 를 다시 만들므로, 여기서 확인한 값이 그대로 저장된다.
const slugMsg = ref('')
const slugBusy = ref(false)
const onFieldAction = async (key: string, value: any) => {
  if (key !== 'title') return
  const title = String(value ?? '').trim()
  if (!title) { slugMsg.value = '제목을 먼저 입력하세요.'; return }
  const slug = slugify(title)
  slugBusy.value = true
  slugMsg.value = '확인 중…'
  try {
    const rows = await $fetch<any[]>(api(), { params: { slug, limit: 5 } })
    const mine = String(selected.value?._id || '')
    const dup = (rows || []).filter((r) => String(r._id) !== mine)
    if (dup.length) {
      slugMsg.value = `이미 있는 slug 입니다 — ${slug} (${dup[0]?.translations?.ko?.title || dup[0]?.slug})`
    } else {
      slugMsg.value = `사용 가능 — ${slug}`
      const f = fm()
      if (f) f.slug = slug           // slug 칸(표시전용)에 바로 보여준다
    }
  } catch (err: any) {
    slugMsg.value = '확인 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    slugBusy.value = false
  }
}

// ── copyJSON / parseJSON ──────────────────────────────────
// 드로어에서 편집 중인 값을 JSON 한 덩어리로 주고받는다.
// parseJSON 은 본문(마크다운) 칸에 붙여넣은 JSON 을 읽어 각 칸에 흩뿌린다.
const drawerRef = ref<any>(null)
const jsonMsg = ref('')
const fm = () => drawerRef.value?.form as Record<string, any> | undefined

// 폼은 select·checkbox 를 라벨·불리언으로 들고 있어, JSON 과 오갈 때 변환이 필요하다.
const toJson = () => {
  const f = fm() || {}
  const typeV = ARTICLE_TYPES.find((t) => t.l === f.type1)?.v || f.type1 || ''
  const list = (v: any) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return {
    type: typeV,
    title: f.title ?? '', titleEng: f.titleEn ?? '',
    subtitle: f.subtitle ?? '', subtitleEng: f.subtitleEn ?? '',
    youtube: { url: f.youtube ?? '', caption: f.youtubeCaption ?? '' },
    featured: !!f.featured,
    status: f.status ? 'published' : 'draft',
    categories: list(f.categories),
    tags: list(f.tags),
    lead: f.lead ?? '', leadEng: f.leadEn ?? '',
    excerpt: f.excerpt ?? '', excerptEng: f.excerptEn ?? '',
    markdown: f.body ?? '', markdownEng: f.bodyEn ?? '',
    images: (selected.value?.media?.images || []).map((im: any) => ({ url: im.url, caption: im.caption || '' })),
  }
}

const copyJson = async () => {
  const ok = await copyText(JSON.stringify(toJson(), null, 2))
  jsonMsg.value = ok ? 'JSON 복사됨' : '복사 실패 — 브라우저가 막았습니다'
}

const parseJson = () => {
  const f = fm()
  if (!f) return
  let j: any
  try { j = JSON.parse(String(f.body ?? '')) } catch { alert('본문 칸의 내용이 올바른 JSON 이 아닙니다.'); return }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { alert('JSON 객체가 아닙니다.'); return }

  const put = (k: string, v: any) => { if (v !== undefined && v !== null) f[k] = v }
  const join = (v: any) => (Array.isArray(v) ? v.join(', ') : v)

  if (j.type) {
    const hit = ARTICLE_TYPES.find((t) => t.v === j.type || t.l === j.type)
    if (hit && TYPE_OPTIONS.includes(hit.l)) f.type1 = hit.l
  }
  put('title', j.title); put('titleEn', j.titleEng ?? j.titleEn)
  put('subtitle', j.subtitle); put('subtitleEn', j.subtitleEng ?? j.subtitleEn)
  if (j.youtube) { put('youtube', j.youtube.url); put('youtubeCaption', j.youtube.caption) }
  if (j.featured !== undefined) f.featured = !!j.featured
  if (j.status !== undefined) f.status = j.status === 'published' || j.status === true
  put('categories', join(j.categories)); put('tags', join(j.tags))
  put('lead', j.lead); put('leadEn', j.leadEng ?? j.leadEn)
  put('excerpt', j.excerpt); put('excerptEn', j.excerptEng ?? j.excerptEn)
  // 본문 — JSON 이 들어 있던 칸을 마크다운 본문으로 덮는다
  f.body = j.markdown ?? ''
  put('bodyEn', j.markdownEng ?? j.markdownEn)

  // 이미지는 업로드로 관리하는 값이라 캡션만 맞춰 준다(없는 url 은 무시).
  let capped = 0
  if (Array.isArray(j.images) && selected.value?.media?.images) {
    for (const im of selected.value.media.images) {
      const hit = j.images.find((x: any) => x && x.url === im.url)
      if (hit && hit.caption !== undefined) { im.caption = hit.caption; capped++ }
    }
  }
  jsonMsg.value = `각 칸에 넣었습니다${capped ? ` · 이미지 캡션 ${capped}건` : ''} — 저장을 눌러야 반영됩니다`
}

// 목록 행은 표시용 필드만 담고 있다. 편집·저장은 전체 문서라야 하므로
// (부분 문서로 저장하면 빠진 필드가 통째로 날아간다) 열 때 그 기사 하나를 다시 받는다.
const rowLoading = ref(false)
const openRow = async (r: Record<string, any>) => {
  isNew.value = false
  resetUpload()
  jsonMsg.value = ''
  slugMsg.value = ''
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
const openNew = () => { isNew.value = true; selected.value = { ...blankArticle(TYPE), type1: type1.value || 'athlete' }; open.value = true }

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
    <!-- 필터 바: 기사 유형 + 제목 검색 + 기사 등록 -->
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

    <DetailDrawer
      ref="drawerRef"
      :open="open" :title="isNew ? '기사 등록' : '기사 상세 · 편집'"
      :fields="fields" :row="selected"
      @close="open = false" @save="onSave" @delete="onDrawerDelete" @action="onFieldAction"
    >
      <template #foot-actions>
        <button class="btn btn-ghost" type="button" @click="copyJson">copyJSON</button>
        <button class="btn btn-ghost" type="button" title="본문 칸의 JSON 을 각 칸에 넣습니다" @click="parseJson">parseJSON</button>
        <span v-if="slugMsg" class="json-msg" :class="{ bad: slugMsg.startsWith('이미') }">{{ slugMsg }}</span>
        <span v-if="jsonMsg" class="json-msg">{{ jsonMsg }}</span>
      </template>
      <template #body-bottom>
        <div class="up-sec">
          <div class="up-head">
            <span class="field-label">이미지</span>
            <span v-if="savedImages.length" class="up-count">{{ savedImages.length }}장</span>
          </div>

          <!-- 저장된 이미지 -->
          <div v-if="savedImages.length" class="up-grid">
            <div v-for="(im, i) in savedImages" :key="i" class="up-cell">
              <img :src="im.url" class="up-thumb" alt="">
              <button class="up-del" type="button" title="삭제" @click="removeSaved(im.url)">✕</button>
            </div>
          </div>

          <!-- 업로드 대기 큐 (미리보기) -->
          <div v-if="queue.length" class="up-grid">
            <div v-for="(q, i) in queue" :key="'q' + i" class="up-cell pending">
              <img :src="q.preview" class="up-thumb" alt="">
              <button class="up-del" type="button" title="빼기" @click="removeQueued(i)">✕</button>
            </div>
          </div>

          <!-- 업로드 컨트롤 -->
          <div class="up-area" @dragover.prevent @drop.prevent="onDrop">
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFileChange">
            <button class="btn btn-ghost" type="button" :disabled="isNew || uploading" @click="fileInput?.click()">파일 선택</button>
            <span class="up-hint">또는 드래그</span>
            <span class="toolbar-spacer" />
            <button
              v-if="queue.length" class="btn btn-primary" type="button"
              :disabled="isNew || uploading" @click="doUpload"
            >{{ uploading ? '업로드 중…' : `${queue.length}장 업로드` }}</button>
          </div>
          <p v-if="isNew" class="up-note">기사를 먼저 저장하면 이미지를 올릴 수 있습니다.</p>
          <p v-else-if="uploadMsg" class="up-note">{{ uploadMsg }}</p>
        </div>
      </template>
    </DetailDrawer>
  </div>
</template>

<style scoped>
.json-msg { font-size: 12px; color: var(--ink-mute); align-self: center; }
.json-msg.bad { color: var(--bad); }

/* 이미지 업로드 (competitions 드로어와 같은 규격) */
.up-sec { border-top: 1px solid var(--line-soft); margin-top: 18px; padding-top: 16px; }
.up-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.up-head .field-label { font-size: 11.5px; color: var(--ink-light); }
.up-count { font-size: 11.5px; color: var(--ink-light); }
.up-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.up-cell { position: relative; width: 96px; height: 72px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); background: var(--paper-deep); }
.up-cell.pending { border-style: dashed; }
.up-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.up-del {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; line-height: 1;
  border: none; border-radius: 50%; background: rgba(26,26,26,.6); color: #fff; font-size: 11px; cursor: pointer;
}
.up-del:hover { background: var(--bad); }
.up-area { display: flex; align-items: center; gap: 8px; }
.up-hint { font-size: 12px; color: var(--ink-light); }
.up-note { margin: 8px 0 0; font-size: 12px; color: var(--ink-mute); }

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
