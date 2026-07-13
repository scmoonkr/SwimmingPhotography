<script setup lang="ts">
import { useMock } from '~/composables/useMock'

const data = useMock()

// 사이드바 건수 — 실제 DB 카운트(/api/counts). 실패 시 mock rows 로 폴백.
const dbCounts = ref<Record<string, number>>({})
onMounted(async () => {
  try { dbCounts.value = await $fetch<Record<string, number>>(`${useRuntimeConfig().public.apiBase}/api/counts`) } catch {}
})
const count = (key: string) => dbCounts.value[key] ?? (data[key]?.rows.length ?? 0)

// 네비게이션 — 라벨 · 경로 · 건수 · 아이콘(SVG path)
const nav = [
  { to: '/', label: '개요', en: 'Overview', key: '', icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
  { to: '/breaking-news', label: '속보', en: 'Breaking', key: 'breakingNews', icon: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>' },
  { to: '/articles', label: '기사', en: 'Articles', key: 'article', icon: '<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-3-2-1 1V3Z"/><path d="M8 7h8M8 11h8M8 15h5"/>' },
  { to: '/competitions', label: '대회', en: 'Competitions', key: 'competitions', icon: '<path d="M6 9a6 6 0 0 0 12 0V4H6Z"/><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/><path d="M12 15v4M8 21h8"/>' },
  { to: '/athletes', label: '선수', en: 'Athletes', key: 'athletes', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
  { to: '/teams', label: '팀', en: 'Teams', key: 'teams', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-3-5.5"/>' },
  { to: '/venues', label: '경기장', en: 'Venues', key: 'venues', icon: '<path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/>' },
  { to: '/times', label: '기록', en: 'Times', key: 'times', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { to: '/images', label: '사진', en: 'Images', key: 'images', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>' },
  { to: '/start-list', label: '출발명단', en: 'Start List', key: 'startList', icon: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>' },
]

const route = useRoute()
const current = computed(() => nav.find((n) => n.to === route.path) ?? nav[0])
</script>

<template>
  <div class="dash">
    <aside class="sidebar">
      <div class="sb-brand">
        <div class="bk">수영사진<span>.</span></div>
        <div class="bs">Dashboard</div>
      </div>
      <nav class="nav">
        <div class="nav-sec">관리</div>
        <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-item">
          <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" v-html="n.icon" /></span>
          <span class="lbl">{{ n.label }}</span>
          <span v-if="n.key" class="nav-count">{{ count(n.key) }}</span>
        </NuxtLink>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar">
        <span class="tb-title">{{ current.label }}</span>
        <span class="tb-spacer" />
        <span class="tb-user">
          <span class="tb-avatar">문</span>
          관리자
        </span>
      </header>
      <div class="content">
        <slot />
      </div>
    </div>
  </div>
</template>
