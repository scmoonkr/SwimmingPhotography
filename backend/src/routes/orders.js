// 주문 — 목록(필터·검색·정렬) / 상세 / 등록 / 수정 / 상태변경 / 삭제 / 변경이력.
import { Router } from 'express'
import { col, nextSeq } from '../db.js'
import { requireCap } from '../auth.js'
import { oid, escRe } from '../crud.js'

export const STATUSES = ['예정', '접수', '제작중', '검수', '배송준비', '출고', '완료', '취소']
const router = Router()

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const date = (v) => {
  if (v === '' || v == null) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const str = (v) => String(v ?? '').trim()

// 품목 라인 정리 + 금액 계산. 공급가 = Σ(수량×단가), 부가세는 vat 가 false 면 0.
function normItems(items) {
  return (Array.isArray(items) ? items : []).map((it) => ({
    productName: str(it.productName),
    designCode: str(it.designCode),
    color: str(it.color),
    size: str(it.size),
    qty: Math.max(0, num(it.qty)),
    unitPrice: Math.max(0, num(it.unitPrice)),
    note: str(it.note),          // 이니셜·문구 등
  }))
}
function calcAmounts(items, vat, paid) {
  const supply = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const tax = vat ? Math.round(supply * 0.1) : 0
  const total = supply + tax
  return { supply, vat: tax, total, paid: paid, balance: total - paid }
}

// 요청 본문 → 저장 필드 (화이트리스트). 일부만 온 PATCH 도 처리하도록 있는 것만 담는다.
function build(b = {}) {
  const d = {}
  if ('title' in b) d.title = str(b.title)
  if ('partnerId' in b) d.partnerId = oid(b.partnerId)
  if ('customerId' in b) d.customerId = oid(b.customerId)
  if ('orderedAt' in b) d.orderedAt = date(b.orderedAt)
  if ('dueAt' in b) d.dueAt = date(b.dueAt)
  if ('shippedAt' in b) d.shippedAt = date(b.shippedAt)
  if ('priority' in b) d.priority = Math.max(0, Math.min(3, num(b.priority)))  // 0 보통 · 1 높음 · 2 긴급 · 3 최우선
  if ('tags' in b) d.tags = (Array.isArray(b.tags) ? b.tags : []).map(str).filter(Boolean)
  if ('memo' in b) d.memo = String(b.memo ?? '')
  if ('attachments' in b) d.attachments = Array.isArray(b.attachments) ? b.attachments.map(str).filter(Boolean) : []
  if ('items' in b) d.items = normItems(b.items)
  if ('vat' in b) d.vat = !!b.vat
  if ('paid' in b) d.paid = Math.max(0, num(b.paid))
  if ('shipping' in b) {
    const s = b.shipping || {}
    d.shipping = { method: str(s.method), trackingNo: str(s.trackingNo), address: str(s.address), direct: !!s.direct }
  }
  return d
}

async function log(orderId, user, action, detail) {
  await (await col('activityLogs')).insertOne({
    target: 'order', targetId: orderId, action, detail, by: user.username, at: new Date(),
  })
}

// 목록: ?status=제작중,검수 &partnerId &customerId &q &dueFrom &dueTo &overdue=1 &sort=dueAt|-orderedAt &limit &skip
router.get('/', async (req, res) => {
  try {
    const q = {}
    const { status, partnerId, customerId, search, dueFrom, dueTo, overdue, sort } = {
      ...req.query, search: req.query.q,
    }
    if (status) q.status = { $in: String(status).split(',').filter((s) => STATUSES.includes(s)) }
    if (partnerId && oid(partnerId)) q.partnerId = oid(partnerId)
    if (customerId && oid(customerId)) q.customerId = oid(customerId)
    if (search) {
      const re = { $regex: escRe(search), $options: 'i' }
      q.$or = [{ title: re }, { memo: re }, { tags: re }, { 'items.designCode': re }, { 'shipping.trackingNo': re }]
      if (/^\d+$/.test(String(search))) q.$or.push({ orderNo: Number(search) })
    }
    const due = {}
    if (date(dueFrom)) due.$gte = date(dueFrom)
    if (date(dueTo)) due.$lte = date(dueTo)
    if (overdue === '1') {           // 납기 지남 + 아직 출고 전
      due.$lt = new Date()
      q.status = { $nin: ['출고', '완료', '취소'] }
    }
    if (Object.keys(due).length) q.dueAt = due

    const desc = String(sort || '-orderNo').startsWith('-')
    const field = String(sort || '-orderNo').replace(/^-/, '')
    const sortField = ['orderNo', 'orderedAt', 'dueAt', 'shippedAt', 'priority', 'status'].includes(field) ? field : 'orderNo'
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const skip = Math.max(Number(req.query.skip) || 0, 0)

    const c = await col('orders')
    const [items, total] = await Promise.all([
      c.find(q).sort({ [sortField]: desc ? -1 : 1, orderNo: -1 }).skip(skip).limit(limit).toArray(),
      c.countDocuments(q),
    ])
    await attachNames(items)
    res.json({ items, total })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 목록·상세에 거래처/고객 이름을 붙인다 (표시용 — 저장하지 않는다)
async function attachNames(orders) {
  const pIds = [...new Set(orders.map((o) => o.partnerId?.toString()).filter(Boolean))].map(oid)
  const cIds = [...new Set(orders.map((o) => o.customerId?.toString()).filter(Boolean))].map(oid)
  const [ps, cs] = await Promise.all([
    pIds.length ? (await col('partners')).find({ _id: { $in: pIds } }, { projection: { name: 1 } }).toArray() : [],
    cIds.length ? (await col('customers')).find({ _id: { $in: cIds } }, { projection: { name: 1 } }).toArray() : [],
  ])
  const pm = new Map(ps.map((p) => [p._id.toString(), p.name]))
  const cm = new Map(cs.map((c) => [c._id.toString(), c.name]))
  for (const o of orders) {
    o.partnerName = pm.get(o.partnerId?.toString()) || ''
    o.customerName = cm.get(o.customerId?.toString()) || ''
  }
}

router.get('/:id', async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const o = _id && await (await col('orders')).findOne({ _id })
    if (!o) return res.status(404).json({ error: '없는 주문입니다.' })
    await attachNames([o])
    const logs = await (await col('activityLogs')).find({ target: 'order', targetId: _id }).sort({ at: -1 }).limit(100).toArray()
    res.json({ ...o, logs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', requireCap('write'), async (req, res) => {
  try {
    const d = build(req.body)
    if (!d.title && !d.partnerId) return res.status(400).json({ error: '주문명 또는 거래처가 필요합니다.' })
    const now = new Date()
    const items = d.items || []
    const vat = d.vat ?? false
    const paid = d.paid ?? 0
    const status = STATUSES.includes(req.body?.status) ? req.body.status : '접수'
    const doc = {
      title: '', partnerId: null, customerId: null, orderedAt: now, dueAt: null, shippedAt: null,
      priority: 0, tags: [], memo: '', attachments: [], shipping: { method: '', trackingNo: '', address: '', direct: false },
      ...d, items, vat, paid, status,
      amounts: calcAmounts(items, vat, paid),
      orderNo: await nextSeq('orderNo'),
      createdAt: now, updatedAt: now, createdBy: req.user.username,
    }
    const r = await (await col('orders')).insertOne(doc)
    await log(r.insertedId, req.user, 'create', { orderNo: doc.orderNo })
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.patch('/:id', requireCap('write'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('orders')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 주문입니다.' })
    const d = build(req.body)
    // 금액에 영향을 주는 값이 바뀌면 다시 계산
    const items = d.items ?? cur.items ?? []
    const vat = d.vat ?? cur.vat ?? false
    const paid = d.paid ?? cur.paid ?? 0
    const set = { ...d, vat, paid, items, amounts: calcAmounts(items, vat, paid), updatedAt: new Date() }
    const next = await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' })
    const changed = Object.keys(d).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(cur[k]))
    if (changed.length) await log(_id, req.user, 'update', { fields: changed })
    res.json(next)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 상태 변경 — 출고로 바뀌면 shippedAt 을 오늘로 채운다(이미 있으면 유지).
router.post('/:id/status', requireCap('write'), async (req, res) => {
  try {
    const status = String(req.body?.status || '')
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `상태는 ${STATUSES.join(' · ')} 중 하나여야 합니다.` })
    const _id = oid(req.params.id)
    const c = await col('orders')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 주문입니다.' })
    const set = { status, updatedAt: new Date() }
    if (status === '출고' && !cur.shippedAt) set.shippedAt = new Date()
    const next = await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' })
    await log(_id, req.user, 'status', { from: cur.status, to: status })
    res.json(next)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', requireCap('delete'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const r = _id && await (await col('orders')).deleteOne({ _id })
    if (!r?.deletedCount) return res.status(404).json({ error: '없는 주문입니다.' })
    await log(_id, req.user, 'delete', {})
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
