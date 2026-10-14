// 단순 마스터 데이터(거래처·고객) 공용 CRUD 라우터.
// fields: 허용 필드 화이트리스트 — 그 밖의 값은 무시한다.
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { col } from './db.js'
import { requireCap } from './auth.js'

export const oid = (v) => (ObjectId.isValid(v) ? new ObjectId(String(v)) : null)
export const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function crudRouter(name, fields, { searchIn = ['name'] } = {}) {
  const router = Router()
  const pick = (b = {}) => Object.fromEntries(fields.filter((f) => f in b).map((f) => [f, b[f]]))

  router.get('/', async (req, res) => {
    try {
      const q = {}
      if (req.query.q) q.$or = searchIn.map((f) => ({ [f]: { $regex: escRe(req.query.q), $options: 'i' } }))
      if (req.query.partnerId && oid(req.query.partnerId)) q.partnerId = oid(req.query.partnerId)
      const limit = Math.min(Number(req.query.limit) || 100, 500)
      const skip = Math.max(Number(req.query.skip) || 0, 0)
      const c = await col(name)
      const [items, total] = await Promise.all([
        c.find(q).sort({ name: 1 }).skip(skip).limit(limit).toArray(),
        c.countDocuments(q),
      ])
      res.json({ items, total })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get('/:id', async (req, res) => {
    try {
      const _id = oid(req.params.id)
      const doc = _id && await (await col(name)).findOne({ _id })
      if (!doc) return res.status(404).json({ error: '없는 항목입니다.' })
      res.json(doc)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/', requireCap('write'), async (req, res) => {
    try {
      const data = pick(req.body)
      if (!String(data.name || '').trim()) return res.status(400).json({ error: '이름은 필수입니다.' })
      if (data.partnerId) data.partnerId = oid(data.partnerId)
      const now = new Date()
      const doc = { ...data, name: String(data.name).trim(), createdAt: now, updatedAt: now, createdBy: req.user.username }
      const r = await (await col(name)).insertOne(doc)
      res.status(201).json({ ...doc, _id: r.insertedId })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/:id', requireCap('write'), async (req, res) => {
    try {
      const _id = oid(req.params.id)
      if (!_id) return res.status(404).json({ error: '없는 항목입니다.' })
      const data = pick(req.body)
      if ('partnerId' in data) data.partnerId = oid(data.partnerId)
      const r = await (await col(name)).findOneAndUpdate(
        { _id }, { $set: { ...data, updatedAt: new Date() } }, { returnDocument: 'after' },
      )
      if (!r) return res.status(404).json({ error: '없는 항목입니다.' })
      res.json(r)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id', requireCap('delete'), async (req, res) => {
    try {
      const _id = oid(req.params.id)
      const r = _id && await (await col(name)).deleteOne({ _id })
      if (!r?.deletedCount) return res.status(404).json({ error: '없는 항목입니다.' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
