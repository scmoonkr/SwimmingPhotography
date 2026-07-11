<script setup lang="ts">
// 기사 상세 — docs/html/article.html 이식(목업).
// 원문 HTML(본문) + 원문 CSS를 그대로 사용하고, data-en 기반 i18n(applyI18n)으로 한/영 전환.
// (폰트 크기 조절·라이트박스 등 상호작용 스크립트는 목업에서 생략)
import { computed, onMounted, ref, watch } from 'vue'
import bodyHtml from '~/content/article-body.html?raw'
import '~/assets/css/article.css'

const { isEN } = useLang()
const root = ref<HTMLElement | null>(null)

const apply = () => { if (root.value) applyI18n(root.value, isEN.value) }
onMounted(apply)
watch(isEN, apply)

useHead({
  title: computed(() =>
    isEN.value
      ? 'HONG, Gildong Sets Korean Record in 100m Freestyle — Swimming Photography'
      : '홍길동, 자유형 100m 한국신기록 수립 — Swimming Photography',
  ),
  meta: [
    {
      name: 'description',
      content: '잠실 실내수영장서 1분 33초 33… 종전 기록 0.33초 단축. Swimming Photography by Medalbank 경기 기사.',
    },
  ],
})
</script>

<template>
  <div ref="root" class="article-page" v-html="bodyHtml" />
</template>
