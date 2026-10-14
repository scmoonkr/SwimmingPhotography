// 물품 발주 · 입고.
//   상태: 발주 → 부분입고 → 입고완료 (취소는 입고 전에만)
//   입고하면 stockMoves 에 'in'(reason '발주입고')이 쌓이고, 라인의 receivedQty 가 늘어난다.
import { Router } from 'express'
import { col, nextSeq } from '../db.js'
import { requireCap } from '../auth.js'
import { oid, escRe } from '../crud.js'
import { planMoves, commitMoves, flatItems } from '../stockLib.js'

export const PO_STATUSES = ['발주', '부분입고', '입고완료', '취소']
const router = Router()
const str = (v) => String(v ?? '').trim()
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
const date = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })
const bad = (message, status = 400) => Object.assign(new Error(message), { status })

// 입력 라인 → 저장 라인. 물품 마스터에서 이름·색상·사이즈를 복사해 두고, 단가가 없으면 구입가격을 쓴다.
async function buildLines(input, prev = []) {
  const lines = (Array.isArray(input) ? input : []).map((l) => ({ code: str(l.code), qty: num(l.qty), unitPrice: l.unitPrice === '' || l.unitPrice == null ? null : num(l.unitPrice) }))
    .filter((l) => l.code)
  if (!lines.length) throw bad('발주 품목이 없습니다.')
  if (lines.some((l) => l.qty <= 0)) throw bad('수량은 1 이상이어야 합니다.')
  if (new Set(lines.map((l) => l.code)).size !== lines.length) throw bad('같은 물품 코드가 중복되었습니다.')
  const mats = await flatItems('material', { codes: lines.map((l) => l.code) })
  const map = new Map(mats.map((m) => [m.code, m]))
  const received = new Map(prev.map((l) => [l.code, l.receivedQty || 0]))
  return lines.map((l) => {
    const m = map.get(l.code)
    if (!m) throw bad(`없는 물품 코드입니다: ${l.code}`)
    return {
      code: l.code, name: m.name, color: m.color || '', size: m.size || '', unit: m.unit || '개',
      qty: l.qty, unitPrice: l.unitPrice ?? m.price ?? 0, receivedQty: received.get(l.code) || 0,
    }
  })
}
const total = (lines) => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
const statusOf = (lines) => {
  const got = lines.reduce((s, l) => s + l.receivedQty, 0)
  if (!got) return '발주'
  return lines.every((l) => l.receivedQty >= l.qty) ? '입고완료' : '부분입고'
}

router.get('/', async (req, res) => {
  try {
    const q = {}
    if (req.query.status) q.status = { $in: String(req.query.status).split(',').filter((s) => PO_STATUSES.includes(s)) }
    if (req.query.q) {
      const re = { $regex: escRe(req.query.q), $options: 'i' }
      q.$or = [{ supplier: re }, { memo: re }, { 'lines.name': re }, { 'lines.code': re }]
      if (/^\d+$/.test(String(req.query.q))) q.$or.push({ poNo: Number(req.query.q) })
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const skip = Math.max(Number(req.query.skip) || 0, 0)
    const c = await col('purchaseOrders')
    const [items, count] = await Promise.all([c.find(q).sort({ poNo: -1 }).skip(skip).limit(limit).toArray(), c.countDocuments(q)])
    res.json({ items, total: count })
  } catch (e) { fail(res, e) }
})

router.get('/:id', async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const po = _id && await (await col('purchaseOrders')).findOne({ _id })
    if (!po) return res.status(404).json({ error: '없는 발주입니다.' })
    res.json(po)
  } catch (e) { fail(res, e) }
})

