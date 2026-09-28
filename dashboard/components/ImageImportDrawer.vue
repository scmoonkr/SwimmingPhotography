<script setup lang="ts">
// 사진 가져오기 드로어 — 대회 선택 → 파일 선택(드래그/파일선택) → 파일명 파싱 결과 표시.
// 파일명 규칙: ******_{name}_{gender}_{discipline}_{distance}_{type}.jpg
//   예) 20260830_175302_048A8464_문주희_혼성_계영_200_CEREMONY.jpg
//       20260912_091556_7R504579_이정민_여자_평영_RACE.jpg   ← distance 생략(선택 항목)
//   앞쪽(******)은 촬영 정보라 길이가 제각각 → 오른쪽부터 끊는다.
//     type=맨끝, distance=그 앞이 숫자면(선택), discipline·gender=그 앞 두 칸, name=그 앞.
//   distance 는 빠지는 사진이 많아(RACE·TOUCHPAD·CEREMONY 등) 선택 항목으로 본다.
//   거리가 없으면 50M 로 기본 설정한다(표에 '*' 표시 — 다르면 행에서 고친다).
//   team 은 파일명에서 뺐다 — 매칭 키가 아니고(힌트일 뿐), 저장 team 은 매칭된 기록 값을 쓴다.
//   동명이인은 행에서 team 을 채우거나 name 을 name_unique(예: 홍길동1)로 고쳐 가른다.
//   ※ 예전 규칙처럼 team 이 들어간 파일명은 name 이 팀으로 밀려 읽히니 행에서 고쳐야 한다.
// times 매칭·업로드는 다음 단계에서 구현한다.
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  competitions: any[]
  competitionID: number | ''
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', r: any): void }>()

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif)$/i

// ── 파일명 → 코드 변환 ──
const GENDER_MAP: Record<string, string> = {
  남자: 'men', 남: 'men', 여자: 'women', 여: 'women', 혼성: 'mixed', 혼합: 'mixed',
  men: 'men', women: 'women', mixed: 'mixed',
}
// 영법 — 파일명에 쓰는 7종. 이 표 하나에서 파싱(한글→코드)과 표시(코드→한글)를 모두 만든다.
// (직접 두 방향을 적으면 계영↔FRR 처럼 짝이 어긋나기 쉽다.)
const DISCIPLINE_LABEL: Record<string, string> = {
  FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영',
}
const DISCIPLINE_MAP: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DISCIPLINE_LABEL).map(([code, ko]) => [ko, code])), // 자유형 → FR
  ...Object.fromEntries(Object.keys(DISCIPLINE_LABEL).map((code) => [code, code])),        // FR → FR
}
const TYPE_MAP: Record<string, string> = {
  enter: 'ENTER', block: 'BLOCK', start: 'START', race: 'RACE', touchpad: 'TOUCHPAD',
  ceremony: 'CEREMONY', exit: 'EXIT', walk: 'WALK', team: 'TEAM',
}
// "200" → "200M", "50m" → "50M"
const normDistance = (v: string) => {
  const m = String(v || '').match(/(\d+)\s*[Mm]?$/)
  return m ? `${m[1]}M` : ''
}
// distance 칸인지 판별 — 숫자(+선택 m).
const DIST_RE = /^\d+\s*[Mm]?$/
// 각 토큰이 어떤 필드인지 값으로 판별 — gender·discipline·type·distance 는 모두 닫힌 어휘/숫자라 겹치지 않는다.
const asType = (t: string) => TYPE_MAP[String(t).toLowerCase()] || ''
const asGender = (t: string) => GENDER_MAP[t] || ''
const asDiscipline = (t: string) => DISCIPLINE_MAP[t] || DISCIPLINE_MAP[String(t).toUpperCase()] || ''
const parseFilename = (filename: string) => {
  const base = filename.replace(/\.[^.]+$/, '')
  const parts = base.split('_').map((s) => s.trim()).filter((s) => s !== '')
  // 오른쪽부터 '값의 형태'로 분류한다 — 앞쪽 촬영 정보(******)는 길이가 제각각이고,
  // 성별·영법·거리는 있을 수도/없을 수도 있어(성별만·영법만·거리 없음 등) 위치로는 못 가른다.
  //   각 토큰을 type→distance→discipline→gender 순으로 맞춰 채우고(겹치지 않음),
  //   어디에도 안 맞는 첫 토큰이 이름이다(그 앞은 촬영 정보라 멈춘다).
  let gRaw = '', dRaw = '', distRaw = '', tRaw = '', name = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const tok = parts[i]
    if (!tRaw && asType(tok)) { tRaw = tok; continue }
    if (!distRaw && DIST_RE.test(tok)) { distRaw = tok; continue }
    if (!dRaw && asDiscipline(tok)) { dRaw = tok; continue }
    if (!gRaw && asGender(tok)) { gRaw = tok; continue }
    name = tok            // 인식 안 되는 토큰 = 이름. 여기서 멈춘다.
    break
  }
  return {
    filename,
    ok: !!name,                                  // 이름을 못 찾으면 형식오류
    name,
    team: '',   // 파일명에서 팀을 읽지 않는다 — 동명이인 힌트가 필요하면 행에서 직접 채운다
    gender: asGender(gRaw),
    discipline: asDiscipline(dRaw),
    distance: normDistance(distRaw) || '50M',    // 파일명에 거리가 없으면 50M 로 기본 설정(표에 '*' 표시)
    type: tRaw ? asType(tRaw) : '',
    raw: { name, gender: gRaw, discipline: dRaw, distance: distRaw, type: tRaw },
  }
}

