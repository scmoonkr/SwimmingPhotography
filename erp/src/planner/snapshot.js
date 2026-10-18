// 현재 DB(주문·장별 제작 명세·디자인·자수기·작업배정)를 배정 엔진의 입력(스냅샷)으로 바꾼다.
//   계획 단위 = 장(piece)의 묶음: (디자인, 컬러 세트, 이니셜색상)이 같은 장은 같은 실을 쓰므로 한 묶음이다.
//   필요한 실 = 로고 컬러(그 장의 컬러 세트) + 이니셜색상 → 자수기에 없는 실만 교체한다.
import { col } from '../db.js'
import { loadAppSettings } from '../settings.js'
import { designDetails, pickSetName } from '../designLib.js'
import { normNeedles, threadNeeds } from '../machineLib.js'
import { orderQty } from '../routes/schedule.js'
import { WorkCal, dayStart } from './calendar.js'
import { secPerCap } from './estimate.js'

const ACTIVE = ['접수', '작업배정', '제작중', '검수']

const hhmmMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }

// 계획 시작 시각: 지금 이후 가장 이른 근무 시각
export function planStart(cfg, now = Date.now()) {
  const cal = new WorkCal(cfg, now, 14)
  const t = cal.nextStart(now)
  return Number.isFinite(t) ? t : now
}

// 출고일(dueAt) → 자수 완료 목표 시각: 출고일의 근무 종료 − 출고 전 여유(일)
export function productionDue(dueAt, cfg) {
  if (!dueAt) return null
  const ymd = new Date(dueAt).toISOString().slice(0, 10)
  return dayStart(ymd) + hhmmMin(cfg.workEnd) * 60e3 - cfg.shipBufferDays * 86400e3
}

export const workVersion = async () => {
  const c = await col('workSchedules')
  const n = await c.countDocuments({})
  const last = await c.find({}, { projection: { updatedAt: 1, createdAt: 1 } }).sort({ updatedAt: -1, createdAt: -1 }).limit(1).next()
  return `${n}:${new Date(last?.updatedAt || last?.createdAt || 0).getTime()}`
}

export async function buildSnapshot({ now = Date.now() } = {}) {
  const settings = await loadAppSettings()
  const cfg = settings.production
  const threadSec = settings.swapMinutes * 60
  const startMs = planStart(cfg, now)
  const lookEnd = now + cfg.lookAheadDays * 86400e3

  const machines = (await (await col('machines')).find({ active: { $ne: false } }).sort({ order: 1, name: 1 }).toArray())
    .map((m) => ({ id: String(m._id), name: m.name, needles: normNeedles(m.needles), freeAt: 0 }))
  const known = new Set(machines.map((m) => m.id))

  const orders = await (await col('orders')).find({ status: { $in: ACTIVE } }, {
    projection: { orderNo: 1, title: 1, dueAt: 1, items: 1, pieceCount: 1, pieces: 1, designs: 1, status: 1, partnerId: 1 },
  }).sort({ orderNo: 1 }).toArray()
  const dd = await designDetails(orders)
  const entries = orders.length ? await (await col('workSchedules')).find({ orderId: { $in: orders.map((o) => o._id) } }).toArray() : []
  const byOrder = new Map()
  for (const e of entries) { const k = String(e.orderId); if (!byOrder.has(k)) byOrder.set(k, []); byOrder.get(k).push(e) }

  const groups = [], fixed = Object.fromEntries(machines.map((m) => [m.id, []])), due = {}, info = {}
  const warnings = { outOfRange: 0, noDue: 0, noDesign: 0, noMachineFixed: 0 }
  let fx = 0
  for (const o of orders) {
    const oidS = String(o._id)
    const list = byOrder.get(oidS) || []
    const total = orderQty(o)
    const doneByTask = {}
    for (const e of list) if (e.status === '완료') doneByTask[e.task || ''] = (doneByTask[e.task || ''] || 0) + e.qty
    const done = Math.max(0, ...Object.values(doneByTask))
    const locked = list.filter((e) => e.status !== '완료' && (e.status === '진행' || e.locked))
    const lockedQty = locked.reduce((t, e) => t + e.qty, 0)
    const remaining = total - done - lockedQty
    const dueMs = productionDue(o.dueAt, cfg)
    const hadEntries = list.some((e) => e.status !== '완료')
    if (remaining <= 0 && !locked.length) continue
    if (dueMs == null && !hadEntries) { warnings.noDue++; continue }                       // 출고일이 없고 아직 배정도 안 한 주문은 계획에서 뺀다
    if (dueMs != null && o.dueAt && new Date(o.dueAt).getTime() > lookEnd) { warnings.outOfRange++; continue }

    const det = dd.get(oidS) || []
    const link = det[0] || null
    const verOf = (code) => det.find((x) => x.code === code) || link
    info[oidS] = { orderNo: o.orderNo, title: o.title, dueAt: o.dueAt || null, total, remaining: Math.max(0, remaining), status: o.status, noDesign: !det.length }
    if (dueMs != null) due[oidS] = dueMs
    if (!det.length) warnings.noDesign++

    // 잠금·진행 중인 작업은 그 자수기에 그대로 (계획이 건드리지 않는다)
    for (const e of locked) {
      const mid = e.machineId ? String(e.machineId) : ''
      if (!mid || !known.has(mid)) { warnings.noMachineFixed++; continue }
      const est = secPerCap(link, cfg)
      fixed[mid].push({ id: `f${++fx}`, groupKey: `${oidS}|fixed|${String(e._id)}`, orderId: oidS, count: e.qty, secPerCap: est.sec, threads: threadNeeds(o.pieces, det, e.task || ''), locked: true, entryId: String(e._id), source: est.source })
    }
    if (remaining <= 0) continue

    // 남은 장: 완료·고정된 장수만큼은 앞에서 빠진 것으로 본다 (번호 순)
    const pieces = (o.pieces || []).slice().sort((a, b) => (a.no || 0) - (b.no || 0))
    const rest = pieces.length ? pieces.slice(done + lockedQty, done + lockedQty + remaining) : []
    const synth = Math.max(0, remaining - rest.length)
    const gmap = new Map()
    const add = (p, n) => {
      const code = p?.design || link?.code || ''
      const d = verOf(code)
      const setName = d ? pickSetName(d, p || {}) : ''
      const ic = String(p?.initialColor || '').trim()
      const key = `${oidS}|${code}|${setName}|${ic}`
      const est = secPerCap(d, cfg)
      if (!gmap.has(key)) gmap.set(key, { key, orderId: oidS, orderNo: o.orderNo, designCode: code, designName: d?.name || '', setName, initialColor: ic, threads: threadNeeds(p ? [p] : [], det, ''), secPerCap: est.sec, source: est.source, count: 0, dueMs })
      gmap.get(key).count += n
    }
    rest.forEach((p) => add(p, 1))
    if (synth) add(null, synth)                                  // 제작 명세가 없는 장: 연결된 디자인의 기본 컬러로
    groups.push(...gmap.values())
  }
  return { startMs, nowMs: now, cfg, threadSec, machines, groups, fixed, due, orders: info, warnings, baseVersion: await workVersion() }
}

