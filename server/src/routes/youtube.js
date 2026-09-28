// youtube 컬렉션(SwimmingPhotography DB) — 크롤링한 유튜브 영상.
// 이미지 가져오기와 같은 얼개로, 일자로 목록을 읽어 대회(competitionID)를 붙인다(매칭).
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { SP } from '../db.js'

const router = Router()
const coll = async () => (await SP()).collection('youtube')
const toId = (id) => {
  try { return new ObjectId(id) } catch { return null }
}

// 대회 select 옵션 — SP.competitions 전부, 최신순. count 는 그 대회에 매칭된 유튜브 수.
// (images 의 /competitions 와 같은 방식 — 아직 매칭이 없는 대회도 고를 수 있어야 한다.)
router.get('/competitions', async (req, res) => {
  try {
    const docs = await (await SP()).collection('competitions').aggregate([
      { $match: { competitionID: { $ne: null } } },
      { $lookup: { from: 'youtube', localField: 'competitionID', foreignField: 'competitionID', as: '_y' } },
      {
        $project: {
          _id: 0,
          competitionID: 1,
          competitionName: { $ifNull: ['$competitionName', ''] },
          datetime: { $ifNull: ['$datetime', ''] },
          count: { $size: '$_y' },
        },
      },
      { $sort: { datetime: -1, competitionID: -1 } },
    ]).toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 목록 — 일자(datetime) 범위 · 매칭여부 · 대회 · 이름/제목 검색
router.get('/', async (req, res) => {
  try {
    const { dateFrom, dateTo, matched, timeMatched, competitionID, name, q, limit = 3000 } = req.query
    const and = []
    // datetime 은 'YYYY-MM-DD' 문자열이라 문자열 범위 비교로 거른다
    if (dateFrom || dateTo) {
      const range = {}
      if (dateFrom) range.$gte = String(dateFrom)
      if (dateTo) range.$lte = String(dateTo)
      and.push({ datetime: range })
    }
    // 대회 매칭 여부 — competitionID 가 있으면 매칭됨, 없으면(null·''·미존재) 미매칭
    if (matched === 'has') and.push({ competitionID: { $nin: [null, ''] } })
    else if (matched === 'none') and.push({ $or: [{ competitionID: { $in: [null, ''] } }, { competitionID: { $exists: false } }] })
    // times 매칭 여부 — timeID 가 있으면 매칭됨, 없으면 미매칭
    if (timeMatched === 'has') and.push({ timeID: { $nin: [null, ''] } })
    else if (timeMatched === 'none') and.push({ $or: [{ timeID: { $in: [null, ''] } }, { timeID: { $exists: false } }] })
    if (competitionID !== undefined && String(competitionID).trim() !== '') and.push({ competitionID: Number(competitionID) })
    const term = String(name || q || '').trim()
    if (term) and.push({ $or: [{ name: { $regex: term, $options: 'i' } }, { title: { $regex: term, $options: 'i' } }] })
    const filter = and.length ? { $and: and } : {}
    const docs = await (await coll())
      .find(filter)
      .sort({ datetime: -1, _id: -1 })
      .limit(Number(limit) || 3000)
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── times 매칭 (이미지→기록 매칭과 같은 방식) — competitionID 가 붙은 영상에 timeID 를 채운다 ──
// 키: 대회 + 이름 + 성별 + 영법 + 거리 (계영은 성별 제외). 이름은 NFC 로 맞춘다.
// 여러 건(예선·결선)이면 유튜브의 round 로 좁히고, 못 좁히면 결선(가장 높은 라운드)으로.
const RELAY = ['FRR', 'MR']
const isRelay = (d) => RELAY.includes(String(d || '').toUpperCase())
const nfc = (v) => String(v ?? '').normalize('NFC')
const keyOf = (nm, g, d, dist) => (isRelay(d)
  ? ['R', nfc(nm), d, dist]
  : ['I', nfc(nm), g, d, dist]).map((v) => String(v ?? '')).join('|')
// 라운드를 예선/준결/결선 으로 정규화 (times 는 예선·결승·finals, youtube 는 preliminaries·finals 혼재)
const roundCanon = (r) => {
  const s = String(r || '').toLowerCase()
  if (/준결|semi/.test(s)) return 'semi'
  if (/결|final/.test(s)) return 'final'
  if (/예선|prelim|heat/.test(s)) return 'prelim'
  return ''
}
const roundRank = (r) => ({ final: 3, semi: 2, prelim: 1 }[roundCanon(r)] || 0)

// times 조회 필드 + 인덱스(키→기록들) + 한 영상 매칭 — match-times(일괄)·PUT(행 편집)에서 공용
const TIMES_PROJ = { timeID: 1, name: 1, name_unique: 1, gender: 1, discipline: 1, distance: 1, round: 1 }
const buildTimesIndex = (rows) => {
  const idx = new Map()
  const put = (k, r) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(r) }
  for (const r of rows) {
    const arr = Array.isArray(r.name_unique) ? r.name_unique : (r.name_unique ? [String(r.name_unique)] : [])
    // name_unique 원소들 + 원래 이름(동명이인 번호가 없는 유튜브 이름도 잡히도록)
    const keys = new Set([...arr, ...(r.name ? [r.name] : [])].filter(Boolean))
    for (const k of keys) put(keyOf(k, r.gender, r.discipline, r.distance), r)
  }
  return idx
}
// doc(name·gender·discipline·distance·round) → { timeID, status }. 여러건이면 round 로 좁히고 못 좁히면 결선.
const matchDoc = (idx, doc) => {
  const hit = idx.get(keyOf(doc.name, doc.gender, doc.discipline, doc.distance)) || []
  if (hit.length === 1) return { timeID: hit[0].timeID, status: 'ok' }
  if (hit.length > 1) {
    const yc = roundCanon(doc.round)
    const narrowed = yc ? hit.filter((r) => roundCanon(r.round) === yc) : []
    if (narrowed.length === 1) return { timeID: narrowed[0].timeID, status: 'ok' }
    let best = hit[0]
    for (const r of hit) if (roundRank(r.round) > roundRank(best.round)) best = r
    return { timeID: best.timeID, status: 'multi' }
  }
  return { timeID: null, status: 'none' }
}

router.post('/match-times', async (req, res) => {
  try {
    const sp = await SP()
    const { competitionID, ids } = req.body || {}
    // 대상: competitionID(대회 매칭됨)가 있는 영상. 대회·ids 로 좁힐 수 있다.
    const filter = { competitionID: { $nin: [null, ''] } }
    if (competitionID != null && String(competitionID).trim() !== '') filter.competitionID = Number(competitionID)
    if (Array.isArray(ids) && ids.length) filter._id = { $in: ids.map(toId).filter(Boolean) }
    const docs = await sp.collection('youtube')
      .find(filter, { projection: { name: 1, gender: 1, discipline: 1, distance: 1, round: 1, competitionID: 1 } })
      .toArray()
    if (!docs.length) return res.json({ total: 0, ok: 0, multi: 0, none: 0, modified: 0 })

    // 대회별로 times 를 한 번씩 읽어 인덱스(같은 대회 영상이 여럿이라 반복 조회를 피한다)
    const byComp = new Map()
    for (const d of docs) {
      const c = Number(d.competitionID)
      if (!byComp.has(c)) byComp.set(c, [])
      byComp.get(c).push(d)
    }
    const timesColl = sp.collection('times')
    const bulk = []
    let ok = 0; let multi = 0; let none = 0
    for (const [cid, list] of byComp) {
      const rows = await timesColl.find({ competitionID: cid }, { projection: TIMES_PROJ }).toArray()
      const idx = buildTimesIndex(rows)
      for (const d of list) {
        const m = matchDoc(idx, d)
        if (m.status === 'ok') ok++
        else if (m.status === 'multi') multi++
        else none++
        if (m.timeID != null) bulk.push({ updateOne: { filter: { _id: d._id }, update: { $set: { timeID: m.timeID, updatedAt: new Date() } } } })
      }
    }
    let modified = 0
    if (bulk.length) { const r = await sp.collection('youtube').bulkWrite(bulk); modified = r.modifiedCount || 0 }
    res.json({ total: docs.length, ok, multi, none, modified })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 기사 저장 — timeID 붙은 유튜브를 해당 기사에 붙인다 ──
// 유튜브.timeID → times(unique·competitionID) → article(competitionID + unique) 을 찾아
// articles.youtube = { url, caption(=유튜브 제목) } 를 저장한다.
router.post('/save-articles', async (req, res) => {
  try {
    const sp = await SP()
    const { competitionID, ids } = req.body || {}
    // times 매칭까지 끝난(timeID 있는) 영상만 대상. ids 를 주면 그 영상들만(체크한 것만).
    const filter = { timeID: { $nin: [null, ''] } }
    if (Array.isArray(ids) && ids.length) filter._id = { $in: ids.map(toId).filter(Boolean) }
    else if (competitionID != null && String(competitionID).trim() !== '') filter.competitionID = Number(competitionID)
    const yts = await sp.collection('youtube')
      .find(filter, { projection: { timeID: 1, url: 1, title: 1, competitionID: 1 } })
      .toArray()
    if (!yts.length) return res.json({ total: 0, articles: 0, matched: 0, saved: 0, noArticle: 0, noUnique: 0 })

    // timeID → times(unique, competitionID) 한 번에 조회
    const timeIDs = [...new Set(yts.map((y) => y.timeID).filter((v) => v != null))]
    const tRows = await sp.collection('times')
      .find({ timeID: { $in: timeIDs } }, { projection: { timeID: 1, unique: 1, competitionID: 1 } })
      .toArray()
    const tById = new Map(tRows.map((t) => [t.timeID, t]))

    // (competitionID + unique) 로 기사를 묶는다 — 같은 기사에 영상이 여럿이면 마지막 것이 남는다.
    const byArticle = new Map()
    let noUnique = 0
    for (const y of yts) {
      const t = tById.get(y.timeID)
      const uq = t?.unique
      const cid = t?.competitionID ?? y.competitionID
      if (!uq || cid == null || String(cid).trim() === '') { noUnique++; continue }
      byArticle.set(`${Number(cid)}|${uq}`, {
        cid: Number(cid), uq,
        youtube: { url: String(y.url || ''), caption: String(y.title || '') },
      })
    }
    const bulk = [...byArticle.values()].map((a) => ({
      updateOne: {
        filter: { competitionID: a.cid, unique: a.uq },
        update: { $set: { youtube: a.youtube, updatedAt: new Date() } },
      },
    }))
    let matched = 0; let saved = 0
    if (bulk.length) {
      const r = await sp.collection('articles').bulkWrite(bulk)
      matched = r.matchedCount || 0
      saved = r.modifiedCount || 0
    }
    res.json({ total: yts.length, articles: byArticle.size, matched, saved, noArticle: bulk.length - matched, noUnique })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 행 편집 + 재매칭 — { name, gender, discipline, distance, time } 저장 후
// competitionID 로 times 를 다시 찾아 timeID 를 설정한다(이미지 상세의 편집·재매칭과 같은 방식).
const EDITABLE = ['name', 'gender', 'discipline', 'distance', 'time']
router.put('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const sp = await SP()
    const cur = await sp.collection('youtube').findOne({ _id })
    if (!cur) return res.status(404).json({ error: 'not found' })
    const body = req.body || {}
    const $set = { updatedAt: new Date() }
    for (const k of EDITABLE) if (k in body) $set[k] = String(body[k] ?? '')
    if ($set.name != null) $set.name = nfc($set.name).trim()   // 직접 입력한 이름은 NFC 로
    const merged = { ...cur, ...$set }
    let status = 'skip'
    // competitionID(대회 매칭됨)가 있으면 편집값으로 times 재매칭 → timeID 설정(없으면 null 로 해제)
    if (merged.competitionID != null && String(merged.competitionID).trim() !== '') {
      const rows = await sp.collection('times').find({ competitionID: Number(merged.competitionID) }, { projection: TIMES_PROJ }).toArray()
      const m = matchDoc(buildTimesIndex(rows), merged)
      $set.timeID = m.timeID
      status = m.status
    }
    await sp.collection('youtube').updateOne({ _id }, { $set })
    const doc = await sp.collection('youtube').findOne({ _id })
    res.json({ ...doc, matchStatus: status })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 대회 매칭 — { ids: [...], competitionID } → 선택한 영상들에 competitionID(및 대회명) 저장
router.post('/match', async (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || []
    const cidRaw = req.body && req.body.competitionID
    const oids = ids.map(toId).filter(Boolean)
    if (!oids.length) return res.status(400).json({ error: 'ids 가 비어 있습니다.' })
    if (cidRaw == null || String(cidRaw).trim() === '') return res.status(400).json({ error: '대회를 선택하세요.' })
    const cid = Number(cidRaw)
    if (Number.isNaN(cid)) return res.status(400).json({ error: 'competitionID 가 올바르지 않습니다.' })
    // 대회명도 함께 맞춰 저장(표시·일관성) — competitions 에서 공식 이름을 가져온다
    const comp = await (await SP()).collection('competitions').findOne({ competitionID: cid }, { projection: { competitionName: 1 } })
    const $set = { competitionID: cid, updatedAt: new Date() }
    if (comp?.competitionName) $set.competitionName = comp.competitionName
    const r = await (await coll()).updateMany({ _id: { $in: oids } }, { $set })
    res.json({ matched: r.matchedCount, modified: r.modifiedCount, competitionID: cid, competitionName: $set.competitionName || '' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