// 대회 — 목록 필터에서 고른 값으로 시작하되 드로어에서 바꿀 수 있다
const cid = ref<number | ''>('')
watch(() => props.open, (v) => { if (v) { cid.value = props.competitionID; reset() } })

// ── 파일 선택 (competitions 드로어와 같은 방식) ──
const fileInput = ref<HTMLInputElement | null>(null)
// name — 파일명을 NFC 로 맞춘 값. 이후 파싱·표·업로드는 모두 이 이름을 쓴다.
// (macOS 에서 만든 파일은 한글이 자모 분리(NFD)로 온다. 그대로 두면 '문주희' 가
//  ㅁ+ㅜ+ㄴ… 으로 쪼개져 파일명 파싱도, times.name_unique 매칭도 어긋난다.)
const queue = ref<{ file: File; name: string; preview: string }[]>([])
const addFiles = (files: FileList | null) => {
  if (!files) return
  const seen = new Set(queue.value.map((q) => q.name))
  for (const f of Array.from(files)) {
    const name = f.name.normalize('NFC')
    if (!IMAGE_RE.test(name) || seen.has(name)) continue
    seen.add(name)
    queue.value.push({ file: f, name, preview: URL.createObjectURL(f) })
  }
  clearMatch()
}
const onFileChange = (e: Event) => { addFiles((e.target as HTMLInputElement).files); if (fileInput.value) fileInput.value.value = '' }
const onDrop = (e: DragEvent) => addFiles(e.dataTransfer?.files ?? null)
// 표는 정렬해 보여주므로 인덱스가 아니라 파일명으로 지운다
const removeFile = (filename: string) => {
  const i = queue.value.findIndex((q) => q.name === filename)
  if (i < 0) return
  URL.revokeObjectURL(queue.value[i].preview)
  queue.value.splice(i, 1)
  clearMatch()
}
// ── 이미지 확대 (썸네일 클릭 → 모달) ──
const lightbox = ref<string | null>(null)   // 크게 볼 이미지 preview URL
const onLbKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); lightbox.value = null } }
// 열려 있을 때만 ESC 리스너를 건다 (드로어 닫기 ESC 보다 먼저 라이트박스를 닫도록 capture)
watch(lightbox, (v) => {
  if (typeof window === 'undefined') return
  if (v) window.addEventListener('keydown', onLbKey, true)
  else window.removeEventListener('keydown', onLbKey, true)
})

const reset = () => {
  queue.value.forEach((q) => URL.revokeObjectURL(q.preview))
  queue.value = []
  overrides.value = {}
  editing.value = ''
  lightbox.value = null
  clearMatch()
}