router.post('/', requireCap('write'), async (req, res) => {
  try {
    const b = req.body || {}
    const lines = await buildLines(b.lines)
    const now = new Date()
    const doc = {
      poNo: await nextSeq('poNo'),
      supplier: str(b.supplier), orderedAt: date(b.orderedAt) || now, expectedAt: date(b.expectedAt),
      memo: String(b.memo ?? ''), lines, total: total(lines), status: '발주',
      createdAt: now, updatedAt: now, createdBy: req.user.username,
    }
    const r = await (await col('purchaseOrders')).insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { fail(res, e) }
})

// 수정 — 입고가 시작된 뒤에는 품목을 바꿀 수 없다(발주처·예정일·메모만).
router.patch('/:id', requireCap('write'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('purchaseOrders')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 발주입니다.' })
    const b = req.body || {}
    const set = { updatedAt: new Date() }
    if ('supplier' in b) set.supplier = str(b.supplier)
    if ('orderedAt' in b) set.orderedAt = date(b.orderedAt) || cur.orderedAt
    if ('expectedAt' in b) set.expectedAt = date(b.expectedAt)
    if ('memo' in b) set.memo = String(b.memo ?? '')
    if ('lines' in b) {
      if (cur.lines.some((l) => l.receivedQty > 0) || cur.status === '취소') return res.status(409).json({ error: '입고가 시작되었거나 취소된 발주는 품목을 바꿀 수 없습니다.' })
      set.lines = await buildLines(b.lines, cur.lines)
      set.total = total(set.lines)
    }
    res.json(await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' }))
  } catch (e) { fail(res, e) }
})

// 입고 — { lines: [{ code, qty }] } 로 일부만도 가능. 발주 수량을 넘겨 들어와도 받는다(상태는 입고완료).
router.post('/:id/receive', requireCap('write'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('purchaseOrders')
    const po = _id && await c.findOne({ _id })
    if (!po) return res.status(404).json({ error: '없는 발주입니다.' })
    if (po.status === '취소') return res.status(409).json({ error: '취소된 발주입니다.' })

    const input = (Array.isArray(req.body?.lines) ? req.body.lines : [])
      .map((l) => ({ code: str(l.code), qty: num(l.qty) })).filter((l) => l.code && l.qty > 0)
    if (!input.length) return res.status(400).json({ error: '입고 수량을 입력하세요.' })
    const byCode = new Map(po.lines.map((l) => [l.code, l]))
    for (const l of input) if (!byCode.has(l.code)) return res.status(400).json({ error: `발주에 없는 물품입니다: ${l.code}` })

    const moves = await planMoves(
      input.map((l) => ({ kind: 'material', code: l.code, type: 'in', qty: l.qty, reason: '발주입고', note: `발주 #${po.poNo}` })),
      req.user, { refType: 'po', refId: po._id },
    )
    const lines = po.lines.map((l) => ({ ...l, receivedQty: l.receivedQty + (input.find((x) => x.code === l.code)?.qty || 0) }))
    const status = statusOf(lines)
    await commitMoves(moves)
    const next = await c.findOneAndUpdate({ _id }, { $set: { lines, status, updatedAt: new Date() } }, { returnDocument: 'after' })
    res.json(next)
  } catch (e) { fail(res, e) }
})

// 취소 — 입고 전에만
router.post('/:id/cancel', requireCap('write'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('purchaseOrders')
    const po = _id && await c.findOne({ _id })
    if (!po) return res.status(404).json({ error: '없는 발주입니다.' })
    if (po.lines.some((l) => l.receivedQty > 0)) return res.status(409).json({ error: '입고된 발주는 취소할 수 없습니다.' })
    res.json(await c.findOneAndUpdate({ _id }, { $set: { status: '취소', updatedAt: new Date() } }, { returnDocument: 'after' }))
  } catch (e) { fail(res, e) }
})

router.delete('/:id', requireCap('delete'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('purchaseOrders')
    const po = _id && await c.findOne({ _id })
    if (!po) return res.status(404).json({ error: '없는 발주입니다.' })
    if (po.lines.some((l) => l.receivedQty > 0)) return res.status(409).json({ error: '입고 이력이 있는 발주는 삭제할 수 없습니다.' })
    await c.deleteOne({ _id })
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

export default router
