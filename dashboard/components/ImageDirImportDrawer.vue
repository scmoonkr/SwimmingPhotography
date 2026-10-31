<script setup lang="ts">
// 폴더별 사진 가져오기 드로어 — 대회 선택 → 폴더 선택(드래그/폴더선택) → 폴더명 파싱 → 업로드.
// 폴더명 규칙: {discipline}_{gender}_{distance}   예) 자유형_남자_50M
//   사진은 자기가 들어 있는 폴더(바로 위 폴더)의 영법·성별·거리를 그대로 받는다.
//   파일명에서는 아무것도 읽지 않는다 — 선수명·timeID 는 이 가져오기가 다루지 않는다.
// 저장: 원본+썸네일을 R2 로 올리고 images 에
//   competitionID · competition · discipline · gender · distance · filename · thumbnail · url 을 update(upsert).
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  competitions: any[]
  competitionID: number | ''
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', r: any): void }>()
// ESC — 드로어 밖에 포커스가 있어도 닫힌다
useEscClose(() => props.open, () => emit('close'))

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif)$/i

// ── 폴더명 → 코드 변환 (ImageImportDrawer 의 파일명 규칙과 같은 어휘) ──
const GENDER_MAP: Record<string, string> = {
  남자: 'men', 남: 'men', 여자: 'women', 여: 'women', 혼성: 'mixed', 혼합: 'mixed',
  men: 'men', women: 'women', mixed: 'mixed',
}
const GENDER_LABEL: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const DISCIPLINE_LABEL: Record<string, string> = {
  FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영',
}
const DISCIPLINE_MAP: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DISCIPLINE_LABEL).map(([code, ko]) => [ko, code])), // 자유형 → FR
  ...Object.fromEntries(Object.keys(DISCIPLINE_LABEL).map((code) => [code, code])),        // FR → FR
}
const DIST_RE = /^\d+\s*[Mm]?$/
// "50" · "50m" → "50M"
const normDistance = (v: string) => {
  const m = String(v || '').match(/(\d+)\s*[Mm]?$/)
  return m ? `${m[1]}M` : ''
}
const asGender = (t: string) => GENDER_MAP[t] || GENDER_MAP[String(t).toLowerCase()] || ''
const asDiscipline = (t: string) => DISCIPLINE_MAP[t] || DISCIPLINE_MAP[String(t).toUpperCase()] || ''
// 세 값은 어휘가 겹치지 않으므로 순서가 달라도(남자_자유형_50M) 값의 형태로 가린다.
const parseDir = (dir: string) => {
  let discipline = '', gender = '', distance = ''
  for (const tok of dir.split('_').map((s) => s.trim()).filter(Boolean)) {
    if (!distance && DIST_RE.test(tok)) distance = normDistance(tok)
    else if (!discipline && asDiscipline(tok)) discipline = asDiscipline(tok)
    else if (!gender && asGender(tok)) gender = asGender(tok)
  }
  return { discipline, gender, distance, ok: !!(discipline && gender && distance) }
}

// 대회 — 목록 필터에서 고른 값으로 시작하되 드로어에서 바꿀 수 있다
const cid = ref<number | ''>('')
watch(() => props.open, (v) => { if (v) { cid.value = props.competitionID; reset() } })

