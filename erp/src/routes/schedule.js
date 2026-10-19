// 작업관리 — 주문을 일자에 배정(작업지시)하는 일정.
//   workSchedules: { orderId, orderNo, date('YYYY-MM-DD'), qty, status('지시'|'진행'|'완료'), note, createdAt, by }
//   한 주문을 여러 날짜에 나눠 배정할 수 있다(날짜별 수량). 날짜는 시간대 문제가 없도록 문자열로 둔다.
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { oid, escRe } from '../crud.js'
import { flatItems, onHandMap } from '../stockLib.js'
import { loadAppSettings } from '../settings.js'
import { designDetails, designState, latestConfirmed, pickSetName } from '../designLib.js'
import { threadNeeds, loadThreads } from '../machineLib.js'

export const WORK_STATUSES = ['지시', '진행', '완료']
// 공정 구분 — '' 은 구분 없음(전체). 로고·이니셜을 따로 작업하는 주문은 같은 주문에 공정별 배정을 둔다(각각 전체 수량).
export const WORK_TASKS = ['', '로고', '이니셜']
const taskOf = (v) => (WORK_TASKS.includes(v) ? v : '')
const DONE = ['완료', '출고', '취소']
const router = Router()
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (s) => DATE_RE.test(String(s)) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime())
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)

// 주문 수량: 품목 합계 → 제작 명세 줄 수 → 주문명의 #N장
export function orderQty(o) {
  const items = (o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0)
  if (items > 0) return items
  if (o.pieceCount > 0) return o.pieceCount
  const m = String(o.title || '').match(/#\s*(\d+)(?:\s*\+\s*(\d+))?\s*장/)
  return m ? Number(m[1]) + Number(m[2] || 0) : 0
}

async function scheduledQty(orderIds) {
  if (!orderIds.length) return new Map()
  const rows = await (await col('workSchedules')).aggregate([
    { $match: { orderId: { $in: orderIds } } },
    { $group: { _id: '$orderId', qty: { $sum: '$qty' }, days: { $sum: 1 } } },
  ]).toArray()
  return new Map(rows.map((r) => [String(r._id), r]))
}

// 주문별 · 공정별 배정 수량 { orderId: { '': n, '로고': n, '이니셜': n } }
async function taskQtyMap(orderIds) {
  if (!orderIds.length) return new Map()
  const rows = await (await col('workSchedules')).aggregate([
    { $match: { orderId: { $in: orderIds } } },
    { $group: { _id: { o: '$orderId', t: { $ifNull: ['$task', ''] } }, qty: { $sum: '$qty' } } },
  ]).toArray()
  const m = new Map()
  for (const r of rows) {
    const k = String(r._id.o)
    if (!m.has(k)) m.set(k, {})
    m.get(k)[r._id.t] = r.qty
  }
  return m
}

async function partnerNames(orders) {
  const ids = [...new Set(orders.map((o) => String(o.partnerId || '')).filter(Boolean))].map(oid)
  if (!ids.length) return new Map()
  const ps = await (await col('partners')).find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()
  return new Map(ps.map((p) => [String(p._id), p.name]))
}

const summary = (o, pn) => ({
  _id: o._id, orderNo: o.orderNo, title: o.title, status: o.status, dueAt: o.dueAt, priority: o.priority || 0,
  partnerName: pn.get(String(o.partnerId || '')) || '', totalQty: orderQty(o), designNotNeeded: !!o.designNotNeeded,
})
const PROJ = { orderNo: 1, title: 1, status: 1, dueAt: 1, priority: 1, partnerId: 1, items: 1, pieceCount: 1, designs: 1, designNotNeeded: 1 }


// 하루 처리 한도 설정 — 조회는 누구나, 변경은 관리자·매니저(write)
router.get('/capacity', async (_req, res) => {
  try {
    const cfg = await loadCapacity()
    res.json({ ...cfg, limit: cfg.machines * cfg.perMachine })
  } catch (e) { fail(res, e) }
})

// { machines?, perMachine?, overrides? }  overrides: { 'YYYY-MM-DD': 가동 대수 } (null 이면 해당 날짜 지정 해제)
router.put('/capacity', requireCap('settings'), async (req, res) => {
  try {
    const b = req.body || {}
    const cur = await loadCapacity()
    const next = { machines: cur.machines, perMachine: cur.perMachine, overrides: { ...cur.overrides } }
    const int = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null }
    if ('machines' in b) { const n = int(b.machines, 0, 200); if (n === null) return res.status(400).json({ error: '가동 대수는 0~200 사이입니다.' }); next.machines = n }
    if ('perMachine' in b) { const n = int(b.perMachine, 1, 10000); if (n === null) return res.status(400).json({ error: '대당 일 처리량이 올바르지 않습니다.' }); next.perMachine = n }
    if (b.overrides && typeof b.overrides === 'object') {
      for (const [d, v] of Object.entries(b.overrides)) {
        if (!validDate(d)) return res.status(400).json({ error: `날짜가 올바르지 않습니다: ${d}` })
        if (v === null) { delete next.overrides[d]; continue }
        const n = int(v, 0, 200)
        if (n === null) return res.status(400).json({ error: `${d}: 가동 대수가 올바르지 않습니다.` })
        next.overrides[d] = n
      }
    }
    // 지난 날짜의 지정은 정리한다 (설정 문서가 계속 커지지 않게)
    const today = new Date().toISOString().slice(0, 10)
    for (const d of Object.keys(next.overrides)) if (d < dayAfter(today, -31)) delete next.overrides[d]
    await (await col('settings')).updateOne({ _id: 'capacity' }, { $set: { ...next, updatedAt: new Date(), updatedBy: req.user.username } }, { upsert: true })
    res.json({ ...next, limit: next.machines * next.perMachine })
  } catch (e) { fail(res, e) }
})

