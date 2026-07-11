<script setup lang="ts">
// 기사 작성 규약 — docs/html/agreement.html 이식(대형 문서).
// 원문 HTML을 그대로 사용하고, data-en 속성 기반 i18n(applyI18n)으로 한/영 전환.
import { computed, onMounted, ref, watch } from 'vue'
// Vite raw import — content/agreement-body.html 를 문자열로 가져온다.
import bodyHtml from '~/content/agreement-body.html?raw'

const { t, isEN } = useLang()
const root = ref<HTMLElement | null>(null)

const apply = () => { if (root.value) applyI18n(root.value, isEN.value) }
onMounted(apply)
watch(isEN, apply)

useHead({
  title: computed(() => t('기사 작성 규약 — Swimming Photography', 'Article Writing Guidelines — Swimming Photography')),
  meta: [
    {
      name: 'description',
      content: 'Swimming Photography by Medalbank 기사 작성 규약. 모든 기사가 준수하는 신문체와 편집 기준을 정합니다.',
    },
  ],
})
</script>

<template>
  <div ref="root" v-html="bodyHtml" />
</template>

<style>
/* 머리말: 타이틀 아래 보더 제거 + 박스를 보더 높이로 끌어올림 (원문 인라인 스타일 이식) */
#preface h2 { border-bottom: none; margin-bottom: 0; }
</style>
