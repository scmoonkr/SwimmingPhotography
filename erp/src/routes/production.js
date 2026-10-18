// 생산 계획(시나리오) — 7일 시간대별 자수기 배정·시뮬레이션.
//   시나리오는 서버에 저장되는 '초안'이다. 만들기(자동 배정) → 수동 변경 → 지표 비교 → 확정(workSchedules 로 반영).
//   확정 전에는 실제 작업배정(workSchedules)을 바꾸지 않는다.
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { oid } from '../crud.js'
import { buildSnapshot, workVersion } from '../planner/snapshot.js'
import { greedy, improve, evaluate, mergeAdjacent, UNASSIGNED } from '../planner/optimize.js'
import { WorkCal, ymdOf } from '../planner/calendar.js'
import { syncStatus, syncProgress, syncConsumption } from './schedule.js'

const router = Router()
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })
const bad = (m, status = 400) => Object.assign(new Error(m), { status })
const CAN = requireCap('orders', 'work')

// 저장된 jobs → 자수기별 큐 (seq 순)
function toQueues(sc) {
  const q = Object.fromEntries(sc.snap.machines.map((m) => [m.id, []]))
  q[UNASSIGNED] = []
  for (const j of [...sc.jobs].sort((a, b) => a.seq - b.seq)) {
    const key = j.machineId && q[j.machineId] ? j.machineId : UNASSIGNED
    q[key].push({ id: j.id, groupKey: j.groupKey, orderId: j.orderId, count: j.count, secPerCap: j.secPerCap, threads: j.threads, locked: !!j.locked, entryId: j.entryId, source: j.source })
  }
  return q
}
const fromQueues = (queues) => Object.entries(queues).flatMap(([mid, list]) => list.map((j, seq) => ({ ...j, machineId: mid, seq })))

// 화면에 줄 결과: 시뮬레이션을 다시 돌려 일정·지표를 붙인다 (결정적이라 저장하지 않아도 항상 같다)
async function view(sc) {
  const queues = toQueues(sc)
  const ev = evaluate(sc.snap, queues)
  const sim = ev.sim
  const gmap = new Map(sc.snap.groups.map((g) => [g.key, g]))
  const jobs = []
  for (const [mid, list] of Object.entries(queues)) {
    list.forEach((j, seq) => {
      const g = gmap.get(j.groupKey), o = sc.snap.orders[j.orderId], r = sim.jobs.get(j.id)
      jobs.push({
        id: j.id, machineId: mid, seq, orderId: j.orderId, orderNo: o?.orderNo, title: o?.title || '',
        designCode: g?.designCode || '', designName: g?.designName || '', setName: g?.setName || '', initialColor: g?.initialColor || '',
        threads: j.threads, count: j.count, secPerCap: j.secPerCap, source: j.source || g?.source || '',
        locked: !!j.locked, fixed: !!j.entryId, startMs: r?.startMs ?? null, endMs: r?.endMs ?? null, swaps: r?.swaps || 0, waitMs: r?.waitMs || 0, capDays: r?.capDays || {},
      })
    })
  }
  const orders = Object.entries(sc.snap.orders).map(([id, o]) => ({ id, ...o, endMs: sim.orders[id]?.endMs ?? null, dueMs: sc.snap.due[id] ?? null, lateMs: sim.orders[id]?.lateMs || 0 }))
    .sort((a, b) => (a.dueMs ?? Infinity) - (b.dueMs ?? Infinity) || a.orderNo - b.orderNo)
  const cal = new WorkCal(sc.snap.cfg, sc.snap.startMs, 40)
  const cfg = sc.snap.cfg
  return {
    _id: sc._id, name: sc.name, status: sc.status, createdAt: sc.createdAt, createdBy: sc.createdBy, confirmedAt: sc.confirmedAt || null,
    stale: sc.status === 'draft' && sc.baseVersion !== await workVersion(),
    startMs: sc.snap.startMs, threadSec: sc.snap.threadSec, cfg: { workStart: cfg.workStart, workEnd: cfg.workEnd, lunchStart: cfg.lunchStart, lunchEnd: cfg.lunchEnd, workers: cfg.workers, capChangeSec: cfg.capChangeSec, shipBufferDays: cfg.shipBufferDays },
    axis: cal.axis(ymdOf(sc.snap.startMs), Math.min(21, cfg.lookAheadDays + 7)),
    machines: sc.snap.machines.map((m) => ({ id: m.id, name: m.name, needles: m.needles, segs: sim.machines[m.id]?.segs || [], embMs: sim.machines[m.id]?.embMs || 0, util: sim.machines[m.id]?.util || 0, swaps: sim.machines[m.id]?.swaps || 0 })),
    workerSegs: sim.workerSegs, jobs, orders, warnings: sc.snap.warnings,
    metrics: { ...sim.metrics, unassignedCaps: ev.unassigned, overflow: sim.overflow }, autoMetrics: sc.autoMetrics || null,
  }
}