// ── 폴더 선택 ──
// name·dir 은 NFC 로 맞춘다 — macOS 에서 만든 폴더·파일은 한글이 자모 분리(NFD)로 와서
// '자유형' 이 어휘와 안 맞고 파일명도 서버 저장값과 어긋난다.
const dirInput = ref<HTMLInputElement | null>(null)
const queue = ref<{ file: File; name: string; dir: string }[]>([])
const dupCount = ref(0)   // 같은 파일명이 다른 폴더에 또 있어 뺀 수 (저장 키가 대회+파일명이라 하나만 남는다)
const msg = ref('')
const push = (file: File, dir: string) => {
  const name = file.name.normalize('NFC')
  if (!IMAGE_RE.test(name)) return
  if (queue.value.some((q) => q.name === name)) { dupCount.value++; return }
  queue.value.push({ file, name, dir: dir.normalize('NFC') })
}
// 폴더 선택 input — webkitRelativePath = "최상위/자유형_남자_50M/파일.jpg". 바로 위 폴더가 분류다.
const onDirChange = (e: Event) => {
  for (const f of Array.from((e.target as HTMLInputElement).files || [])) {
    const parts = String((f as any).webkitRelativePath || '').split('/')
    push(f, parts.length >= 2 ? parts[parts.length - 2] : '')
  }
  if (dirInput.value) dirInput.value.value = ''
  msg.value = ''
}
// 드래그 — 폴더를 통째로 끌어다 놓으면 하위 폴더까지 훑는다
const readAll = (reader: any) => new Promise<any[]>((resolve) => {
  const all: any[] = []
  const next = () => reader.readEntries((es: any[]) => { if (!es.length) return resolve(all); all.push(...es); next() }, () => resolve(all))
  next()
})
const walk = async (entry: any, dir: string) => {
  if (entry.isFile) {
    const f = await new Promise<File | null>((resolve) => entry.file(resolve, () => resolve(null)))
    if (f) push(f, dir)
  } else if (entry.isDirectory) {
    for (const e of await readAll(entry.createReader())) await walk(e, entry.name)
  }
}
const onDrop = async (e: DragEvent) => {
  // entry 는 이벤트가 끝나면 사라지므로 await 전에 모두 꺼내 둔다
  const entries = Array.from(e.dataTransfer?.items || []).map((it: any) => it.webkitGetAsEntry?.()).filter(Boolean)
  for (const en of entries) await walk(en, '')
  msg.value = ''
}
const removeDir = (dir: string) => { queue.value = queue.value.filter((q) => q.dir !== dir) }
const reset = () => { queue.value = []; dupCount.value = 0; msg.value = '' }

// ── 폴더별 묶음 ──
const groups = computed(() => {
  const by = new Map<string, { dir: string; count: number }>()
  for (const q of queue.value) {
    if (!by.has(q.dir)) by.set(q.dir, { dir: q.dir, count: 0 })
    by.get(q.dir)!.count++
  }
  return [...by.values()]
    .map((g) => ({ ...g, ...parseDir(g.dir) }))
    .sort((a, b) => a.dir.localeCompare(b.dir, 'ko', { numeric: true }))
})
const okDirs = computed(() => new Set(groups.value.filter((g) => g.ok).map((g) => g.dir)))
const targets = computed(() => queue.value.filter((q) => okDirs.value.has(q.dir)))
const badGroups = computed(() => groups.value.filter((g) => !g.ok))

