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
  { to: '/', label: '개요', en: 'Overview', key: '', need: ['data'], icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
  { to: '/breaking-news', label: 'Breaking News', en: 'Breaking', key: 'breakingNews', need: ['breaking'], icon: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>' },
  { to: '/articles', label: 'Articles', en: 'Articles', key: 'article', need: ['articles'], icon: '<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-3-2-1 1V3Z"/><path d="M8 7h8M8 11h8M8 15h5"/>' },
  { to: '/competitions', label: 'Competitions', en: 'Competitions', key: 'competitions', need: ['data'], icon: '<path d="M6 9a6 6 0 0 0 12 0V4H6Z"/><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/><path d="M12 15v4M8 21h8"/>' },
  { to: '/athletes', label: 'Athletes', en: 'Athletes', key: 'athletes', need: ['data'], icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
  { to: '/times', label: 'Times', en: 'Times', key: 'times', need: ['data'], icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { to: '/images', label: 'Images', en: 'Images', key: 'images', need: ['data'], icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>' },
  { to: '/venues', label: 'Pools', en: 'Venues', key: 'venues', need: ['data'], icon: '<path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/>' },
  { to: '/teams', label: 'Teams', en: 'Teams', key: 'teams', need: ['data'], icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-3-5.5"/>' },
  { to: '/start-list', label: 'Start List', en: 'Start List', key: 'startList', need: ['data'], icon: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>' },
]

// 그 계정이 쓸 수 있는 메뉴만 사이드바에 남긴다 (서버에서도 같은 능력으로 쓰기를 막는다)
const { user, logout, can } = useAuth()
const menu = computed(() => nav.filter((n) => !n.need || can(...n.need)))

const route = useRoute()
const current = computed(() => nav.find((n) => n.to === route.path) ?? menu.value[0] ?? nav[0])

// 상단 오른쪽 계정 메뉴 — 마우스를 올리면 열린다.
// 메뉴로 커서를 옮기는 사이에 닫히지 않도록 나갈 때만 약간 늦춘다.
const menuOpen = ref(false)
const accOpen = ref(false)
let closeTimer: any = null
const openMenu = () => { clearTimeout(closeTimer); menuOpen.value = true }
const closeMenu = () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => { menuOpen.value = false }, 160) }
const initial = computed(() => (user.value?.name || user.value?.username || '?').trim().charAt(0))
const onAccount = () => { menuOpen.value = false; accOpen.value = true }
const onLogout = async () => { menuOpen.value = false; await logout() }
onBeforeUnmount(() => clearTimeout(closeTimer))
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
        <NuxtLink v-for="n in menu" :key="n.to" :to="n.to" class="nav-item">
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
        <div class="tb-acc" @mouseenter="openMenu" @mouseleave="closeMenu">
          <button class="tb-user" type="button" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
            <span class="tb-avatar">{{ initial }}</span>
            {{ user?.name || '관리자' }}
            <span class="tb-caret" aria-hidden="true">▾</span>
          </button>
          <div v-show="menuOpen" class="tb-menu" role="menu">
            <button class="tb-mi" type="button" role="menuitem" @click="onAccount">정보변경</button>
            <button class="tb-mi" type="button" role="menuitem" @click="onLogout">로그아웃</button>
          </div>
        </div>
      </header>
      <div class="content">
        <slot />
      </div>
      <AccountModal :open="accOpen" @close="accOpen = false" />
    </div>
  </div>
</template>

<style>
/* 상단 오른쪽 계정 메뉴 */
.tb-acc { position: relative; }
.topbar .tb-user {
  border: none; background: none; cursor: pointer; font-family: var(--sans);
  padding: 6px 4px;
}
.topbar .tb-user:hover { color: var(--ink); }
.tb-caret { font-size: 10px; color: var(--ink-light); }
.tb-menu {
  position: absolute; right: 0; top: calc(100% + 4px); min-width: 148px; z-index: 40;
  background: var(--paper); border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 10px 28px rgba(26, 26, 26, .14); padding: 5px; display: flex; flex-direction: column;
}
.tb-mi {
  border: none; background: none; cursor: pointer; text-align: left;
  font-family: var(--sans); font-size: 12.5px; color: var(--ink-mute);
  padding: 8px 10px; border-radius: 5px;
}
.tb-mi:hover { background: var(--paper-deep); color: var(--ink); }
</style>
