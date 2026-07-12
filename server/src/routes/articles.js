// articles 컬렉션 CRUD (SwimmingPhotography DB) — 속보 등 기사.
// GET /api/articles?type=breaking_news&status=published&limit=100
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { SP } from '../db.js'

const router = Router()
const coll = async () => (await SP()).collection('articles')

const toId = (id) => {
  try { return new ObjectId(id) } catch { return null }
}

// 목록. type/status 외에 category(searchCategories 포함), q(제목 부분검색) 지원.
router.get('/', async (req, res) => {
  try {
    const { type, status, category, q, limit = 200 } = req.query
    const filter = {}
    if (type) filter.type = type
    if (status) filter.status = status
    if (category) filter.searchCategories = String(category)
    if (q) filter['translations.ko.title'] = { $regex: String(q), $options: 'i' }
    const docs = await (await coll())
      .find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(Number(limit) || 200)
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 단건
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

// 생성
router.post('/', async (req, res) => {
  try {
    const now = new Date()
    const doc = { ...req.body, createdAt: now, updatedAt: now }
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
    const body = { ...req.body, updatedAt: new Date() }
    delete body._id
    delete body.createdAt
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
