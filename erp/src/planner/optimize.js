// 배정 엔진 — 초기 배정(Greedy)과 개선(Local Search). 모든 후보는 같은 시뮬레이터(sim.js)로 다시 채점한다.
//   job   : { id, groupKey, orderId, count, secPerCap, threads, locked? }   — 한 자수기에서 연속으로 만드는 같은 묶음
//   queues: { [machineId]: [job], '': [job] }                               — '' 는 미배정
import { loadThreads, normNeedles, swapCount } from '../machineLib.js'
import { simulate, scoreOf, better } from './sim.js'

export const UNASSIGNED = ''

// 난수(시드 고정) — 같은 입력·같은 시드면 같은 결과
function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export const cloneQueues = (q) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.slice()]))

// 같은 묶음이 한 자수기에서 이어지면 합친다 (잠긴 작업은 합치지 않는다)
export function mergeAdjacent(list) {
  const out = []
  for (const j of list) {
    const last = out[out.length - 1]
    if (last && !last.locked && !j.locked && last.groupKey === j.groupKey) out[out.length - 1] = { ...last, count: last.count + j.count }
    else out.push(j)
  }
  return out
}

export const unassignedCaps = (queues) => (queues[UNASSIGNED] || []).reduce((t, j) => t + j.count, 0)

export function evaluate(snap, queues) {
  const due = new Map(Object.entries(snap.due || {}))
  const sim = simulate({ machines: snap.machines, queues, due, cfg: snap.cfg, threadSec: snap.threadSec, startMs: snap.startMs })
  const un = unassignedCaps(queues)
  return { sim, score: scoreOf(sim.metrics, un), unassigned: un }
}

// ── 초기 배정 ─────────────────────────────────────────
//   납기가 이른 묶음부터, 끝나는 시각 추정이 가장 빠른(실 교체 포함) 자수기에 한 덩어리(약 30분 분량)씩 넣는다.
export function greedy(snap, fixedQueues = {}) {
  const cap = snap.cfg.capChangeSec, th = snap.threadSec
  const queues = {}
  const state = {}, avail = {}
  for (const m of snap.machines) {
    queues[m.id] = (fixedQueues[m.id] || []).slice()
    let nd = normNeedles(m.needles), t = Math.max(snap.startMs, m.freeAt || 0) / 1000
    for (const j of queues[m.id]) { t += swapCount(nd, j.threads) * th + j.count * (j.secPerCap + cap); nd = loadThreads(nd, j.threads).needles }
    state[m.id] = nd; avail[m.id] = t
  }
  queues[UNASSIGNED] = []
  if (!snap.machines.length) { queues[UNASSIGNED] = snap.groups.map((g, i) => ({ id: `j${i + 1}`, groupKey: g.key, orderId: g.orderId, count: g.count, secPerCap: g.secPerCap, threads: g.threads, source: g.source })); return queues }
  const groups = snap.groups.slice().sort((a, b) => (a.dueMs ?? Infinity) - (b.dueMs ?? Infinity) || b.count * b.secPerCap - a.count * a.secPerCap || a.orderId.localeCompare(b.orderId))
  let n = 0
  // 한 묶음은 가능하면 한 자수기에 통째로 넣는다(조각이 많을수록 실 교체가 늘어난다). 자수기 한 대의 평균 일량의 절반보다 길 때만 나눈다.
  const work = (g) => g.count * (g.secPerCap + cap)
  const target = Math.max(1, (groups.reduce((t, g) => t + work(g), 0) / snap.machines.length) * 0.5)
  for (const g of groups) {
    const parts = Math.min(g.count, work(g) <= target * 1.25 ? 1 : Math.ceil(work(g) / target))
    const sizes = Array.from({ length: parts }, (_, i) => Math.floor(g.count / parts) + (i < g.count % parts ? 1 : 0))
    for (const b of sizes) {
      let best = null
      for (const m of snap.machines) {
        const sw = swapCount(state[m.id], g.threads)
        const fin = avail[m.id] + sw * th + b * (g.secPerCap + cap)
        if (!best || fin < best.fin - 1e-9) best = { m, sw, fin }
      }
      const q = queues[best.m.id]
      const last = q[q.length - 1]
      if (last && !last.locked && last.groupKey === g.key) q[q.length - 1] = { ...last, count: last.count + b }
      else q.push({ id: `j${++n}`, groupKey: g.key, orderId: g.orderId, count: b, secPerCap: g.secPerCap, threads: g.threads, source: g.source })
      state[best.m.id] = loadThreads(state[best.m.id], g.threads).needles
      avail[best.m.id] = best.fin
    }
  }
  return queues
}

// ── 개선 ──────────────────────────────────────────────
//   무작위로 (이동 · 인접 교환 · 분할)을 해 보고, 점수가 좋아질 때만 받아들인다. 잠긴 작업과 미배정은 건드리지 않는다.
export function improve(snap, start, { iterations = 300, timeMs = 2500, seed = 7 } = {}) {
  const R = rng(seed)
  const ids = snap.machines.map((m) => m.id)
  let cur = cloneQueues(start)
  let curEval = evaluate(snap, cur)
  if (!ids.length) return { queues: cur, ...curEval, evals: 0 }
  const t0 = Date.now()
  let evals = 0
  const firstFree = (q) => { let i = 0; while (i < q.length && q[i].locked) i++; return i }
  for (let it = 0; it < iterations && Date.now() - t0 < timeMs; it++) {
    const next = cloneQueues(cur)
    const a = ids[Math.floor(R() * ids.length)]
    const qa = next[a]
    const lo = firstFree(qa)
    if (qa.length <= lo) continue
    const i = lo + Math.floor(R() * (qa.length - lo))
    if (qa[i].locked) continue
    const kind = R()
    if (kind < 0.45) {                                   // 이동: 다른 자수기의 임의 위치로
      const b = ids[Math.floor(R() * ids.length)]
      const [job] = qa.splice(i, 1)
      const qb = b === a ? qa : next[b]
      const pos = firstFree(qb) + Math.floor(R() * (qb.length - firstFree(qb) + 1))
      qb.splice(pos, 0, job)
      next[a] = mergeAdjacent(qa); if (b !== a) next[b] = mergeAdjacent(qb); else next[a] = mergeAdjacent(qb)
    } else if (kind < 0.7) {                              // 같은 자수기에서 인접 작업 교환
      if (i + 1 >= qa.length || qa[i + 1].locked) continue
      ;[qa[i], qa[i + 1]] = [qa[i + 1], qa[i]]
      next[a] = mergeAdjacent(qa)
    } else {                                              // 분할: 일부를 다른 자수기로
      const job = qa[i]
      if (job.count < 2 || ids.length < 2) continue
      const take = 1 + Math.floor(R() * (job.count - 1))
      let b = ids[Math.floor(R() * ids.length)]
      if (b === a) b = ids[(ids.indexOf(a) + 1) % ids.length]
      qa[i] = { ...job, count: job.count - take }
      const qb = next[b]
      const pos = firstFree(qb) + Math.floor(R() * (qb.length - firstFree(qb) + 1))
      qb.splice(pos, 0, { ...job, id: `${job.id}s${it}`, count: take })
      next[a] = mergeAdjacent(qa); next[b] = mergeAdjacent(qb)
    }
    const ev = evaluate(snap, next)
    evals++
    if (better(ev.score, curEval.score)) { cur = next; curEval = ev }
  }
  return { queues: cur, ...curEval, evals }
}