// 디자인 필요 목록 — 작업관리자의 디자인 할 일.
// 끝나지 않은 배정이 있는데 디자인이 확정되지 않았고 '불필요'도 아닌 주문을, 가장 빠른 작업일 순으로.
//   kind: new(신규 — 거래처에 이전 디자인 없음) · reorder(재주문 후보 — 거래처의 확정 디자인이 있음) · working(연결한 디자인이 작업 중)
router.get('/design-queue', async (req, res) => {
  try {
    // scope=all : 디자인 매핑 화면용 — 배정 여부와 상관없이 진행 중인 모든 주문을 상태와 함께 (매핑 필요·연결됨·불필요 모두)
    const all = req.query.scope === 'all'
    const pend = await (await col('workSchedules')).aggregate([
      { $match: { status: { $ne: '완료' } } },
      { $group: { _id: '$orderId', next: { $min: '$date' }, qty: { $sum: '$qty' } } },
    ]).toArray()
    if (!all && !pend.length) return res.json({ items: [] })
    const orders = await (await col('orders')).find(
      all ? { status: { $in: ['예정', '접수', '작업배정', '제작중', '검수'] } }
        : { _id: { $in: pend.map((p) => p._id) }, status: { $ne: '취소' }, designNotNeeded: { $ne: true } },
      { projection: { ...PROJ, attachments: 1, content: 1, request: 1, designNotNeeded: 1, 'pieces.design': 1, 'pieces.variant': 1, 'pieces.color': 1 } },
    ).limit(all ? 500 : 0).toArray()
    const dd = await designDetails(orders)
    const pn = await partnerNames(orders)
    const need = all ? orders : orders.filter((o) => designState(dd.get(String(o._id))) !== 'ready')

    // 거래처의 확정된 이전 디자인(최근 수정 순, 거래처당 5개)
    const pids = [...new Set(need.map((o) => String(o.partnerId || '')).filter(Boolean))].map((x) => oid(x))
    const cand = new Map()
    if (pids.length) {
      const ds = await (await col('designs')).find({ partnerId: { $in: pids }, active: { $ne: false } }).sort({ updatedAt: -1 }).toArray()
      for (const d of ds) {
        const v = latestConfirmed(d)
        if (!v) continue
        const k = String(d.partnerId)
        if (!cand.has(k)) cand.set(k, [])
        if (cand.get(k).length < 5) cand.get(k).push({ _id: d._id, code: d.code, name: d.name, version: v.no, preview: v.previewImage || '' })
      }
    }
    const nextBy = new Map(pend.map((p) => [String(p._id), p]))
    const items = need.map((o) => {
      const det = dd.get(String(o._id)) || []
      const st = designState(det)
      const cands = cand.get(String(o.partnerId || '')) || []
      // 장별 매핑 현황 — 디자인(코드)별로 어느 세트가 몇 장인지. 디자인을 정하지 않은 장은 unmapped.
      const use = new Map()
      let unmapped = 0
      for (const p of o.pieces || []) {
        if (!p.design) { unmapped++; continue }
        const d = det.find((x) => x.code === p.design)
        if (!use.has(p.design)) use.set(p.design, { code: p.design, name: d?.name || '', hasSets: !!(d?.variants || []).length, sets: new Map() })
        const u = use.get(p.design)
        const nm = pickSetName(d, p)
        u.sets.set(nm, (u.sets.get(nm) || 0) + 1)
      }
      const designUse = [...use.values()].map((u) => ({ code: u.code, name: u.name, hasSets: u.hasSets, sets: [...u.sets].map(([name, n]) => ({ name, n })) }))
      return {
        ...summary(o, pn), nextDate: nextBy.get(String(o._id))?.next || null, designState: st, designs: det,
        candidates: cands, kind: st === 'working' ? 'working' : (cands.length ? 'reorder' : 'new'),
        attachments: o.attachments || [], content: o.content || '', request: o.request || '', partnerId: o.partnerId || null,
        notNeeded: !!o.designNotNeeded, pieceTotal: (o.pieces || []).length, unmapped, designUse,
      }
    }).sort((a, b) => (all ? (String(a.dueAt || '9').localeCompare(String(b.dueAt || '9'))) : String(a.nextDate).localeCompare(String(b.nextDate))) || a.orderNo - b.orderNo)
    res.json({ items })
  } catch (e) { fail(res, e) }
})

// 좌측 목록: 작업 대기·진행 중인 주문 + 배정된 수량. ?q &scope=open(기본: 접수·제작중·검수) | all(완료·출고·취소 제외)
router.get('/orders', async (req, res) => {
  try {
    // 좌측 목록: 접수 상태 주문. (작업배정 주문은 배정을 모두 지웠을 때 접수로 되돌릴 수 있도록 함께 내려준다)
    const q = { status: { $in: ['접수', '작업배정'] } }
    if (req.query.q) {
      const re = { $regex: escRe(req.query.q), $options: 'i' }
      q.$or = [{ title: re }, { 'pieces.person': re }, { tags: re }]
      if (/^\d+$/.test(String(req.query.q))) q.$or.push({ orderNo: Number(req.query.q) })
    }
    const orders = await (await col('orders')).find(q, { projection: { ...PROJ, 'pieces.design': 1, 'pieces.variant': 1, 'pieces.color': 1, 'pieces.initialColor': 1 } }).limit(500).toArray()
    const ids = orders.map((o) => o._id)
    const [sched, pn, tq] = await Promise.all([scheduledQty(ids), partnerNames(orders), taskQtyMap(ids)])
    const dd = await designDetails(orders)
    const items = orders.map((o) => {
      const s = sched.get(String(o._id))
      const det = dd.get(String(o._id)) || []
      return { ...summary(o, pn), scheduledQty: s?.qty || 0, scheduledDays: s?.days || 0, taskQty: tq.get(String(o._id)) || {}, designState: o.designNotNeeded ? 'na' : designState(det), designCount: det.length,
        needsByTask: Object.fromEntries(['', '로고', '이니셜'].map((k) => [k, threadNeeds(o.pieces, det, k)])) }      // 공정별로 필요한 실 — 새로 배정할 때 자수기 교체 개수 계산용
    })
    // 납기 빠른 순 (납기 없는 건 뒤로), 같으면 주문번호
    items.sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity) || a.orderNo - b.orderNo)
    res.json({ items })
  } catch (e) { fail(res, e) }
})