// ── 업로드 — 원본+썸네일을 R2 로 올리고 images 에 저장 (ImageImportDrawer 와 같은 방식) ──
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/images${p}`
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
// 화면 갱신 보장 — rAF 를 두 번 기다려 브라우저가 한 프레임을 그린 뒤 이어간다
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
// 한 요청에 담는 장수 — 원본이 장당 수 MB 라 크게 잡으면 요청 하나가 너무 무거워진다
const BATCH = 4
const uploading = ref(false)
const upProgress = ref('')
const upDone = ref(0)
const upTotal = ref(0)

const doUpload = async () => {
  if (uploading.value) return
  if (cid.value === '' || cid.value == null) { msg.value = '대회를 선택하세요.'; return }
  const list = targets.value
  if (!list.length) { msg.value = '올릴 파일이 없습니다.'; return }
  const skip = queue.value.length - list.length
  if (skip && !confirm(`폴더명을 읽지 못한 ${badGroups.value.length}개 폴더의 ${skip}장은 빼고 ${list.length}장만 저장합니다. 계속할까요?`)) return
  const comp = props.competitions.find((c) => c.competitionID === cid.value)
  const metaOf = new Map(groups.value.map((g) => [g.dir, g]))

  uploading.value = true; msg.value = ''; upProgress.value = ''
  const total = list.length
  upDone.value = 0; upTotal.value = total
  const sum = { count: 0, upserted: 0, modified: 0, failed: [] as any[] }
  let done = 0
  try {
    // 묶음으로 나눠 보낸다 — 진행률이 계속 움직이고, 중간에 끊겨도 앞 묶음은 이미 저장돼 있다
    for (let s = 0; s < total; s += BATCH) {
      const chunk = list.slice(s, s + BATCH)
      const fd = new FormData()
      fd.append('mode', 'dir')
      fd.append('competitionID', String(cid.value))
      fd.append('competitionName', comp?.competitionName ?? '')
      const meta: any[] = []
      for (const q of chunk) {
        upProgress.value = `썸네일 ${done + meta.length + 1} / ${total}  ${q.dir}/${q.name}`
        await nextFrame()
        const thumb = await makeThumb(q.file)
        fd.append('files', q.file, q.name)
        fd.append('thumbs', thumb || q.file, q.name)
        const g = metaOf.get(q.dir)!
        meta.push({ filename: q.name, discipline: g.discipline, gender: g.gender, distance: g.distance })
      }
      fd.append('meta', JSON.stringify(meta))
      upProgress.value = `전송 ${done + meta.length} / ${total}  ${meta[meta.length - 1].filename}`
      const r = await $fetch<any>(api('/import'), { method: 'POST', body: fd })
      sum.count += r.count || 0
      sum.upserted += r.upserted || 0
      sum.modified += r.modified || 0
      if (r.failed?.length) sum.failed.push(...r.failed)
      done += meta.length
      upDone.value = done
    }
    emit('done', sum)
  } catch (err: any) {
    // 앞 묶음은 이미 저장됐으므로 어디까지 됐는지 알려준다
    msg.value = `업로드 실패(${done}/${total} 저장됨): ` + (err?.data?.error || err?.message || '')
    if (done) emit('done', sum)
  } finally {
    uploading.value = false; upProgress.value = ''; upDone.value = 0; upTotal.value = 0
  }
}
</script>

<template>
  <div class="drawer-root" :class="{ open }" @keydown.esc="emit('close')">
    <div class="drawer-ov" @click="emit('close')" />
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="폴더별 사진 가져오기">
      <header class="drawer-head">
        <h2>폴더별 사진 가져오기</h2>
        <button class="drawer-x" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div class="drawer-body">
        <!-- 대회 -->
        <label class="fld">
          <span class="info-l">대회</span>
          <select v-model="cid" class="fld-input">
            <option value="">대회 선택…</option>
            <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
              {{ c.competitionName || c.competitionID }}<span v-if="c.datetime"> ({{ c.datetime }})</span>
            </option>
          </select>
        </label>

        <!-- 폴더 선택 -->
        <div class="up-sec">
          <div class="up-head">
            <span class="info-l">폴더</span>
            <span v-if="queue.length" class="up-count">{{ groups.length }}개 폴더 · {{ queue.length }}장</span>
            <span class="spacer" />
            <button v-if="queue.length" class="btn btn-ghost btn-sm" type="button" :disabled="uploading" @click="reset">비우기</button>
          </div>
          <div class="up-area" @dragover.prevent @drop.prevent="onDrop">
            <input ref="dirInput" type="file" webkitdirectory multiple hidden @change="onDirChange">
            <button class="btn btn-ghost" type="button" @click="dirInput?.click()">폴더 선택</button>
            <span class="up-hint">또는 폴더를 드래그 (분류 폴더들을 담은 상위 폴더를 통째로 넣어도 됩니다)</span>
          </div>
          <p class="up-note">
            폴더명 규칙 <code>{discipline}_{gender}_{distance}</code> &nbsp;예) <code>자유형_남자_50M</code><br>
            사진은 들어 있는 폴더의 영법·성별·거리로 저장됩니다. 파일명은 그대로 쓰고, 같은 대회에 같은 파일명이 있으면 덮어씁니다.
          </p>
        </div>

        <!-- 폴더별 결과 -->
        <div v-if="groups.length" class="res-sec">
          <p class="res-sum">
            저장 대상 <b>{{ targets.length }}</b>장
            <span v-if="badGroups.length" class="bad"> · 폴더명 인식 실패 {{ badGroups.length }}개</span>
            <span v-if="dupCount" class="warn"> · 중복 파일명 {{ dupCount }}장 제외</span>
          </p>
          <table class="res-table">
            <thead>
              <tr><th>폴더</th><th>discipline</th><th>gender</th><th>distance</th><th class="num">사진</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="g in groups" :key="g.dir" :class="{ miss: !g.ok }">
                <td class="mono" :class="{ bad: !g.ok }">{{ g.dir || '(폴더 없음)' }}</td>
                <td>{{ g.discipline ? `${DISCIPLINE_LABEL[g.discipline]} (${g.discipline})` : '—' }}</td>
                <td>{{ g.gender ? `${GENDER_LABEL[g.gender]} (${g.gender})` : '—' }}</td>
                <td>{{ g.distance || '—' }}</td>
                <td class="num">{{ g.count }}</td>
                <td class="act"><button class="row-btn" type="button" title="빼기" :disabled="uploading" @click="removeDir(g.dir)">✕</button></td>
              </tr>
            </tbody>
          </table>
          <p v-if="badGroups.length" class="res-hint">
            <b>폴더명 인식 실패</b> — 영법·성별·거리 중 읽지 못한 값이 있는 폴더입니다. 이 폴더의 사진은 저장하지 않습니다. 폴더명을 고친 뒤 다시 넣으세요.
          </p>
        </div>
      </div>

      <footer class="drawer-foot">
        <span class="foot-msg">{{ msg }}</span>
        <span v-if="uploading" class="foot-progress" :title="upProgress">{{ upProgress }}</span>
        <button class="btn btn-ghost" type="button" :disabled="uploading" @click="emit('close')">닫기</button>
        <button class="btn btn-primary" type="button" :disabled="!targets.length || uploading" @click="doUpload">
          {{ uploading ? `저장 중… ${upDone} / ${upTotal}` : `저장${targets.length ? ` (${targets.length})` : ''}` }}
        </button>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(900px, 98vw); background: var(--paper);
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

.info-l { font-size: 11.5px; color: var(--ink-light); }
.fld { display: flex; flex-direction: column; gap: 4px; }
.fld-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 8px 11px; width: 100%;
}
.fld-input:focus { outline: none; border-color: var(--orange); }

.up-sec { display: flex; flex-direction: column; gap: 10px; }
.up-head { display: flex; align-items: center; gap: 8px; }
.up-count { font-size: 12px; color: var(--ink-mute); }
.spacer { flex: 1; }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.up-area {
  display: flex; align-items: center; gap: 10px; padding: 14px;
  border: 1px dashed var(--line); border-radius: 8px; background: var(--paper-deep);
}
.up-hint { font-size: 12.5px; color: var(--ink-mute); }
.up-note { margin: 0; font-size: 12px; color: var(--ink-mute); line-height: 1.7; }
.up-note code { font-family: var(--mono, monospace); background: var(--paper-deep); padding: 1px 5px; border-radius: 4px; }

.res-sec { display: flex; flex-direction: column; gap: 8px; }
.res-sum { margin: 0; font-size: 13px; color: var(--ink); }
.res-sum .bad { color: var(--bad); }
.res-sum .warn { color: var(--orange); }
.res-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.res-table th, .res-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--line-soft); }
.res-table th { font-size: 11.5px; font-weight: 600; color: var(--ink-light); }
.res-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.res-table td.mono { font-family: var(--mono, monospace); word-break: break-all; }
.res-table td.bad { color: var(--bad); }
.res-table tr.miss td { background: var(--bad-bg); }
.res-table td.act { text-align: right; }
.row-btn { border: none; background: none; cursor: pointer; color: var(--ink-light); font-size: 13px; line-height: 1; padding: 0 3px; }
.res-hint { margin: 0; font-size: 12px; color: var(--ink-mute); line-height: 1.6; }

.drawer-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-top: 1px solid var(--line); background: var(--paper);
}
.foot-msg { flex: 1; font-size: 12px; color: var(--bad); }
.foot-progress {
  flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--ink-mute);
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.btn:disabled { opacity: .5; cursor: default; }
</style>
