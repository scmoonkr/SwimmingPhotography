<script setup lang="ts">
// 선수(Athletes) — SP.times 를 선수별로 그룹핑한 뷰.
// 필터: 대회선택·성별·선수명. row 클릭 → 상세 드로어(선수 정보 + times[종목·기록·순위]). 선수추가(수동).
import { computed, onMounted, ref, watch } from 'vue'
import type { Column, Field } from '~/composables/useMock'

const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/athletes${p}`

// ── 옵션 ──
const GENDERS = [{ v: '', l: '성별 전체' }, { v: 'men', l: '남자' }, { v: 'women', l: '여자' }, { v: 'mixed', l: '혼성' }]
const DISCIPLINE_LABEL: Record<string, string> = {
  FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영',
  BK: '배영(BK)', BRMS: '평영(MS)', BROS: '평영(OS)', BROW: '평영(OW)', BRUW: '평영(UW)', BRZS: '평영(ZS)',
}
const DISCIPLINES = ['', 'FR', 'BA', 'BR', 'FL', 'IM', 'FRR', 'MR', 'BK', 'BRMS', 'BROS', 'BROW', 'BRUW', 'BRZS']
const DISTANCES = ['', '25M', '50M', '100M', '200M', '400M', '500M', '800M', '1000M', '1500M', '3000M', '5000M', '10000M']
const disc = (v: string) => (DISCIPLINE_LABEL[v] || v || '')
const genderLabel = (v: string) => ({ men: '남자', women: '여자', mixed: '혼성' } as Record<string, string>)[v] || v
const eventLabel = (t: any) => [disc(t.discipline), t.distance, t.course].filter(Boolean).join(' ')

// ── 필터 ──
const competitionID = ref<number | ''>('')
const gender = ref('')
const group = ref('')
const name = ref('')
const articleFilter = ref<'' | 'has' | 'none'>('')   // 전체 / 기사작성 / 기사미작성
const groupOptions = ref<string[]>([])

// 기록 표기: "00:24.43" → "24초 43" / "01:33.33" → "1분 33초 33"
const fmtRec = (t: any) => {
  const m = String(t || '').match(/^(\d+):(\d+)\.(\d+)/)
  if (!m) return t || ''
  return (+m[1] > 0) ? `${+m[1]}분 ${+m[2]}초 ${m[3]}` : `${+m[2]}초 ${m[3]}`
}
// 차이(초): 선수 timeStamp − 기록 timeStamp (하루 분수 → 초)
const fmtDiff = (aTs: any, rTs: any) => {
  if (aTs == null || rTs == null) return ''
  const s = (aTs - rTs) * 86400
  if (!isFinite(s)) return ''
  return (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(2)
}
const evKey = (t: any) => `${t.discipline || ''}|${t.distance || ''}|${t.course || ''}`

const competitions = ref<any[]>([])
const loadCompetitions = async () => {
  try { competitions.value = await $fetch<any[]>(api('/competitions'), { params: { limit: 2000 } }) } catch { competitions.value = [] }
}
// 필터에서 선택한 대회 (JSON payload 의 대회명·일자·수영장 출처)
const selectedComp = computed(() => competitions.value.find((c) => c.competitionID === competitionID.value) || null)

// ── 테이블 컬럼 ──
const columns: Column[] = [
  { key: 'name', label: '선수명', cls: 'strong' },
  { key: 'gender', label: '성별', cls: 'muted', get: (r) => genderLabel(r.gender) },
  { key: 'group', label: 'group' },
  { key: 'ageGroup', label: 'ageGroup', cls: 'muted' },
  { key: 'team', label: '팀', cls: 'muted' },
  { key: 'count', label: '기록', cls: 'num', get: (r) => (r.times || []).length },
  { key: 'myTimesCount', label: 'my', cls: 'num', get: (r) => r.myTimesCount ?? 0 },
  { key: 'imageCount', label: '이미지', cls: 'num', get: (r) => r.imageCount ?? 0 },
  { key: 'hasArticle', label: '기사', cls: 'num', get: (r) => (r.hasArticle ? '✓' : '') },
]

// ── 목록 ──
const rows = ref<any[]>([])
// 기사 작성 여부 필터 (전체/기사작성/기사미작성) — 클라이언트에서 hasArticle 로 거름
const viewRows = computed(() => {
  if (articleFilter.value === 'has') return rows.value.filter((r) => r.hasArticle)
  if (articleFilter.value === 'none') return rows.value.filter((r) => !r.hasArticle)
  return rows.value
})
// 테이블 체크박스 선택 (배치 LLM생성 대상)
const selectedRows = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref('')
const notice = ref('')
const load = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const params: Record<string, any> = { limit: 3000 }
    if (competitionID.value) params.competitionID = competitionID.value
    if (gender.value) params.gender = gender.value
    if (group.value) params.group = group.value
    if (name.value.trim()) params.name = name.value.trim()
    rows.value = await $fetch<any[]>(api(), { params })
    selectedRows.value = []   // 재조회 시 선택 초기화(참조 불일치 방지)
    // group 미지정 조회일 때 group 셀렉트 옵션 갱신(전체 집합 유지)
    if (!group.value) groupOptions.value = [...new Set(rows.value.map((r) => r.group).filter(Boolean))].sort()
  } catch (err: any) {
    rows.value = []
    errorMsg.value = err?.data?.error || err?.message || '조회 실패'
  } finally {
    loading.value = false
  }
}
watch([competitionID, gender, group], load)

// ── 상세 드로어 (읽기전용): 선수 + 팀통계 + times별 기록 비교 ──
const selected = ref<any | null>(null)
const open = ref(false)
const teamStats = ref<{ athletes: number; times: number } | null>(null)
const teamData = ref<any>(null) // 소속팀 성적 { total, events }(선수 출전종목 coarse/fine)
const recordsByEvent = ref<Record<string, any[]>>({})
const pbByEvent = ref<Record<string, any>>({})
const athleteImages = ref<{ type: string; url: string; thumbnail?: string; filename?: string }[]>([])
const eventStats = ref<{ events: Record<string, any>; heats: any[] }>({ events: {}, heats: [] })

// 선수 상세 데이터 로드 (drawer 표시·배치 LLM생성 공용) — refs(selected/eventStats/teamData/records/pb/images) 채움
const loadAthleteData = async (r: any) => {
  selected.value = r
  teamStats.value = null; teamData.value = null; recordsByEvent.value = {}; pbByEvent.value = {}; activeTab.value = 0; genJson.value = ''; note.value = ''
  athleteImages.value = []
  eventStats.value = { events: {}, heats: [] }
  // 선수 이미지 (images 컬렉션: name·gender·team·ageGroup 매칭)
  try {
    athleteImages.value = await $fetch(api('/images'), { params: { name: r.name, gender: r.gender, team: r.team, ageGroup: r.ageGroup } })
  } catch {}
  // 종목·heat 통계 (선택 대회 기준)
  if (competitionID.value) {
    try {
      eventStats.value = await $fetch(api('/event-stats'), { params: { competitionID: competitionID.value, name: r.name, team: r.team } })
    } catch {}
  }
  // 저장분(SP.athletes) 있으면 llm(생성기사)·note 표시
  try {
    const saved = await $fetch<any>(api('/saved'), { params: { name: r.name, gender: r.gender, group: r.group } })
    if (saved) { genJson.value = saved.llm || ''; note.value = saved.note || '' }
  } catch {}
  if (r.team) {
    try { teamStats.value = await $fetch(api('/team-stats'), { params: { team: r.team, competitionID: competitionID.value || undefined } }) } catch {}
    // 소속팀의 대회 성적 — 팀 합계 + 선수 출전종목(coarse/fine). payload 포함용
    if (competitionID.value) {
      try { teamData.value = await $fetch<any>(api('/competition-teams'), { params: { competitionID: competitionID.value, team: r.team, name: r.name } }) } catch {}
    }
  }
  // 종목(영법·거리·코스)별로 기록·PB 1회씩 조회
  const seen: Record<string, any> = {}
  for (const t of (r.times || [])) { const k = evKey(t); if (k && !seen[k]) seen[k] = t }
  for (const k of Object.keys(seen)) {
    const t = seen[k]
    try {
      const recs = await $fetch<any[]>(api('/records'), { params: { discipline: t.discipline, distance: t.distance, course: t.course } })
      recordsByEvent.value = { ...recordsByEvent.value, [k]: recs }
    } catch {}
    try {
      const pb = await $fetch<any>(api('/pb'), { params: { name: r.name, gender: r.gender, group: r.group, discipline: t.discipline, distance: t.distance, course: t.course } })
      pbByEvent.value = { ...pbByEvent.value, [k]: pb }
    } catch {}
  }
}
const openRow = async (r: any) => {
  open.value = true
  await loadAthleteData(r)
}
// 기록 탭 (종목별) — timeStamp 빠른순
const timeTabs = computed<any[]>(() => (selected.value?.times || []).slice().sort((a: any, b: any) => (a.timeStamp || Infinity) - (b.timeStamp || Infinity)))
const activeTab = ref(0)
const ROUND_KO: Record<string, string> = { preliminaries: '예선', finals: '결선', semiFinals: '준결선' }
// 라운드가 있으면 "자유형 50M 예선"처럼 표기
const tabLabel = (t: any) => [disc(t.discipline), t.distance, ROUND_KO[t.round]].filter(Boolean).join(' ')
// 상세 정보 2열 행: [성별|그룹] · [부|시도] · [heat|round] (heat/round 는 활성 기록 탭 기준)
const infoRows = computed<[string, any][][]>(() => {
  const r = selected.value
  if (!r) return []
  const t: any = timeTabs.value[activeTab.value] || {}
  return [
    [['성별', genderLabel(r.gender)], ['그룹', r.group]],
    [['부', r.ageGroup], ['시도', r.sido]],
    [['heat', t.heat], ['round', ROUND_KO[t.round] || t.round]],
  ]
})
// disciplines [{discipline,count}] → "자유형 539 · 평영 367 …"
const fmtDisciplines = (d: any) => Array.isArray(d) ? d.map((x) => `${disc(x.discipline)} ${x.startCount ?? x.count}`).join(' · ') : ''
// 기록 비교표(구분·기록·차이·비고) — time 하나 기준
const isNation = (s: any) => /^[A-Z]{2,3}$/.test(String(s || ''))
const recNote = (r: any) => (r ? `${r.name || ''}${isNation(r.team) ? ` (${r.team})` : ''} · ${String(r.datetime || '').slice(0, 4)}` : '')
const compRows = (t: any) => {
  const recs = recordsByEvent.value[evKey(t)] || []
  const g = selected.value?.gender || 'women'
  // 같은 종류(예: 마스터즈)가 여러 개면 가장 빠른(대표) 기록 선택
  const pick = (type: string, gd: string) => recs
    .filter((r) => r.type === type && r.gender === gd)
    .sort((a, b) => (a.timeStamp ?? Infinity) - (b.timeStamp ?? Infinity))[0]
  const row = (label: string, r: any) => ({ label, time: r ? fmtRec(r.time) : '—', diff: r ? fmtDiff(t.timeStamp, r.timeStamp) : '', note: recNote(r) })
  // PB(개인 최고기록) — BR.mergedTimes 최고기록.
  // 이번 대회가 PB면 이번 대회 차이에 'PB' 표시하고 별도 PB 행은 생략. 아니면 과거 PB 행 표시.
  const pb = pbByEvent.value[evKey(t)]
  const isPB = !!(pb && pb.timeStamp != null && t.timeStamp != null && Math.abs(t.timeStamp - pb.timeStamp) < 1e-9)
  const pbRow = (pb && !isPB)
    ? { label: 'PB', time: fmtRec(pb.time), diff: fmtDiff(t.timeStamp, pb.timeStamp), note: `${pb.competitionName || ''}${pb.datetime ? ` (${String(pb.datetime).slice(0, 4)})` : ''}` }
    : null
  return [
    { label: '이번 대회', time: fmtRec(t.time), diff: isPB ? 'PB' : '', note: `${selected.value?.name || ''}${selected.value?.ageGroup ? ' · ' + selected.value.ageGroup : ''}${(t.eventRank ?? t.rank) != null ? ' ' + (t.eventRank ?? t.rank) + '위' : ''}` },
    ...(pbRow ? [pbRow] : []),
    row('세계기록', pick('WR', g)),
    row('올림픽기록', pick('OR', g)),
    row('한국기록(여)', pick('KR', 'women')),
    row('한국기록(남)', pick('KR', 'men')),
    row('세계마스터즈기록', pick('WMR', g)),
    row('한국마스터즈기록', pick('KMR', g)),
  ]
}

// ── 선수추가 드로어 (DetailDrawer, 편집) ──
const addOpen = ref(false)
const blankAthlete = () => ({ name: '', gender: '', group: '', ageGroup: '', team: '', sido: '', discipline: '', distance: '', course: 'LCM', time: '', rank: null as number | null })
const addFields: Field[] = [
  { key: 'name', label: '선수명', get: (r) => r.name ?? '', set: (r, v) => { r.name = v } },
  { key: 'gender', label: '성별', type: 'select', options: ['', 'men', 'women', 'mixed'], get: (r) => r.gender ?? '', set: (r, v) => { r.gender = v } },
  { key: 'group', label: 'group', get: (r) => r.group ?? '', set: (r, v) => { r.group = v } },
  { key: 'ageGroup', label: 'ageGroup', get: (r) => r.ageGroup ?? '', set: (r, v) => { r.ageGroup = v } },
  { key: 'team', label: '팀', get: (r) => r.team ?? '', set: (r, v) => { r.team = v } },
  { key: 'sido', label: '시도', get: (r) => r.sido ?? '', set: (r, v) => { r.sido = v } },
  { key: 'discipline', label: '영법', type: 'select', options: DISCIPLINES, get: (r) => r.discipline ?? '', set: (r, v) => { r.discipline = v } },
  { key: 'distance', label: '거리', type: 'select', options: DISTANCES, get: (r) => r.distance ?? '', set: (r, v) => { r.distance = v } },
  { key: 'course', label: '코스', type: 'select', options: ['LCM', 'SCM'], get: (r) => r.course ?? '', set: (r, v) => { r.course = v } },
  { key: 'time', label: '기록', get: (r) => r.time ?? '', set: (r, v) => { r.time = v } },
  { key: 'rank', label: '순위', get: (r) => r.rank ?? '', set: (r, v) => { r.rank = (v === '' || v == null) ? null : Number(v) } },
]
const addSelected = ref<Record<string, any>>(blankAthlete())
const openAdd = () => { addSelected.value = blankAthlete(); addOpen.value = true }
const onAddSave = async (form: Record<string, any>) => {
  const base: Record<string, any> = blankAthlete()
  for (const f of addFields) f.set(base, form[f.key])
  if (!base.name) { alert('선수명을 입력하세요.'); return }
  try {
    await $fetch(api(), {
      method: 'POST',
      body: {
        name: base.name, gender: base.gender, group: base.group, ageGroup: base.ageGroup, team: base.team, sido: base.sido,
        competitionID: competitionID.value || undefined,
        times: [{ discipline: base.discipline, distance: base.distance, course: base.course, time: base.time, rank: base.rank }],
      },
    })
    addOpen.value = false
    notice.value = '선수 추가됨'
    await load()
  } catch (err: any) {
    alert('저장 실패: ' + (err?.data?.error || err?.message || ''))
  }
}

// ── 기사 LLM 생성 ──
const genLoading = ref(false)
const genJson = ref('')
const note = ref('') // LLM 참고 메모 (payload 에 포함)
// 드로어에 표시된 내용(선수·팀통계·종목별 기록 비교)을 그대로 JSON payload 로 구성 (LLM 입력)
const buildPayload = () => {
  const a = selected.value
  if (!a) return null
  const events = timeTabs.value.map((t) => {
    const st = eventStats.value.events[`${t.discipline}|${t.distance}|${t.course}`] || {}
    return {
      discipline: disc(t.discipline),
      distance: t.distance || '',
      course: t.course || '',
      time: fmtRec(t.time),
      rank: t.eventRank ?? t.rank,   // 종목순위(eventRank) 우선, 없으면 heat 순위
      athleteCount: st.athleteCount ?? null,   // 종목 전체 출전 선수수
      startCount: st.startCount ?? null,       // 종목 전체 완주 기록수
      best: st.best || null,                   // round 무관 최고기록 {name,team,time,diff}
      gold: st.gold || null,                   // 결승 1등 (결승 없으면 best 와 동일)
      team: st.team || null,                   // 이 종목 선수 소속팀 성적
      records: compRows(t)
        .filter((cr) => cr.label !== '이번 대회')
        .map((cr) => ({ category: cr.label, time: cr.time, diff: cr.diff, holder: cr.note })),
    }
  })
  // 대회 정보는 필터에서 "선택한 대회" 기준. (competitionInfo·poolInfo 에 담음)
  const c = selectedComp.value
  return {
    athlete: { name: a.name, gender: genderLabel(a.gender), group: a.group, ageGroup: a.ageGroup, team: a.team, sido: a.sido },
    note: note.value || '',
    images: athleteImages.value.map((im: any) => ({ type: im.type, url: im.path ?? im.url })),
    events,
    // 선수가 뛴 heat 의 전체 출전선수·start (성별·영법 한글)
    heats: (eventStats.value.heats || []).map((h: any) => ({
      gender: genderLabel(h.gender), discipline: disc(h.discipline), distance: h.distance,
      ageGroup: h.ageGroup, round: h.round || '', heat: h.heat || '',
      athleteCount: h.athleteCount, startCount: h.startCount,
    })),
    competitionInfo: c ? {
      competitionName: c.competitionName || '',
      sido: c.sido || '',
      date: c.datetime || '',
      teamCount: c.teamCount ?? null,
      athleteCount: c.athleteCount ?? null,
      startCount: c.startCount ?? null,
      disciplines: c.disciplines || [],
      notesCompetition: c.notesCompetition || '',
      notesParking: c.notesParking || '',
      notesWeather: c.notesWeather || '',
      quotesCompetition: c.quotesCompetition || '',
      quotesParking: c.quotesParking || '',
      quotesWeather: c.quotesWeather || '',
    } : null,
    poolInfo: c ? { pool: c.pool || '', notesPool: c.notesPool || '', quotesPool: c.quotesPool || '' } : null,
    // 소속팀의 이 대회 성적 — 팀 합계 + 영법별 집계(종목별 성적은 events[].team 으로 이동)
    teamInfo: teamData.value?.total ? {
      team: a.team,
      athleteCount: teamData.value.total.athleteCount,
      startCount: teamData.value.total.startCount,
      goldCount: teamData.value.total.goldCount,
      silverCount: teamData.value.total.silverCount,
      bronzeCount: teamData.value.total.bronzeCount,
      // 팀 영법별 집계 (계영 포함) — [{ discipline, count }]
      disciplines: teamData.value.disciplines || [],
    } : null,
  }
}
const generateArticle = async () => {
  const payload = buildPayload()
  if (!payload) return
  genLoading.value = true; genJson.value = ''
  try {
    const r = await $fetch<any>(api('/generate-article'), { method: 'POST', body: { data: payload } })
    genJson.value = r.content || ''
    notice.value = r.finishReason === 'length'
      ? `⚠ 응답이 토큰 한도로 잘렸습니다(출력 ${r.usage?.completion_tokens ?? '?'} 토큰). NVIDIA_MAX_TOKENS를 올리거나 스키마를 줄이세요.`
      : `기사 생성 완료${r.usage ? ` (출력 ${r.usage.completion_tokens} 토큰)` : ''}`
  } catch (err: any) {
    genJson.value = '생성 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    genLoading.value = false
  }
}
// 클립보드 복사 — HTTPS/localhost 는 Clipboard API, HTTP(비보안) 는 execCommand 폴백.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// LLM 에 넘겨줄 선수 기록 JSON 을 클립보드에 복사
const copyPayload = async () => {
  const payload = buildPayload()
  if (!payload) return
  if (await copyText(JSON.stringify(payload, null, 2))) {
    notice.value = 'JSON 복사됨 (클립보드)'
  } else {
    alert('복사 실패: 클립보드 접근 권한을 확인하세요.')
  }
}

// ── 드로어 저장 — json(소스 payload)+llm(생성 기사)+note 를 SP.athletes 에 upsert ──
const saving = ref(false)
const saveAthlete = async () => {
  const a = selected.value
  if (!a) return
  saving.value = true
  try {
    await $fetch(api('/save'), {
      method: 'POST',
      body: { name: a.name, gender: a.gender, group: a.group, ageGroup: a.ageGroup, team: a.team, competitionID: competitionID.value || null, json: buildPayload(), llm: genJson.value, note: note.value },
    })
    notice.value = `저장됨 — ${a.name}`
  } catch (err: any) {
    alert('저장 실패: ' + (err?.data?.error || err?.message || ''))
  } finally {
    saving.value = false
  }
}

// ── 배치 LLM생성 — 체크된 선수들을 드로어의 '기사LLM생성 + 저장'과 동일하게 순차 처리 ──
const batchLoading = ref(false)
const batchProgress = ref('')
const generateSelected = async () => {
  const targets = [...selectedRows.value]
  if (!targets.length) { alert('선택된 선수가 없습니다.'); return }
  if (!competitionID.value) { alert('대회를 먼저 선택하세요. (종목·팀 통계에 필요)'); return }
  if (!confirm(`선택한 ${targets.length}명의 기사를 LLM으로 생성하고 articles에 저장합니다. 계속할까요?`)) return
  batchLoading.value = true; notice.value = ''; errorMsg.value = ''
  let ok = 0, fail = 0
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i]
    batchProgress.value = `${i + 1}/${targets.length} · ${r.name}`
    try {
      await loadAthleteData(r)                     // 드로어와 동일한 소스 데이터 로드
      const payload = buildPayload()
      if (!payload) { fail++; continue }
      const gen = await $fetch<any>(api('/generate-article'), { method: 'POST', body: { data: payload } })
      const content = gen?.content || ''
      if (!content) { fail++; continue }
      // 드로어 저장과 동일 — genJson(content) 을 articles 에 upsert
      await $fetch(api('/save'), {
        method: 'POST',
        body: { name: r.name, gender: r.gender, group: r.group, ageGroup: r.ageGroup, team: r.team, competitionID: competitionID.value || null, json: payload, llm: content, note: '' },
      })
      ok++
    } catch { fail++ }
  }
  batchLoading.value = false; batchProgress.value = ''
  notice.value = `LLM 생성·저장 완료 — 성공 ${ok}${fail ? ` · 실패 ${fail}` : ''}`
  selectedRows.value = []
  await load()                                     // hasArticle(기사) 갱신
}

// ── "my" — name·gender 로 myranking.co.kr 크롤링 → SP.myTimes upsert ──
const myLoading = ref(false)
const fetchMy = async () => {
  const a = selected.value
  if (!a) return
  myLoading.value = true; notice.value = ''
  try {
    const r = await $fetch<any>(api('/my'), { method: 'POST', body: { name: a.name, gender: a.gender } })
    notice.value = `my 저장 — 조회 ${r.matched}건 · 신규 ${r.upserted} · 갱신 ${r.modified}`
  } catch (err: any) {
    notice.value = 'my 실패: ' + (err?.data?.error || err?.message || '')
  } finally {
    myLoading.value = false
  }
}

// ── 목록 전체 순차 myranking 조회 (선수명 + 성별) → myTimes upsert ──
const myAllLoading = ref(false)
const myAllProgress = ref('')
const fetchMyAll = async () => {
  // 이미 my기록(myTimesCount>0)이 있는 선수는 제외
  const list = rows.value.filter((a) => !(a.myTimesCount > 0))
  if (!list.length) { notice.value = 'my 조회 대상이 없습니다 (목록의 선수가 모두 이미 조회됨).'; return }
  if (!confirm(`my기록이 없는 ${list.length}명을 순차적으로 myranking 조회합니다. 오래 걸릴 수 있습니다. 진행할까요?`)) return
  myAllLoading.value = true
  let ok = 0
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    myAllProgress.value = `${i + 1}/${list.length} — ${a.name}`
    try { await $fetch(api('/my'), { method: 'POST', body: { name: a.name, gender: a.gender } }); ok++ } catch {}
  }
  myAllLoading.value = false
  myAllProgress.value = ''
  notice.value = `my 일괄 조회 완료 — 성공 ${ok}/${list.length}명`
  await load()
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }
onMounted(async () => {
  await loadCompetitions()
  // 전체를 조회하지 않고 대회 select 의 첫 대회를 선택 → 해당 대회 기록만 조회
  // (competitionID 변경 시 watch 가 load 를 호출)
  if (competitions.value.length) competitionID.value = competitions.value[0].competitionID
  else await load()
})
</script>

<template>
  <div>
    <!-- 툴바: 필터 + 액션 -->
    <div class="toolbar">
      <select v-model="competitionID" class="filter-select filter-comp" aria-label="대회">
        <option value="">대회 전체</option>
        <option v-for="c in competitions" :key="c.competitionID" :value="c.competitionID">
          {{ c.competitionName }}<span v-if="c.datetime"> ({{ c.datetime }})</span>
        </option>
      </select>
      <select v-model="gender" class="filter-select" aria-label="성별">
        <option v-for="g in GENDERS" :key="g.v" :value="g.v">{{ g.l }}</option>
      </select>
      <select v-model="group" class="filter-select" aria-label="group">
        <option value="">group 전체</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
      </select>
      <select v-model="articleFilter" class="filter-select" aria-label="기사 작성 여부">
        <option value="">전체</option>
        <option value="has">기사작성</option>
        <option value="none">기사미작성</option>
      </select>
      <input v-model="name" class="filter-input filter-name" type="search" placeholder="선수명 검색…" @keydown.enter="load">
      <button class="btn btn-ghost" type="button" @click="load">검색</button>
      <button class="btn btn-primary" type="button" :disabled="batchLoading || !selectedRows.length" @click="generateSelected">
        {{ batchLoading ? `LLM 생성 중… ${batchProgress}` : `LLM생성${selectedRows.length ? ` (${selectedRows.length})` : ''}` }}
      </button>
      <span class="t-spacer" />
      <button class="btn btn-primary" type="button" @click="openAdd">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        선수추가
      </button>
      <button class="btn btn-ghost" type="button" :disabled="myAllLoading" @click="fetchMyAll">
        {{ myAllLoading ? 'my 조회 중…' : 'my' }}
      </button>
    </div>

    <p v-if="errorMsg" class="load-error">{{ errorMsg }}</p>
    <p v-if="myAllLoading" class="notice">my 일괄 조회 중… {{ myAllProgress }}</p>
    <p v-else-if="notice" class="notice">{{ notice }}</p>
    <p v-if="batchLoading" class="notice">LLM 생성·저장 중… {{ batchProgress }}</p>
    <p v-if="!loading" class="result-note">총 {{ viewRows.length }}명<span v-if="selectedRows.length"> · 선택 {{ selectedRows.length }}</span></p>

    <DataTable
      :columns="columns" :rows="viewRows" clickable hide-search hide-actions selectable
      :selected="selectedRows" @update:selected="selectedRows = $event" @row-click="openRow"
    />

    <!-- 상세 드로어 (읽기전용): 선수 + times -->
    <div class="drawer-root" :class="{ open }" @keydown="onKey">
      <div class="drawer-ov" @click="open = false" />
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="선수 상세">
        <header class="drawer-head">
          <h2>{{ selected?.name || '선수' }}</h2>
          <button class="drawer-x" aria-label="닫기" @click="open = false">×</button>
        </header>
        <div class="drawer-body">
          <div v-for="(row, ri) in infoRows" :key="ri" class="info-duo">
            <div v-for="(cell, ci) in row" :key="ci" class="detail-cell">
              <span class="detail-k">{{ cell[0] }}</span><span class="detail-v">{{ (cell[1] ?? '') === '' ? '-' : cell[1] }}</span>
            </div>
          </div>
          <div class="info-duo">
            <div class="detail-cell">
              <span class="detail-k">팀</span>
              <span class="detail-v team-v">{{ selected?.team || '-' }}<span v-if="teamStats" class="team-stat"> (선수 {{ teamStats.athletes }} · 기록 {{ teamStats.times }})</span></span>
            </div>
            <div class="detail-cell">
              <span class="detail-k">수영장</span>
              <span class="detail-v">{{ (timeTabs[activeTab]?.pool || selectedComp?.pool) || '-' }}</span>
            </div>
          </div>

          <!-- 대회 정보 (선택된 대회) -->
          <div v-if="selectedComp" class="comp-block">
            <div class="comp-title">
              {{ selectedComp.competitionName }}<span v-if="selectedComp.datetime" class="comp-date"> / {{ selectedComp.datetime }}</span>
            </div>
            <div class="comp-counts">
              <span>팀 <b>{{ selectedComp.teamCount ?? '-' }}</b></span>
              <span>선수 <b>{{ selectedComp.athleteCount ?? '-' }}</b></span>
              <span>start <b>{{ selectedComp.startCount ?? '-' }}</b></span>
            </div>
            <div v-if="fmtDisciplines(selectedComp.disciplines)" class="comp-disc">{{ fmtDisciplines(selectedComp.disciplines) }}</div>
          </div>

          <!-- 선수 이미지 (images 컬렉션) -->
          <div v-if="athleteImages.length" class="ath-images">
            <a v-for="(im, i) in athleteImages" :key="i" class="ath-img" :href="im.url" target="_blank" rel="noopener">
              <img :src="im.thumbnail || im.url" alt="">
              <span v-if="im.type" class="ath-img-type">{{ im.type }}</span>
            </a>
          </div>

          <div class="times-head">기록 ({{ timeTabs.length }})</div>
          <div v-if="timeTabs.length" class="rec-tabs">
            <button
              v-for="(t, i) in timeTabs" :key="i" type="button"
              class="rec-tab" :class="{ active: activeTab === i }" @click="activeTab = i"
            >{{ tabLabel(t) }}</button>
          </div>
          <div v-if="timeTabs[activeTab]" class="event-block">
            <table class="comp-table">
              <thead><tr><th>구분</th><th>기록</th><th class="num">차이</th><th>비고</th></tr></thead>
              <tbody>
                <tr v-for="(cr, j) in compRows(timeTabs[activeTab])" :key="j" :class="{ own: cr.label === '이번 대회', pbrow: cr.label === 'PB' }">
                  <td class="cat">{{ cr.label }}</td>
                  <td class="mono">{{ cr.time }}</td>
                  <td class="num diff" :class="{ 'is-pb': cr.diff === 'PB' }">{{ cr.diff }}</td>
                  <td class="muted">{{ cr.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-block">기록 없음</p>

          <!-- 기사 LLM 생성 -->
          <div class="gen-section">
            <div class="gen-actions">
              <button class="btn btn-primary" type="button" :disabled="genLoading" @click="generateArticle">
                {{ genLoading ? '생성 중…' : '기사LLM생성' }}
              </button>
              <button class="btn btn-ghost" type="button" :disabled="!timeTabs.length" @click="copyPayload">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                JSON 복사
              </button>
            </div>
            <div class="gen-cols">
              <textarea v-model="genJson" class="gen-json" rows="10" spellcheck="false" placeholder="기사 LLM 생성 JSON…" />
              <textarea v-model="note" class="gen-json" rows="10" spellcheck="false" placeholder="note (LLM 참고 메모)…" />
            </div>
          </div>
        </div>
        <footer class="drawer-foot">
          <button class="btn btn-ghost my-btn" type="button" :disabled="myLoading" @click="fetchMy">
            {{ myLoading ? 'my 조회 중…' : 'my' }}
          </button>
          <button class="btn btn-primary" type="button" :disabled="saving || !selected" @click="saveAthlete">
            {{ saving ? '저장 중…' : '저장' }}
          </button>
          <button class="btn btn-ghost" type="button" @click="open = false">닫기</button>
        </footer>
      </aside>
    </div>

    <!-- 선수추가 드로어 -->
    <DetailDrawer
      :open="addOpen" title="선수 추가" :fields="addFields" :row="addSelected"
      @close="addOpen = false" @save="onAddSave"
    />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.t-spacer { flex: 1 1 auto; }
.filter-select {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px; cursor: pointer;
}
.filter-comp { flex: 0 1 340px; max-width: 340px; }
.filter-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px;
}
.filter-name { flex: 0 1 200px; }
.filter-input:focus, .filter-select:focus { outline: none; border-color: var(--orange); }

.load-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
.notice { margin-bottom: 12px; padding: 10px 14px; border-radius: 6px; background: var(--good-bg); color: var(--good); font-size: 13px; }
.result-note { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 12px; }

/* 읽기전용 드로어 */
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov { position: absolute; inset: 0; background: rgba(26,26,26,.34); opacity: 0; transition: opacity .22s ease; }
.drawer {
  position: absolute; top: 0; right: 0; height: 100%; width: min(760px, 96vw);
  background: var(--paper); border-left: 1px solid var(--line); box-shadow: -18px 0 50px rgba(26,26,26,.12);
  display: flex; flex-direction: column; transform: translateX(100%); transition: transform .26s cubic-bezier(.4,0,.2,1);
}
.drawer-root.open { pointer-events: auto; }
.drawer-root.open .drawer-ov { opacity: 1; }
.drawer-root.open .drawer { transform: translateX(0); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.drawer-head h2 { font-size: 17px; font-weight: 700; color: var(--ink); }
.drawer-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.drawer-x:hover { color: var(--ink); }
.drawer-body { flex: 1; overflow-y: auto; padding: 12px 22px 20px; }
.detail-row { display: flex; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.detail-k { flex: 0 0 92px; font-size: 12px; font-weight: 700; color: var(--ink-mute); }
.detail-v { flex: 1; font-size: 13.5px; color: var(--ink); }
.team-stat { color: var(--ink-mute); font-size: 12px; }
/* 2열 정보 행 (성별|그룹, 부|시도, heat|round) */
.info-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.detail-cell { display: flex; gap: 10px; min-width: 0; }
.detail-cell .detail-k { flex: 0 0 52px; }
.detail-cell .detail-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-cell .detail-v.team-v { white-space: normal; overflow: visible; }
/* 대회 정보 블록 */
.comp-block { margin: 14px 0 4px; padding: 12px 14px; background: var(--paper-deep); border-radius: 8px; }
.comp-title { font-size: 13.5px; font-weight: 700; color: var(--ink); }
.comp-title .comp-date { font-weight: 500; color: var(--ink-mute); }
.comp-counts { margin-top: 8px; display: flex; gap: 14px; font-size: 12.5px; color: var(--ink-mute); }
.comp-counts b { color: var(--ink); font-weight: 800; font-variant-numeric: tabular-nums; }
.comp-disc { margin-top: 8px; font-size: 12px; color: var(--ink-mute); line-height: 1.6; }

/* 선수 이미지 스트립 */
.ath-images { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
.ath-img { position: relative; width: 92px; height: 68px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); background: var(--paper-deep); }
.ath-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ath-img-type { position: absolute; left: 0; bottom: 0; padding: 1px 5px; font-size: 10px; font-weight: 700; color: #fff; background: rgba(26, 26, 26, .66); border-top-right-radius: 4px; }
.times-head { font-size: 12px; font-weight: 700; color: var(--ink-mute); margin: 18px 0 4px; }
.rec-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
.rec-tab { font-family: var(--sans); font-size: 12.5px; color: var(--ink-mute); background: var(--paper-deep); border: 1px solid transparent; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.rec-tab:hover { color: var(--ink); }
.rec-tab.active { color: #fff; background: var(--orange); }
.event-block { margin-bottom: 14px; }
.comp-table { width: 100%; border-collapse: collapse; }
.comp-table th { text-align: left; font-size: 11px; font-weight: 700; color: var(--ink-light); padding: 5px 8px; border-bottom: 1px solid var(--line); }
.comp-table th.num { text-align: right; }
.comp-table td { font-size: 12.5px; color: var(--ink); padding: 6px 8px; border-bottom: 1px solid var(--line-soft); }
.comp-table td.num { text-align: right; }
.comp-table td.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.comp-table td.diff { font-family: var(--mono); color: var(--ink-mute); font-size: 11.5px; }
.comp-table td.muted { color: var(--ink-light); font-size: 11.5px; }
.comp-table td.cat { font-weight: 500; white-space: nowrap; }
.comp-table tr.own { background: var(--orange-bg); }
.comp-table tr.own td { color: var(--ink); font-weight: 700; }
.comp-table tr.own td.muted { font-weight: 500; color: var(--ink-mute); }
.comp-table tr.pbrow td.cat { color: var(--orange-deep); font-weight: 700; }
.comp-table td.is-pb { color: var(--orange); font-weight: 700; }
.empty-block { color: var(--ink-light); font-size: 13px; padding: 12px 0; }

.gen-section { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line); }
.gen-actions { display: flex; gap: 8px; align-items: center; }
.gen-actions .btn svg { width: 15px; height: 15px; }
.gen-cols { display: flex; gap: 10px; margin-top: 10px; }
.gen-cols .gen-json { flex: 1; margin-top: 0; min-width: 0; }
.gen-json { width: 100%; margin-top: 10px; font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--ink); background: var(--paper-deep); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; resize: vertical; }
.gen-json:focus { outline: none; border-color: var(--orange); background: var(--paper); }
.drawer-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--line); }
.drawer-foot .my-btn { margin-right: auto; }
</style>
