// 재고검수(실사) — 시작하면 그 시점의 전산 수량을 스냅샷으로 떠 두고, 실제로 센 수량을 입력한 뒤 완료하면
// 차이만큼 'adjust' 이력이 쌓여 재고가 맞춰진다. 검수 중에 입출고가 있어도 완료 시점의 현재고 기준으로 보정한다.
import { Router } from 'express'
import { col, nextSeq } from '../db.js'
import { requireCap } from '../auth.js'
import { oid } from '../crud.js'
import { KINDS, flatItems, onHandMap, planMoves, commitMoves } from '../stockLib.js'

const router = Router()
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })

router.get('/', async (req, res) => {
  try {
    const q = {}
    if (['진행중', '완료'].includes(req.query.status)) q.status = req.query.status
    const items = await (await col('stocktakes')).find(q, { projection: { lines: 0 } }).sort({ no: -1 }).limit(100).toArray()
    res.json({ items })
  } catch (e) { fail(res, e) }
})

router.get('/:id', async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const st = _id && await (await col('stocktakes')).findOne({ _id })
    if (!st) return res.status(404).json({ error: '없는 검수입니다.' })
    res.json(st)
  } catch (e) { fail(res, e) }
})

// 시작 — { kind, note, category? } : 해당 종류의 사용 중인 모든 항목(또는 한 분류)을 담는다
router.post('/', requireCap('stock'), async (req, res) => {
  try {
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'material'
    const items = await flatItems(kind, { activeOnly: true, category: req.body?.category ? String(req.body.category) : undefined })
    if (!items.length) return res.status(400).json({ error: '검수할 항목이 없습니다.' })
    const stock = await onHandMap(kind)
    const now = new Date()
    const doc = {
      no: await nextSeq('stocktakeNo'), kind, status: '진행중', note: String(req.body?.note || ''),
      lines: items.map((it) => ({
        code: it.code, name: it.name, category: it.category || '', color: it.color || '', size: it.size || '', unit: it.unit || '개',
        systemQty: stock.get(it.code)?.onHand || 0, countedQty: null, diff: null,
      })),
      createdAt: now, createdBy: req.user.username,
    }
    const r = await (await col('stocktakes')).insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { fail(res, e) }
})

// 실사 수량 저장 — { lines: [{ code, countedQty }] } (빈 값이면 미입력으로 되돌림), note
router.patch('/:id', requireCap('stock'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('stocktakes')
    const st = _id && await c.findOne({ _id })
    if (!st) return res.status(404).json({ error: '없는 검수입니다.' })
    if (st.status !== '진행중') return res.status(409).json({ error: '완료된 검수는 바꿀 수 없습니다.' })
    const input = new Map((Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => [String(l.code), l.countedQty]))
    const lines = st.lines.map((l) => {
      if (!input.has(l.code)) return l
      const v = input.get(l.code)
      if (v === '' || v == null) return { ...l, countedQty: null, diff: null }
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${l.code}: 수량이 올바르지 않습니다.`), { status: 400 })
      return { ...l, countedQty: n, diff: n - l.systemQty }
    })
    const set = { lines }
    if ('note' in (req.body || {})) set.note = String(req.body.note || '')
    res.json(await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' }))
  } catch (e) { fail(res, e) }
})

// 완료 — 입력된 줄만 보정한다(미입력은 건드리지 않는다)
router.post('/:id/complete', requireCap('stock'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('stocktakes')
    const st = _id && await c.findOne({ _id })
    if (!st) return res.status(404).json({ error: '없는 검수입니다.' })
    if (st.status !== '진행중') return res.status(409).json({ error: '이미 완료된 검수입니다.' })
    const counted = st.lines.filter((l) => l.countedQty != null)
    if (!counted.length) return res.status(400).json({ error: '입력된 실사 수량이 없습니다.' })

    const moves = await planMoves(
      counted.map((l) => ({ kind: st.kind, code: l.code, type: 'adjust', qty: l.countedQty, reason: '재고검수', note: `검수 #${st.no}` })),
      req.user, { refType: 'stocktake', refId: st._id },
    )
    await commitMoves(moves)
    const next = await c.findOneAndUpdate(
      { _id },
      { $set: { status: '완료', completedAt: new Date(), completedBy: req.user.username, adjusted: moves.length, skipped: st.lines.length - counted.length } },
      { returnDocument: 'after' },
    )
    res.json(next)
  } catch (e) { fail(res, e) }
})

router.delete('/:id', requireCap('stock'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('stocktakes')
    const st = _id && await c.findOne({ _id })
    if (!st) return res.status(404).json({ error: '없는 검수입니다.' })
    if (st.status !== '진행중') return res.status(409).json({ error: '완료된 검수는 삭제할 수 없습니다.' })
    await c.deleteOne({ _id })
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

export default router
