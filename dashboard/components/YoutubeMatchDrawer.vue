<script setup lang="ts">
// 유튜브 대회 매칭 드로어 — 일자로 youtube 컬렉션을 읽어 표로 보여주고,
// 체크한 영상들에 '대회 매칭' 으로 competitionID 를 붙인다. (이미지 가져오기와 같은 얼개)
import { computed, ref, watch } from 'vue'
import type { Column } from '~/composables/useMock'

const props = defineProps<{
  open: boolean
  competitions: any[]
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', r: any): void }>()

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/youtube${p}`

// 코드 → 한글 라벨
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const discLabel = (d: string) => DISC_KO[d] || d || ''
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v || ''
const roundLabel = (r: string) => ({
  preliminaries: '예선', prelim: '예선', heats: '예선', semifinals: '준결승', semifinal: '준결승', finals: '결선', final: '결선',
} as Record<string, string>)[String(r || '').toLowerCase()] || r || ''

// ── 일자 필터 ──
const dateFrom = ref('')
const dateTo = ref('')
const matched = ref<'' | 'none' | 'has'>('none')   // 기본은 아직 매칭 안 된 것만
const q = ref('')

const rows = ref<any[]>([])
const loading = ref(false)
const loaded = ref(false)
const errorMsg = ref('')
const checked = ref<Record<string, any>[]>([])
const msg = ref('')   // 매칭 결과·오류 메시지 (푸터·모달 공용)

const load = async () => {
  loading.value = true; errorMsg.value = ''
  try {
    const params: Record<string, any> = {}
    if (dateFrom.value) params.dateFrom = dateFrom.value
    if (dateTo.value) params.dateTo = dateTo.value
    if (matched.value) params.matched = matched.value
    if (q.value.trim()) params.q = q.value.trim()
    rows.value = await $fetch<any[]>(api(), { params })
    checked.value = []
    loaded.value = true
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '불러오기 실패'
  } finally {
    loading.value = false
  }
}

// 드로어를 열 때 초기화
watch(() => props.open, (v) => {
  if (v) { rows.value = []; checked.value = []; loaded.value = false; errorMsg.value = ''; msg.value = '' }
})

// ── 표 ──
const columns: Column[] = [
  { key: 'datetime', label: '일자', cls: 'mono' },
  { key: 'name', label: '선수명', cls: 'strong' },
  { key: 'event', label: '종목', cls: 'muted', get: (r) => [genderLabel(r.gender), discLabel(r.discipline), r.distance].filter(Boolean).join(' ') },
  { key: 'round', label: '라운드', cls: 'muted', get: (r) => roundLabel(r.round) },
  { key: 'time', label: '기록', cls: 'mono' },
  { key: 'title', label: '제목' },
  { key: 'comp', label: '대회', get: (r) => (r.competitionID ? (r.competitionName || r.competitionID) : '—') },
]
// 행 클릭 → 유튜브 영상 새 탭
const openVideo = (r: any) => { if (r?.url) window.open(r.url, '_blank', 'noopener') }

// ── 대회 매칭 모달 ──
const modalOpen = ref(false)
const pickCid = ref<number | ''>('')
const saving = ref(false)
const openMatch = () => {
  if (!checked.value.length) return
  pickCid.value = ''
  msg.value = ''
  modalOpen.value = true
}
const closeModal = () => { if (!saving.value) modalOpen.value = false }

const applyMatch = async () => {
  if (saving.value) return
  const ids = checked.value.map((r) => r._id).filter(Boolean)
  if (!ids.length) { msg.value = '선택된 영상이 없습니다.'; return }
  if (pickCid.value === '' || pickCid.value == null) { msg.value = '대회를 선택하세요.'; return }
  saving.value = true; msg.value = ''
  try {
    const res = await $fetch<any>(api('/match'), { method: 'POST', body: { ids, competitionID: pickCid.value } })
    modalOpen.value = false
    emit('done', { matched: res.matched ?? ids.length, competitionName: res.competitionName || '' })
    await load()   // 매칭된 행의 '대회' 열이 바뀐다 (미매칭 필터면 목록에서 빠진다)
  } catch (err: any) {
    msg.value = '매칭 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="drawer-root" :class="{ open }" @keydown.esc="emit('close')">
    <div class="drawer-ov" @click="emit('close')" />
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="유튜브 대회 매칭">
      <header class="drawer-head">
        <h2>유튜브 대회 매칭</h2>
        <button class="drawer-x" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div class="drawer-body">
        <!-- 일자 필터 -->
        <div class="filter-bar">
          <label class="fld">
            <span class="info-l">일자(부터)</span>
            <input v-model="dateFrom" class="fld-input" type="date" @keydown.enter="load">
          </label>
          <label class="fld">
            <span class="info-l">일자(까지)</span>
            <input v-model="dateTo" class="fld-input" type="date" @keydown.enter="load">
          </label>
          <label class="fld">
            <span class="info-l">매칭</span>
            <select v-model="matched" class="fld-input">
              <option value="none">미매칭</option>
              <option value="has">매칭됨</option>
              <option value="">전체</option>
            </select>
          </label>
          <label class="fld fld-grow">
            <span class="info-l">선수명·제목</span>
            <input v-model="q" class="fld-input" type="search" placeholder="검색어…" @keydown.enter="load">
          </label>
          <button class="btn btn-primary" type="button" :disabled="loading" @click="load">
            {{ loading ? '불러오는 중…' : '불러오기' }}
          </button>
        </div>

        <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>

        <div v-if="loaded" class="res-sec">
          <p class="res-sum">
            {{ rows.length }}건
            <span v-if="checked.length" class="sel"> · 선택 {{ checked.length }}</span>
          </p>
          <DataTable
            :columns="columns" :rows="rows" clickable hide-search hide-actions
            selectable :selected="checked" @update:selected="checked = $event"
            @row-click="openVideo"
          />
          <p class="res-hint">체크한 뒤 아래 <b>대회 매칭</b> 을 누르면 대회를 골라 한번에 붙입니다. (행을 클릭하면 유튜브 영상이 열립니다.)</p>
        </div>
        <p v-else-if="!loading" class="res-hint">일자 범위를 고르고 <b>불러오기</b> 를 누르세요.</p>
      </div>

      <footer class="drawer-foot">
        <span class="foot-msg">{{ msg }}</span>
        <button class="btn btn-ghost" type="button" @click="emit('close')">닫기</button>
        <button class="btn btn-primary" type="button" :disabled="!checked.length" @click="openMatch">
          {{ checked.length ? `대회 매칭 (${checked.length})` : '대회 매칭' }}
        </button>
      </footer>
    </aside>

    <!-- 대회 선택 모달 -->
    <div v-if="modalOpen" class="pd" @keydown.esc="closeModal">
      <div class="pd-ov" @click="closeModal" />
      <div class="pd-box" role="dialog" aria-modal="true" aria-label="대회 선택">
        <div class="pd-head">
          <h2>대회 매칭</h2>
          <button class="pd-x" type="button" aria-label="닫기" @click="closeModal">×</button>
        </div>
        <div class="pd-body">
          <p class="pd-note">선택한 <b>{{ checked.length }}개</b> 영상에 아래 대회를 매칭합니다(competitionID 저장).</p>
          <select v-model="pickCid" class="pd-input">
            <option value="">대회 선택…</option>
            <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
              {{ c.competitionName || c.competitionID }}<span v-if="c.datetime"> ({{ c.datetime }})</span>
            </option>
          </select>
          <p v-if="msg" class="pd-msg">{{ msg }}</p>
        </div>
        <div class="pd-foot">
          <button class="btn btn-ghost" type="button" :disabled="saving" @click="closeModal">취소</button>
          <button class="btn btn-primary" type="button" :disabled="!pickCid || saving" @click="applyMatch">
            {{ saving ? '저장 중…' : '매칭 저장' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(1400px, 98vw); background: var(--paper);
  border-left: 1px solid var(--line); box-shadow: -18px 0 50px rgba(26, 26, 26, .12);
  display: flex; flex-direction: column; transform: translateX(100%); transition: transform .26s cubic-bezier(.4, 0, .2, 1);
}
.drawer-root.open { pointer-events: auto; }
.drawer-root.open .drawer-ov { opacity: 1; }
.drawer-root.open .drawer { transform: translateX(0); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.drawer-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); }
.drawer-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }

.filter-bar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.info-l { font-size: 11.5px; color: var(--ink-light); }
.fld { display: flex; flex-direction: column; gap: 4px; }
.fld-grow { flex: 1 1 220px; }
.fld-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 11px; width: 100%;
}
.fld-input:focus { outline: none; border-color: var(--orange); }
.load-error { margin: 0; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }

.res-sec { display: flex; flex-direction: column; gap: 8px; }
.res-sum { margin: 0; font-size: 13px; color: var(--ink); }
.res-sum .sel { color: var(--orange); font-weight: 600; }
.res-hint { margin: 0; font-size: 12px; color: var(--ink-mute); line-height: 1.6; }

.drawer-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-top: 1px solid var(--line); background: var(--paper);
}
.foot-msg { flex: 1; font-size: 12px; color: var(--bad); }
.btn:disabled { opacity: .5; cursor: default; }

/* 대회 선택 모달 */
.pd { position: fixed; inset: 0; z-index: 1200; }
.pd-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .38); }
.pd-box {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(460px, 94vw); background: var(--paper);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 24px 60px rgba(26, 26, 26, .22);
}
.pd-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--line); }
.pd-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); }
.pd-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.pd-body { padding: 18px 20px; }
.pd-note { margin: 0 0 12px; font-size: 13px; color: var(--ink); line-height: 1.6; }
.pd-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink); background: var(--paper);
  border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px; width: 100%;
}
.pd-input:focus { outline: none; border-color: var(--orange); }
.pd-msg { margin: 10px 0 0; font-size: 12.5px; color: var(--bad); }
.pd-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 0 20px 18px; }
</style>
