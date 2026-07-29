// 하이브리드 기사 조립 (athletes1 전용).
// 원칙: 숫자·기록·통계·표는 sourceData 에서 '코드로 결정적' 생성(환각 0),
//       판단이 필요한 title·subtitle·lead·대회소개(①)·선수요약(②)만 LLM 이 생성.
import { callLLM } from './llm.js'

const STROKE = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const strokeKo = (d) => STROKE[d] || d
const comma = (n) => (n == null ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
const courseKo = (c) => (c === 'LCM' ? '장수로(LCM)' : c === 'SCM' ? '단수로(SCM)' : '')
const medalKo = (r) => (r === 1 ? '금메달' : r === 2 ? '은메달' : r === 3 ? '동메달' : '')

// 한글 받침 유무 → 조사 선택. josa('이강해','은','는')='이강해는', josa('CRS압구정','은','는')='CRS압구정은'
function hasBatchim(s) {
  const c = String(s || '').trim().slice(-1)
  const code = c.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return /[a-zA-Z0-9]/.test(c) ? true : false // 한글 아니면 영숫자는 받침 있음 취급
  return (code - 0xac00) % 28 !== 0
}
const josa = (w, withB, noB) => String(w || '') + (hasBatchim(w) ? withB : noB)

// "23초 78" · "1분 12초 65" → 초(number)
export function recToSec(s) {
  const m = String(s || '').match(/(?:(\d+)\s*분)?\s*(\d+)\s*초\s*(\d+)/)
  if (!m) return NaN
  return (+(m[1] || 0)) * 60 + (+m[2]) + (+('0.' + String(m[3]).padStart(2, '0')))
}
const diffDec = (a, b) => (Math.abs(a - b)).toFixed(2)

// M월 D일
function dateKo(d) {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${+m[2]}월 ${+m[3]}일` : ''
}

// 순위 표현 (prompt §6 통제어휘) — 한 기사에서 같은 표현 두 번 금지(로테이션).
const RANK_VOCAB = {
  1: ['가장 먼저 터치패드를 찍었다', '가장 먼저 벽을 찍었다', '선착했다', '우승을 차지했다', '정상에 올랐다', '가장 빠른 기록을 냈다'],
  2: ['2위로 터치패드를 찍었다', '은메달을 목에 걸었다', '2위에 올랐다'],
  3: ['3위로 터치패드를 찍었다', '동메달을 획득했다', '3위를 차지했다', '처음으로 시상대에 올랐다'],
}
function phrasePicker() {
  const used = new Set()
  return (rank) => {
    const list = RANK_VOCAB[rank] || [`${rank}위를 기록했다`, `${rank}위로 경기를 마쳤다`, `${rank}위에 자리했다`]
    const pick = (list.find((x) => !used.has(x)) || list[0])
    used.add(pick)
    return pick
  }
}

// 사진 type → 현재진행형 동작 (캡션 ①문장)
const ACTION = {
  ENTER: '수영장에 들어서고 있다', BLOCK: '출발대에 올라 레이스를 준비하고 있다',
  START: '출발 신호에 맞춰 물살을 가르기 시작했다', RACE: '힘차게 물살을 가르고 있다', TOUCHPAD: '터치패드를 찍고 있다',
}
// YYYY년 M월 D일
function dateLong(d) {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${+m[1]}년 ${+m[2]}월 ${+m[3]}일` : ''
}
// 선수 성적 요약 문장 (캡션 ②문장) — 메달 우선, 없으면 출전 사실
function achSummary(a, evs) {
  const medals = evs.filter((e) => medalKo(e.rank))
  if (medals.length) return `이날 ${josa(a.name, '은', '는')} ${medals.map((e) => `${e.discipline} ${e.distance} ${medalKo(e.rank)}`).join(', ')}을 수확했다.`
  if (evs.length) return `이날 ${josa(a.name, '은', '는')} ${evs.map((e) => `${e.discipline} ${e.distance}`).join('·')}에 출전했다.`
  return ''
}

// ── 결정적 블록(③ 종목 · ④ 팀 · ⑦ 대회) 생성 ──
function deterministicBlocks(data) {
  const a = data.athlete || {}
  const comp = data.competitionInfo || {}
  const team = data.teamInfo || {}
  const heats = data.heats || []
  const evs = (data.events || []).slice().sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
  const blocks = []
  const pick = phrasePicker()

  // ③ 종목별 result → event → record → recordTable (성적순)
  evs.forEach((e, idx) => {
    const evName = `${a.gender || ''} ${e.discipline} ${e.distance}`.trim()
    const heat = heats.find((h) => h.discipline === e.discipline && h.distance === e.distance) || {}
    // result
    let rt = `${josa(a.name, '은', '는')} ${evName}${heat.heat ? ` ${heat.heat}경기` : ''}에서 ${e.time}로 ${pick(e.rank)}.`
    if (heat.athleteCount) rt += ` 이 경기에는 ${heat.athleteCount}명이 배정돼 전원이 출발대에 섰다.`
    // 소제목: 첫 종목만. 4위 이하는 순위 빼고 기록만 (prompt §5).
    const title = `${e.discipline} ${e.distance} ${e.time}${e.rank <= 3 ? ', ' + medalKo(e.rank) : ''}`
    blocks.push({ type: 'event', source: 'result', ...(idx === 0 ? { title } : {}), text: rt })
    // event (종목 전체)
    if (e.athleteCount != null) {
      let t = `${evName}에는 ${comma(e.athleteCount)}명이 출전해 ${comma(e.startCount)}건의 도약이 이뤄졌다.`
      if (e.rank === 1) t += ` ${a.name}의 ${e.time}은 이 종목 전체 1위 기록이다.`
      else if (e.best && e.best.time) t += ` 전체 1위는 ${e.best.name || ''}의 ${e.best.time}이었다.`
      blocks.push({ type: 'event', source: 'event', text: t })
    }
    // record (기준 기록 비교 — diff 는 time 으로 재계산해 검증)
    const recs = (e.records || []).filter((r) => r.time && r.time !== '—')
    if (recs.length) {
      const mySec = recToSec(e.time)
      const parts = recs.slice(0, 3).map((r) => {
        const rs = recToSec(r.time)
        const d = Number.isFinite(rs) && Number.isFinite(mySec) ? diffDec(mySec, rs) : null
        return `${r.category} ${r.time}${d != null ? `와 ${d}초 차이` : ''}`
      })
      if (parts.length) blocks.push({ type: 'event', source: 'record', text: `${a.name}의 ${e.time}은 ${parts.join(', ')}다.` })
    }
    // recordTable (원본 records 전부, — 포함)
    if ((e.records || []).length) {
      blocks.push({
        type: 'recordTable', caption: `${evName} 주요 기록 비교`,
        rows: [
          { segment: '이번 대회', record: e.time, note: `${a.name} · ${a.ageGroup || ''} · ${e.rank}위` },
          ...(e.records || []).map((r) => ({ segment: r.category, record: r.time, note: r.holder || '' })),
        ],
      })
    }
  })

  // ④ 팀
  if (team && team.team) {
    const total = (team.goldCount || 0) + (team.silverCount || 0) + (team.bronzeCount || 0)
    const med = []
    if (team.goldCount) med.push(`금메달 ${team.goldCount}개`)
    if (team.silverCount) med.push(`은메달 ${team.silverCount}개`)
    if (team.bronzeCount) med.push(`동메달 ${team.bronzeCount}개`)
    let t = `${josa(a.name, '이', '가')} 속한 ${josa(team.team, '은', '는')} 이번 대회에 선수 ${comma(team.athleteCount)}명이 출전해 ${comma(team.startCount)}회의 도약을 기록했다.`
    if (med.length) t += ` 팀이 획득한 메달은 ${med.join(', ')}로 모두 ${total}개다.`
    blocks.push({ type: 'team', source: 'info', title: `${team.team}, 메달 ${total}개`, text: t })
    if ((team.disciplines || []).length) {
      const p = team.disciplines.map((d) => `${strokeKo(d.discipline)} ${d.count}회`)
      blocks.push({ type: 'team', source: 'events', text: `영법별 도약은 ${p.join(', ')}였다.` })
    }
  }

  // ⑦ 대회 규모
  if (comp && comp.competitionName) {
    if (comp.teamCount != null) {
      const dp = (comp.disciplines || []).map((d) => '△' + strokeKo(d.discipline)).join('')
      blocks.push({ type: 'competition', source: 'event', text: `이번 대회에는 전국 ${comma(comp.teamCount)}개 팀에서 ${comma(comp.athleteCount)}명이 출전해 개인 종목과 단체 종목을 합쳐 모두 ${comma(comp.startCount)}회의 도약이 이뤄졌다.${dp ? ` 종목은 ${dp}으로 구성됐다.` : ''}` })
    }
    const ds = comp.disciplines || []
    if (ds.length) {
      const byA = ds.filter((d) => d.athleteCount != null)
      const byS = ds.filter((d) => d.startCount != null)
      let t = ''
      if (byA.length) t += `영법별 참가자 수는 ${byA.map((d) => `${strokeKo(d.discipline)} ${comma(d.athleteCount)}명`).join(', ')}이었다.`
      if (byS.length) t += ` 도약 수로 보면 ${byS.map((d) => `${strokeKo(d.discipline)} ${comma(d.startCount)}회`).join(', ')}였다.`
      if (t) blocks.push({ type: 'competition', source: 'disciplines', text: t.trim() })
    }
  }
  return blocks
}

// ── 태그·슬러그·미디어(결정적) ──
function romanSlug(name) {
  const roman = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  if (roman) return roman
  return String(name || '').replace(/\s+/g, '') || 'athlete' // 한글 이름은 그대로(URL 인코딩됨)
}
function buildTags(data) {
  const a = data.athlete || {}
  const evs = data.events || []
  const team = data.teamInfo || {}
  const search = [a.name, team.team, data.competitionInfo?.competitionName, ...evs.map((e) => `${e.discipline} ${e.distance}`), a.sido].filter(Boolean)
  return [...new Set(search)]
}
function buildMedia(data) {
  const a = data.athlete || {}
  const pool = data.poolInfo?.pool || ''
  const dl = dateLong(data.competitionInfo?.date)
  const suffix = `사진=편집부 (@medalbankaquatics)${dl || pool ? ` / ${[dl, pool].filter(Boolean).join(' ')}` : ''}`
  const result = achSummary(a, (data.events || []).slice().sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99)))
  const imgs = (data.images || []).map((im) => {
    const action = ACTION[im.type] || '역영하고 있다'
    const caption = `${josa(a.name, '이', '가')} ${action}. ${result ? result + ' ' : ''}${suffix}`
    return {
      imageId: null, url: im.url || '', role: im.type === 'ENTER' ? 'venue' : 'race',
      photographer: '편집부', photographerEng: 'Editorial Team', email: 'press@medalbank.com',
      translations: { ko: { title: '', caption }, en: { title: '', caption: '' }, ja: { title: '', caption: '' } },
    }
  })
  const race = (data.images || []).find((im) => im.type === 'RACE') || (data.images || [])[0]
  return { thumb: race?.url || '', coverImage: race?.url || '', images: imgs }
}

