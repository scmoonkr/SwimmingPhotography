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

    // eventRank — 종목(부) 단위 순위. rank 는 heat 별 순위라,
    // 같은 (성별·부·영법·거리·라운드) 안에서 timeStamp 오름차순으로 다시 매긴다.
    // round 가 있으면 각 라운드별로 매겨져 결승 기록엔 '결승 기준' 순위가 부여된다.
    // DQ/DNS·빈 time 은 순위 제외. 동타임은 같은 순위(1224 방식).
    let eventRanked = 0
    if (cid != null) {
      const groups = await c.aggregate([
        { $match: { competitionID: cid, time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] }, timeStamp: { $type: 'number' } } },
        { $sort: { timeStamp: 1 } },
        {
          $group: {
            _id: { gender: '$gender', ageGroup: '$ageGroup', discipline: '$discipline', distance: '$distance', round: '$round' },
            docs: { $push: { id: '$_id', ts: '$timeStamp' } },
          },
        },
      ]).toArray()
      const rankOps = []
      for (const g of groups) {
        let rank = 0, seen = 0, prevTs = null
        for (const d of g.docs) {
          seen++
          if (prevTs === null || d.ts !== prevTs) rank = seen // 동타임이면 같은 순위, 다르면 현재 위치
          prevTs = d.ts
          rankOps.push({ updateOne: { filter: { _id: d.id }, update: { $set: { eventRank: rank } } } })
        }
      }
      if (rankOps.length) { const rr = await c.bulkWrite(rankOps, { ordered: false }); eventRanked = rr.modifiedCount + rr.upsertedCount }
    }

    // 선수 요약 재집계 → SP.athletes upsert
    // 단체전(FRR·MR)·time 없거나 "" 제외, name+gender+group 별 time count
    const summary = await c.aggregate([
      { $match: { time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] }, discipline: { $nin: ['FRR', 'MR'] } } },
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

    // 이 대회의 참가 규모 집계 → SP.competitions 에 기록
    // 팀수 = 소속 distinct, 선수수 = name+gender distinct(단체전 제외), start수 = 개인 출전 기록 수
    let stats = null
    if (cid != null) {
      const IND = { discipline: { $nin: ['FRR', 'MR'] } } // 단체전(계영) 제외
      const [agg] = await c.aggregate([
        { $match: { competitionID: cid, time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] } } },
        {
          $facet: {
            teams: [{ $match: { team: { $type: 'string', $ne: '' } } }, { $group: { _id: '$team' } }, { $count: 'n' }],
            athletes: [{ $match: IND }, { $group: { _id: { name: '$name', gender: '$gender' } } }, { $count: 'n' }],
            starts: [{ $match: IND }, { $count: 'n' }],
            // 종목별 time count — [{ discipline, count }] (계영 포함, count 내림차순)
            disciplines: [
              { $match: { discipline: { $type: 'string', $ne: '' } } },
              { $group: { _id: '$discipline', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $project: { _id: 0, discipline: '$_id', count: 1 } },
            ],
          },
        },
        {
          $project: {
            teamCount: { $ifNull: [{ $arrayElemAt: ['$teams.n', 0] }, 0] },
            athleteCount: { $ifNull: [{ $arrayElemAt: ['$athletes.n', 0] }, 0] },
            startCount: { $ifNull: [{ $arrayElemAt: ['$starts.n', 0] }, 0] },
            disciplines: '$disciplines',
          },
        },
      ]).toArray()
      // 팀 × (성별·영법·거리) 상세 — [{ team, gender, discipline, distance, athleteCount, startCount, goldCount, silverCount, bronzeCount }]
      const teamRows = await c.aggregate([
        { $match: { competitionID: cid, time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] }, team: { $type: 'string', $ne: '' } } },
        {
          $group: {
            _id: { team: '$team', gender: '$gender', discipline: '$discipline', distance: '$distance' },
            names: { $addToSet: '$name' },
            startCount: { $sum: 1 },
            goldCount: { $sum: { $cond: [{ $eq: ['$rank', 1] }, 1, 0] } },
            silverCount: { $sum: { $cond: [{ $eq: ['$rank', 2] }, 1, 0] } },
            bronzeCount: { $sum: { $cond: [{ $eq: ['$rank', 3] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            team: '$_id.team', gender: '$_id.gender', discipline: '$_id.discipline', distance: '$_id.distance',
            athleteCount: { $size: '$names' },
            startCount: 1, goldCount: 1, silverCount: 1, bronzeCount: 1,
          },
        },
        { $sort: { team: 1, gender: 1, discipline: 1, distance: 1 } },
      ]).toArray()

      if (agg) {
        stats = { ...agg, teamRows: teamRows.length }
        await (await SP()).collection('competitions').updateOne(
          { competitionID: cid },
          { $set: { ...agg, teams: teamRows, statsUpdatedAt: new Date() } },
        )
      }
    }

    res.json({ matched: rows.length, inserted: toInsert.length, skipped: rows.length - toInsert.length, competitionAdded, eventRanked, athletes: summary.length, athletesUpserted, stats })
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

// 파일(CSV) 행 업서트 — { rows: [{ timeID, name, gender, heat, ageGroup, team,
//   discipline, distance, round, time, rank, image1..image5 }] }
// timeID 있으면 그 키로 upsert, 없으면 insert. image1~5 → images:[{filename}].
router.post('/import-rows', async (req, res) => {
  try {
    const rows = (req.body && req.body.rows) || []
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows 가 비어 있습니다.' })
    const num = (v) => (v === '' || v == null ? null : Number(v))
    const str = (v) => (v == null ? '' : String(v).trim())
    const c = await coll()
    const ops = []
    for (const r of rows) {
      const images = [r.image1, r.image2, r.image3, r.image4, r.image5]
        .map(str).filter(Boolean).map((filename) => ({ filename }))
      const doc = {
        name: str(r.name), gender: str(r.gender), heat: num(r.heat), ageGroup: str(r.ageGroup),
        team: str(r.team), discipline: str(r.discipline), distance: str(r.distance),
        round: str(r.round), time: str(r.time), rank: num(r.rank),
      }
      if (images.length) doc.images = images
      const timeID = num(r.timeID)
      if (timeID != null && !Number.isNaN(timeID)) {
        doc.timeID = timeID
        ops.push({ updateOne: { filter: { timeID }, update: { $set: doc }, upsert: true } })
      } else {
        ops.push({ insertOne: { document: doc } })
      }
    }
    const rw = await c.bulkWrite(ops, { ordered: false })
    res.json({
      received: rows.length,
      upserted: rw.upsertedCount || 0,
      modified: rw.modifiedCount || 0,
      inserted: rw.insertedCount || 0,
    })
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