// 선택 즉시 파싱 (서버 호출 없음) → name · gender · discipline · distance · type 순 정렬.
// 이름은 기록 목록과 같이 영문 먼저 ('ko' 로케일은 한글을 라틴보다 앞에 둔다).
// 거리는 문자열이라 50M < 100M < 1500M 이 되도록 숫자로 비교한다.
const ko = (a: any, b: any) => String(a || '').localeCompare(String(b || ''), 'ko', { numeric: true })
const isHangul = (v: any) => /^[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(String(v || ''))
const distN = (v: any) => { const m = String(v || '').match(/(\d+)/); return m ? Number(m[1]) : Infinity }
// 행 클릭으로 고친 값 — 파일명별로 보관하고 파싱 결과 위에 덮어쓴다
const FIELDS = ['name', 'team', 'gender', 'discipline', 'distance', 'type'] as const
const GENDER_OPTS = ['men', 'women', 'mixed']
const DISCIPLINE_OPTS = Object.keys(DISCIPLINE_LABEL)
const DISTANCE_OPTS = ['25M', '50M', '100M', '200M', '400M', '800M', '1500M', '3000M', '5000M', '10000M']
const TYPE_OPTS = ['ENTER', 'BLOCK', 'START', 'RACE', 'TOUCHPAD', 'CEREMONY', 'EXIT', 'WALK', 'TEAM']
const overrides = ref<Record<string, any>>({})

const parsed = computed(() => queue.value
  .map((q) => {
    const base = parseFilename(q.name)
    const ov = overrides.value[q.name]
    return {
      ...base,
      ...(ov || {}),
      ok: base.ok || !!ov,                                            // 직접 채웠으면 형식오류 해제
      edited: !!ov && FIELDS.some((k) => (base as any)[k] !== ov[k]),
      match: matchByFile.value[q.name] || null,
      preview: q.preview,                                             // 파일명 앞 썸네일
    }
  })
  .sort((a, b) => {
    const ha = isHangul(a.name), hb = isHangul(b.name)
    return (ha === hb ? ko(a.name, b.name) : (ha ? 1 : -1))
      || ko(a.gender, b.gender)
      || ko(a.discipline, b.discipline)
      || (distN(a.distance) - distN(b.distance))
      || ko(a.type, b.type)
  }))
// 인식 실패 = 이름을 못 찾은 것만. 성별·영법·거리는 값으로 판별하며 없어도 되므로(파일명이 생략) 실패로 치지 않는다.
const badCount = computed(() => parsed.value.filter((p) => !p.ok).length)

// ── times 매칭 — name(=name_unique)·gender·discipline·distance 로 찾아 timeID·ageGroup·team 을 채운다 ──
// (team 도 함께 보내지만 키는 아니다 — 여러 건이 잡혔을 때 서버에서 좁히는 힌트로만 쓴다)
const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/images${p}`
const matchByFile = ref<Record<string, any>>({})
const matching = ref(false)
const msg = ref('')

// ── 여러건(예선·결선) 처리 ──
// 매칭 키(이름·성별·영법·거리)에 라운드가 없어, 같은 종목을 예선·결선 뛰면 두 기록이 다 잡힌다(multi).
// 사진으로 예선/결선을 가리기 어려우니 구분하지 않고 결선(최종 기록)에 자동으로 붙인다.
// 라운드 우선순위 — 결승/결선 > 준결승 > 예선 > 그 외. 가장 높은 라운드를 고른다.
const roundRank = (r: any) => {
  const s = String(r || '')
  if (/준결|semi/i.test(s)) return 2      // '준결승' 은 '결' 을 포함하니 먼저 거른다
  if (/결|final/i.test(s)) return 3
  if (/예선|prelim|heat/i.test(s)) return 1
  return 0
}
// 이 사진에 붙을 timeID — 단건이면 그것, 여러건이면 결선(가장 높은 라운드). 매칭 안 됐으면 null.
const chosenTimeID = (p: any): number | null => {
  const ts = p.match?.times || []
  if (!ts.length) return null
  let best = ts[0]
  for (const t of ts) if (roundRank(t.round) > roundRank(best.round)) best = t
  return best?.timeID ?? null
}
// 자동 선택된 timeID 의 라운드(표시용)
const chosenRound = (p: any) => {
  const id = chosenTimeID(p)
  return (p.match?.times || []).find((t: any) => t.timeID === id)?.round || ''
}

const clearMatch = () => { matchByFile.value = {}; msg.value = '' }

// 요약은 표의 현재 상태에서 계산한다 — 한 행만 다시 매칭해도 숫자가 맞도록.
const matchSum = computed(() => {
  const rows = parsed.value.filter((p) => p.match)
  if (!rows.length) return null
  const n = (s: string) => rows.filter((p) => p.match.status === s).length
  return { ok: n('ok'), multi: n('multi'), none: n('none') }
})

// 직접 타이핑/붙여넣기한 이름·소속은 NFC 로 맞춘다 — 자모분리(NFD)면 times.name_unique(NFC)와
// 매칭이 어긋난다(파일명은 addFiles 에서 이미 NFC 로 정규화됨). 전송 직전에도 정규화해 예전 override 도 커버.
const nfc = (s: any) => String(s ?? '').normalize('NFC').trim()
const payloadOf = (p: any) => ({
  filename: p.filename, name: nfc(p.name), team: nfc(p.team), gender: p.gender, discipline: p.discipline, distance: p.distance,
})
const postMatch = async (items: any[]) => {
  const res = await $fetch<any>(api('/match'), { method: 'POST', body: { competitionID: cid.value, items } })
  return res.items || []
}

// 선택한 대회에 기록이 몇 건인지 — 하나도 안 맞을 때 대회를 잘못 골랐는지 판단용
const timesInComp = ref<number | null>(null)

const runMatch = async () => {
  if (matching.value) return
  commitEdit(false)   // 편집 중인 행이 있으면 먼저 반영(개별 매칭은 생략 — 아래에서 한꺼번에)
  if (cid.value === '' || cid.value == null) { msg.value = '대회를 선택하세요.'; return }
  const items = parsed.value.filter((p) => p.ok).map(payloadOf)
  if (!items.length) { msg.value = '파일명이 규칙에 맞는 파일이 없습니다.'; return }
  matching.value = true; msg.value = ''
  try {
    const res = await $fetch<any>(api('/match'), { method: 'POST', body: { competitionID: cid.value, items } })
    timesInComp.value = res.timesInCompetition ?? null
    matchByFile.value = Object.fromEntries((res.items || []).map((r: any) => [r.filename, r]))

  } catch (err: any) {
    clearMatch()
    msg.value = '매칭 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    matching.value = false
  }
}

// 한 행만 다시 매칭 — 행을 고치고 ✓ 를 누르면 바로 표를 갱신한다
const matchOne = async (filename: string) => {
  if (cid.value === '' || cid.value == null) { msg.value = '대회를 선택하세요.'; return }
  const p = parsed.value.find((x) => x.filename === filename)
  if (!p?.ok) return
  msg.value = ''
  try {
    const [r] = await postMatch([payloadOf(p)])
    if (r) matchByFile.value = { ...matchByFile.value, [filename]: r }
  } catch (err: any) {
    msg.value = '매칭 실패: ' + (err?.data?.error || err?.message || '')
  }
}
// ── 업로드 — 원본+썸네일을 R2 로 올리고 images 컬렉션에 저장 ──
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
const upProgress = ref('')
// 저장 버튼에도 (몇째 / 전체) 를 띄운다
const upDone = ref(0)
const upTotal = ref(0)
// 화면 갱신 보장 — nextTick 은 마이크로태스크라 DOM 만 바뀌고 아직 그려지지 않는다.
// rAF 를 두 번 기다리면 브라우저가 실제로 한 프레임을 그린 뒤 이어간다.
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
// 진행률 표기 — "썸네일 3 / 120  20260830_..._CEREMONY.jpg"
// 어느 단계든 (몇째 / 전체) 와 그때 다루는 파일명을 함께 보여준다.
const prog = (label: string, n: number, total: number, filename = '') =>
  `${label} ${n} / ${total}${filename ? `  ${filename}` : ''}`
// 한 요청에 담는 장수 — 원본이 장당 수 MB 라 크게 잡으면 요청 하나가 너무 무거워진다
const BATCH = 4
// timeID 없이 올라가는 파일 — 매칭 안 함(null) 또는 '없음'. 올리기 전에 몇 건인지 알려준다.
// 여러건(예선·결선)은 결선 기본값(또는 행에서 고른 라운드)으로 확정되므로 여기 포함하지 않는다.
const unmatchedCount = computed(() => parsed.value.filter((p) => p.ok && !chosenTimeID(p)).length)

const doUpload = async () => {
  if (uploading.value) return
  commitEdit(false)
  if (cid.value === '' || cid.value == null) { msg.value = '대회를 선택하세요.'; return }
  const targets = parsed.value.filter((p) => p.ok)
  if (!targets.length) { msg.value = '올릴 파일이 없습니다.'; return }
  const comp = props.competitions.find((c) => c.competitionID === cid.value)
  const bad = unmatchedCount.value
  if (bad && !confirm(`${targets.length}장 중 ${bad}장은 times 매칭이 안 됐습니다(없음/미매칭).\ntimeID 없이 저장됩니다. 계속할까요?`)) return

  uploading.value = true; msg.value = ''; upProgress.value = ''
  upDone.value = 0; upTotal.value = targets.length
  // 한 번에 다 보내면 원본 수십~수백 MB 가 요청 하나가 되어 오래 멈춘 것처럼 보인다.
  // 묶음으로 나눠 보내면 진행률이 계속 움직이고, 중간에 끊겨도 앞 묶음은 이미 저장돼 있다.
  const total = targets.length
  const sum = { count: 0, upserted: 0, modified: 0, failed: [] as any[] }
  let done = 0
  try {
    for (let s = 0; s < total; s += BATCH) {
      const chunk = targets.slice(s, s + BATCH)
      const fd = new FormData()
      fd.append('competitionID', String(cid.value))
      fd.append('competitionName', comp?.competitionName ?? '')
      const meta: any[] = []
      for (const p of chunk) {
        const q = queue.value.find((x) => x.name === p.filename)
        if (!q) continue
        upDone.value = done + meta.length
        upProgress.value = prog('썸네일', done + meta.length + 1, total, p.filename)
        // 썸네일 생성은 동기 작업이라 그대로 두면 진행률이 안 그려진다 — 한 프레임 양보한다
        await nextFrame()
        const thumb = await makeThumb(q.file)
        fd.append('files', q.file, p.filename)
        fd.append('thumbs', thumb || q.file, p.filename)
        meta.push({
          filename: p.filename,
          // name 은 times.name_unique 와 같아야 매칭이 유지된다 —
          // 팀으로 동명이인을 가른 경우 파일명의 '김수정' 이 아니라 '김수정2' 로 저장한다.
          name: p.match?.name_unique || p.name,
          gender: p.gender, discipline: p.discipline, distance: p.distance, type: p.type,
          // 확정된 timeID — 단건이면 그것, 여러건(예선·결선)이면 결선 기본값 또는 행에서 고른 라운드
          timeID: chosenTimeID(p),
          ageGroup: p.match?.ageGroup ?? '',
          // team — 맞은 기록의 팀명을 우선한다(times 와 표기를 맞추려고). 못 맞았으면 파일명 값.
          team: p.match?.team || p.team || '',
        })
      }
      if (!meta.length) continue
      fd.append('meta', JSON.stringify(meta))
      // 묶음(BATCH)을 한 요청으로 보내므로 그 묶음의 마지막 파일명을 붙인다
      upDone.value = done + meta.length
      upProgress.value = prog('전송', done + meta.length, total, meta[meta.length - 1].filename)
      const r = await $fetch<any>(api('/import'), { method: 'POST', body: fd })
      sum.count += r.count || 0
      sum.upserted += r.upserted || 0
      sum.modified += r.modified || 0
      if (r.failed?.length) sum.failed.push(...r.failed)
      const last = meta[meta.length - 1].filename
      done += meta.length
      upDone.value = done
      upProgress.value = prog('저장', done, total, last)
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

// 파일명에 거리가 없어 50M 로 기본 채운 경우 — 표에 '기본' 으로 표시해 확인·수정을 유도한다
const distDefault = (p: any) => !!(p.ok && p.raw && !p.raw.distance && !p.edited)
// 파일명 이름과 실제 name_unique 가 다른 경우 — 동명이인을 팀으로 가른 것
const nuFixed = (p: any) => !!(p.match?.name_unique && p.match.name_unique !== p.name)
// 파일명의 팀 표기가 맞은 기록의 team 과 다를 때 알려준다 — 저장은 기록 쪽 값을 쓴다
const teamDiff = (p: any) => !!(p.match?.team && p.team && p.match.team !== p.team)
// timeID 셀 툴팁 — 잡힌 기록 전체(라운드·기록)를 줄바꿈으로
const timeIDTitle = (m: any) => (m?.times || []).map((t: any) => `${t.timeID} ${t.round || ''} ${t.time || ''}`.trim()).join('\n')

// ── 행 클릭 → 인라인 편집 ──
// 입력 중에 정렬이 바뀌어 행이 튀지 않도록, 확정(✓)할 때만 값을 반영한다.
const editing = ref('')
const draft = ref<Record<string, string>>({ name: '', team: '', gender: '', discipline: '', distance: '', type: '' })
const startEdit = (p: any) => {
  if (editing.value === p.filename) return
  if (editing.value) commitEdit()
  editing.value = p.filename
  draft.value = Object.fromEntries(FIELDS.map((k) => [k, p[k] || ''])) as Record<string, string>
}
// doMatch=true 면 고친 값으로 그 행만 곧바로 times 를 다시 찾아 표를 갱신한다
const commitEdit = (doMatch = true) => {
  const f = editing.value
  if (!f) return
  const d = { ...draft.value, name: nfc(draft.value.name), team: nfc(draft.value.team) }
  overrides.value = { ...overrides.value, [f]: d }
  // 값이 바뀌었으니 이전 매칭 결과는 무효(아래 doMatch 로 다시 찾는다).
  const m = { ...matchByFile.value }
  delete m[f]
  matchByFile.value = m
  editing.value = ''
  if (doMatch) matchOne(f)
}
const cancelEdit = () => { editing.value = '' }
</script>

<template>
  <div class="drawer-root" :class="{ open }" @keydown.esc="emit('close')">
    <div class="drawer-ov" @click="emit('close')" />
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="사진 가져오기">
      <header class="drawer-head">
        <h2>사진 가져오기</h2>
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

        <!-- 파일 선택 -->
        <div class="up-sec">
          <div class="up-head">
            <span class="info-l">이미지</span>
            <span v-if="queue.length" class="up-count">{{ queue.length }}장</span>
            <span class="spacer" />
            <button v-if="queue.length" class="btn btn-ghost btn-sm" type="button" @click="reset">비우기</button>
          </div>
          <div class="up-area" @dragover.prevent @drop.prevent="onDrop">
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFileChange">
            <button class="btn btn-ghost" type="button" @click="fileInput?.click()">파일 선택</button>
            <span class="up-hint">또는 폴더에서 드래그</span>
          </div>
          <p class="up-note">
            파일명 규칙 <code>******_{name}_{gender}_{discipline}_{distance}_{type}.jpg</code><br>
            예) <code>20260830_175302_048A8464_문주희_혼성_계영_200_CEREMONY.jpg</code><br>
            <code>distance</code> 는 생략할 수 있고(예: <code>…_이정민_여자_평영_RACE.jpg</code>), 없으면 <b>50M</b> 로 기본 설정됩니다(표에 <b>*</b> 표시). 팀은 파일명에 넣지 않습니다 — 동명이인은 행에서 team 을 채우거나 이름을 <code>홍길동1</code> 로 고쳐 가릅니다.
          </p>
        </div>

        <!-- 파싱 결과 -->
        <div v-if="parsed.length" class="res-sec">
          <p class="res-sum">
            {{ parsed.length }}장
            <span v-if="badCount" class="bad"> · 인식 실패 {{ badCount }}</span>
            <template v-if="matchSum">
              &nbsp;·&nbsp; 매칭 <b>{{ matchSum.ok }}</b>
              <span v-if="matchSum.multi" class="warn"> · 여러건 {{ matchSum.multi }}</span>
              <span v-if="matchSum.none" class="bad"> · 없음 {{ matchSum.none }}</span>
            </template>
          </p>
          <table class="res-table">
            <thead>
              <tr>
                <th>filename</th><th>name</th><th>team</th><th>gender</th>
                <th>discipline</th><th>distance</th><th>type</th>
                <th>timeID</th><th>ageGroup</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in parsed" :key="p.filename"
                :class="{ miss: !p.ok || p.match?.status === 'none', editing: editing === p.filename, edited: p.edited }"
                @click="startEdit(p)"
              >
                <td class="mono fn-cell" :class="{ bad: !p.ok }" :title="p.edited ? '직접 수정한 행' : ''">
                  <img
                    v-if="p.preview" class="fn-thumb" :src="p.preview" alt="" loading="lazy"
                    title="클릭하면 크게 보기" @click.stop="lightbox = p.preview"
                  >
                  <span class="fn-name"><span v-if="p.edited" class="dot">●</span>{{ p.filename }}</span>
                </td>

                <!-- 편집 중 -->
                <template v-if="editing === p.filename">
                  <td>
                    <input
                      v-model="draft.name" class="cell-input" type="text" placeholder="선수명"
                      @click.stop @keydown.enter="commitEdit()" @keydown.esc.stop="cancelEdit"
                    >
                  </td>
                  <td>
                    <input
                      v-model="draft.team" class="cell-input" type="text" placeholder="소속"
                      @click.stop @keydown.enter="commitEdit()" @keydown.esc.stop="cancelEdit"
                    >
                  </td>
                  <td>
                    <select v-model="draft.gender" class="cell-input" @click.stop>
                      <option value="">—</option>
                      <option v-for="g in GENDER_OPTS" :key="g" :value="g">{{ g }}</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="draft.discipline" class="cell-input" @click.stop>
                      <option value="">—</option>
                      <option v-for="d in DISCIPLINE_OPTS" :key="d" :value="d">{{ DISCIPLINE_LABEL[d] }} ({{ d }})</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="draft.distance" class="cell-input" @click.stop>
                      <option value="">—</option>
                      <option v-for="d in DISTANCE_OPTS" :key="d" :value="d">{{ d }}</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="draft.type" class="cell-input" @click.stop>
                      <option value="">—</option>
                      <option v-for="t in TYPE_OPTS" :key="t" :value="t">{{ t }}</option>
                    </select>
                  </td>
                </template>

                <!-- 표시 -->
                <template v-else>
                  <td class="strong">
                    {{ p.name || '—' }}
                    <span v-if="nuFixed(p)" class="nu-fix" :title="`동명이인 — 팀(${p.team})으로 가려 ${p.match.name_unique} 로 저장됩니다`">→ {{ p.match.name_unique }}</span>
                  </td>
                  <td :class="{ warn: teamDiff(p) }" :title="teamDiff(p) ? `기록의 팀: ${p.match.team}` : ''">
                    {{ p.team || '—' }}
                  </td>
                  <!-- gender·discipline 은 값으로 판별하므로 '없거나 정확'하다 — 없으면 '—'(행에서 채울 수 있음) -->
                  <td>{{ p.gender || '—' }}</td>
                  <td>{{ p.discipline || '—' }}</td>
                  <!-- distance — 파일명에 없으면 50M 로 기본 채우고 '*' 표시 -->
                  <td>
                    {{ p.distance || '—' }}
                    <span v-if="distDefault(p)" class="dist-def" title="파일명에 거리가 없어 50M 로 기본 설정했습니다 — 다르면 행을 클릭해 고치세요">*</span>
                  </td>
                  <td>{{ p.type || '—' }}</td>
                </template>

                <!-- 여러건(예선·결선)은 구분하지 않고 결선에 자동 배정 — 붙는 timeID 만 표시 -->
                <td class="mono" :class="{ bad: p.match?.status === 'none' }" :title="timeIDTitle(p.match)">
                  <template v-if="p.match">
                    <template v-if="chosenTimeID(p)">
                      {{ chosenTimeID(p) }}<span v-if="p.match.status === 'multi'" class="multi-note"> · {{ chosenRound(p) }}</span>
                    </template>
                    <template v-else>없음</template>
                  </template>
                  <template v-else>—</template>
                </td>
                <td>{{ p.match?.ageGroup || '—' }}</td>

                <td class="act" @click.stop>
                  <template v-if="editing === p.filename">
                    <button class="row-btn ok" type="button" title="적용 · 다시 매칭" @click="commitEdit()">✓</button>
                    <button class="row-btn" type="button" title="취소" @click="cancelEdit">✕</button>
                  </template>
                  <button v-else class="row-btn" type="button" title="빼기" @click="removeFile(p.filename)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="res-hint">행을 클릭하면 name·team·gender·discipline·distance·type 을 고칠 수 있습니다 (✓ 적용 · Esc 취소).</p>
          <p v-if="badCount" class="res-hint">
            <b>인식 실패 {{ badCount }}</b> — 이름을 찾지 못한 파일입니다. 행을 클릭해 이름을 직접 채우세요.
          </p>
          <p v-if="matchSum && !matchSum.ok && !matchSum.multi" class="res-hint bad">
            <b>하나도 맞지 않습니다.</b>
            <template v-if="timesInComp === 0">
              선택한 대회에 기록이 <b>0건</b>입니다 — 대회를 잘못 고르셨거나, 그 대회의 기록가져오기를 아직 안 하셨습니다.
            </template>
            <template v-else>
              선택한 대회의 기록은 {{ timesInComp }}건입니다. 대회 선택이 맞는지 확인해 주세요.
            </template>
          </p>
          <p v-else-if="matchSum?.none" class="res-hint">
            <b>없음</b> — 이 대회에 (이름 · 성별 · 영법 · 거리) 가 맞는 기록이 없습니다.
            동명이인이면 행에서 <b>팀</b>을 채워 좁히거나, 이름을 <code>홍길동1</code> 처럼 name_unique 로 바꾸세요(행 클릭으로 수정 가능).
          </p>
          <p v-if="matchSum?.multi" class="res-hint">
            <b>여러건</b> — 같은 종목을 예선·결선처럼 두 번 이상 뛴 경우입니다(동명이인 아님). 예선·결선은 구분하지 않고 <b>결선</b> 기록에 자동으로 붙습니다.
          </p>
        </div>
      </div>

      <footer class="drawer-foot">
        <span class="foot-msg">{{ msg }}</span>
        <span v-if="uploading" class="foot-progress" :title="upProgress">{{ upProgress }}</span>
        <button class="btn btn-ghost" type="button" :disabled="uploading" @click="emit('close')">닫기</button>
        <button class="btn btn-ghost" type="button" :disabled="!parsed.length || matching || uploading" @click="runMatch">
          {{ matching ? '매칭 중…' : 'times 매칭' }}
        </button>
        <button class="btn btn-primary" type="button" :disabled="!parsed.length || uploading || matching" @click="doUpload">
          {{ uploading ? `저장 중… ${upDone} / ${upTotal}` : `저장${parsed.length ? ` (${parsed.length})` : ''}` }}
        </button>
      </footer>
    </aside>

    <!-- 이미지 확대 (썸네일 클릭) — 배경/×/Esc 로 닫기 -->
    <div v-if="lightbox" class="lb" @click="lightbox = null">
      <img class="lb-img" :src="lightbox" alt="" @click.stop>
      <button class="lb-x" type="button" aria-label="닫기" @click="lightbox = null">×</button>
    </div>
  </div>
</template>

<style scoped>
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(1480px, 98vw); background: var(--paper);
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
.res-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.res-table th, .res-table td { padding: 5px 8px; text-align: left; border-bottom: 1px solid var(--line-soft); }
.res-table th { font-size: 11.5px; font-weight: 600; color: var(--ink-light); }
.res-table td.mono { font-family: var(--mono, monospace); word-break: break-all; }
/* 파일명 셀 — 썸네일 + 파일명 */
.res-table td.fn-cell { display: flex; align-items: center; gap: 9px; }
.res-table .fn-thumb { flex: 0 0 auto; width: 48px; height: 48px; object-fit: cover; border-radius: 4px; background: var(--paper-deep); border: 1px solid var(--line); cursor: zoom-in; }
.res-table .fn-thumb:hover { border-color: var(--orange); }
.res-table .fn-name { min-width: 0; word-break: break-all; }
.res-table td.strong { font-weight: 700; }
.res-table td.bad { color: var(--bad); }
.res-table td.warn { color: var(--orange); }
.res-sum .bad { color: var(--bad); }
.res-sum .warn { color: var(--orange); }
.res-hint code { font-family: var(--mono, monospace); background: var(--paper-deep); padding: 1px 5px; border-radius: 4px; }
.res-table tr.miss td { background: var(--bad-bg); }
.res-table tbody tr { cursor: pointer; }
.res-table tbody tr:hover td { background: var(--paper-deep); }
.res-table tr.editing td { background: var(--paper-deep); box-shadow: inset 2px 0 0 var(--orange); }
.res-table .nu-fix { margin-left: 4px; font-weight: 600; color: var(--orange); }
.res-table .dist-def { margin-left: 2px; color: var(--orange); font-weight: 700; cursor: help; }
.res-table .multi-note { color: var(--ink-light); font-size: 11.5px; }
.res-table tr.edited .dot { color: var(--orange); margin-right: 5px; font-size: 8px; vertical-align: middle; }
.res-table td.act { white-space: nowrap; text-align: right; }
.cell-input {
  font-family: var(--sans); font-size: 12.5px; color: var(--ink); width: 100%; min-width: 76px;
  background: var(--paper); border: 1px solid var(--line); border-radius: 4px; padding: 4px 6px;
}
.cell-input:focus { outline: none; border-color: var(--orange); }
.row-btn { border: none; background: none; cursor: pointer; color: var(--ink-light); font-size: 13px; line-height: 1; padding: 0 3px; }
.row-btn.ok { color: var(--orange); font-weight: 700; }
.res-hint { margin: 0; font-size: 12px; color: var(--ink-mute); line-height: 1.6; }
.res-hint.bad { color: var(--bad); }

.drawer-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-top: 1px solid var(--line); background: var(--paper);
}
.foot-msg { flex: 1; font-size: 12px; color: var(--bad); }
/* 진행률 — 파일명이 길어도 푸터가 밀리지 않도록 자른다 */
.foot-progress {
  flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--ink-mute);
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.btn:disabled { opacity: .5; cursor: default; }

/* 이미지 확대 라이트박스 */
.lb { position: fixed; inset: 0; z-index: 1300; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .82); padding: 32px; cursor: zoom-out; }
.lb-img { max-width: 96vw; max-height: 92vh; object-fit: contain; box-shadow: 0 12px 48px rgba(0, 0, 0, .5); cursor: default; }
.lb-x { position: absolute; top: 16px; right: 24px; border: none; background: none; color: #fff; font-size: 36px; line-height: 1; cursor: pointer; padding: 0; }
.lb-x:hover { color: var(--orange); }
</style>