// ── LLM: 판단 필드만 (title·subtitle·lead·① 대회소개·② 선수요약) ──
async function judgmentFields(data, { temperature = 0.4, maxTokens = 1200 } = {}) {
  const a = data.athlete || {}
  const comp = data.competitionInfo || {}
  const pool = data.poolInfo || {}
  const evs = (data.events || []).slice().sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
  const top = evs[0] || {}
  const facts = {
    선수: `${a.name}(${a.team || ''})`, 성별: a.gender, 부: a.ageGroup, 지역: a.sido,
    대회: comp.competitionName, 일자: dateKo(comp.date), 수영장: pool.pool,
    코스: courseKo(top.course), 출전종목: evs.map((e) => `${e.discipline} ${e.distance} ${e.time} ${e.rank}위`),
    note: data.note || '', notesCompetition: comp.notesCompetition || '', notesPool: pool.notesPool || '',
  }
  const sys = `너는 수영 전문 기자다. 아래 [사실]만 근거로 JSON을 출력한다. 숫자·기록·순위는 [사실] 그대로만 쓰고 창작 금지.
규칙: 제목 25자·부제 30자 이내, 물음표·느낌표·이모지·강조부사(매우·정말·너무)·감정어(충격·아쉽게도) 금지. 4위 이하는 제목에 순위 대신 기록/「역영」. notes 는 사실만 남기고 주체 없는 평가·감상은 버린다(예: "편리했다" 삭제, 사실 없으면 빈 문자열).
[출력 JSON] {"title":"","subtitle":"","excerpt":"리드 첫 문장 축약","lead":"【지역】 으로 시작하는 3~4문장, 누가·무엇·언제·기록","intro":"① 대회 명칭·일시·장소·코스·진행. 선수·통계·notes 언급 금지","summary":"② 선수 첫 등장·출전 종목 구성·코스·결과 요약. note(선수) 사실만 병합","sketch":"⑤⑥ notesCompetition·notesPool 의 사실만 1~2문장으로. 재료 없으면 빈 문자열"}`
  const user = `[사실]\n${JSON.stringify(facts, null, 2)}\n\n위 사실만으로 JSON만 출력.`
  const out = await callLLM({ system: sys, user, temperature, maxTokens })
  let j = {}
  try { j = JSON.parse((out.content || '').replace(/^```json\s*|\s*```$/g, '').trim()) } catch {}
  return { fields: j, usage: out.usage, finishReason: out.finishReason, provider: out.provider, model: out.model }
}