// 기간의 일정: ?from=YYYY-MM-DD&to=YYYY-MM-DD (최대 100일). 납기(dues)도 함께 돌려준다.
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query
    if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: 'from · to 를 YYYY-MM-DD 로 주세요.' })
    if ((new Date(to) - new Date(from)) / 864e5 > 100) return res.status(400).json({ error: '조회 기간은 100일 이하입니다.' })
    const entries = await (await col('workSchedules')).find({ date: { $gte: from, $lte: to } }).sort({ date: 1, orderNo: 1 }).toArray()
    const ids = [...new Set(entries.map((e) => String(e.orderId)))].map(oid)
    const oc = await col('orders')
    const orders = ids.length ? await oc.find({ _id: { $in: ids } }, { projection: { ...PROJ, 'pieces.design': 1, 'pieces.variant': 1, 'pieces.color': 1, 'pieces.initialColor': 1 } }).toArray() : []
    const pn = await partnerNames(orders)
    const dd = await designDetails(orders)
    const piecesOf = new Map(orders.map((o) => [String(o._id), o.pieces || []]))
    const byId = new Map(orders.map((o) => [String(o._id), { ...summary(o, pn), designs: dd.get(String(o._id)) || [], designState: o.designNotNeeded ? 'na' : designState(dd.get(String(o._id))) }]))
    // 공정별 완료 수량 (예: 로고 20/32) — 일 보기·작업자 화면의 진척 표시용
    const doneRows = ids.length ? await (await col('workSchedules')).aggregate([
      { $match: { orderId: { $in: ids }, status: '완료' } },
      { $group: { _id: { o: '$orderId', t: { $ifNull: ['$task', ''] } }, qty: { $sum: '$qty' } } },
    ]).toArray() : []
    for (const r of doneRows) {
      const sum = byId.get(String(r._id.o))
      if (sum) { sum.taskDone = sum.taskDone || {}; sum.taskDone[r._id.t] = r.qty }
    }
    // 납기 표시: 기간 안에 납기가 있고 아직 끝나지 않은 주문
    const dueDocs = await oc.find(
      { dueAt: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) }, status: { $nin: DONE } },
      { projection: { orderNo: 1, title: 1, dueAt: 1 } },
    ).toArray()
    // 같은 주문·공정에서 앞선 배정의 수량 합 (날짜 · 등록 순) — 주문 전체 N장 중 이 배정이 몇 번째 장부터인지
    const offsetOf = new Map()
    if (ids.length) {
      const all = await (await col('workSchedules')).find({ orderId: { $in: ids } }, { projection: { orderId: 1, task: 1, date: 1, qty: 1, createdAt: 1 } }).sort({ date: 1, createdAt: 1, _id: 1 }).toArray()
      const run = new Map()
      for (const e of all) { const k = `${e.orderId}|${e.task || ''}`; offsetOf.set(String(e._id), run.get(k) || 0); run.set(k, (run.get(k) || 0) + (e.qty || 0)) }
    }
    const cfg = await loadCapacity()
    const capacity = {}
    for (let d = from; d <= to; d = dayAfter(d)) capacity[d] = capacityOn(cfg, d)
    res.json({
      cfg: { machines: cfg.machines, perMachine: cfg.perMachine },
      capacity,
      // needs: 이 작업이 필요로 하는 실 번호(로고 컬러 + 이니셜색상) — 자수기에 걸린 실과 비교해 교체 개수를 계산한다
      entries: entries.map((e) => ({ ...e, offset: offsetOf.get(String(e._id)) || 0, order: byId.get(String(e.orderId)) || null, needs: threadNeeds(piecesOf.get(String(e.orderId)), byId.get(String(e.orderId))?.designs, e.task || '') })),
      dues: dueDocs.map((o) => ({ orderId: o._id, orderNo: o.orderNo, title: o.title, date: ymd(o.dueAt) })),
    })
  } catch (e) { fail(res, e) }
})

async function logSchedule(orderId, user, detail) {
  await (await col('activityLogs')).insertOne({ target: 'order', targetId: orderId, action: 'schedule', detail, by: user.username, at: new Date() })
}

// 작업을 시작·완료하면 배정된 자수기에 그 작업의 실이 걸린다 (이미 걸린 실은 그대로, 없는 실만 필요 없는 침에 교체)
async function applyMachine(cur) {
  if (!cur.machineId) return
  const mc = await col('machines')
  const m = await mc.findOne({ _id: cur.machineId })
  if (!m) return
  const o = await (await col('orders')).findOne({ _id: cur.orderId }, { projection: { designs: 1, 'pieces.no': 1, 'pieces.design': 1, 'pieces.variant': 1, 'pieces.color': 1, 'pieces.initialColor': 1 } })
  if (!o) return
  // 이 배정이 맡은 장(units)만 — 장 번호는 번호 순으로 정렬한 제작 명세의 위치다. 없으면 주문 전체.
  const sorted = (o.pieces || []).slice().sort((a, b) => (a.no || 0) - (b.no || 0))
  const mine = Array.isArray(cur.units) && cur.units.length ? cur.units.map((u) => sorted[u]).filter(Boolean) : o.pieces
  const needs = threadNeeds(mine, (await designDetails([o])).get(String(o._id)) || [], cur.task || '')
  const { needles, swaps } = loadThreads(m.needles, needs)
  await mc.updateOne({ _id: m._id }, { $set: { needles, updatedAt: new Date(), lastJob: { orderNo: cur.orderNo, task: cur.task || '', swaps, at: new Date() } } })
}

