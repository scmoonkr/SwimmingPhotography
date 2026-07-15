// 선수(athletes) — SwimmingPhotography DB 의 times 를 선수별로 그룹핑한 뷰.
// 대회·성별·선수명으로 필터해 선수 목록(각 선수의 times[영법·기록·순위 등])을 반환. 수동 선수추가도 지원.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { SP, BR } from '../db.js'

const router = Router()
const coll = async () => (await SP()).collection('times')

// 표준기사 가이드라인(.md) — LLM 프롬프트용. 소형 모델이 전체 마크다운에 눌리므로
// 핵심 규칙(제목/리드/문체/표기)만 추려서 캐시. 파일이 있으면 §1~4의 불릿만 발췌.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RULES_FALLBACK = [
  '제목 25자·부제 30자 이내, 사실 중심. 물음표·느낌표·이모지·감정어·과장어(충격·대박·역대급) 금지.',
  '리드 첫 문장에 누가·무엇·언제(60자 이내), 이어서 대회·기록.',
  '문장은 짧고 능동형, 한 문장에 사실 하나. 「하였다→했다」·「되었다→됐다」 축약.',
  '인명 첫 등장 「이름 선수」, 이후 「성 선수」. 기록은 「33초 91」식 한글 표기. 종목은 「자유형 50m」. 순위는 「1위」.',
  '기록 비교는 데이터 records(세계·한국·마스터즈 기록과 차이)만 인용. 데이터에 없는 나이·소속·신기록·메달·우승은 쓰지 마라.',
  '1인칭(나·우리)·강조부사(매우·정말·너무)·추측(~로 보인다) 금지.',
].map((s) => '- ' + s).join('\n')
let RULES = null
const getRules = () => {
  if (RULES != null) return RULES
  try {
    const md = fs.readFileSync(path.resolve(__dirname, '../../../docs/html/표준 기사/표준기사-가이드라인.md'), 'utf8')
    // §1~4(제목·본문·문체·표기)의 불릿만 발췌해 압축 (소형 모델 대응)
    const lines = md.split('\n')
    const picked = []
    let on = false
    for (const ln of lines) {
      if (/^##\s*[1-4]\./.test(ln)) on = true
      else if (/^##\s/.test(ln)) on = false
      if (on && /^\s*-\s+\S/.test(ln)) picked.push(ln.trim())
    }
    RULES = picked.length ? picked.slice(0, 24).join('\n') : RULES_FALLBACK
  } catch { RULES = RULES_FALLBACK }
  return RULES
}

// 대회 select 옵션 (SP.competitions)
router.get('/competitions', async (req, res) => {
  try {
    const docs = await (await SP()).collection('competitions')
      .find({}, { projection: { competitionID: 1, competitionName: 1, datetime: 1 } })
      .sort({ competitionID: -1 })
      .limit(2000)
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 선수 목록 — times 를 선수(이름+소속)별로 그룹핑
router.get('/', async (req, res) => {
  try {
    const { competitionID, gender, name, group, limit = 2000 } = req.query
    const match = {
      time: { $type: 'string', $ne: '' },   // 기록(time)이 없거나 ''인 것 제외
      discipline: { $nin: ['FRR', 'MR'] },   // 단체전(계영 FRR·혼계영 MR) 제외
    }
    if (competitionID) match.competitionID = Number(competitionID)
    if (gender) match.gender = String(gender)
    if (group) match.group = String(group)
    if (name) match.name = { $regex: String(name), $options: 'i' }
    const docs = await (await coll()).aggregate([
      { $match: match },
      {
        $group: {
          _id: { name: '$name', team: '$team' },
          name: { $first: '$name' },
          gender: { $first: '$gender' },
          group: { $first: '$group' },
          ageGroup: { $first: '$ageGroup' },
          team: { $first: '$team' },
          sido: { $first: '$sido' },
          aid: { $first: '$aid' },
          times: {
            $push: {
              _id: '$_id',
              discipline: '$discipline', distance: '$distance', course: '$course',
              time: '$time', rank: '$rank', round: '$round', timeStamp: '$timeStamp',
              competitionName: '$competitionName', datetime: '$datetime', pool: '$pool',
            },
          },
        },
      },
      { $sort: { name: 1 } },
      { $limit: Math.min(Number(limit) || 2000, 5000) },
      // myTimes(myranking 크롤링 결과) 건수 조인 — 선수(name+gender) 기준
      {
        $lookup: {
          from: 'myTimes',
          let: { nm: '$name', gd: '$gender' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$name', '$$nm'] }, { $eq: ['$gender', '$$gd'] }] } } },
            { $count: 'c' },
          ],
          as: '_myt',
        },
      },
      { $addFields: { myTimesCount: { $ifNull: [{ $arrayElemAt: ['$_myt.c', 0] }, 0] } } },
      { $project: { _myt: 0 } },
    ]).toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 팀 통계 — team 의 선수수(고유 이름)·기록수. competitionID 있으면 그 대회 내로 한정.
router.get('/team-stats', async (req, res) => {
  try {
    const { team, competitionID } = req.query
    if (!team) return res.json({ athletes: 0, times: 0 })
    const match = { team: String(team) }
    if (competitionID) match.competitionID = Number(competitionID)
    const rows = await (await coll()).aggregate([
      { $match: match },
      { $group: { _id: null, times: { $sum: 1 }, names: { $addToSet: '$name' } } },
      { $project: { _id: 0, times: 1, athletes: { $size: '$names' } } },
    ]).toArray()
    res.json(rows[0] || { athletes: 0, times: 0 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 종목별 기록(Breaststroke DB records) — 비교표용. discipline·distance(·course) 로 조회.
router.get('/records', async (req, res) => {
  try {
    const { discipline, distance, course } = req.query
    if (!discipline || !distance) return res.json([])
    const q = { discipline: String(discipline), distance: String(distance) }
    if (course) q.course = String(course)
    const docs = await (await BR()).collection('records')
      .find(q, { projection: { type: 1, gender: 1, time: 1, timeStamp: 1, name: 1, team: 1, datetime: 1, location: 1, discipline: 1, distance: 1, course: 1 } })
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── myranking 기록 표기 헬퍼 (myTimes 는 myranking 원본 포맷 MMss.cc 로 저장됨) ──
// "32.68"=32.68초 · "112.65"=1분 12.65초 · "1:12.65" 도 허용. (myranking.js recordToSeconds 와 동일 규칙 —
//  playwright 를 끌어오지 않으려고 여기서 자체 구현)
function myRecToSec(t) {
  const s = String(t ?? '').trim()
  let m = s.match(/^(\d+):(\d+)\.(\d+)$/)
  if (m) return (+m[1]) * 60 + (+m[2]) + +('0.' + m[3])
  m = s.match(/^(\d+)\.(\d+)$/)
  if (!m) return Infinity
  const intp = m[1], cc = m[2]
  const ss = intp.length > 2 ? intp.slice(-2) : intp
  const mm = intp.length > 2 ? intp.slice(0, -2) : '0'
  return (+mm) * 60 + (+ss) + +('0.' + cc)
}
// 초 → "MM:SS.SS" (대시보드 fmtRec 가 "32초 68" / "1분 12초 65" 로 표기)
function secToClock(sec) {
  if (!Number.isFinite(sec)) return ''
  const mm = Math.floor(sec / 60)
  const rest = sec - mm * 60
  const ss = Math.floor(rest)
  const cc = Math.round((rest - ss) * 100)
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cc).padStart(2, '0')}`
}

// myranking 이벤트 텍스트 파싱: "자유형 50m 결승" → { discipline:'FR', distance:'50M', round:'결승' }
// round = 영법·거리를 제거한 나머지(결승·결선·예선·준결승 등 그대로).
const STROKE_CODE = { 자유형: 'FR', 배영: 'BA', 평영: 'BR', 접영: 'FL', 개인혼영: 'IM' }
function parseEvent(evText) {
  const s = String(evText || '').trim()
  let discipline = '', strokeKo = ''
  for (const ko of Object.keys(STROKE_CODE)) { if (s.includes(ko)) { discipline = STROKE_CODE[ko]; strokeKo = ko; break } }
  const dm = s.match(/(\d+)\s*m/i)
  const distance = dm ? dm[1] + 'M' : ''           // 거리 M 은 대문자
  let round = s
  if (strokeKo) round = round.replace(strokeKo, '')
  if (dm) round = round.replace(dm[0], '')
  round = round.replace(/\s+/g, ' ').trim()
  return { discipline, distance, round }
}

// "my" — name·gender 로 myranking.co.kr 을 크롤링해 개인 기록을 SP.myTimes 에 upsert.
router.post('/my', async (req, res) => {
  try {
    const { name, gender } = req.body || {}
    if (!name) return res.status(400).json({ error: '선수명(name)이 필요합니다.' })
    const mr = await import('../myranking.js').catch((e) => {
      console.error('myranking 모듈 로드 실패:', e?.message || e); return null
    })
    if (!mr || !mr.lookupPB) return res.status(503).json({ error: 'myranking 모듈을 사용할 수 없습니다(playwright 설치 필요).' })
    // discipline·distance 미지정 → 해당 선수의 전체 기록. gender 로 성별 필터.
    const result = await mr.lookupPB({ name: String(name), gender })
    if (!result || !result.ok) {
      return res.status(502).json({ error: (result && result.error) || 'myranking 조회 실패', records: (result && result.records) || [] })
    }
    const recs = result.records || []
    if (!recs.length) return res.json({ matched: 0, upserted: 0, modified: 0 })
    const c = (await SP()).collection('myTimes')
    const now = new Date()
    const ops = recs.map((r) => {
      const { discipline, distance, round } = parseEvent(r.event || '')
      const doc = {
        name: String(name),
        gender: gender || '',
        ageGroup: r.ageGroup || '',
        discipline, distance, round,          // "자유형 50m 결선" → FR / 50M / 결선
        event: r.event || '',                 // 원본 이벤트 텍스트
        time: r.record || '',
        rank: (r.rank ?? null),               // 메달/순위 (금1·은2·동3·N위)
        competitionName: r.competition || '',
        competitionID: r.competitionID || '',
        date: r.date || '',                   // 대회 일자
        pb: r.pb || '',                       // PB 달성 일자(PB면)
        updatedAt: now,
      }
      // 키: 선수·종목(영법·거리·라운드)·대회·기록으로 결과 1건 식별(동일하면 갱신)
      const key = { name: doc.name, gender: doc.gender, ageGroup: doc.ageGroup, discipline, distance, round, competitionID: doc.competitionID, time: doc.time }
      return { updateOne: { filter: key, update: { $set: doc }, upsert: true } }
    })
    const rw = await c.bulkWrite(ops, { ordered: false })
    res.json({ matched: recs.length, upserted: rw.upsertedCount || 0, modified: rw.modifiedCount || 0 })
  } catch (e) {
    res.status(502).json({ error: 'my 조회 실패: ' + (e?.message || String(e)) })
  }
})

// PB(개인 최고기록) 조회 — myranking 우선, 없거나 실패하면 BR.mergedTimes 폴백.
// query: name·gender·group·discipline·distance(·course). source=merged 면 myranking 건너뜀.
router.get('/pb', async (req, res) => {
  const { name, gender, group, discipline, distance, course, source } = req.query
  if (!name || !discipline || !distance) return res.json(null)

  // 1) myranking 우선 — "my" 크롤로 저장된 SP.myTimes 에서 해당 종목 가장 빠른 기록.
  //    (라이브 스크래핑 대신 저장 데이터를 읽으므로 빠르다. 없으면 아래 mergedTimes 폴백)
  if (source !== 'merged') {
    try {
      const q = { name: String(name), discipline: String(discipline), distance: String(distance) }
      if (gender) q.gender = String(gender)
      const docs = await (await SP()).collection('myTimes')
        .find(q, { projection: { time: 1, competitionName: 1, date: 1, rank: 1, pb: 1, round: 1, ageGroup: 1 } })
        .limit(500)
        .toArray()
      const best = docs
        .map((d) => ({ d, sec: myRecToSec(d.time) }))
        .filter((x) => Number.isFinite(x.sec))
        .sort((a, b) => a.sec - b.sec)[0]
      if (best) {
        return res.json({
          source: 'myranking',
          time: secToClock(best.sec),          // "MM:SS.SS" → 대시보드가 "32초 68" 로 표기
          timeStamp: best.sec / 86400,          // mergedTimes 와 동일 단위(하루 분수)
          competitionName: best.d.competitionName || '',
          datetime: best.d.date || '',
          discipline: String(discipline), distance: String(distance), course: course ? String(course) : '',
          rank: best.d.rank ?? null, pb: best.d.pb || '',
        })
      }
    } catch (e) {
      console.error('myTimes PB 조회 실패(mergedTimes 폴백):', e?.message || e)
    }
  }

  // 2) 폴백: BR.mergedTimes 에서 가장 빠른(timeStamp 최소) 1건
  try {
    const match = { name: String(name), discipline: String(discipline), distance: String(distance) }
    if (gender) match.gender = String(gender)
    if (group) match.group = String(group)
    if (course) match.course = String(course)
    const doc = await (await BR()).collection('mergedTimes')
      .find(match, { projection: { time: 1, timeStamp: 1, competitionName: 1, datetime: 1, course: 1, discipline: 1, distance: 1 } })
      .sort({ timeStamp: 1 })
      .limit(1)
      .next()
    res.json(doc ? { ...doc, source: 'merged' } : null)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 기사 LLM 생성 — 드로어 내용(JSON)을 표준기사 가이드라인 지침과 함께 NVIDIA 모델에 전달해 기사 JSON 생성.
router.post('/generate-article', async (req, res) => {
  try {
    const apiKey = process.env.NVIDIA_API_KEY
    const model = process.env.NVIDIA_MODEL_NAME || 'meta/llama-3.1-8b-instruct'
    if (!apiKey) return res.status(500).json({ error: 'NVIDIA_API_KEY 가 설정되지 않았습니다.' })
    const data = (req.body && req.body.data) || req.body || {}
    const name = data?.athlete?.name || data?.name
    if (!name) return res.status(400).json({ error: '선수 데이터가 없습니다.' })

    const rules = getRules()
    const sys = `너는 수영 전문 기자다. [데이터]의 사실만으로 한국어 경기 기사를 작성하고, 아래 [출력 스키마]의 모든 필드를 실제 내용으로 채워 JSON만 출력한다.
빈 문자열("")을 남기지 마라. title·subtitle·lead·blocks(2~4개 문단)·conclusion·tags 를 모두 채워라.
데이터에 없는 사실(나이·소속·신기록·메달·우승 등)은 지어내지 마라. JSON 외 텍스트(설명·마크다운·코드펜스)는 출력하지 마라.

[작성 규칙 — 표준기사 가이드라인]
${rules}

[출력 스키마]
{"title":"기사 제목","subtitle":"부제","lead":"리드 문단","blocks":[{"type":"paragraph","text":"본문 문단1"},{"type":"paragraph","text":"본문 문단2"}],"conclusion":"마무리 문단","tags":["태그1","태그2"]}`
    const user = `[데이터]\n${JSON.stringify(data, null, 2)}\n\n위 데이터로 기사를 작성하고, 스키마의 모든 필드를 채운 JSON만 출력하라.`

    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.4, top_p: 0.9, max_tokens: 1600,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return res.status(502).json({ error: `LLM 오류 ${r.status}: ${txt.slice(0, 300)}` })
    }
    const out = await r.json()
    const content = out?.choices?.[0]?.message?.content || ''
    res.json({ content })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 선수 추가 — {name, gender, group, ageGroup, team, sido, competitionID, times:[{discipline,distance,course,time,rank,round}]}
// 각 times 를 SP.times 문서로 저장(선수는 times 그룹으로 표현되므로).
router.post('/', async (req, res) => {
  try {
    const a = req.body || {}
    if (!a.name) return res.status(400).json({ error: '선수명을 입력하세요.' })
    const base = {
      name: a.name, gender: a.gender || '', group: a.group || '',
      ageGroup: a.ageGroup || '', team: a.team || '', sido: a.sido || '',
    }
    if (a.competitionID != null && a.competitionID !== '') base.competitionID = Number(a.competitionID)
    const rows = (Array.isArray(a.times) && a.times.length ? a.times : [{}]).map((t) => ({
      ...base,
      discipline: t.discipline || '', distance: t.distance || '', course: t.course || '',
      time: t.time || '', rank: (t.rank === '' || t.rank == null) ? null : Number(t.rank), round: t.round || '',
    }))
    const r = await (await coll()).insertMany(rows)
    res.status(201).json({ inserted: r.insertedCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
