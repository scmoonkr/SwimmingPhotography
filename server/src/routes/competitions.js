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
router.get('/', async (req, res) => {
  try {
    const { q, year, limit = 300 } = req.query
    const filter = {}
    if (q) filter.competitionName = { $regex: String(q), $options: 'i' }
    if (year) filter.datetime = { $regex: `^${String(year)}` }
    const docs = await (await coll())
      .find(filter)
      .sort({ competitionID: -1 })
      .limit(Math.min(Number(limit) || 300, 2000))
      .toArray()
    res.json(docs)
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