async function load(id) {
  const _id = oid(id)
  const sc = _id && await (await col('scheduleScenarios')).findOne({ _id })
  if (!sc) throw bad('없는 계획입니다.', 404)
  return sc
}
const save = async (sc, queues, extra = {}) => {
  await (await col('scheduleScenarios')).updateOne({ _id: sc._id }, { $set: { jobs: fromQueues(queues), updatedAt: new Date(), ...extra } })
  return load(String(sc._id))
}
const metricsOf = (snap, queues) => { const ev = evaluate(snap, queues); return { ...ev.sim.metrics, unassignedCaps: ev.unassigned } }

// 가장 최근 계획 (없으면 null)
router.get('/scenarios/latest', async (_req, res) => {
  try {
    const sc = await (await col('scheduleScenarios')).find({}).sort({ createdAt: -1 }).limit(1).next()
    res.json(sc ? await view(sc) : null)
  } catch (e) { fail(res, e) }
})

router.get('/scenarios/:id', async (req, res) => {
  try { res.json(await view(await load(req.params.id))) } catch (e) { fail(res, e) }
})

// 새 계획 — 지금의 주문·자수기 상태로 자동 배정까지 만든다
router.post('/scenarios', CAN, async (req, res) => {
  try {
    const snap = await buildSnapshot()
    if (!snap.machines.length) throw bad('가동 중인 자수기가 없습니다. 작업 > 자수기에서 등록하세요.')
    let q = greedy(snap, snap.fixed)
    if (req.body?.optimize !== false) q = improve(snap, q, { iterations: 400, timeMs: 3000, seed: 7 }).queues
    const now = new Date()
    const doc = {
      name: String(req.body?.name || '').trim() || `${ymdOf(now.getTime())} 생산 계획`, status: 'draft', createdAt: now, createdBy: req.user.username,
      snap, jobs: fromQueues(q), baseVersion: snap.baseVersion, autoMetrics: metricsOf(snap, q),
    }
    const r = await (await col('scheduleScenarios')).insertOne(doc)
    res.status(201).json(await view({ ...doc, _id: r.insertedId }))
  } catch (e) { fail(res, e) }
})

// 자동 개선 — 지금(수동 수정 포함)의 배정에서 더 좋은 배정을 찾는다. 잠긴 작업은 그대로.
router.post('/scenarios/:id/optimize', CAN, async (req, res) => {
  try {
    const sc = await load(req.params.id)
    if (sc.status !== 'draft') throw bad('이미 확정된 계획입니다.', 409)
    const r = improve(sc.snap, toQueues(sc), { iterations: 400, timeMs: 3000, seed: Math.floor(Math.random() * 1e6) })
    res.json(await view(await save(sc, r.queues)))
  } catch (e) { fail(res, e) }
})