// 배정이 있으면 접수 → 작업배정, 배정이 모두 사라지면 작업배정 → 접수. (제작중 이후 상태는 건드리지 않는다)
export async function syncStatus(orderIds, user) {
  const changed = []
  const oc = await col('orders')
  const wc = await col('workSchedules')
  for (const id of [...new Set(orderIds.map(String))].map(oid)) {
    if (!id) continue
    const o = await oc.findOne({ _id: id }, { projection: { status: 1, orderNo: 1 } })
    if (!o) continue
    const n = await wc.countDocuments({ orderId: id })
    let to = null
    if (n > 0 && o.status === '접수') to = '작업배정'
    else if (n === 0 && ['작업배정', '제작중', '검수'].includes(o.status)) to = '접수'      // 배정이 모두 사라지면 (진행 중이던 것도) 접수로 — 다시 배정 대기 목록에 나타난다
    if (!to) continue
    await oc.updateOne({ _id: id }, { $set: { status: to, updatedAt: new Date() } })
    await (await col('activityLogs')).insertOne({ target: 'order', targetId: id, action: 'status', detail: { from: o.status, to, by: '작업관리' }, by: user.username, at: new Date() })
    changed.push({ orderId: id, orderNo: o.orderNo, from: o.status, to })
  }
  return changed
}

// 취소한 배정의 수량은 같은 주문의 남은 배정(완료 제외) 중 가장 빠른 날짜의 배정에 합친다.
// 남은 배정이 없으면(전부 취소) 합칠 곳이 없으므로 아무 일도 하지 않는다 — 주문은 접수로 돌아간다.
async function mergeRemoved(orderId, qty, task = '') {
  const wc = await col('workSchedules')
  // 같은 공정의 배정에만 합친다 (로고 수량이 이니셜 배정으로 들어가면 안 된다)
  const sameTask = task ? { task } : { $or: [{ task: '' }, { task: { $exists: false } }] }
  const target = await wc.find({ orderId, status: { $ne: '완료' }, ...sameTask }).sort({ date: 1, createdAt: 1 }).limit(1).next()
  if (!target) return null
  await wc.updateOne({ _id: target._id }, { $inc: { qty }, $set: { updatedAt: new Date() } })
  return { orderId, orderNo: target.orderNo, date: target.date, qty, task }
}

// ── 작업 진행 ─────────────────────────────────────────────
// 작업지시의 상태(지시 → 진행 → 완료)에 따라
//   · 주문 상태를 자동으로 맞추고(작업배정 → 제작중 → 검수),
//   · 공정이 끝난 만큼 수모 재고를 차감한다.
// 배송준비 이후의 상태는 사람이 정하므로 건드리지 않는다.
const WORK_FLOW = ['작업배정', '제작중', '검수']

// 주문 상태: 하나라도 시작되면 제작중, 사용 중인 모든 공정이 주문 수량만큼 끝나면 검수.
// allowDown=false 이면 상태를 올리기만 한다 — 일정을 저장할 때 사람이 정해 둔 상태(제작중 등)가 강등되지 않게 하기 위함.
// 작업 시작·완료·되돌림(/work)에서는 allowDown=true 로 진행 상황을 그대로 반영한다.
export async function syncProgress(orderIds, user, allowDown = true) {
  const changed = []
  const oc = await col('orders')
  const wc = await col('workSchedules')
  for (const id of [...new Set(orderIds.map(String))].map(oid)) {
    if (!id) continue
    const o = await oc.findOne({ _id: id }, { projection: { status: 1, orderNo: 1, items: 1, pieceCount: 1, title: 1 } })
    if (!o || !WORK_FLOW.includes(o.status)) continue
    const es = await wc.find({ orderId: id }).toArray()
    if (!es.length) continue
    const total = orderQty(o)
    const done = {}
    let allDone = true
    let started = false
    for (const e of es) {
      const t = e.task || ''
      if (e.status === '완료') done[t] = (done[t] || 0) + e.qty
      else allDone = false
      if (e.status !== '지시') started = true
    }
    const tasks = [...new Set(es.map((e) => e.task || ''))]
    const complete = allDone && tasks.every((t) => !total || (done[t] || 0) >= total)
    const to = complete ? '검수' : started ? '제작중' : '작업배정'
    if (to === o.status) continue
    if (!allowDown && WORK_FLOW.indexOf(to) < WORK_FLOW.indexOf(o.status)) continue
    await oc.updateOne({ _id: id }, { $set: { status: to, updatedAt: new Date() } })
    await (await col('activityLogs')).insertOne({ target: 'order', targetId: id, action: 'status', detail: { from: o.status, to, by: '작업 진행' }, by: user.username, at: new Date() })
    changed.push({ orderId: id, orderNo: o.orderNo, from: o.status, to })
  }
  return changed
}

// 장별 사양 목록 [{ color, size }] — 제작 명세가 있으면 그 줄, 없으면 품목을 수량만큼 펼친다
function unitsOf(o) {
  if (Array.isArray(o.pieces) && o.pieces.length) return o.pieces.map((p) => ({ color: p.color || '', size: p.size || '' }))
  const out = []
  for (const it of o.items || []) for (let i = 0; i < (Number(it.qty) || 0); i++) out.push({ color: it.color || '', size: it.size || '' })
  return out
}