// ── 전체 조립: 결정적 블록 + LLM 판단 필드 → 전체 DB 문서(schema B) ──
export async function buildHybridArticle(data, opts = {}) {
  const a = data.athlete || {}
  const evs = (data.events || []).slice().sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
  const det = deterministicBlocks(data)
  const { fields, usage, finishReason, provider, model } = await judgmentFields(data, opts)

  // ⑤⑥ 대회·수영장 스케치(notes 정제) — team 뒤·⑦대회 앞에 삽입(재료 있을 때만)
  const sketch = String(fields.sketch || '').trim()
  if (sketch) {
    const ci = det.findIndex((b) => b.type === 'competition')
    const sb = { type: 'competition', source: 'sketch', text: sketch }
    if (ci >= 0) det.splice(ci, 0, sb); else det.push(sb)
  }

  const blocks = []
  if (fields.intro) blocks.push({ type: 'competition', source: 'info', text: fields.intro })
  if (fields.summary) blocks.push({ type: 'event', source: 'summary', text: fields.summary })
  blocks.push(...det)

  const dateISO = String(data.competitionInfo?.date || '').slice(0, 10)
  const content = {
    title: fields.title || '', subtitle: fields.subtitle || '', excerpt: fields.excerpt || '',
    lead: fields.lead || '', blocks, conclusion: '',
    categories: ['경기'], tags: buildTags(data),
    seoTitle: fields.title || '', seoDescription: fields.excerpt || '',
  }
  const doc = {
    slug: `article-${dateISO.replace(/-/g, '')}-${romanSlug(a.name)}`,
    type: 'article', status: 'draft', langDefault: 'ko', availableLangs: ['ko'],
    sourceType: 'ai_generated', generationJobId: null,
    reporter: { name: '편집부', nameEng: 'Editorial Team', email: 'press@medalbank.com' },
    relations: { competitionId: null, venueId: null, athleteId: null, teamId: null, timeIds: null, imageIds: null, startListIds: null },
    media: buildMedia(data),
    tags: [], searchTags: buildTags(data), searchCategories: ['meet', 'athlete', 'masters'],
    translations: {
      ko: { title: content.title, subtitle: content.subtitle, excerpt: content.excerpt, content, categories: ['경기'], tags: content.tags, seoTitle: content.seoTitle, seoDescription: content.seoDescription },
      en: { title: '', subTitle: '', excerpt: '', content: {}, categories: [], tags: [], seoTitle: '', seoDescription: '' },
      ja: { title: '', subTitle: '', excerpt: '', content: {}, categories: [], tags: [], seoTitle: '', seoDescription: '' },
    },
    editorial: { factChecked: false, reviewedBy: '', reviewMemo: 'ai_generated 하이브리드 초안(숫자·표는 코드, 문장은 LLM). 발행 전 확인.', riskLevel: /학생/.test(a.ageGroup || '') ? 'medium' : 'low' },
    visibility: { isFeatured: false, showInHome: true, showInSearch: true, showInAthleteProfile: true, showInTeamPage: true, showInCompetitionPage: true },
    permissions: { consentStatus: 'unknown', canShowAthleteName: true, canShowHighResPhoto: false },
    stats: { views: 0, uniqueViews: 0, likes: 0, shares: 0 },
    corrections: [], publishedAt: null, createdAt: null, updatedAt: null,
  }
  return { doc, meta: { blocks: blocks.length, deterministic: det.length, usage, finishReason, provider, model } }
}
