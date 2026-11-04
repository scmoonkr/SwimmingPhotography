<script setup lang="ts">
// 영상 재생 모달 — Videos 페이지의 행 클릭. 머리줄(칩) · 작성자/인스타/작성일 · 영상 · 삭제(확인 후).
import { computed, ref, watch } from 'vue'

const props = defineProps<{ row: any | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'deleted', row: any): void }>()

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/videos${p}`
const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }

const deleting = ref(false)
const msg = ref('')
watch(() => props.row, () => { msg.value = ''; deleting.value = false })

// 머리줄 — [성별] [영법] [거리] [코스] [팀(선수명, …)]
const parts = computed(() => {
  const r = props.row || {}
  const list = Array.isArray(r.athletes) ? r.athletes : []
  const names = [...new Set(list.map((a: any) => a.name).filter(Boolean))].join(', ') || String(r.name || '')
  const team = [...new Set(list.map((a: any) => a.team).filter(Boolean))].join(', ') || String(r.team || '')
  const isRelay = ['FRR', 'MR'].includes(r.discipline) || names.includes(',')
  const subject = isRelay && team ? `${team}(${names})` : (names || team)
  const distance = /^\d+$/.test(String(r.distance || '')) ? `${r.distance}M` : r.distance
  return [GENDER_KO[r.gender] || r.gender, DISC_KO[r.discipline] || r.discipline, distance, r.course, subject].filter(Boolean)
})
const fmtDate = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
const writer = computed(() => props.row?.uploaderName || props.row?.uploader || '—')
const instagram = computed(() => {
  const ig = String(props.row?.uploaderInstagram || '').trim()
  return ig ? (ig.startsWith('@') ? ig : `@${ig}`) : ''
})

const close = () => { if (!deleting.value) emit('close') }
useEscClose(() => !!props.row, close)

const onDelete = async () => {
  const r = props.row
  if (!r?._id || deleting.value) return
  if (!confirm(`'${r.filename || '이 영상'}' 영상을 삭제하시겠습니까?\n업로드된 영상 파일도 함께 삭제됩니다.`)) return
  deleting.value = true; msg.value = ''
  try {
    await $fetch(api(`/${r._id}`), { method: 'DELETE' })
    emit('deleted', r)
  } catch (err: any) {
    msg.value = '삭제 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="row" class="vm">
      <button class="vm-ov" type="button" aria-label="닫기" @click="close" />
      <div class="vm-box" role="dialog" aria-modal="true" aria-label="영상 재생">
        <header class="vm-head">
          <h2><span v-for="(p, i) in parts" :key="i" class="vm-chip">{{ p }}</span></h2>
          <button class="vm-x" type="button" aria-label="닫기" :disabled="deleting" @click="close">×</button>
        </header>
        <div class="vm-meta">
          <span>작성자 <b>{{ writer }}</b></span>
          <span v-if="instagram">인스타 <b>{{ instagram }}</b></span>
          <span>작성일 <b>{{ fmtDate(row.createdAt || row.updatedAt) || '—' }}</b></span>
        </div>
        <div class="vm-player">
          <video :key="row._id" :src="row.url" :poster="row.thumbnail || undefined" controls autoplay playsinline />
        </div>
        <footer class="vm-foot">
          <a class="vm-dl" :href="api(`/${row._id}/download`)" title="다운로드" aria-label="다운로드">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>
          </a>
          <span class="vm-msg">{{ msg }}</span>
          <button class="vm-del" type="button" :disabled="deleting" @click="onDelete">{{ deleting ? '삭제 중…' : '삭제' }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vm { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; }
.vm-ov { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(26, 26, 26, .5); cursor: default; }
.vm-box { position: relative; width: min(860px, calc(100vw - 24px)); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--paper); border: 1px solid var(--line); box-shadow: 0 18px 48px rgba(26, 26, 26, .28); }
.vm-head { display: flex; align-items: flex-start; gap: 16px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.vm-head h2 { flex: 1; min-width: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.vm-chip { padding: 4px 12px; border: 1px solid var(--line); background: var(--paper-deep, #f6f4f1); font-family: var(--serif, inherit); font-size: 15px; font-weight: 700; line-height: 1.5; }
.vm-x { padding: 0; border: 0; background: none; color: var(--ink-light, #999); font-size: 28px; line-height: 1; cursor: pointer; }
.vm-x:hover { color: var(--ink); }
.vm-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 12px 22px; color: var(--ink-mute); font-size: 13px; }
.vm-meta b { color: var(--ink); font-weight: 600; }
.vm-player { padding: 0 22px; }
.vm-player video { display: block; width: 100%; max-height: 62vh; aspect-ratio: 16 / 9; background: #000; }
.vm-foot { display: flex; align-items: center; justify-content: flex-start; gap: 14px; padding: 14px 22px 18px; }
.vm-dl { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 6px; color: var(--ink-mute); }
.vm-dl:hover { border-color: var(--orange); color: var(--orange); }
.vm-dl svg { width: 17px; height: 17px; }
.vm-msg { margin-right: auto; color: var(--bad); font-size: 12.5px; }
.vm-del { margin-left: auto; padding: 8px 20px; border: 1px solid var(--bad); border-radius: 6px; background: transparent; color: var(--bad); font: 600 13px var(--sans); cursor: pointer; }
.vm-del:hover:not(:disabled) { background: var(--bad); color: #fff; }
.vm-del:disabled { opacity: .5; cursor: default; }
</style>
