// 기록(times) — 대상: SwimmingPhotography DB 의 times 컬렉션.
// 원본 Breaststroke DB 의 mergedTimes 에서 대회·일자로 '가져와(upsert)' 관리하고, 수동 추가/편집/삭제도 지원.
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { SP, BR } from '../db.js'

const router = Router()
const coll = async () => (await SP()).collection('times')          // 대상
const toId = (id) => { try { return new ObjectId(id) } catch { return null } }

// 대회 select 옵션 (필터용) — SwimmingPhotography DB 의 competitions(가져온 대회들), 최신순
router.get('/competitions', async (req, res) => {
  try {
    const { q, limit = 2000 } = req.query
    const filter = {}
    if (q) filter.competitionName = { $regex: String(q), $options: 'i' }
    const docs = await (await SP()).collection('competitions')
      .find(filter, { projection: { competitionID: 1, competitionName: 1, datetime: 1 } })
      .sort({ competitionID: -1 })
      .limit(Math.min(Number(limit) || 2000, 5000))
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 목록 (SP.times) — 대회·성별·영법·거리·코스·일자 필터
router.get('/', async (req, res) => {
  try {
    const { competitionID, gender, discipline, distance, course, date, name, limit = 2000 } = req.query
    const filter = {}
    if (competitionID) filter.competitionID = Number(competitionID)
    if (gender) filter.gender = String(gender)
    if (discipline) filter.discipline = String(discipline)
    if (distance) filter.distance = String(distance)
    if (course) filter.course = String(course)
    if (date) filter.datetime = { $regex: `^${String(date)}` }
    if (name) filter.name = { $regex: String(name), $options: 'i' }
    const docs = await (await coll()).find(filter).limit(Math.min(Number(limit) || 2000, 10000)).toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 가져오기 — mergedTimes(대회+일자) → SP.times upsert (timeID 기준, 없으면 원본 _id)
router.post('/import', async (req, res) => {
  try {
    const { competitionID, competition, date } = req.body || {}
    const filter = {}
    if (competitionID != null && competitionID !== '') filter.competitionID = Number(competitionID)
    if (competition) filter.competitionName = { $regex: String(competition), $options: 'i' }
    if (date) filter.datetime = { $regex: `^${String(date)}` }
    if (!Object.keys(filter).length) return res.status(400).json({ error: '대회 또는 일자를 지정하세요.' })

    // 대회정보가 SP.competitions 에 없으면 원본(Breaststroke)에서 복사해 추가
    let competitionAdded = false
    const cid = (competitionID != null && competitionID !== '') ? Number(competitionID) : null
    if (cid != null) {
      const spComp = (await SP()).collection('competitions')
      const exists = await spComp.findOne({ competitionID: cid })
      if (!exists) {
        const brComp = await (await BR()).collection('competitions').findOne({ competitionID: cid })
        if (brComp) { const cc = { ...brComp }; delete cc._id; await spComp.insertOne(cc); competitionAdded = true }
      }
    }

    const rows = await (await BR()).collection('mergedTimes').find(filter).limit(10000).toArray()
    if (!rows.length) return res.json({ matched: 0, inserted: 0, skipped: 0, competitionAdded })
    const c = await coll()
    // 이미 SP.times 에 있는 것은 제외하고 '없는 것만' insert (timeID 기준, 없으면 원본 _id)
    const tids = rows.map((r) => r.timeID).filter((v) => v != null)
    const sids = rows.filter((r) => r.timeID == null).map((r) => String(r._id))
    const [exTid, exSid] = await Promise.all([
      tids.length ? c.distinct('timeID', { timeID: { $in: tids } }) : [],
      sids.length ? c.distinct('_srcId', { _srcId: { $in: sids } }) : [],
    ])
    const exTidSet = new Set(exTid), exSidSet = new Set(exSid)
    const toInsert = rows
      .filter((r) => (r.timeID != null) ? !exTidSet.has(r.timeID) : !exSidSet.has(String(r._id)))
      .map((r) => { const d = { ...r }; delete d._id; if (d.timeID == null) d._srcId = String(r._id); return d })
    if (toInsert.length) await c.insertMany(toInsert, { ordered: false })

    // 선수 요약 재집계 → SP.athletes upsert
    // 단체전(FRR·MR)·time 없거나 "" 제외, name+gender+group 별 time count
    const summary = await c.aggregate([
      { $match: { time: { $type: 'string', $ne: '' }, discipline: { $nin: ['FRR', 'MR'] } } },
      {
        $group: {
          _id: { name: '$name', gender: '$gender', group: '$group' },
          name: { $first: '$name' },
          gender: { $first: '$gender' },
          group: { $first: '$group' },
          team: { $first: '$team' },
          timeCount: { $sum: 1 },
        },
      },
    ]).toArray()
    let athletesUpserted = 0
    if (summary.length) {
      const now = new Date()
      const athColl = (await SP()).collection('athletes')
      const ops = summary.map((s) => ({
        updateOne: {
          filter: { name: s.name ?? '', gender: s.gender ?? '', group: s.group ?? '' },
          update: { $set: { name: s.name ?? '', gender: s.gender ?? '', group: s.group ?? '', team: s.team ?? '', timeCount: s.timeCount, updatedAt: now } },
          upsert: true,
        },
      }))
      const rw = await athColl.bulkWrite(ops, { ordered: false })
      athletesUpserted = (rw.upsertedCount || 0) + (rw.modifiedCount || 0)
    }

    res.json({ matched: rows.length, inserted: toInsert.length, skipped: rows.length - toInsert.length, competitionAdded, athletes: summary.length, athletesUpserted })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 일괄 삭제 — { ids: [...] }
router.post('/delete-many', async (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || []
    const oids = ids.map(toId).filter(Boolean)
    if (!oids.length) return res.status(400).json({ error: 'ids 가 비어 있습니다.' })
    const r = await (await coll()).deleteMany({ _id: { $in: oids } })
    res.json({ deleted: r.deletedCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 생성 (수동 기록추가)
router.post('/', async (req, res) => {
  try {
    const doc = { ...req.body }
    delete doc._id
    const r = await (await coll()).insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 수정
router.put('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const body = { ...req.body }
    delete body._id
    const r = await (await coll()).findOneAndUpdate({ _id }, { $set: body }, { returnDocument: 'after' })
    const doc = r && (r.value || r)
    if (!doc || !doc._id) return res.status(404).json({ error: 'not found' })
    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 삭제
router.delete('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const r = await (await coll()).deleteOne({ _id })
    if (!r.deletedCount) return res.status(404).json({ error: 'not found' })
    res.status(204).end()
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
