// 주문 — 목록(필터·검색·정렬) / 상세 / 등록 / 수정 / 상태변경 / 삭제 / 변경이력.
import { Router } from 'express'
import { col, nextSeq } from '../db.js'
import { requireCap } from '../auth.js'
import { ObjectId } from 'mongodb'
import { oid, escRe } from '../crud.js'
import { normPieces, parsePieces } from '../pieces.js'
import { parseCsv, plan } from '../notionCsv.js'
import { recentOrders, configured as smartstoreConfigured } from '../smartstore.js'
import { designDetails, latestOf, latestConfirmed, versionOf, DESIGN_ROLES } from '../designLib.js'
import multer from 'multer'
import crypto from 'node:crypto'
import { saveBuffer, removeRel, validRel } from '../files.js'
import { EXT } from './uploads.js'

export const STATUSES = ['예정', '접수', '작업배정', '제작중', '검수', '배송준비', '출고', '완료', '취소']
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
  if ('priority' in b) d.priority = Math.max(0, Math.min(9, Math.round(num(b.priority))))  // 0 보통 · 1 높음 · 2 긴급 · 3 최우선 · 4~9 (작업배정에서 숫자가 큰 주문부터 배정)
  if ('tags' in b) d.tags = (Array.isArray(b.tags) ? b.tags : []).map(str).filter(Boolean)
  if ('pieces' in b) { d.pieces = normPieces(b.pieces); d.pieceCount = d.pieces.length }   // 제작 명세(사람별 사양)
  if ('designNotNeeded' in b) d.designNotNeeded = !!b.designNotNeeded      // 디자인이 필요 없는 주문(후드티 등)
  if ('productType' in b) d.productType = str(b.productType).slice(0, 30)      // 제품종류 (설정의 목록에서 고른다)
  if ('content' in b) d.content = String(b.content ?? '')      // 내용(Notion '내용')
  if ('request' in b) d.request = String(b.request ?? '')      // 요청사항
  if ('attachments' in b) d.attachments = (Array.isArray(b.attachments) ? b.attachments.map(str) : []).filter(validRel)
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
      q.$or = [{ title: re }, { productType: re }, { content: re }, { request: re }, { 'notes.text': re }, { 'pieces.person': re }, { 'pieces.initials': re }, { tags: re }, { 'items.designCode': re }, { 'shipping.trackingNo': re }]
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
      c.find(q, { projection: { pieces: 0, notes: 0 } }).sort({ [sortField]: desc ? -1 : 1, orderNo: -1 }).skip(skip).limit(limit).toArray(),
      c.countDocuments(q),
    ])
    await attachNames(items)
    // 수량: 품목 합계 → 제작 명세 줄 수 → 주문명의 #N장 (작업관리와 같은 기준)
    for (const o of items) {
      const sum = (o.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0)
      const m = String(o.title || '').match(/#\s*(\d+)(?:\s*\+\s*(\d+))?\s*장/)
      o.totalQty = sum || o.pieceCount || (m ? Number(m[1]) + Number(m[2] || 0) : 0)
    }
    res.json({ items, total })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
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

// 붙여넣은 표(엑셀·구글시트·Notion) → 제작 명세 줄. 저장하지 않고 변환 결과만 돌려준다.
router.post('/parse-pieces', requireCap('orders'), (req, res) => {
  const text = String(req.body?.text ?? '')
  if (text.length > 400000) return res.status(400).json({ error: '붙여넣은 내용이 너무 큽니다.' })
  const r = parsePieces(text)
  if (r.pieces.length > 1000) return res.status(400).json({ error: '한 번에 1000줄까지 넣을 수 있습니다.' })
  res.json(r)
})

// 주문에 연결할 디자인 목록을 검증해 스냅샷(코드·이름)과 함께 저장 형태로 만든다.
//   입력: [{ designId, version?, role?, note? }] — version 을 주지 않으면 확정된 최신 버전(없으면 최신 버전)
async function resolveDesignLinks(list) {
  const out = []
  const seen = new Set()
  for (const x of (Array.isArray(list) ? list : []).slice(0, 12)) {
    const id = oid(x?.designId)
    if (!id) throw Object.assign(new Error('디자인 id 가 올바르지 않습니다.'), { status: 400 })
    const d = await (await col('designs')).findOne({ _id: id })
    if (!d) throw Object.assign(new Error('없는 디자인이 포함되어 있습니다.'), { status: 400 })
    const no = Number(x.version) || (latestConfirmed(d) || latestOf(d))?.no
    if (!versionOf(d, no)) throw Object.assign(new Error(`${d.code}: 없는 버전입니다.`), { status: 400 })
    const key = `${id}:${no}:${x.role || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ designId: id, code: d.code, name: d.name, version: no, role: DESIGN_ROLES.includes(x.role) ? x.role : '', note: String(x.note || '').slice(0, 200) })
  }
  return out
}

// 디자인 연결 / '디자인 불필요' 표시만 바꾸는 전용 경로 — 디자인 담당(design)이 주문 전체를 고치지 않고도 연결할 수 있다.
//   { designs?: [{ designId, version?, role?, note? }], notNeeded?: boolean }
router.post('/:id/designs', requireCap('design', 'orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('orders')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 주문입니다.' })
    const b = req.body || {}
    const set = { updatedAt: new Date() }
    if (Array.isArray(b.designs)) set.designs = await resolveDesignLinks(b.designs)
    if ('notNeeded' in b) set.designNotNeeded = !!b.notNeeded
    await c.updateOne({ _id }, { $set: set })
    await log(_id, req.user, 'update', { fields: Object.keys(set).filter((k) => k !== 'updatedAt') })
    res.json({ designs: set.designs ?? cur.designs ?? [], designNotNeeded: set.designNotNeeded ?? !!cur.designNotNeeded })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 제작 명세(장별 수모·이니셜 컬러·디자인) 저장 — 디자인 매핑 단계에서 디자인 담당이 쓴다. { pieces: [...] }
router.post('/:id/pieces', requireCap('design', 'orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('orders')
    if (!_id || !await c.findOne({ _id }, { projection: { _id: 1 } })) return res.status(404).json({ error: '없는 주문입니다.' })
    const pieces = normPieces(req.body?.pieces)
    await c.updateOne({ _id }, { $set: { pieces, pieceCount: pieces.length, updatedAt: new Date() } })
    await log(_id, req.user, 'update', { fields: ['pieces'] })
    res.json({ pieces })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 작업에 쓸 수모 선택 — 수모 번호(caps/01.png 의 01) + 사이즈. 재고의 수모 옵션과 맞으면 code 도 함께 저장한다.
//   { caps: [{ no, size?, code?, label? }] }  — 작업(work)·주문(orders) 담당이 쓴다
router.post('/:id/caps', requireCap('work', 'orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('orders')
    if (!_id || !await c.findOne({ _id }, { projection: { _id: 1 } })) return res.status(404).json({ error: '없는 주문입니다.' })
    const caps = (Array.isArray(req.body?.caps) ? req.body.caps : []).slice(0, 20).map((x) => ({
      no: str(x.no).slice(0, 20), size: str(x.size).slice(0, 20), code: str(x.code).slice(0, 40), label: str(x.label).slice(0, 80),
    })).filter((x) => x.no || x.code)
    await c.updateOne({ _id }, { $set: { caps, updatedAt: new Date() } })
    await log(_id, req.user, 'update', { fields: ['caps'] })
    res.json({ caps })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 스마트스토어(네이버 커머스 API) 최근 주문 — 보기만 한다(DB 에 저장하지 않는다). ?days=1~365 (기본 30)
router.get('/smartstore', requireCap('orders'), async (req, res) => {
  try {
    if (!smartstoreConfigured()) return res.status(400).json({ error: '.env 에 NAVER_SMARTSTORE_CLIENT_ID · NAVER_SMARTSTORE_CLIENT_SECRET (커머스API센터 애플리케이션)을 넣어 주세요.' })
    const items = await recentOrders(req.query.days)
    res.json({ items, days: Math.max(1, Math.min(365, Math.round(Number(req.query.days)) || 30)), fetchedAt: new Date() })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const o = _id && await (await col('orders')).findOne({ _id })
    if (!o) return res.status(404).json({ error: '없는 주문입니다.' })
    await attachNames([o])
    const logs = await (await col('activityLogs')).find({ target: 'order', targetId: _id }).sort({ at: -1 }).limit(100).toArray()
    const designsState = (await designDetails([o])).get(String(o._id)) || []
    res.json({ ...o, logs, designsState })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// Notion 에서 내보낸 CSV 가져오기 — 주문자명(주문 제목)으로 같은 주문을 찾는다.
//   같은 주문: Notion 이 원본인 값(주문일 · 출발필수 · 출발날짜 · 내용 · 요청사항 · 제품·색상·사이즈)만 바꾸고 우리가 만든 값은 그대로 둔다.
//   없는 주문: 새 주문번호로 만든다.   apply=1 이 아니면 미리보기만(DB 변경 없음).
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
router.post('/import-csv', requireCap('orders'), csvUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV 파일을 선택하세요.' })
    const rows = parseCsv(req.file.buffer.toString('utf8'))
    if (!rows.length || !('주문자명' in rows[0])) return res.status(400).json({ error: "CSV 에 '주문자명' 열이 없습니다. 노션에서 내보낸 주문 CSV 인지 확인하세요." })
    const oc = await col('orders')
    const existing = await oc.find({}, { projection: { orderNo: 1, title: 1, status: 1, orderedAt: 1, dueAt: 1, shippedAt: 1, content: 1, request: 1, items: 1, pieceCount: 1 } }).toArray()
    const pl = plan(rows, existing)
    const skipped = pl.skipped.reduce((m, x) => { m[x.reason] = (m[x.reason] || 0) + 1; return m }, {})
    // key — 미리보기에서 체크한 것만 반영하기 위한 식별자: CSV 행 번호 + 주문자명 (파일이 바뀌었으면 맞지 않게)
    const key = (x) => `${x.row}:${x.title}`
    // list — CSV 행 순서대로 전부(신규 · 변경 · 변경 없음 · 건너뜀). 표로 보여 주고 신규 · 변경만 고를 수 있다.
    const csv = (x) => { const r = rows[x.row] || {}; return { orderedAt: r['주문일'] || '', dueAt: r['출발필수'] || '', notionStatus: r['상태'] || '' } }
    const list = [
      ...pl.updates.map((u) => ({ kind: 'update', key: key(u), row: u.row, orderNo: u.orderNo, title: u.title, changes: u.changes, ...csv(u) })),
      ...pl.creates.map((c) => ({ kind: 'create', key: key(c), row: c.row, title: c.title, ...csv(c) })),
      ...pl.unchanged.map((u) => ({ kind: 'same', row: u.row, orderNo: u.orderNo, title: u.title, ...csv(u) })),
      ...pl.skipped.map((s) => ({ kind: 'skip', row: s.row, title: s.title, reason: s.reason, ...csv(s) })),
    ].sort((a, b) => a.row - b.row)
    const preview = {
      rows: rows.length, list, creates: pl.creates.map((c) => ({ key: key(c), title: c.title })), updates: pl.updates.map((u) => ({ key: key(u), orderNo: u.orderNo, title: u.title, changes: u.changes })),
      unchanged: pl.unchanged.length, skipped,
    }
    if (req.body?.apply !== '1') return res.json({ applied: false, ...preview })
    // pick(JSON 배열)이 오면 그 key 만 반영한다
    if (req.body?.pick) {
      let pick
      try { pick = new Set(JSON.parse(req.body.pick)) } catch { return res.status(400).json({ error: '선택 목록 형식이 올바르지 않습니다.' }) }
      pl.creates = pl.creates.filter((c) => pick.has(key(c)))
      pl.updates = pl.updates.filter((u) => pick.has(key(u)))
      if (!pl.creates.length && !pl.updates.length) return res.status(400).json({ error: '가져올 주문을 체크하세요.' })
    }

    const now = new Date()
    const pc = await col('partners')
    for (const u of pl.updates) {
      await oc.updateOne({ _id: oid(u.id) }, { $set: { ...u.set, updatedAt: now } })
      await log(oid(u.id), req.user, 'import', { from: 'notion-csv', fields: u.changes.map((c) => c.label) })
    }
    let made = 0
    for (const c of pl.creates) {
      const v = c.values
      const partner = v.p.leading ? await pc.findOne({ name: v.p.leading }, { projection: { _id: 1 } }) : null
      const items = v.hasItem ? [{ productName: v.item.productName, designCode: v.item.designCode, color: v.item.color, size: v.item.size, qty: v.p.qty ?? 1, unitPrice: 0, note: v.item.note }] : []
      const doc = {
        title: v.title, partnerId: partner?._id || null, customerId: null,
        orderedAt: v.orderedAt || now, dueAt: v.dueAt, shippedAt: v.shippedAt, status: v.status || '접수', priority: 0, tags: v.p.tags,
        content: v.content, request: v.request, notes: [], pieces: [], pieceCount: 0, attachments: [],
        items, vat: false, paid: 0, shipping: { method: '', trackingNo: '', address: '', direct: v.p.tags.includes('직접배송') },
        amounts: calcAmounts(items, false, 0), orderNo: await nextSeq('orderNo'),
        source: { system: 'notion-csv', importedAt: now }, createdAt: now, updatedAt: now, createdBy: req.user.username,
      }
      const r = await oc.insertOne(doc)
      await log(r.insertedId, req.user, 'create', { orderNo: doc.orderNo, from: 'notion-csv' })
      made++
    }
    res.json({ applied: true, ...preview, createdCount: made, updatedCount: pl.updates.length })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.post('/', requireCap('orders'), async (req, res) => {
  try {
    const d = build(req.body)
    if (Array.isArray(req.body?.designs)) d.designs = await resolveDesignLinks(req.body.designs)
    if (!d.title && !d.partnerId) return res.status(400).json({ error: '주문명 또는 거래처가 필요합니다.' })
    const now = new Date()
    const items = d.items || []
    const vat = d.vat ?? false
    const paid = d.paid ?? 0
    const status = STATUSES.includes(req.body?.status) ? req.body.status : '접수'
    const doc = {
      title: '', partnerId: null, customerId: null, orderedAt: now, dueAt: null, shippedAt: null,
      priority: 0, tags: [], content: '', request: '', notes: [], pieces: [], pieceCount: 0, attachments: [], shipping: { method: '', trackingNo: '', address: '', direct: false },
      ...d, items, vat, paid, status,
      amounts: calcAmounts(items, vat, paid),
      orderNo: await nextSeq('orderNo'),
      createdAt: now, updatedAt: now, createdBy: req.user.username,
    }
    const r = await (await col('orders')).insertOne(doc)
    await log(r.insertedId, req.user, 'create', { orderNo: doc.orderNo })
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.patch('/:id', requireCap('orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('orders')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 주문입니다.' })
    const d = build(req.body)
    if (Array.isArray(req.body?.designs)) d.designs = await resolveDesignLinks(req.body.designs)
    // 금액에 영향을 주는 값이 바뀌면 다시 계산
    const items = d.items ?? cur.items ?? []
    const vat = d.vat ?? cur.vat ?? false
    const paid = d.paid ?? cur.paid ?? 0
    const set = { ...d, vat, paid, items, amounts: calcAmounts(items, vat, paid), updatedAt: new Date() }
    const next = await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' })
    const changed = Object.keys(d).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(cur[k]))
    if (changed.length) await log(_id, req.user, 'update', { fields: changed })
    res.json(next)
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 상태 변경 — 출고로 바뀌면 shippedAt 을 오늘로 채운다(이미 있으면 유지).
router.post('/:id/status', requireCap('orders'), async (req, res) => {
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
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 첨부 이미지 — 서버 디스크(UPLOAD_DIR/erp/orders/<주문번호>)에 저장한다.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } })

router.post('/:id/attachments', requireCap('orders'), (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '이미지는 10MB 이하만 올릴 수 있습니다.' : err.message })
      const _id = oid(req.params.id)
      const c = await col('orders')
      const o = _id && await c.findOne({ _id })
      if (!o) return res.status(404).json({ error: '없는 주문입니다.' })
      const files = req.files || []
      if (!files.length) return res.status(400).json({ error: '파일이 없습니다.' })
      if (files.some((f) => !EXT[f.mimetype])) return res.status(400).json({ error: 'jpg · png · webp · gif 이미지만 올릴 수 있습니다.' })
      const saved = []
      for (const f of files) saved.push(await saveBuffer(`orders/${o.orderNo}`, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${EXT[f.mimetype]}`, f.buffer))
      const next = await c.findOneAndUpdate({ _id }, { $push: { attachments: { $each: saved } }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' })
      await log(_id, req.user, 'update', { fields: ['attachments'] })
      res.status(201).json({ attachments: next.attachments })
    } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
  })
})

