<script setup lang="ts">
// 이미지 — SwimmingPhotography DB(images) 조회. 대회·영법·선수명 필터, 행 클릭 시 상세 드로어.
import { onMounted, ref, watch } from 'vue'
import type { Column } from '~/composables/useMock'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/images${p}`

// ── 필터 ──
const competitionID = ref<number | ''>('')
const discipline = ref('')
const name = ref('')

const competitions = ref<any[]>([])
const disciplines = ref<string[]>([])

// 영법 코드 → 한글
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const discLabel = (d: string) => DISC_KO[d] || d || ''
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v || ''

// ── 테이블 ──
const columns: Column[] = [
  { key: 'filename', label: '파일', cls: 'mono' },
  { key: 'name', label: '선수명', cls: 'strong' },
  { key: 'genderAge', label: '성별·부', cls: 'muted', get: (r) => [genderLabel(r.gender), r.ageGroup].filter(Boolean).join(' · ') },
  { key: 'team', label: '팀', cls: 'muted' },
  { key: 'discipline', label: '영법', get: (r) => discLabel(r.discipline) },
  { key: 'scene', label: '장면', cls: 'muted', get: (r) => r.sceneType || r.type || '' },
  { key: 'caption', label: '캡션', get: (r) => r.translations?.ko?.caption || '' },
]

const rows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')

const loadFilters = async () => {
  try { competitions.value = await $fetch<any[]>(api('/competitions')) } catch { competitions.value = [] }
  try { disciplines.value = await $fetch<string[]>(api('/disciplines')) } catch { disciplines.value = [] }
}
const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (competitionID.value) params.competitionID = competitionID.value
    if (discipline.value) params.discipline = discipline.value
    if (name.value.trim()) params.name = name.value.trim()
    rows.value = await $fetch<any[]>(api(), { params })
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
onMounted(async () => { await loadFilters(); await load() })
watch([competitionID, discipline], load)

// ── 상세 드로어 (읽기전용) ──
const selected = ref<any | null>(null)
const open = ref(false)
const openRow = (r: any) => { selected.value = r; open.value = true }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }

const infoRows = () => {
  const r = selected.value
  if (!r) return [] as [string, any][][]
  return [
    [['선수', r.name], ['성별·부', [genderLabel(r.gender), r.ageGroup].filter(Boolean).join(' · ')]],
    [['팀', r.team], ['영법·거리', [discLabel(r.discipline), r.distance, r.course].filter(Boolean).join(' ')]],
    [['장면', r.sceneType || r.type], ['role', r.role]],
    [['촬영자', r.photographer || '—'], ['이메일', r.email || '—']],
    [['대회', r.competition], ['timeID', r.timeID]],
  ]
}
</script>

<template>
  <div>
    <!-- 툴바: 필터 -->
    <div class="toolbar">
      <select v-model="competitionID" class="filter-select filter-comp" aria-label="대회">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName || c.competitionID }} ({{ c.count }})
        </option>
      </select>
      <select v-model="discipline" class="filter-select" aria-label="영법">
        <option value="">영법 전체</option>
        <option v-for="d in disciplines" :key="d" :value="d">{{ discLabel(d) }}</option>
      </select>
      <input v-model="name" class="filter-input" type="search" placeholder="선수명 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
    </div>

    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="!loading" class="result-note">총 {{ rows.length }}장</p>

    <DataTable :columns="columns" :rows="rows" clickable hide-search hide-actions @row-click="openRow" />

    <!-- 상세 드로어 -->
    <div class="drawer-root" :class="{ open }" @keydown="onKey">
      <div class="drawer-ov" @click="open = false" />
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="이미지 상세">
        <header class="drawer-head">
          <h2>{{ selected?.filename || '이미지' }}</h2>
          <button class="drawer-x" aria-label="닫기" @click="open = false">×</button>
        </header>
        <div class="drawer-body">
          <div v-if="selected" class="img-wrap">
            <img :src="selected.url" :alt="selected.filename">
          </div>
          <div v-for="(row, ri) in infoRows()" :key="ri" class="info-duo">
            <div v-for="([label, val], ci) in row" :key="ci" class="info-cell">
              <span class="info-l">{{ label }}</span>
              <span class="info-v">{{ (val ?? '') === '' ? '—' : val }}</span>
            </div>
          </div>
          <div v-if="selected?.translations?.ko?.title" class="cap-block">
            <span class="info-l">제목</span>
            <p class="cap-text">{{ selected.translations.ko.title }}</p>
          </div>
          <div v-if="selected?.translations?.ko?.caption" class="cap-block">
            <span class="info-l">캡션</span>
            <p class="cap-text">{{ selected.translations.ko.caption }}</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.filter-select, .filter-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-input { flex: 0 1 240px; }
.filter-comp { max-width: 320px; }
.filter-select:focus, .filter-input:focus { outline: none; border-color: var(--orange); }
.result-note { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 12px; }
.load-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }

/* 드로어 */
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(1120px, 96vw); background: var(--paper);
  border-left: 1px solid var(--line); box-shadow: -18px 0 50px rgba(26, 26, 26, .12);
  display: flex; flex-direction: column; transform: translateX(100%); transition: transform .26s cubic-bezier(.4, 0, .2, 1);
}
.drawer-root.open { pointer-events: auto; }
.drawer-root.open .drawer-ov { opacity: 1; }
.drawer-root.open .drawer { transform: translateX(0); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.drawer-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); word-break: break-all; }
.drawer-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.img-wrap { margin-bottom: 14px; background: var(--paper-deep); border-radius: 6px; overflow: hidden; }
.img-wrap img { display: block; width: 100%; height: auto; }
.info-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.info-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.info-l { font-size: 11.5px; color: var(--ink-light); }
.info-v { font-size: 13.5px; color: var(--ink); word-break: break-all; }
.cap-block { padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
.cap-text { margin: 4px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--ink); }
</style>
