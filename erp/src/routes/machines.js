// 자수기(머신) — 이름과 침 1~7 에 현재 걸린 실. 작업관리에서 작업을 자수기에 배정하고,
// 작업을 시작·완료하면 그 작업의 실이 자수기에 걸린 것으로 갱신된다 (schedule.js).
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { oid } from '../crud.js'
import { loadAppSettings } from '../settings.js'
import { normNeedles } from '../machineLib.js'

const router = Router()
const str = (v, n = 40) => String(v ?? '').trim().slice(0, n)
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })

// 목록 + 실 교체 시간(분)
router.get('/', async (_req, res) => {
  try {
    const items = await (await col('machines')).find({}).sort({ order: 1, name: 1 }).toArray()
    res.json({ items, swapMinutes: (await loadAppSettings()).swapMinutes })
  } catch (e) { fail(res, e) }
})

router.post('/', requireCap('work', 'settings'), async (req, res) => {
  try {
    const c = await col('machines')
    const name = str(req.body?.name)
    if (!name) return res.status(400).json({ error: '자수기 이름을 입력하세요.' })
    if (await c.findOne({ name })) return res.status(409).json({ error: `이미 있는 이름입니다: ${name}` })
    const order = (await c.find({}).sort({ order: -1 }).limit(1).next())?.order ?? 0
    const doc = { name, needles: normNeedles(req.body?.needles), active: true, order: order + 1, createdAt: new Date(), updatedAt: new Date() }
    const r = await c.insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { fail(res, e) }
})

// 여러 대를 한 번에 — { count, prefix? }  (예: 8대 → 자수기 1 … 자수기 8)
router.post('/bulk', requireCap('work', 'settings'), async (req, res) => {
  try {
    const n = Math.round(Number(req.body?.count))
    if (!(n >= 1 && n <= 30)) return res.status(400).json({ error: '1~30대까지 만들 수 있습니다.' })
    const prefix = str(req.body?.prefix, 20) || '자수기'
    const c = await col('machines')
    let order = (await c.find({}).sort({ order: -1 }).limit(1).next())?.order ?? 0
    const made = []
    for (let i = 1; i <= n; i++) {
      const name = `${prefix} ${i}`
      if (await c.findOne({ name })) continue
      const doc = { name, needles: normNeedles([]), active: true, order: ++order, createdAt: new Date(), updatedAt: new Date() }
      made.push({ ...doc, _id: (await c.insertOne(doc)).insertedId })
    }
    res.status(201).json({ items: made })
  } catch (e) { fail(res, e) }
})

router.patch('/:id', requireCap('work', 'settings'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('machines')
    if (!_id || !await c.findOne({ _id }, { projection: { _id: 1 } })) return res.status(404).json({ error: '없는 자수기입니다.' })
    const b = req.body || {}
    const set = { updatedAt: new Date() }
    if ('name' in b) {
      const name = str(b.name)
      if (!name) return res.status(400).json({ error: '자수기 이름을 입력하세요.' })
      if (await c.findOne({ name, _id: { $ne: _id } })) return res.status(409).json({ error: `이미 있는 이름입니다: ${name}` })
      set.name = name
    }
    if ('needles' in b) set.needles = normNeedles(b.needles)
    if ('active' in b) set.active = !!b.active
    if ('order' in b && Number.isFinite(Number(b.order))) set.order = Number(b.order)
    res.json(await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' }))
  } catch (e) { fail(res, e) }
})

// 삭제 — 이 자수기에 배정된 작업지시는 배정 없음으로 돌린다
router.delete('/:id', requireCap('work', 'settings'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    if (!_id) return res.status(404).json({ error: '없는 자수기입니다.' })
    await (await col('machines')).deleteOne({ _id })
    await (await col('workSchedules')).updateMany({ machineId: _id }, { $unset: { machineId: '' } })
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

export default router
