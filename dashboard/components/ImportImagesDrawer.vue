<script setup lang="ts">
// 이미지 가져오기 드로어 — 엑셀(rows) 표시 + 디렉터리 선택 → 파일명 {timeID}_{type}.jpg 매칭 →
// 원본+썸네일(canvas) R2 업로드 → images 컬렉션 upsert. 업로드는 competitions 드로어 방식 참조.
import { ref } from 'vue'

const props = defineProps<{
  open: boolean
  rows: any[]                              // 엑셀 파싱 행 (timeID, name, gender, discipline, distance, time, rank)
  competition: { id: number | '' | null; name: string }
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', r: any): void }>()

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/times${p}`

// 파일명 접미 → type
const TYPE_MAP: Record<string, string> = {
  enter: 'ENTER', block: 'BLOCK', start: 'START', race: 'RACE', touchpad: 'TOUCHPAD',
  ceremony: 'CEREMONY', exit: 'EXIT', walk: 'WALK', team: 'TEAM',
}
const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif)$/i
// 엑셀 각 행의 이미지 파일명 (image1~image5)
const expectedFor = (r: any) => [r.image1, r.image2, r.image3, r.image4, r.image5]
  .map((v) => String(v ?? '').trim()).filter(Boolean)
// type: 파일명 접미(_enter 등) → ENTER…
const typeOf = (filename: string) => {
  const base = filename.replace(/\.[^.]+$/, '')
  const us = base.lastIndexOf('_')
  return us < 0 ? '' : (TYPE_MAP[base.slice(us + 1).toLowerCase()] || '')
}

// 디렉터리 선택 → 엑셀 image1~5 파일명'만' 폴더에서 읽어옴 (폴더 전체를 읽지 않음)
const dirName = ref('')
const matched = ref<{ file: File; filename: string; timeID: string; type: string }[]>([])
const dirInput = ref<HTMLInputElement | null>(null)
const missing = ref(0)      // 엑셀에 있으나 폴더에 없는 파일 수

// File System Access API: 필요한 파일명만 getFileHandle 로 개별 읽기
const pickViaFSA = async () => {
  const handle = await (window as any).showDirectoryPicker()
  dirName.value = handle.name || ''
  const out: typeof matched.value = []
  let miss = 0
  for (const r of props.rows) {
    for (const fn of expectedFor(r)) {
      try {
        const fh = await handle.getFileHandle(fn)   // 그 파일만 접근
        out.push({ file: await fh.getFile(), filename: fn, timeID: String(r.timeID ?? ''), type: typeOf(fn) })
      } catch { miss++ }                             // 폴더에 없음
    }
  }
  matched.value = out
  missing.value = miss
}

const selectDir = async () => {
  if ((window as any).showDirectoryPicker) {
    try { await pickViaFSA() } catch { /* 사용자 취소 */ }
  } else {
    dirInput.value?.click()   // 미지원 브라우저 폴백 (webkitdirectory)
  }
}

// 폴백: webkitdirectory (전체 파일 읽지만 image1~5 만 매칭)
const onDir = (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  if (dirInput.value) dirInput.value.value = ''
  if (!files.length) return
  dirName.value = (files[0] as any).webkitRelativePath?.split('/')[0] || ''
  const dirMap = new Map<string, File>()
  for (const f of files) if (IMAGE_RE.test(f.name)) dirMap.set(f.name, f)
  const out: typeof matched.value = []
  let miss = 0
  for (const r of props.rows) {
    for (const fn of expectedFor(r)) {
      const file = dirMap.get(fn)
      if (!file) { miss++; continue }
      out.push({ file, filename: fn, timeID: String(r.timeID ?? ''), type: typeOf(fn) })
    }
  }
  matched.value = out
  missing.value = miss
}

// row 별 엑셀 기재 이미지 파일명 (image1~5)
const filesForRow = (r: any) => expectedFor(r).join(' | ')

// 브라우저 canvas 썸네일 (최대 320px, jpeg 0.8)
const makeThumb = (file: File): Promise<Blob | null> => new Promise((resolve) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const max = 320
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
    canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b) }, 'image/jpeg', 0.8)
  }
  img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
  img.src = url
})

const uploading = ref(false)
const progress = ref(0)
const msg = ref('')

const doImport = async () => {
  if (!matched.value.length || uploading.value) return
  uploading.value = true; progress.value = 0; msg.value = ''
  try {
    const fd = new FormData()
    fd.append('competitionID', String(props.competition?.id ?? ''))
    fd.append('competitionName', props.competition?.name ?? '')
    const meta: any[] = []
    for (const m of matched.value) {
      const thumb = await makeThumb(m.file)
      fd.append('files', m.file, m.filename)
      fd.append('thumbs', thumb || m.file, m.filename)
      meta.push({ filename: m.filename, timeID: m.timeID, type: m.type })
      progress.value++
    }
    fd.append('meta', JSON.stringify(meta))
    const r = await $fetch<any>(api('/images-import'), { method: 'POST', body: fd })
    emit('done', r)
  } catch (err: any) {
    msg.value = '가져오기 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="drawer-root" :class="{ open }">
    <div class="drawer-ov" @click="emit('close')" />
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="이미지 가져오기">
      <header class="drawer-head">
        <h2>이미지 가져오기<span v-if="competition?.name" class="comp"> · {{ competition.name }}</span></h2>
        <button class="drawer-x" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div class="drawer-body">
        <!-- 디렉터리 선택 -->
        <div class="dir-bar">
          <input ref="dirInput" type="file" webkitdirectory multiple hidden @change="onDir">
          <button class="btn btn-ghost" type="button" :disabled="uploading" @click="selectDir">upload image (폴더 선택)</button>
          <span v-if="dirName" class="dir-info">📁 {{ dirName }} · 매칭 {{ matched.length }}장<span v-if="missing"> · 폴더에 없음 {{ missing }}</span></span>
        </div>

        <!-- 엑셀 행 + 매칭 이미지 -->
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>timeID</th><th>name</th><th>gender</th><th>discipline</th>
                <th>distance</th><th>time</th><th>rank</th><th>image</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in rows" :key="i">
                <td class="mono">{{ r.timeID }}</td>
                <td class="strong">{{ r.name }}</td>
                <td>{{ r.gender }}</td>
                <td>{{ r.discipline }}</td>
                <td>{{ r.distance }}</td>
                <td class="mono">{{ r.time }}</td>
                <td class="num">{{ r.rank }}</td>
                <td class="img">{{ filesForRow(r) || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <footer class="drawer-foot">
        <div class="foot-left">
          <button class="btn btn-ghost" type="button" :disabled="uploading" @click="emit('close')">취소</button>
          <button class="btn btn-primary" type="button" :disabled="!matched.length || uploading" @click="doImport">
            {{ uploading ? `업로드 중… ${progress}/${matched.length}` : `import (${matched.length}장)` }}
          </button>
          <span v-if="msg" class="err">{{ msg }}</span>
        </div>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(980px, 96vw); background: var(--paper);
  border-left: 1px solid var(--line); box-shadow: -18px 0 50px rgba(26, 26, 26, .12);
  display: flex; flex-direction: column; transform: translateX(100%); transition: transform .26s cubic-bezier(.4, 0, .2, 1);
}
.drawer-root.open { pointer-events: auto; }
.drawer-root.open .drawer-ov { opacity: 1; }
.drawer-root.open .drawer { transform: translateX(0); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.drawer-head h2 { font-size: 16px; font-weight: 700; color: var(--ink); }
.drawer-head .comp { font-weight: 500; color: var(--ink-mute); font-size: 13px; }
.drawer-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.drawer-body { flex: 1; overflow-y: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
.dir-bar { display: flex; align-items: center; gap: 12px; }
.dir-info { font-size: 13px; color: var(--ink-mute); }
.tbl-wrap { border: 1px solid var(--line); border-radius: 8px; overflow: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; padding: 9px 12px; background: var(--paper-deep); color: var(--ink-mute); font-weight: 700; position: sticky; top: 0; }
.tbl td { padding: 8px 12px; border-top: 1px solid var(--line); color: var(--ink); }
.tbl td.mono { font-family: var(--mono, monospace); }
.tbl td.strong { font-weight: 700; }
.tbl td.num { text-align: right; }
.tbl td.img { color: var(--orange); word-break: break-all; }
.drawer-foot { display: flex; align-items: center; padding: 14px 22px; border-top: 1px solid var(--line); }
.foot-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.err { font-size: 12px; color: var(--bad); }
</style>
