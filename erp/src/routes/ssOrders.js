// 스마트스토어 주문 — 네이버 커머스 API 에서 가져온 주문을 따로 보관한다.
// 지금은 기존 주문(orders)과 분리해 운영한다. 스마트스토어 테스트와 주문·작업관리가 완성되면 그때 통합한다.
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { escRe } from '../crud.js'
import { CARRIERS, carrierName, track, register, cancel, configured as deliveryConfigured, accountKey, shipCourier, sender as senderInfo } from '../deliveryApi.js'
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
      // 스마트스토어에 송장번호가 있으면 가져온다 — 우리 쪽에서 이미 등록한 송장은 덮어쓰지 않는다
      const invNo = str(o.invoiceNo, 20), invCarrier = CARRIERS.some((x) => x.id === o.invoiceCarrier) ? o.invoiceCarrier : ''
      if (invNo && invCarrier) {
        const same = o.orderId ? { orderId: str(o.orderId, 40) } : { productOrderId }
        await c.updateMany({ ...same, invoice: { $exists: false } }, { $set: { invoice: { carrierId: invCarrier, carrierName: carrierName(invCarrier), trackingNo: invNo, source: 'smartstore', sentAt: str(o.sentAt, 40), at: now, by: req.user.username } } })
      }
      if (r.upsertedCount) created++; else updated++
    }
    res.json({ ok: true, created, updated })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 택배사 목록 · 보내는 사람(.env SENDER_NAME · SENDER_TEL · SENDER_ADDRESS, 선택) — 송장 화면과 인쇄가 쓴다
router.get('/carriers', (_req, res) => {
  res.json({ carriers: CARRIERS, trackerReady: deliveryConfigured(), shipReady: deliveryConfigured() && !!accountKey(), shipCourier: shipCourier(), sender: senderInfo() })
})

// 송장번호 조회(배송 추적) — ?carrierId=kr.cjlogistics &trackingNo=
router.get('/track', requireCap('orders'), async (req, res) => {
  try {
    const carrierId = str(req.query.carrierId, 40), trackingNo = str(req.query.trackingNo, 40).replace(/[\s-]/g, '')
    if (!CARRIERS.some((c) => c.id === carrierId)) return res.status(400).json({ error: '택배사를 고르세요.' })
    if (!/^\d{8,20}$/.test(trackingNo)) return res.status(400).json({ error: '송장번호는 숫자 8~20자리입니다.' })
    res.json(await track(carrierId, trackingNo))
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 택배 접수(송장번호 발급) — 딜리버리API 로 .env 의 택배사 계정(롯데 · CJ)에 접수한다. 결과를 이 주문(같은 주문번호 전체)의 송장으로 저장한다.
//   송장번호가 바로 나오지 않으면 trackingNo 는 비워 두고 접수 정보만 저장한다(번호는 나중에 입력).
router.post('/:productOrderId/ship', requireCap('orders'), async (req, res) => {
  try {
    const c = await col('smartstoreOrders')
    const o = await c.findOne({ productOrderId: str(req.params.productOrderId, 40) })
    if (!o) return res.status(404).json({ error: '주문을 찾지 못했습니다.' })
    if (o.invoice?.historyId) return res.status(409).json({ error: '이미 택배를 접수한 주문입니다. 다시 접수하려면 먼저 접수를 취소하세요.' })
    const r = await register(o)
    const carrierId = shipCourier()
    const invoice = { carrierId, carrierName: carrierName(carrierId), trackingNo: r.trackingNo, courierDeliveryId: r.courierDeliveryId, historyId: r.historyId, registered: true, at: new Date(), by: req.user.username }
    await c.updateMany(o.orderId ? { orderId: o.orderId } : { productOrderId: o.productOrderId }, { $set: { invoice } })
    res.json({ ok: true, invoice, message: r.message })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 접수 취소 — 딜리버리API 로 취소하고 송장 정보를 지운다
router.delete('/:productOrderId/ship', requireCap('orders'), async (req, res) => {
  try {
    const c = await col('smartstoreOrders')
    const o = await c.findOne({ productOrderId: str(req.params.productOrderId, 40) }, { projection: { orderId: 1, productOrderId: 1, invoice: 1 } })
    if (!o) return res.status(404).json({ error: '주문을 찾지 못했습니다.' })
    if (!o.invoice?.historyId) return res.status(400).json({ error: '이 주문은 API 로 접수한 내역이 없습니다.' })
    await cancel(o.invoice.historyId)
    await c.updateMany(o.orderId ? { orderId: o.orderId } : { productOrderId: o.productOrderId }, { $unset: { invoice: '' } })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 송장 저장 — { carrierId, trackingNo } 같은 주문번호(orderId)의 상품주문 모두에 저장한다. trackingNo 가 비면 송장을 지운다.
router.put('/:productOrderId/invoice', requireCap('orders'), async (req, res) => {
  try {
    const c = await col('smartstoreOrders')
    const o = await c.findOne({ productOrderId: str(req.params.productOrderId, 40) }, { projection: { orderId: 1, productOrderId: 1, invoice: 1 } })
    if (!o) return res.status(404).json({ error: '주문을 찾지 못했습니다.' })
    const carrierId = str(req.body?.carrierId, 40), trackingNo = str(req.body?.trackingNo, 40).replace(/[\s-]/g, '')
    const filter = o.orderId ? { orderId: o.orderId } : { productOrderId: o.productOrderId }
    if (!trackingNo) { await c.updateMany(filter, { $unset: { invoice: '' } }); return res.json({ ok: true, invoice: null }) }
    if (!CARRIERS.some((x) => x.id === carrierId)) return res.status(400).json({ error: '택배사를 고르세요.' })
    if (!/^\d{8,20}$/.test(trackingNo)) return res.status(400).json({ error: '송장번호는 숫자 8~20자리입니다.' })
    // API 로 접수한 송장이면 접수 정보(historyId 등)는 그대로 두고 번호만 채운다
    const keep = o.invoice?.historyId && o.invoice.carrierId === carrierId ? { courierDeliveryId: o.invoice.courierDeliveryId, historyId: o.invoice.historyId, registered: true } : {}
    const invoice = { carrierId, carrierName: carrierName(carrierId), trackingNo, ...keep, at: new Date(), by: req.user.username }
    await c.updateMany(filter, { $set: { invoice } })
    res.json({ ok: true, invoice })
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
