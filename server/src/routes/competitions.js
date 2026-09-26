// competitions 컬렉션 CRUD (SwimmingPhotography DB) — 대회.
// GET /api/competitions?limit=300&q=검색어  (competitionID 내림차순)
import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import { SP, BR } from '../db.js'
import { putObject, deleteObject } from '../r2.js'

const router = Router()
const coll = async () => (await SP()).collection('competitions')

const toId = (id) => {
  try { return new ObjectId(id) } catch { return null }
}

// ── 이미지 업로드 (R2/S3 호환) ──────────────────────────────────────────────
// CLOUD_BUCKET(swimmingphotography-bucket) 의 'SP-competitions-<competitionID>/<파일명>' 키로 저장.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i
const safeName = (s) => String(s).replace(/[^\w.\-가-힣]/g, '_')
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 50 }, // 장당 20MB, 최대 50장
  fileFilter: (req, file, cb) => cb(null, IMAGE_EXT.test(file.originalname)),
})

// 목록 (최신 대회 우선). q=대회명 부분검색, year=개최연도(datetime 앞 4자리).
// fields=list  — 공개 사이트(대회 목록)용 가벼운 응답. images 배열이 대회당 수백 건이라
//                그대로 내보내면 목록 한 번에 수 MB 가 된다.
// sort=date     — 대회일자 최신순. (기본은 예전처럼 competitionID 내림차순 — 대시보드가 쓴다)
const LIST_PROJECTION = { _id: 0, competitionID: 1, competitionName: 1, datetime: 1, pool: 1, sido: 1, gungu: 1, course: 1 }
router.get('/', async (req, res) => {
  try {
    const { q, year, fields, sort, limit = 300 } = req.query
    const filter = {}
    if (q) filter.competitionName = { $regex: String(q), $options: 'i' }
    if (year) filter.datetime = { $regex: `^${String(year)}` }
    const docs = await (await coll())
      .find(filter, fields === 'list' ? { projection: LIST_PROJECTION } : undefined)
      // 같은 날짜의 대회가 여럿이면 competitionID 로 동점을 깬다
      .sort(sort === 'date' ? { datetime: -1, competitionID: -1 } : { competitionID: -1 })
      .limit(Math.min(Number(limit) || 300, 2000))
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 종목·거리별 통계 — GET /api/competitions/stats[?competitionID=3616]
//   한 줄 = (영법·거리) : starts(출전 수) · startPct(대회 전체 start 중 비중) · articles(기사 수)
// articles 는 '그 종목을 뛴 선수 중 게시 기사가 있는 선수'의 수다. 기사는 선수 단위(competitionID+unique)라
// 종목마다 따로 있지 않기 때문에, 그 종목 출전자와 기사 보유자를 맞춰 센다.
// 계영(FRR·MR)은 unique 가 없고 name_unique 에 멤버 명단이 들어 있어 멤버 각각을 선수 키로 본다.
// (/:id 보다 먼저 등록해야 'stats' 가 id 로 잡히지 않는다)
const RELAY = ['FRR', 'MR']
router.get('/stats', async (req, res) => {
  try {
    const { competitionID } = req.query
    const cid = (competitionID != null && String(competitionID).trim() !== '') ? Number(competitionID) : null
    const db = await SP()
    const match = cid != null ? { competitionID: cid } : {}

    const rows = await db.collection('times').aggregate([
      { $match: match },
      {
        $project: {
          competitionID: 1, discipline: 1, distance: 1,
          // 선수 키 — 개인은 unique 하나, 계영은 name_unique 멤버 전부
          keys: {
            $cond: [
              { $in: [{ $ifNull: ['$discipline', ''] }, RELAY] },
              { $ifNull: ['$name_unique', []] },
              { $cond: [{ $in: [{ $type: '$unique' }, ['string']] }, ['$unique'], []] },
            ],
          },
        },
      },
      { $group: { _id: { c: '$competitionID', d: '$discipline', dist: '$distance' }, starts: { $sum: 1 }, keys: { $push: '$keys' } } },
      // keys 는 배열의 배열 — 하나로 합치며 중복 제거
      { $project: { starts: 1, keys: { $reduce: { input: '$keys', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } } },
      { $sort: { starts: -1 } },
    ]).toArray()

    // 대회별 '기사 있는 선수' — 공개 사이트 기준이라 게시된 기사만 센다
    const artRows = await db.collection('articles').aggregate([
      { $match: { ...match, status: 'published' } },
      { $group: { _id: '$competitionID', athletes: { $addToSet: '$unique' } } },
    ]).toArray()
    const artBy = new Map(artRows.map((r) => [r._id, new Set((r.athletes || []).filter(Boolean))]))

    // 대회별 총 start — 비중(startPct) 의 분모
    const totals = new Map()
    for (const r of rows) totals.set(r._id.c, (totals.get(r._id.c) || 0) + r.starts)

    const out = {}
    for (const r of rows) {
      const c = r._id.c
      const arts = artBy.get(c) || new Set()
      const total = totals.get(c) || 0
      if (!out[c]) out[c] = []
      out[c].push({
        discipline: r._id.d || '',
        distance: r._id.dist || '',
        starts: r.starts,
        startPct: total ? Math.round((r.starts / total) * 1000) / 10 : 0,
        articles: (r.keys || []).filter((k) => arts.has(k)).length,
      })
    }
    res.json({ stats: out, totals: Object.fromEntries(totals) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 원본 대회 검색 (Breaststroke DB) — 대시보드에서 가져와 SP로 등록하기 위한 조회용.
// GET /api/competitions/source?q=검색어&limit=50   (반드시 /:id 보다 먼저 등록)
router.get('/source', async (req, res) => {
  try {
    const { q, year, limit = 50 } = req.query
    const filter = {}
    if (q) filter.competitionName = { $regex: String(q), $options: 'i' }
    if (year) filter.datetime = { $regex: `^${String(year)}` }
    const docs = await (await BR()).collection('competitions')
      .find(filter)
      .sort({ competitionID: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const doc = await (await coll()).findOne({ _id })
    if (!doc) return res.status(404).json({ error: 'not found' })
    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 생성 — competitionID 미지정 시 max+1 자동 부여
router.post('/', async (req, res) => {
  try {
    const c = await coll()
    const doc = { ...req.body }
    delete doc._id
    if (doc.competitionID == null || doc.competitionID === '') {
      const last = await c.find({}).sort({ competitionID: -1 }).limit(1).next()
      doc.competitionID = ((last && last.competitionID) || 0) + 1
    } else {
      doc.competitionID = Number(doc.competitionID)
    }
    const r = await c.insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const body = { ...req.body }
    delete body._id
    if (body.competitionID != null) body.competitionID = Number(body.competitionID)
    const r = await (await coll()).findOneAndUpdate(
      { _id },
      { $set: body },
      { returnDocument: 'after' },
    )
    const doc = r && (r.value || r)
    if (!doc || !doc._id) return res.status(404).json({ error: 'not found' })
    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 이미지 업로드 — multipart 'files' → R2 업로드 후 doc.images 에 추가 ──
// 키: SP-competitions-<competitionID>/<파일명>. 같은 파일명은 덮어씀.
router.post('/:id/images', upload.array('files', 50), async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const c = await coll()
    const doc0 = await c.findOne({ _id }, { projection: { competitionID: 1 } })
    if (!doc0) return res.status(404).json({ error: 'not found' })
    const files = req.files || []
    if (!files.length) return res.json({ added: 0, images: [] })
    const cid = (doc0.competitionID != null && doc0.competitionID !== '') ? doc0.competitionID : String(_id)
    const prefix = `SP-competitions-${cid}`
    const now = new Date()
    const items = []
    for (const f of files) {
      const name = safeName(f.originalname)
      const key = `${prefix}/${name}`
      const { url } = await putObject(key, f.buffer, f.mimetype)
      items.push({ url, key, filename: name, size: f.size, uploadedAt: now })
    }
    const r = await c.findOneAndUpdate(
      { _id },
      { $push: { images: { $each: items } } },
      { returnDocument: 'after' },
    )
    const doc = r && (r.value || r)
    res.json({ added: items.length, results: items, images: (doc && doc.images) || items })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 이미지 삭제 — { url } 로 doc.images 에서 제거하고 R2 오브젝트도 삭제 ──
router.delete('/:id/images', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const url = req.body && req.body.url
    if (!url) return res.status(400).json({ error: 'url 이 필요합니다.' })
    const c = await coll()
    // 삭제 대상의 R2 key 확보 (문서에서 조회)
    const cur = await c.findOne({ _id }, { projection: { images: 1 } })
    const target = ((cur && cur.images) || []).find((im) => im.url === url)
    const r = await c.findOneAndUpdate(
      { _id },
      { $pull: { images: { url } } },
      { returnDocument: 'after' },
    )
    if (target && target.key) {
      try { await deleteObject(target.key) } catch { /* R2 없음/권한 이상 시 무시 */ }
    }
    const doc = r && (r.value || r)
    res.json({ images: (doc && doc.images) || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

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
