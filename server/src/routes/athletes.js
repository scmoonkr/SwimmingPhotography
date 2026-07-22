// 선수(athletes) — SwimmingPhotography DB 의 times 를 선수별로 그룹핑한 뷰.
// 대회·성별·선수명으로 필터해 선수 목록(각 선수의 times[영법·기록·순위 등])을 반환. 수동 선수추가도 지원.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { SP, BR } from '../db.js'
import { publicUrl } from '../r2.js'

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

// docs/*.md 파일 읽기 (LLM 프롬프트 재료: prompt.md=system, schema.md=출력형식).
// 캐시하지 않음 — 문서를 편집하면 다음 생성부터 바로 반영(서버 재시작 불필요).
const getDoc = (rel) => {
  try { return fs.readFileSync(path.resolve(__dirname, '../../../docs/' + rel), 'utf8') } catch { return '' }
}
// schema.md 의 첫 ```json 블록(= A. 기사 JSON 출력형식) 추출
const getOutputSchema = () => {
  const m = getDoc('schema.md').match(/```json\s*([\s\S]*?)```/)
  return m ? m[1].trim() : ''
}

// 대회 select 옵션 (SP.competitions)
router.get('/competitions', async (req, res) => {
  try {
    const docs = await (await SP()).collection('competitions')
      .find({}, { projection: { competitionID: 1, competitionName: 1, datetime: 1, pool: 1, sido: 1, teamCount: 1, athleteCount: 1, startCount: 1, disciplines: 1, notesCompetition: 1, notesParking: 1, notesWeather: 1, notesPool: 1, quotesCompetition: 1, quotesParking: 1, quotesWeather: 1, quotesPool: 1 } })
      .sort({ competitionID: -1 })
      .limit(2000)
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 선수 이미지 — images 컬렉션에서 name·gender·team·ageGroup 매칭 → [{ type, url, thumbnail, filename }]
router.get('/images', async (req, res) => {
  try {
    const { name, gender, team, ageGroup } = req.query
    if (!name) return res.json([])
    const filter = { name: String(name) }
    if (gender) filter.gender = String(gender)
    if (team) filter.team = String(team)
    if (ageGroup) filter.ageGroup = String(ageGroup)
    const docs = await (await SP()).collection('images')
      .find(filter, { projection: { _id: 0, type: 1, url: 1, thumbnail: 1, filename: 1 } })
      .toArray()
    // 저장은 상대경로 → 표시용 url·thumbnail 은 CLOUD_PUBLIC_URL 붙인 전체 URL,
    // path·thumbPath 는 CLOUD_PUBLIC_URL 제외한 상대경로(JSON payload 용).
    const base = (process.env.CLOUD_PUBLIC_URL || '').replace(/\/+$/, '')
    const abs = (p) => (!p ? '' : (/^https?:\/\//.test(p) ? p : publicUrl(p)))
    const rel = (p) => (!p ? '' : (base && p.startsWith(base + '/') ? p.slice(base.length + 1) : p))
    const out = docs.map((d) => ({
      type: d.type || '',
      filename: d.filename || '',
      url: abs(d.url),
      thumbnail: abs(d.thumbnail || d.url),
      path: rel(d.url),
      thumbPath: rel(d.thumbnail || d.url),
    }))
    res.json(out)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 선수 목록 — times 를 선수(이름+소속)별로 그룹핑
router.get('/', async (req, res) => {
  try {
    const { competitionID, gender, name, group, limit = 2000 } = req.query
    const match = {
      time: { $type: 'string', $ne: '' },     // 기록(time)이 없거나 ''인 것 제외
      status: { $nin: ['DQ', 'DNS'] },         // 실격(DQ)·미출전(DNS) 제외
      discipline: { $nin: ['FRR', 'MR'] },     // 단체전(계영 FRR·혼계영 MR) 제외
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
          competitionID: { $first: '$competitionID' },
          team: { $first: '$team' },
          sido: { $first: '$sido' },
          aid: { $first: '$aid' },
          times: {
            $push: {
              _id: '$_id',
              discipline: '$discipline', distance: '$distance', course: '$course',
              time: '$time', rank: '$rank', eventRank: '$eventRank', round: '$round', heat: '$heat', timeStamp: '$timeStamp',
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
      // images 건수 조인 — 선수(name+gender+team) 기준
      {
        $lookup: {
          from: 'images',
          let: { nm: '$name', gd: '$gender', tm: '$team' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$name', '$$nm'] }, { $eq: ['$gender', '$$gd'] }, { $eq: ['$team', '$$tm'] }] } } },
            { $count: 'c' },
          ],
          as: '_img',
        },
      },
      { $addFields: { imageCount: { $ifNull: [{ $arrayElemAt: ['$_img.c', 0] }, 0] } } },
      // articles 조인 — 생성 기사 존재 여부(키: competitionID+ageGroup+name)
      {
        $lookup: {
          from: 'articles',
          let: { cid: '$competitionID', ag: '$ageGroup', nm: '$name' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$competitionID', '$$cid'] }, { $eq: ['$ageGroup', '$$ag'] }, { $eq: ['$name', '$$nm'] }] } } },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: '_art',
        },
      },
      { $addFields: { hasArticle: { $gt: [{ $size: '$_art' }, 0] } } },
      { $project: { _myt: 0, _img: 0, _art: 0 } },
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
    const match = { team: String(team), time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] } }
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

// 대회의 특정 팀 상세 — 소속팀 성적을 SP.times 에서 집계.
//  total : 팀 전체 합계(대회 내). events : name 지정 시 그 선수가 출전한 종목만.
//   - coarse 행: (성별·영법·거리)           예) 남자 평영 50M
//   - fine   행: (성별·영법·거리·부·라운드)  예) 남자 평영 50M 성인6부 결승
// DQ/DNS·빈 time 제외.
router.get('/competition-teams', async (req, res) => {
  try {
    const { competitionID, team, name } = req.query
    if (!competitionID || !team) return res.json({ total: null, events: [] })
    const cid = Number(competitionID)
    const t = await coll()
    const base = { competitionID: cid, team: String(team), time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] } }
    const medal = { // 메달은 heat 순위(rank)가 아니라 종목순위(eventRank) 기준
      goldCount: { $sum: { $cond: [{ $eq: ['$eventRank', 1] }, 1, 0] } },
      silverCount: { $sum: { $cond: [{ $eq: ['$eventRank', 2] }, 1, 0] } },
      bronzeCount: { $sum: { $cond: [{ $eq: ['$eventRank', 3] }, 1, 0] } },
    }
    const runAgg = (idFields) => t.aggregate([
      { $match: base },
      { $group: { _id: idFields, names: { $addToSet: '$name' }, startCount: { $sum: 1 }, ...medal } },
    ]).toArray()

    // 팀 전체 합계
    const [tot] = await t.aggregate([
      { $match: base },
      { $group: { _id: null, names: { $addToSet: '$name' }, startCount: { $sum: 1 }, ...medal } },
    ]).toArray()
    const total = tot
      ? { athleteCount: tot.names.length, startCount: tot.startCount, goldCount: tot.goldCount, silverCount: tot.silverCount, bronzeCount: tot.bronzeCount }
      : { athleteCount: 0, startCount: 0, goldCount: 0, silverCount: 0, bronzeCount: 0 }

    // 선수 출전 종목 키 (name 지정 시)
    //  events : (성별·영법·거리)         → 선수 출전 종목
    //  heats  : (성별·영법·거리·부)      → 선수 출전 종목 & 같은 부(ageGroup)만
    let coarseKeys = null, ageKeys = null
    if (name) {
      const mine = await t.find(
        { competitionID: cid, name: String(name), time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] } },
        { projection: { gender: 1, discipline: 1, distance: 1, ageGroup: 1 } },
      ).toArray()
      coarseKeys = new Set(mine.map((m) => `${m.gender}|${m.discipline}|${m.distance}`))
      ageKeys = new Set(mine.map((m) => `${m.gender}|${m.discipline}|${m.distance}|${m.ageGroup || ''}`))
    }
    const inEvent = (r) => !coarseKeys || coarseKeys.has(`${r._id.gender}|${r._id.discipline}|${r._id.distance}`)
    const inAge = (r) => !ageKeys || ageKeys.has(`${r._id.gender}|${r._id.discipline}|${r._id.distance}|${r._id.ageGroup || ''}`)

    // 팀 영법별 집계 (계영 FRR·혼계영 MR 포함), start 수 내림차순
    const disciplines = await t.aggregate([
      { $match: base },
      { $group: { _id: '$discipline', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, discipline: '$_id', count: 1 } },
    ]).toArray()

    const coarse = await runAgg({ gender: '$gender', discipline: '$discipline', distance: '$distance' })
    const fine = await runAgg({ gender: '$gender', discipline: '$discipline', distance: '$distance', ageGroup: '$ageGroup', round: '$round', heat: '$heat' })
    const row = (r, detail) => ({
      gender: r._id.gender, discipline: r._id.discipline, distance: r._id.distance,
      ...(detail ? { ageGroup: r._id.ageGroup || '', round: r._id.round || '', heat: r._id.heat || '' } : {}),
      athleteCount: r.names.length, startCount: r.startCount,
      goldCount: r.goldCount, silverCount: r.silverCount, bronzeCount: r.bronzeCount,
    })
    const evtCmp = (a, b) => String(a.gender).localeCompare(String(b.gender)) || String(a.discipline).localeCompare(String(b.discipline)) || String(a.distance).localeCompare(String(b.distance))
    const events = coarse.filter(inEvent).map((r) => row(r, false)).sort(evtCmp)
    const heats = fine.filter(inAge).map((r) => row(r, true))
      .sort((a, b) => evtCmp(a, b) || String(a.heat).localeCompare(String(b.heat)))

    res.json({ total, disciplines, events, heats })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 종목·heat 통계 (선수 기사 payload 용) — 선수가 출전한 종목/heat 기준.
//  events[key=discipline|distance|course]:
//    athleteCount·startCount : 종목(성별·영법·거리) 전체(전 부·전 heat 합산)
//    best : round 무관 최고기록 {name, team, time, diff(선수−best, 초)}
//    gold : 결승(round 결승/결선/final) 1등. 결승 라운드 없으면 best 와 동일.
//    team : 그 종목 선수 소속팀 성적 {athleteCount, startCount, gold/silver/bronzeCount(부별 eventRank)}
//  heats[] : 선수가 뛴 heat 의 '전체' 출전선수·start 수.
function fmtRecKo(t) {
  const m = String(t || '').match(/^(\d+):(\d+)\.(\d+)/)
  if (!m) return String(t || '')
  return (+m[1] > 0) ? `${+m[1]}분 ${+m[2]}초 ${m[3]}` : `${+m[2]}초 ${m[3]}`
}
router.get('/event-stats', async (req, res) => {
  try {
    const { competitionID, name, team } = req.query
    if (!competitionID || !name) return res.json({ events: {}, heats: [] })
    const cid = Number(competitionID)
    const t = await coll()
    const OK = { time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] } }
    const mine = await t.find(
      { competitionID: cid, name: String(name), ...OK },
      { projection: { gender: 1, discipline: 1, distance: 1, course: 1, ageGroup: 1, round: 1, heat: 1, time: 1, timeStamp: 1 } },
    ).toArray()

    // 종목(gender·discipline·distance·course) 별
    const evMap = new Map()
    for (const m of mine) {
      const key = `${m.discipline}|${m.distance}|${m.course}`
      if (!evMap.has(key)) evMap.set(key, { gender: m.gender, discipline: m.discipline, distance: m.distance, course: m.course, myTs: m.timeStamp })
      else if (m.timeStamp != null && m.timeStamp < evMap.get(key).myTs) evMap.get(key).myTs = m.timeStamp // 선수 최고기록 기준
    }
    const secDiff = (a, b) => (a != null && b != null && isFinite(a - b)) ? Math.abs((a - b) * 86400).toFixed(2) : ''
    const events = {}
    for (const [key, ev] of evMap) {
      const evMatch = { competitionID: cid, gender: ev.gender, discipline: ev.discipline, distance: ev.distance, course: ev.course, ...OK }
      const [agg] = await t.aggregate([
        { $match: evMatch },
        { $group: { _id: null, names: { $addToSet: '$name' }, starts: { $sum: 1 } } },
      ]).toArray()
      const [best] = await t.find(evMatch, { projection: { name: 1, team: 1, time: 1, timeStamp: 1 } }).sort({ timeStamp: 1 }).limit(1).toArray()
      const [goldRec] = await t.find({ ...evMatch, round: { $regex: '결승|결선|final', $options: 'i' } }, { projection: { name: 1, team: 1, time: 1, timeStamp: 1 } }).sort({ timeStamp: 1 }).limit(1).toArray()
      const gr = goldRec || best
      const [tm] = await t.aggregate([
        { $match: { ...evMatch, team: String(team || '') } },
        {
          $group: {
            _id: null, names: { $addToSet: '$name' }, starts: { $sum: 1 },
            gold: { $sum: { $cond: [{ $eq: ['$eventRank', 1] }, 1, 0] } },
            silver: { $sum: { $cond: [{ $eq: ['$eventRank', 2] }, 1, 0] } },
            bronze: { $sum: { $cond: [{ $eq: ['$eventRank', 3] }, 1, 0] } },
          },
        },
      ]).toArray()
      events[key] = {
        athleteCount: agg ? agg.names.length : 0,
        startCount: agg ? agg.starts : 0,
        best: best ? { name: best.name, team: best.team, time: fmtRecKo(best.time), diff: secDiff(ev.myTs, best.timeStamp) } : null,
        gold: gr ? { name: gr.name, team: gr.team, time: fmtRecKo(gr.time), diff: secDiff(ev.myTs, gr.timeStamp) } : null,
        team: tm ? { athleteCount: tm.names.length, startCount: tm.starts, goldCount: tm.gold, silverCount: tm.silver, bronzeCount: tm.bronze }
          : { athleteCount: 0, startCount: 0, goldCount: 0, silverCount: 0, bronzeCount: 0 },
      }
    }

    // heat(gender·discipline·distance·course·round·heat) 전체 출전선수·start
    const heatMap = new Map()
    for (const m of mine) {
      const hk = `${m.gender}|${m.discipline}|${m.distance}|${m.course}|${m.round || ''}|${m.heat || ''}`
      if (!heatMap.has(hk)) heatMap.set(hk, m)
    }
    const heats = []
    for (const m of heatMap.values()) {
      const [agg] = await t.aggregate([
        { $match: { competitionID: cid, gender: m.gender, discipline: m.discipline, distance: m.distance, course: m.course, round: m.round || '', heat: m.heat, ...OK } },
        { $group: { _id: null, names: { $addToSet: '$name' }, starts: { $sum: 1 } } },
      ]).toArray()
      heats.push({
        gender: m.gender, discipline: m.discipline, distance: m.distance, ageGroup: m.ageGroup || '',
        round: m.round || '', heat: m.heat || '',
        athleteCount: agg ? agg.names.length : 0, startCount: agg ? agg.starts : 0,
      })
    }
    res.json({ events, heats })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 드로어 저장분 조회 — SP.athletes(name+gender+group)의 json(소스)·llm(생성기사)·note
router.get('/saved', async (req, res) => {
  try {
    const { name, gender, group } = req.query
    if (!name) return res.json(null)
    const doc = await (await SP()).collection('athletes').findOne(
      { name: String(name), gender: String(gender || ''), group: String(group || '') },
      { projection: { json: 1, llm: 1, note: 1, savedAt: 1 } },
    )
    res.json(doc || null)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 드로어 저장 — json(소스 payload)+llm(생성 기사 JSON)+note 를 SP.athletes 에 upsert(name+gender+group).
// 추가로 genJson(llm)을 SP.articles 에 upsert — 키: { competitionID, ageGroup, name }.
router.post('/save', async (req, res) => {
  try {
    const { name, gender, group, json, llm, note, competitionID, ageGroup, team } = req.body || {}
    if (!name) return res.status(400).json({ error: '선수명(name)이 필요합니다.' })
    const key = { name: String(name), gender: String(gender || ''), group: String(group || '') }
    const r = await (await SP()).collection('athletes').updateOne(
      key,
      { $set: { ...key, json: json ?? null, llm: llm ?? '', note: note ?? '', savedAt: new Date() } },
      { upsert: true },
    )

    // genJson(생성 기사 JSON)을 articles 컬렉션에 upsert — 키: { competitionID, ageGroup, name }.
    // article = parseJSON(genJson); article.created = new Date(); → article 을 upsert.
    let result = null
    if (llm) {
      const cid = (competitionID != null && competitionID !== '') ? Number(competitionID) : null
      const akey = { competitionID: cid, ageGroup: String(ageGroup || ''), name: String(name) }
      let article = null
      try { article = JSON.parse(llm) } catch { return res.status(400).json({ error: 'genJson 이 유효한 JSON 이 아닙니다.' }) }
      if (article && typeof article === 'object' && !Array.isArray(article)) {
        delete article._id                            // _id 는 수정 불가
        article.created = new Date()                  // 오늘 날짜 ISODate
        const ar = await (await SP()).collection('articles').updateOne(
          akey,
          { $set: { ...article, ...akey } },          // 키(competitionID·ageGroup·name)는 항상 akey 로 고정
          { upsert: true },
        )
        result = { upserted: !!ar.upsertedCount, modified: ar.modifiedCount }
      }
    }

    res.json({ ok: true, upserted: !!r.upsertedCount, modified: r.modifiedCount, article: result })
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
  // 핀수영(핀자유형·잠영 등)은 일반 수영 영법이 아니므로 매핑 제외.
  // ("핀자유형"에 "자유형"이 포함돼 FR 로 오분류 → 잘못된 PB(핀수영 기록)가 잡히던 문제)
  if (!/핀|잠영/.test(s)) {
    for (const ko of Object.keys(STROKE_CODE)) { if (s.includes(ko)) { discipline = STROKE_CODE[ko]; strokeKo = ko; break } }
  }
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
      const q = { name: String(name), discipline: String(discipline), distance: String(distance), event: { $not: /핀|잠영/ } }
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

    // system = docs/prompt.md 전문, 출력형식 = docs/schema.md 의 기사 JSON(A). 입력 = docs/sourcedata.md 규격(buildPayload).
    const promptMd = getDoc('prompt.md') || getRules()
    const schema = getOutputSchema()
    const sys = `${promptMd}${schema ? `\n\n## 출력 형식 (schema.md · 기사 JSON A)\n아래 구조의 JSON만 출력한다(블록 type·source 포함). 주석(//)은 설명이므로 출력하지 않는다.\n${schema}` : ''}`
    const user = `[sourceData]\n${JSON.stringify(data, null, 2)}\n\n위 sourceData만 근거로, schema.md 기사 JSON 형식으로만 출력하라. 설명·마크다운·코드펜스 금지.`

    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.3, top_p: 0.9, max_tokens: Number(process.env.NVIDIA_MAX_TOKENS) || 8192,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return res.status(502).json({ error: `LLM 오류 ${r.status}: ${txt.slice(0, 300)}` })
    }
    const out = await r.json()
    const choice = out?.choices?.[0] || {}
    const content = choice.message?.content || ''
    // finish_reason='length' 면 max_tokens 초과로 잘린 것 → 프런트에서 경고
    res.json({ content, finishReason: choice.finish_reason || '', usage: out?.usage || null })
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
