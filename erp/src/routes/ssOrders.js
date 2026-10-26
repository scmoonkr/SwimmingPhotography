// 스마트스토어 주문 — 네이버 커머스 API 에서 가져온 주문을 따로 보관한다.
// 지금은 기존 주문(orders)과 분리해 운영한다. 스마트스토어 테스트와 주문·작업관리가 완성되면 그때 통합한다.
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { escRe } from '../crud.js'
const router = Router()
const str = (v, n = 500) => String(v ?? '').trim().slice(0, n)
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// 목록: ?q=(주문번호·주문자·수취인·상품·주소·톡톡 내용) &limit (기본 300)
router.get('/', async (req, res) => {
  try {
    const q = {}
    if (req.query.q) {
      const re = { $regex: escRe(req.query.q), $options: 'i' }
      q.$or = [{ orderId: re }, { productOrderId: re }, { orderer: re }, { receiver: re }, { product: re }, { option: re }, { address: re }, { talk: re }]
    }
    const limit = Math.max(1, Math.min(1000, Math.round(num(req.query.limit)) || 300))
    const c = await col('smartstoreOrders')
    const [items, total] = await Promise.all([c.find(q).sort({ paidAt: -1, _id: -1 }).limit(limit).toArray(), c.countDocuments(q)])
    res.json({ items, total })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 가져오기(import): 조회 화면에서 고른 주문을 저장한다. 상품주문번호(productOrderId)가 같으면 네이버 값만 갱신한다.
router.post('/import', requireCap('orders'), async (req, res) => {
  try {
    const list = Array.isArray(req.body?.items) ? req.body.items : []
    if (!list.length) return res.status(400).json({ error: '가져올 주문이 없습니다.' })
    if (list.length > 2000) return res.status(400).json({ error: '한 번에 2000건까지 가져올 수 있습니다.' })
    const c = await col('smartstoreOrders')
    const now = new Date()
    let created = 0, updated = 0
    for (const o of list) {
      const productOrderId = str(o?.productOrderId, 40)
      if (!productOrderId) continue
      const fields = {
        orderId: str(o.orderId, 40), paidAt: str(o.paidAt, 40), orderer: str(o.orderer, 60), ordererTel: str(o.ordererTel, 30),
        receiver: str(o.receiver, 60), receiverTel: str(o.receiverTel, 30), address: str(o.address), zip: str(o.zip, 10),
        product: str(o.product, 200), option: str(o.option, 300), qty: Math.max(0, num(o.qty)), amount: Math.max(0, num(o.amount)),
        status: str(o.status, 40), memo: str(o.memo, 500),
      }
      const r = await c.updateOne({ productOrderId }, { $set: { ...fields, updatedAt: now }, $setOnInsert: { productOrderId, importedAt: now, importedBy: req.user.username } }, { upsert: true })
      if (r.upsertedCount) created++; else updated++
    }
    res.json({ ok: true, created, updated })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 톡톡 메시지 — 스마트스토어 톡톡에서 복사한 대화를 주문에 붙여 둔다. 같은 주문번호(orderId)의 상품주문 모두에 저장한다.
router.put('/:productOrderId/talk', requireCap('orders'), async (req, res) => {
  try {
    const c = await col('smartstoreOrders')
    const o = await c.findOne({ productOrderId: str(req.params.productOrderId, 40) }, { projection: { orderId: 1, productOrderId: 1 } })
    if (!o) return res.status(404).json({ error: '주문을 찾지 못했습니다.' })
    const talk = String(req.body?.talk ?? '').replace(/\r\n/g, '\n').trim().slice(0, 50000)
    const set = { talk, talkAt: new Date(), talkBy: req.user.username }
    await c.updateMany(o.orderId ? { orderId: o.orderId } : { productOrderId: o.productOrderId }, { $set: set })
    res.json({ ok: true, ...set })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

export default router