// 수동 변경 — { ops: [{ op:'move', jobId, machineId, index? } | { op:'split', jobId, count, machineId? } | { op:'lock', jobId, locked }] }
//   수량은 늘거나 줄지 않는다 (분할은 총량 보존, 이동은 수량 그대로). 변경 뒤 시뮬레이션은 GET/응답에서 다시 계산된다.
router.patch('/scenarios/:id/jobs', CAN, async (req, res) => {
  try {
    const sc = await load(req.params.id)
    if (sc.status !== 'draft') throw bad('이미 확정된 계획입니다.', 409)
    const q = toQueues(sc)
    const find = (id) => { for (const [mid, list] of Object.entries(q)) { const i = list.findIndex((j) => j.id === id); if (i >= 0) return { mid, i, job: list[i] } } return null }
    const total = () => Object.values(q).flat().reduce((t, j) => t + j.count, 0)
    const before = total()
    let n = 0
    for (const op of Array.isArray(req.body?.ops) ? req.body.ops : []) {
      const f = find(op?.jobId)
      if (!f) throw bad('없는 작업입니다. 새로고침 후 다시 시도하세요.', 409)
      if (op.op === 'lock') { q[f.mid][f.i] = { ...f.job, locked: !!op.locked }; continue }
      if (f.job.locked && op.op !== 'lock') throw bad('잠긴 작업은 옮기거나 나눌 수 없습니다. 잠금을 먼저 푸세요.', 409)
      const to = op.machineId == null ? f.mid : String(op.machineId)
      if (to !== UNASSIGNED && !q[to]) throw bad('없는 자수기입니다.')
      if (op.op === 'move') {
        q[f.mid].splice(f.i, 1)
        const dest = q[to]
        const at = Number.isInteger(op.index) ? Math.max(0, Math.min(dest.length, op.index)) : dest.length
        dest.splice(at, 0, f.job)
        q[f.mid] = mergeAdjacent(q[f.mid]); q[to] = mergeAdjacent(q[to])
      } else if (op.op === 'split') {
        const take = Math.round(Number(op.count))
        if (!(take >= 1 && take < f.job.count)) throw bad(`나눌 수량은 1 ~ ${f.job.count - 1} 입니다.`)
        q[f.mid][f.i] = { ...f.job, count: f.job.count - take }
        const dest = q[to]
        const at = to === f.mid ? f.i + 1 : dest.length
        dest.splice(at, 0, { ...f.job, id: `${f.job.id}s${Date.now().toString(36)}${n++}`, count: take })
        q[f.mid] = mergeAdjacent(q[f.mid]); q[to] = mergeAdjacent(q[to])
      } else throw bad('op 는 move · split · lock 입니다.')
    }
    if (total() !== before) throw bad('수량이 맞지 않습니다.', 500)
    res.json(await view(await save(sc, q)))
  } catch (e) { fail(res, e) }
})

// 확정 — 이 계획을 실제 작업배정(workSchedules)으로 반영한다.
//   · 계획에 포함된 주문의 '지시' 상태(잠기지 않은) 배정을 새 배정으로 바꾼다. 진행·완료·잠금 작업은 그대로.
//   · 그 사이 다른 곳에서 작업배정이 바뀌었으면(stale) 거절한다 — 다시 계산한 뒤 확정한다.
router.post('/scenarios/:id/confirm', CAN, async (req, res) => {
  try {
    const sc = await load(req.params.id)
    if (sc.status !== 'draft') throw bad('이미 확정된 계획입니다.', 409)
    if (sc.baseVersion !== await workVersion()) throw bad('계획을 만든 뒤 작업배정이 바뀌었습니다. "계획 만들기"로 다시 계산하세요.', 409)
    const v = await view(sc)
    const now = new Date()
    const docs = []
    for (const j of v.jobs) {
      if (!j.machineId || j.fixed) continue
      for (const [date, qty] of Object.entries(j.capDays)) {
        docs.push({
          orderId: oid(j.orderId), orderNo: j.orderNo, date, qty, task: '', status: '지시', note: '', machineId: oid(j.machineId), seq: j.seq,
          estStartAt: new Date(j.startMs), estEndAt: new Date(j.endMs), planScenario: sc._id, timeSource: j.source, locked: !!j.locked, createdAt: now, by: req.user.username,
        })
      }
    }
    const wc = await col('workSchedules')
    const orderIds = Object.keys(sc.snap.orders).map(oid)
    const old = await wc.find({ orderId: { $in: orderIds }, status: '지시', locked: { $ne: true } }, { projection: { _id: 1 } }).toArray()
    if (docs.length) await wc.insertMany(docs)                       // 새 배정을 먼저 넣고 → 옛 배정을 지운다 (중간에 실패해도 배정이 사라지지 않게)
    if (old.length) await wc.deleteMany({ _id: { $in: old.map((x) => x._id) } })
    await (await col('scheduleScenarios')).updateOne({ _id: sc._id }, { $set: { status: 'confirmed', confirmedAt: now, confirmedBy: req.user.username } })
    for (const id of orderIds) await (await col('activityLogs')).insertOne({ target: 'order', targetId: id, action: 'schedule', detail: { plan: String(sc._id) }, by: req.user.username, at: now })
    await syncStatus(orderIds, req.user)
    await syncProgress(orderIds, req.user, false)
    for (const id of orderIds) await syncConsumption(id, req.user)
    res.json({ ok: true, entries: docs.length, replaced: old.length, unassigned: v.metrics.unassignedCaps })
  } catch (e) { fail(res, e) }
})

export default router