// 메모 — 주문 하나에 계속 덧붙이는 기록(작성자·시각 포함). Notion 페이지 본문처럼 쓴다.
router.post('/:id/notes', requireCap('orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const text = String(req.body?.text ?? '').trim()
    if (!text) return res.status(400).json({ error: '메모 내용을 입력하세요.' })
    if (text.length > 5000) return res.status(400).json({ error: '메모는 5000자 이하로 입력하세요.' })
    const note = { _id: new ObjectId(), text, by: req.user.username, byName: req.user.name, at: new Date() }
    const r = _id && await (await col('orders')).findOneAndUpdate(
      { _id }, { $push: { notes: note }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' },
    )
    if (!r) return res.status(404).json({ error: '없는 주문입니다.' })
    await log(_id, req.user, 'note', { text: text.slice(0, 60) })
    res.status(201).json({ notes: r.notes })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 메모 삭제 — 쓴 사람 또는 관리자만
router.delete('/:id/notes/:noteId', requireCap('orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const noteId = oid(req.params.noteId)
    const c = await col('orders')
    const o = _id && noteId && await c.findOne({ _id })
    const note = o && (o.notes || []).find((n) => String(n._id) === String(noteId))
    if (!note) return res.status(404).json({ error: '없는 메모입니다.' })
    if (note.by !== req.user.username && !req.user.can.includes('users')) return res.status(403).json({ error: '본인이 쓴 메모만 삭제할 수 있습니다.' })
    const r = await c.findOneAndUpdate({ _id }, { $pull: { notes: { _id: noteId } }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' })
    await log(_id, req.user, 'note-delete', { text: String(note.text).slice(0, 60) })
    res.json({ notes: r.notes })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.delete('/:id/attachments', requireCap('orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const rel = String(req.query.path || '')
    const c = await col('orders')
    const o = _id && await c.findOne({ _id })
    if (!o) return res.status(404).json({ error: '없는 주문입니다.' })
    if (!(o.attachments || []).includes(rel)) return res.status(404).json({ error: '없는 첨부입니다.' })
    const next = await c.findOneAndUpdate({ _id }, { $pull: { attachments: rel }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' })
    await removeRel(rel)
    await log(_id, req.user, 'update', { fields: ['attachments'] })
    res.json({ attachments: next.attachments })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.delete('/:id', requireCap('delete'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const r = _id && await (await col('orders')).deleteOne({ _id })
    if (!r?.deletedCount) return res.status(404).json({ error: '없는 주문입니다.' })
    await log(_id, req.user, 'delete', {})
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

export default router
