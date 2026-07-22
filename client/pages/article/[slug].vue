<script setup lang="ts">
// 기사 상세(동적) — /article/<slug> : articles 컬렉션에서 slug 로 문서를 가져와 렌더.
// 문서 JSON → HTML(buildArticleLayout) → v-html, 상호작용은 wireArticleInteractions 로 공유.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '~/assets/css/article.css'
import { buildArticleLayout, type RelatedItem } from '~/utils/articleHtml'
import { catKo, articleDate } from '~/utils/articleList'
import { wireArticleInteractions, type ArticleWiring } from '~/utils/articleInteractions'

const { isEN } = useLang()
const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))

// slug 로 문서 조회 (+ 같은 대회 최근 기사)
const { data, error } = await useAsyncData(
  () => 'article:' + slug.value,
  async () => {
    const list = await $fetch<any[]>('/api/articles', { params: { slug: slug.value, limit: 1 } })
    const doc = (list && list[0]) || null
    if (!doc) return { doc: null, related: [] as RelatedItem[] }
    // 같은 대회(없으면 최근) 기사 목록 — 현재 글 제외
    let related: RelatedItem[] = []
    try {
      const others = await $fetch<any[]>('/api/articles', { params: { type: 'article', status: 'published', limit: 12 } })
      related = (others || [])
        .filter((d) => d.slug && d.slug !== slug.value)
        .slice(0, 5)
        .map((d) => ({
          slug: d.slug,
          category: catKo(d.translations?.ko?.categories),
          categoryEn: (d.translations?.en?.categories || [])[0] || '',
          title: d.translations?.ko?.title || '',
          titleEn: d.translations?.en?.title || '',
          region: '',
          date: articleDate(d),
          thumb: d?.media?.thumb || d?.media?.coverImage || (d?.media?.images && d.media.images[0]?.url) || '',
        }))
    } catch {}
    return { doc, related }
  },
  { watch: [slug] },
)

const doc = computed<any>(() => data.value?.doc || null)
const html = computed(() => {
  if (!doc.value) return ''
  return buildArticleLayout(doc.value, {
    related: data.value?.related || [],
    relatedHeading: '최근 기사',
    moreHref: '/search',
    cloudPublicUrl: useRuntimeConfig().public.cloudPublicUrl,
  })
})

useHead(() => {
  const ko = doc.value?.translations?.ko
  return {
    title: ko?.seoTitle || ko?.title
      ? `${ko?.seoTitle || ko?.title} — Swimming Photography`
      : 'Swimming Photography',
    meta: [{ name: 'description', content: ko?.seoDescription || ko?.excerpt || '' }],
  }
})

// ── 렌더 후 상호작용 wiring ──
const root = ref<HTMLElement | null>(null)
let wiring: ArticleWiring | null = null

const teardown = () => { wiring?.cleanup(); wiring = null }
const wire = async () => {
  await nextTick()
  if (!root.value || !html.value) return
  teardown()
  applyI18n(root.value, isEN.value)
  wiring = wireArticleInteractions(root.value, { en: () => isEN.value })
}

// 마운트 후 1회 wiring(초기 로드·하이드레이션) + slug/데이터 변경 시 재구성.
// (watch 의 immediate 는 마운트 전에 돌아 root 가 아직 없고, 하이드레이션 시 html 이
//  변하지 않아 재실행되지 않으므로 onMounted 로 초기 wiring 을 보장한다.)
onMounted(wire)
watch(html, wire)
// 언어 전환 시 정적 라벨(i18n) + JS 채운 요소 갱신
watch(isEN, () => {
  if (root.value) applyI18n(root.value, isEN.value)
  wiring?.refreshLang()
})
onBeforeUnmount(teardown)
</script>

<template>
  <div v-if="doc" ref="root" class="article-page" v-html="html" />
  <div v-else class="article-missing">
    <p>{{ isEN ? 'Article not found.' : '기사를 찾을 수 없습니다.' }}</p>
    <NuxtLink to="/">{{ isEN ? 'Back to home' : '홈으로' }}</NuxtLink>
  </div>
</template>

<style scoped>
.article-missing { max-width: 640px; margin: 80px auto; text-align: center; font-family: var(--serif); color: var(--ink-mute); }
.article-missing a { color: var(--orange); }
</style>
