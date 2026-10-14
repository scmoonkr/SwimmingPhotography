// 재고 현황 · 입출고 이력 · 입출고 등록 (출고 포함).
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { oid, escRe } from '../crud.js'
import { KINDS, MOVE_TYPES, flatItems, onHandMap, planMoves, commitMoves } from '../stockLib.js'

const router = Router()
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })

// 현황: ?kind=material|goods(기본 material) &q &low=1(안전재고 이하만)
router.get('/', async (req, res) => {
  try {
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : 'material'
    const items = await flatItems(kind, { q: req.query.q, activeOnly: true })
    const stock = await onHandMap(kind)
    let rows = items.map((it) => {
      const s = stock.get(it.code)
      const onHand = s?.onHand || 0
      return {
        kind, code: it.code, name: it.name, category: it.category, color: it.color, size: it.size, unit: it.unit, parentId: it.parentId,
        supplier: it.supplier || '', image: it.image || '', onHand, safetyStock: it.safetyStock || 0,
        low: (it.safetyStock || 0) > 0 && onHand <= it.safetyStock, lastMoveAt: s?.lastAt || null,
      }
    })
    if (req.query.low === '1') rows = rows.filter((r) => r.low)
    res.json({ items: rows, total: rows.length })
  } catch (e) { fail(res, e) }
})

// 이력: ?kind &code &type &reason &orderId &limit
router.get('/moves', async (req, res) => {
  try {
    const q = {}
    if (KINDS.includes(req.query.kind)) q.kind = req.query.kind
    if (req.query.code) q.code = String(req.query.code)
    if (MOVE_TYPES.includes(req.query.type)) q.type = req.query.type
    if (req.query.reason) q.reason = String(req.query.reason)
    if (req.query.orderId && oid(req.query.orderId)) q.orderId = oid(req.query.orderId)
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const items = await (await col('stockMoves')).find(q).sort({ at: -1 }).limit(limit).toArray()

    // 이름 붙이기 (표시용)
    for (const kind of KINDS) {
      const codes = [...new Set(items.filter((m) => m.kind === kind).map((m) => m.code))]
      if (!codes.length) continue
      const found = await flatItems(kind, { codes })
      const map = new Map(found.map((x) => [x.code, x]))
      for (const m of items.filter((x) => x.kind === kind)) {
        const it = map.get(m.code)
        m.name = it?.name || ''; m.color = it?.color || ''; m.size = it?.size || ''
      }
    }
    res.json({ items })
  } catch (e) { fail(res, e) }
})

// 입출고 등록 — { moves: [{ kind, code, type, qty, reason, note, orderId }] } (단건은 본문 자체)
router.post('/moves', requireCap('write'), async (req, res) => {
  try {
    const list = Array.isArray(req.body?.moves) ? req.body.moves : [req.body]
    if (!list.length || list.length > 200) return res.status(400).json({ error: '1~200건씩 등록할 수 있습니다.' })
    const docs = await commitMoves(await planMoves(list, req.user))
    res.status(201).json({ ok: true, count: docs.length, moves: docs })
  } catch (e) { fail(res, e) }
})

export default router