// 재고 차감: 공정이 끝난 장수(= 공정별 완료 수량의 최댓값)만큼, 제작 명세 앞에서부터 수모를 차감한다.
// 로고·이니셜을 모두 하는 주문이라도 수모는 한 장에 한 번만 쓰이므로 공정별로 중복 차감하지 않는다.
// 완료를 취소하면 같은 만큼 되돌린다. 수모 물품(이름에 '수모')의 색상·사이즈 옵션을 찾지 못한 장은 차감하지 않고 알린다.
export async function syncConsumption(orderId, user) {
  const oc = await col('orders')
  const o = await oc.findOne({ _id: orderId })
  if (!o) return null
  const done = {}
  for (const e of await (await col('workSchedules')).find({ orderId, status: '완료' }).toArray()) done[e.task || ''] = (done[e.task || ''] || 0) + e.qty
  const units = unitsOf(o)
  const target = Math.min(units.length, Math.max(0, ...Object.values(done)))
  const prev = Math.min(o.consumed?.n || 0, units.length)
  if (target === prev) return { delta: 0, moves: 0, unmatched: 0 }

  const delta = target - prev
  const slice = delta > 0 ? units.slice(prev, target) : units.slice(target, prev)
  const group = new Map()
  for (const u of slice) { const k = `${u.color}|${u.size}`; group.set(k, { ...u, n: (group.get(k)?.n || 0) + 1 }) }

  // 수모 물품의 옵션 찾기 (색상·사이즈 일치, 여러 물품이면 주문 품목명과 이름이 겹치는 것 우선)
  const kw = (await loadAppSettings()).capKeyword
  const caps = (await flatItems('material', {})).filter((m) => m.name.includes(kw) || m.category === kw)
  const brand = String(o.items?.[0]?.productName || '')
  const find = (color, size) => {
    const c = caps.filter((m) => (m.color || '') === color && (m.size || '') === size)
    return c.find((m) => brand && (m.name.includes(brand) || brand.includes(m.name))) || c[0] || null
  }
  const codes = [...new Set([...group.values()].map((g) => find(g.color, g.size)?.code).filter(Boolean))]
  const stock = await onHandMap('material', codes)
  const running = new Map([...stock].map(([k, v]) => [k, v.onHand]))
  const now = new Date()
  const docs = []
  let unmatched = 0
  for (const g of group.values()) {
    const m = find(g.color, g.size)
    if (!m) { unmatched += g.n; continue }
    const d = delta > 0 ? -g.n : g.n
    const bal = (running.get(m.code) || 0) + d
    running.set(m.code, bal)
    docs.push({
      kind: 'material', code: m.code, type: delta > 0 ? 'out' : 'in', delta: d, balance: bal,
      reason: delta > 0 ? '작업완료' : '완료취소', note: `#${o.orderNo} ${g.color} ${g.size}`.trim(),
      orderId: o._id, refType: 'progress', refId: o._id, at: now, by: user.username,
    })
  }
  if (docs.length) await (await col('stockMoves')).insertMany(docs)     // 재고가 모자라도 작업은 이미 끝났으므로 음수를 허용해 기록한다
  await oc.updateOne({ _id: orderId }, { $set: { consumed: { n: target, unmatched, at: now } } })
  return { delta, moves: docs.length, unmatched }
}

// ── 하루 처리 한도 ──────────────────────────────────────────
// 한도 = 가동 중인 자수기 수 × 대당 일 처리량. 장애로 대수가 줄면 한도도 줄어든다(8대 80장 → 6대 60장).
// 특정 날짜만 대수를 바꿀 수 있다(overrides). 주말은 기본적으로 작업일이 아니며(한도 없음), 필요하면 그날의 대수를 지정해 연다.
const CAP_DEFAULT = { perMachine: 10, machines: 8, overrides: {} }
export async function loadCapacity() {
  const d = await (await col('settings')).findOne({ _id: 'capacity' })
  return { perMachine: d?.perMachine ?? CAP_DEFAULT.perMachine, machines: d?.machines ?? CAP_DEFAULT.machines, overrides: d?.overrides || {} }
}
const isWeekend = (date) => { const w = new Date(`${date}T12:00:00`).getDay(); return w === 0 || w === 6 }
function capacityOn(cfg, date) {
  const o = cfg.overrides?.[date]
  if (o != null) return o * cfg.perMachine
  return isWeekend(date) ? null : cfg.machines * cfg.perMachine      // null = 작업일 아님(한도 없음)
}
const dayAfter = (date, n = 1) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const sameTaskFilter = (task) => (task ? { task } : { $or: [{ task: '' }, { task: { $exists: false } }] })

const intQty = (v) => { const n = Math.round(Number(v)); return n > 0 ? n : null }

// 배정 초기화 — 아직 시작하지 않은('지시') 작업배정을 모두 지운다. 진행·완료한 작업과 잠긴 작업은 그대로 두고,
//   배정이 모두 사라진 주문은 접수 상태로 돌아간다. { dryRun: true } 이면 지울 건수만 알려 준다.
router.post('/clear', requireCap('orders'), async (req, res) => {
  try {
    const wc = await col('workSchedules')
    const q = { status: '지시', locked: { $ne: true } }
    const docs = await wc.find(q, { projection: { orderId: 1, qty: 1 } }).toArray()
    const info = { entries: docs.length, orders: new Set(docs.map((d) => String(d.orderId))).size, qty: docs.reduce((t, d) => t + (d.qty || 0), 0) }
    if (req.body?.dryRun) return res.json(info)
    if (docs.length) {
      await wc.deleteMany({ _id: { $in: docs.map((d) => d._id) } })
      const orderIds = [...new Set(docs.map((d) => String(d.orderId)))]
      for (const id of orderIds) await logSchedule(oid(id), req.user, { clear: true })
      await syncStatus(orderIds.map(oid), req.user)
    }
    res.json({ ...info, ok: true })
  } catch (e) { fail(res, e) }
})

