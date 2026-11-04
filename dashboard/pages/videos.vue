<script setup lang="ts">
// 비디오 — SwimmingPhotography DB(videos) 조회. 최근 저장순 500개씩, 넘어가면 쪽 이동.
import { onMounted, ref } from 'vue'
import type { Column } from '~/composables/useMock'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/videos${p}`
const PAGE_SIZE = 500

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const discLabel = (d: string) => DISC_KO[d] || d || ''
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v || ''
// updatedAt → KST yyyy-mm-dd
const fmtDate = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
// 영상 하나에 선수가 여럿일 수 있다 — 값을 콤마로 잇는다(같은 값은 한 번만). athletes 가 없으면 단일 필드.
const multi = (r: any, k: 'name' | 'team' | 'ageGroup') => (Array.isArray(r.athletes) && r.athletes.length
  ? [...new Set(r.athletes.map((a: any) => a[k]).filter(Boolean))].join(', ')
  : (r[k] || ''))

const columns: Column[] = [
  { key: 'thumbnail', label: '', type: 'image' },
  { key: 'play', label: '', type: 'play', get: () => '▶' },
  { key: 'contributor', label: 'contributor', cls: 'muted', get: (r) => r.contributorName || r.contributor || r.uploaderName || r.uploader || '' },
  { key: 'competition', label: 'competition' },
  { key: 'gender', label: 'gender', get: (r) => genderLabel(r.gender) },
  { key: 'ageGroup', label: 'ageGroup', cls: 'muted', get: (r) => multi(r, 'ageGroup') },
  { key: 'discipline', label: 'discipline', get: (r) => discLabel(r.discipline) },
  { key: 'distance', label: 'distance' },
  { key: 'team', label: 'team', cls: 'muted', get: (r) => multi(r, 'team') },
  { key: 'athletes', label: 'athletes.name', cls: 'strong', get: (r) => multi(r, 'name') },
  { key: 'updatedAt', label: 'updatedAt', cls: 'mono', get: (r) => fmtDate(r.updatedAt) },
]

const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const errorMsg = ref('')

const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const data = await $fetch<any>(api('/dir'), { params: { limit: PAGE_SIZE, skip: (page.value - 1) * PAGE_SIZE } })
    rows.value = data?.rows || []
    total.value = data?.total ?? rows.value.length
  } catch (err: any) {
    rows.value = []
    total.value = 0
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
const goPage = (p: number) => { page.value = p; load() }

// 행(재생 버튼) 클릭 — 재생 모달
const selected = ref<any | null>(null)
const onDeleted = async () => { selected.value = null; await load() }
onMounted(load)
</script>

<template>
  <div>
    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="!loading" class="result-note">총 {{ total.toLocaleString() }}개</p>
    <DataTable
      :columns="columns" :rows="rows" clickable hide-search hide-actions @row-click="selected = $event"
      :page="page" :total="total" :page-size="PAGE_SIZE" @update:page="goPage"
    />

    <VideoPlayModal :row="selected" @close="selected = null" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.result-note { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 12px; }
.load-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
</style>