// 일괄 저장 — 작업관리 화면의 [저장]. 임시로 쌓아 둔 배정(adds) · 변경(edits) · 삭제(removes)를 한 번에 반영하고
// 영향받은 주문의 상태를 접수 ↔ 작업배정으로 맞춘다. 검증에 실패하면 아무것도 저장하지 않는다.
router.post('/commit', requireCap('orders'), async (req, res) => {
  try {
    const b = req.body || {}
    const adds = Array.isArray(b.adds) ? b.adds : []
    const edits = Array.isArray(b.edits) ? b.edits : []
    const removes = Array.isArray(b.removes) ? b.removes : []
    if (adds.length + edits.length + removes.length > 500) return res.status(400).json({ error: '한 번에 500건까지 저장할 수 있습니다.' })
    const wc = await col('workSchedules')
    const oc = await col('orders')
    const bad = (m) => res.status(400).json({ error: m })

    // 추가
    const orderIds = adds.map((a) => oid(a?.orderId))
    if (orderIds.some((x) => !x)) return bad('orderId 가 올바르지 않습니다.')
    const found = orderIds.length ? await oc.find({ _id: { $in: orderIds } }, { projection: PROJ }).toArray() : []
    const ob = new Map(found.map((o) => [String(o._id), o]))
    const addDocs = []
    for (const a of adds) {
      const o = ob.get(String(a.orderId))
      if (!o) return bad('없는 주문이 포함되어 있습니다.')
      if (!validDate(a.date)) return bad(`날짜가 올바르지 않습니다: ${a.date}`)
      const qty = intQty(a.qty) || orderQty(o) || 1
      if (a.task != null && !WORK_TASKS.includes(a.task)) return bad(`공정은 ${WORK_TASKS.filter(Boolean).join(' · ')} 입니다.`)
      addDocs.push({ orderId: o._id, orderNo: o.orderNo, date: a.date, qty, task: taskOf(a.task), status: '지시', note: String(a.note || '').trim(), createdAt: new Date(), by: req.user.username, ...(oid(a.machineId) ? { machineId: oid(a.machineId) } : {}) })
    }
    // 수정
    const editOps = []
    const unsetMachine = []
    for (const e of edits) {
      const _id = oid(e?.id)
      if (!_id) return bad('수정할 작업지시 id 가 올바르지 않습니다.')
      const set = { updatedAt: new Date() }
      if ('date' in e) { if (!validDate(e.date)) return bad(`날짜가 올바르지 않습니다: ${e.date}`); set.date = e.date }
      if ('qty' in e) { const n = intQty(e.qty); if (!n) return bad('수량은 1 이상이어야 합니다.'); set.qty = n }
      if ('status' in e) { if (!WORK_STATUSES.includes(e.status)) return bad('작업 상태가 올바르지 않습니다.'); set.status = e.status }
      if ('note' in e) set.note = String(e.note ?? '').trim()
      if ('task' in e) { if (!WORK_TASKS.includes(e.task)) return bad('공정이 올바르지 않습니다.'); set.task = e.task }
      if ('machineId' in e) { if (oid(e.machineId)) set.machineId = oid(e.machineId); else unsetMachine.push(_id) }
      editOps.push({ _id, set })
    }
    const rmIds = removes.map((x) => oid(x)).filter(Boolean)

    // 주문 전체 배정 취소 — 그 주문의 (이미 저장된) 배정을 공정과 날짜에 상관없이 모두 지운다. 접수로 되돌아가며 수량 합침은 없다.
    const cancelIds = (Array.isArray(b.cancelOrders) ? b.cancelOrders : []).map((x) => oid(x)).filter(Boolean)
    const cancelDocs = cancelIds.length ? await wc.find({ orderId: { $in: cancelIds } }, { projection: { orderId: 1, orderNo: 1, status: 1, qty: 1, task: 1 } }).toArray() : []
    const doneOnes = cancelDocs.filter((d) => d.status === '완료')
    if (doneOnes.length) return bad(`완료된 작업지시가 있어 주문 전체 배정을 취소할 수 없습니다: #${[...new Set(doneOnes.map((d) => d.orderNo))].join(', #')}`)

    const touched = await wc.find({ _id: { $in: [...editOps.map((x) => x._id), ...rmIds] } }, { projection: { orderId: 1, qty: 1, status: 1, task: 1 } }).toArray()
    if (touched.length !== new Set([...editOps.map((x) => String(x._id)), ...rmIds.map(String)]).size) return bad('이미 삭제되었거나 없는 작업지시가 포함되어 있습니다. 새로고침 후 다시 시도하세요.')

    // 완료된 작업은 취소할 수 없다 (이미 만든 것)
    const rmSet = new Set(rmIds.map(String))
    const removedDocs = touched.filter((t) => rmSet.has(String(t._id)))
    if (removedDocs.some((d) => d.status === '완료')) return bad('완료된 작업지시는 취소할 수 없습니다.')

    // 초기화 — 시작하지 않은('지시') 잠기지 않은 배정을 모두 지운다 (새 배정을 넣기 전에 처리해, 같은 저장에서 다시 배정한 것은 남긴다)
    const clearDocs = b.clearAll ? await wc.find({ status: '지시', locked: { $ne: true } }, { projection: { orderId: 1, qty: 1 } }).toArray() : []
    if (clearDocs.length) await wc.deleteMany({ _id: { $in: clearDocs.map((d) => d._id) } })

    // 반영 — 주문 전체 취소는 새 배정을 넣기 전에 처리해, 같은 저장에서 다시 배정한 것은 남긴다
    if (cancelDocs.length) await wc.deleteMany({ _id: { $in: cancelDocs.map((d) => d._id) } })
    if (addDocs.length) await wc.insertMany(addDocs)
    for (const op of editOps) await wc.updateOne({ _id: op._id }, { $set: op.set })
    if (unsetMachine.length) await wc.updateMany({ _id: { $in: unsetMachine } }, { $unset: { machineId: '' } })
    if (rmIds.length) await wc.deleteMany({ _id: { $in: rmIds } })

    // 삭제된 배정의 수량을 남은 배정에 합친다. 화면에서 이미 합쳐서 보낸 것(noMerge)은 다시 합치지 않는다.
    const noMerge = new Set((Array.isArray(b.noMerge) ? b.noMerge : []).map(String))
    const lost = new Map()
    for (const d of removedDocs) {
      if (noMerge.has(String(d._id))) continue
      const k = `${d.orderId}|${d.task || ''}`
      lost.set(k, (lost.get(k) || 0) + (d.qty || 0))
    }
    const merged = []
    for (const [k, qty] of lost) {
      const [orderId, task] = k.split('|')
      const m = await mergeRemoved(oid(orderId), qty, task)
      if (m) merged.push(m)
    }

    const affected = [...addDocs.map((d) => d.orderId), ...touched.map((t) => t.orderId), ...cancelIds, ...clearDocs.map((d) => d.orderId)]
    for (const id of new Set(clearDocs.map((d) => String(d.orderId)))) await logSchedule(oid(id), req.user, { clear: true })
    for (const id of new Set(cancelDocs.map((d) => String(d.orderId)))) {
      const mine = cancelDocs.filter((d) => String(d.orderId) === id)
      await logSchedule(oid(id), req.user, { cancelAll: true, removed: mine.length, qty: mine.reduce((t, d) => t + (d.qty || 0), 0) })
    }
    for (const d of addDocs) await logSchedule(d.orderId, req.user, { date: d.date, qty: d.qty })
    const statusChanged = await syncStatus(affected, req.user)
    statusChanged.push(...await syncProgress(affected, req.user, false))
    for (const id of new Set(affected.map(String))) await syncConsumption(oid(id), req.user)
    res.json({ ok: true, added: addDocs.length, edited: editOps.length, removed: rmIds.length, cancelled: cancelDocs.length, cleared: clearDocs.length, merged, statusChanged })
  } catch (e) { fail(res, e) }
})

// 작업지시 만들기 — 수량을 주지 않으면 아직 배정되지 않은 나머지 수량으로 한다
router.post('/', requireCap('orders'), async (req, res) => {
  try {
    const orderId = oid(req.body?.orderId)
    const date = String(req.body?.date || '')
    if (!orderId) return res.status(400).json({ error: 'orderId 가 필요합니다.' })
    if (!validDate(date)) return res.status(400).json({ error: '날짜를 YYYY-MM-DD 로 주세요.' })
    const o = await (await col('orders')).findOne({ _id: orderId }, { projection: PROJ })
    if (!o) return res.status(404).json({ error: '없는 주문입니다.' })

    let qty = Number(req.body?.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      const done = (await scheduledQty([orderId])).get(String(orderId))?.qty || 0
      const total = orderQty(o)
      qty = total - done > 0 ? total - done : (total || 1)
    }
    const doc = {
      orderId, orderNo: o.orderNo, date, qty: Math.round(qty), task: taskOf(req.body?.task), status: '지시',
      note: String(req.body?.note || '').trim(), createdAt: new Date(), by: req.user.username,
      ...(oid(req.body?.machineId) ? { machineId: oid(req.body.machineId) } : {}),
    }
    const r = await (await col('workSchedules')).insertOne(doc)
    await logSchedule(orderId, req.user, { date, qty: doc.qty })
    await syncStatus([orderId], req.user)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { fail(res, e) }
})

// 작업 진행 — { action: 'start' | 'complete' | 'undo', qty? }. 작업자(worker)도 쓸 수 있다.
//   complete: qty 가 칸의 수량보다 적으면 부분 완료 — 완료한 만큼을 완료로 두고 남은 수량은 같은 날짜·공정의 새 배정으로 남긴다.
//   undo    : 완료를 되돌린다. 같은 날짜·공정에 남은 수량이 있으면 거기에 합쳐 원래 칸으로 복원한다.
router.post('/:id/work', requireCap('work'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const wc = await col('workSchedules')
    const cur = _id && await wc.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 작업지시입니다.' })
    const action = req.body?.action
    const now = new Date()
    const who = { by: req.user.username }
    let detail = { action }
    let carried = null
    let reduced = []

    if (action === 'start') {
      if (cur.status !== '지시') return res.status(409).json({ error: '이미 진행 중이거나 완료된 작업입니다.' })
      await wc.updateOne({ _id }, { $set: { status: '진행', startedAt: now, startedBy: who.by, updatedAt: now } })
    } else if (action === 'complete') {
      if (cur.status === '완료') return res.status(409).json({ error: '이미 완료된 작업입니다.' })
      const given = req.body?.qty
      const qty = given == null || given === '' ? cur.qty : intQty(given)
      if (!qty) return res.status(400).json({ error: '완료 수량은 1 이상이어야 합니다.' })
      const task = cur.task || ''
      let doneQty = qty
      // 완료 처리는 이 작업(칸) 하나만 바꾼다 — 같은 주문의 다른 배정(다른 자수기·다른 날짜)의 수량은 다시 계산하지 않는다.
      if (qty > cur.qty) {
        // 계획보다 많이 했다: 주문 수량을 넘지만 않으면 이 칸의 수량만 늘린다 (다른 배정은 그대로)
        const order = await (await col('orders')).findOne({ _id: cur.orderId }, { projection: PROJ })
        const total = order ? orderQty(order) : 0
        if (total > 0) {
          const others = await wc.find({ _id: { $ne: _id }, orderId: cur.orderId, status: '완료', ...sameTaskFilter(task) }, { projection: { qty: 1 } }).toArray()
          const room = total - others.reduce((s, x) => s + x.qty, 0)
          if (qty > room) return res.status(400).json({ error: `주문 수량을 넘습니다. 이 공정은 최대 ${Math.max(0, room)}장까지 완료할 수 있습니다.` })
        }
      } else if (qty < cur.qty) {
        // 일부만 완료: 남은 수량은 같은 날짜·같은 자수기의 새 지시로 남긴다 (다른 배정과 합치거나 옮기지 않는다 — 옮기려면 일정에서 직접)
        await wc.insertOne({
          orderId: cur.orderId, orderNo: cur.orderNo, date: cur.date, qty: cur.qty - qty, task,
          status: cur.status, note: cur.note || '', createdAt: now, by: who.by, splitFrom: cur._id, ...(cur.machineId ? { machineId: cur.machineId } : {}),
          ...(cur.seq != null ? { seq: cur.seq } : {}),
        })
      }
      await wc.updateOne({ _id }, { $set: { qty: doneQty, status: '완료', completedAt: now, completedBy: who.by, updatedAt: now } })
      detail = { action, qty, of: cur.qty, carried: carried?.date || null, reduced: reduced.length || undefined }
    } else if (action === 'reset') {
      // 진행 → 지시 (시작을 되돌린다)
      if (cur.status !== '진행') return res.status(409).json({ error: '진행 중인 작업이 아닙니다.' })
      await wc.updateOne({ _id }, { $set: { status: '지시', updatedAt: now }, $unset: { startedAt: '', startedBy: '' } })
    } else if (action === 'undo') {
      if (cur.status !== '완료') return res.status(409).json({ error: '완료된 작업이 아닙니다.' })
      const task = cur.task || ''
      const sameTask = task ? { task } : { $or: [{ task: '' }, { task: { $exists: false } }] }
      const sibling = await wc.findOne({ _id: { $ne: _id }, orderId: cur.orderId, date: cur.date, status: { $in: ['지시', '진행'] }, machineId: cur.machineId || null, ...sameTask })      // 같은 자수기의 칸에만 합친다
      if (sibling) {
        await wc.updateOne({ _id: sibling._id }, { $inc: { qty: cur.qty }, $set: { updatedAt: now } })
        await wc.deleteOne({ _id })
        detail = { action, mergedInto: String(sibling._id) }
      } else {
        // 완료를 되돌리면 '진행'(기본) 또는 '지시'(to: '지시')로 돌아간다
        const back = req.body?.to === '지시' ? '지시' : '진행'
        await wc.updateOne({ _id }, { $set: { status: back, updatedAt: now }, $unset: { completedAt: '', completedBy: '', ...(back === '지시' ? { startedAt: '', startedBy: '' } : {}) } })
      }
    } else {
      return res.status(400).json({ error: "action 은 start · complete · undo · reset 입니다." })
    }

    if (action === 'start' || action === 'complete') await applyMachine(cur).catch(() => {})       // 자수기에 이 작업의 실이 걸린 것으로 갱신
    await logSchedule(cur.orderId, req.user, { work: detail, task: cur.task || '', date: cur.date })
    const statusChanged = await syncProgress([cur.orderId], req.user)
    const stock = await syncConsumption(cur.orderId, req.user)
    const order = await (await col('orders')).findOne({ _id: cur.orderId }, { projection: { status: 1 } })
    res.json({ ok: true, orderStatus: order?.status, statusChanged, stock, carried, reduced })
  } catch (e) { fail(res, e) }
})

// 이동·수정 — { date?, qty?, status?, note? }
router.patch('/:id', requireCap('orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('workSchedules')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 작업지시입니다.' })
    const b = req.body || {}
    const set = { updatedAt: new Date() }
    if ('date' in b) { if (!validDate(b.date)) return res.status(400).json({ error: '날짜가 올바르지 않습니다.' }); set.date = b.date }
    if ('qty' in b) { const n = Math.round(Number(b.qty)); if (!(n > 0)) return res.status(400).json({ error: '수량은 1 이상이어야 합니다.' }); set.qty = n }
    if ('status' in b) { if (!WORK_STATUSES.includes(b.status)) return res.status(400).json({ error: `상태는 ${WORK_STATUSES.join(' · ')} 입니다.` }); set.status = b.status }
    if ('note' in b) set.note = String(b.note ?? '').trim()
    if ('task' in b) { if (!WORK_TASKS.includes(b.task)) return res.status(400).json({ error: '공정이 올바르지 않습니다.' }); set.task = b.task }
    const unset = {}
    if ('machineId' in b) { if (oid(b.machineId)) set.machineId = oid(b.machineId); else unset.machineId = '' }
    const next = await c.findOneAndUpdate({ _id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after' })
    if (set.date && set.date !== cur.date) await logSchedule(cur.orderId, req.user, { from: cur.date, to: set.date })
    res.json(next)
  } catch (e) { fail(res, e) }
})

router.delete('/:id', requireCap('orders'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('workSchedules')
    const cur = _id && await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: '없는 작업지시입니다.' })
    if (cur.status === '완료') return res.status(409).json({ error: '완료된 작업지시는 취소할 수 없습니다.' })
    await c.deleteOne({ _id })
    const merged = await mergeRemoved(cur.orderId, cur.qty, cur.task || '')
    await logSchedule(cur.orderId, req.user, { removed: cur.date, qty: cur.qty, mergedInto: merged?.date || null })
    await syncStatus([cur.orderId], req.user)
    res.json({ ok: true, merged })
  } catch (e) { fail(res, e) }
})

export default router
