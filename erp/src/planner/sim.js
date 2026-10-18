// 생산 시뮬레이터 — DB 를 모르는 순수 함수. 같은 입력이면 같은 결과.
//   자수기마다 작업 큐를 순서대로 돌린다. 한 작업은 [실 교체] → 수모마다 [수모 탈착·장착(작업자)] → [자수(자동)] 이다.
//   작업자는 근무 시간에만 일하고 한 번에 한 대만 다룬다. 자수가 끝난 자수기는 작업자가 올 때까지 선다.
import { loadThreads, normNeedles, swapCount } from '../machineLib.js'
import { WorkCal, ymdOf, dayStart, addDaysYmd } from './calendar.js'

const BIG = 9e15

/**
 * @param {object} p
 *  machines : [{ id, needles:[7], freeAt? }]   — freeAt: 이미 진행 중인 작업이 끝나는 시각
 *  queues   : { [machineId]: [job] }           — job: { id, orderId, count, secPerCap, threads:[], locked? }
 *  due      : Map(orderId → ms)                — 자수 완료 목표
 *  cfg      : normProduction() 결과,  threadSec : 실 1색 교체 초,  startMs : 계산 시작 시각
 */
export function simulate({ machines, queues, due = new Map(), prio = new Map(), cfg, threadSec, startMs, cap = null }) {
  const cal = new WorkCal(cfg, startMs, 150)
  // 하루 작업 수량 한도 — 자수기 1대가 하루에 시작할 수 있는 수모 수(작업 일정 · 하루 처리 한도). 가동 대수가 줄어든 날(날짜별 지정)은 앞의 n대만 쓴다.
  const counts = new Map()
  const limitOn = (mi, date) => {
    if (!cap) return Infinity
    const n = cap.overrides?.[date] ?? cap.machines
    return mi >= n ? 0 : cap.perMachine
  }
  // s 이후 이 자수기가 이 단계를 시작할 수 있는 가장 이른 근무 시각 (한도를 채운 날·쉬는 자수기는 다음 날로 미룬다)
  const place = (mm, mi, s, isCap) => {
    for (let g = 0; g < 400 && s !== Infinity; g++) {
      const date = ymdOf(s), lim = limitOn(mi, date)
      if (lim > 0 && (!isCap || (counts.get(`${mm.id}|${date}`) || 0) < lim)) return s
      s = cal.nextStart(dayStart(addDaysYmd(date, 1)))
    }
    return Infinity
  }
  const capMs = cfg.capChangeSec * 1000, thMs = threadSec * 1000
  const workerFree = Array(cfg.workers).fill(startMs)
  const workerSegs = Array.from({ length: cfg.workers }, () => [])

  const M = machines.map((m) => {
    const q = (queues[m.id] || []).filter(Boolean)
    let state = normNeedles(m.needles)
    const steps = []
    q.forEach((job, ji) => {
      const swaps = swapCount(state, job.threads)
      state = loadThreads(state, job.threads).needles
      if (swaps > 0) steps.push({ w: true, type: 'thread', dur: swaps * thMs, ji, swaps })
      for (let k = 0; k < job.count; k++) {
        steps.push({ w: true, type: 'cap', dur: capMs, ji })
        steps.push({ w: false, type: 'emb', dur: Math.round(job.secPerCap * 1000), ji })
      }
    })
    return {
      id: m.id, q, steps, si: 0, ready: Math.max(startMs, m.freeAt || startMs), segs: [], embMs: 0, waitWork: 0, swaps: 0,
      jobs: q.map((j) => ({ jobId: j.id, orderId: j.orderId, startMs: null, endMs: null, caps: 0, swaps: 0, capDays: {}, embMs: 0, waitMs: 0 })),
    }
  })

  const orderEnd = new Map()
  const push = (mm, t, s, e) => {                         // 구간 추가 — 맞닿은 같은 종류는 합친다
    const last = mm.segs[mm.segs.length - 1]
    if (last && last.t === t && Math.abs(last.e - s) < 1) last.e = e
    else mm.segs.push({ t, s, e })
  }
  const addWorker = (w, s, e) => {
    const L = workerSegs[w], last = L[L.length - 1]
    if (last && s - last.e < 30e3) last.e = e
    else L.push({ s, e })
  }
  let overflow = false

  for (;;) {
    // 1) 자동으로 도는 단계(자수)는 바로 처리
    for (const mm of M) {
      while (mm.si < mm.steps.length && !mm.steps[mm.si].w) {
        const st = mm.steps[mm.si++]
        const s = mm.ready, e = s + st.dur
        push(mm, 'run', s, e)
        mm.ready = e
        mm.embMs += st.dur
        const j = mm.jobs[st.ji]
        j.embMs += st.dur; j.endMs = e; j.caps++
        const day = ymdOf(s)
        j.capDays[day] = (j.capDays[day] || 0) + 1
        orderEnd.set(j.orderId, Math.max(orderEnd.get(j.orderId) || 0, e))
      }
    }
    // 2) 작업자가 필요한 단계 중 가장 빨리 시작할 수 있는 것
    let best = null
    for (let i = 0; i < M.length; i++) {
      const mm = M[i]
      if (mm.si >= mm.steps.length) continue
      let wi = 0
      for (let k = 1; k < workerFree.length; k++) if (workerFree[k] < workerFree[wi]) wi = k
      const s0 = cal.nextStart(Math.max(mm.ready, workerFree[wi]))
      const s = place(mm, i, s0, mm.steps[mm.si].type === 'cap')
      const oidNow = mm.q[mm.steps[mm.si].ji].orderId
      const pv = prio.get(oidNow) || 0
      const d = pv > 0 ? -pv * 1e15 : (due.get(oidNow) ?? BIG)          // 같은 시각이면 우선 주문의 자수기를 먼저 챙긴다
      if (!best || s < best.s || (s === best.s && d < best.d)) best = { i, wi, s, s0, d }
    }
    if (!best) break
    const mm = M[best.i], st = mm.steps[mm.si++]
    if (best.s === Infinity) { overflow = true; mm.si = mm.steps.length; continue }
    const e = cal.advance(best.s, st.dur)
    if (e === Infinity) { overflow = true; mm.si = mm.steps.length; continue }
    if (st.type === 'cap') { const key = `${mm.id}|${ymdOf(best.s)}`; counts.set(key, (counts.get(key) || 0) + 1) }
    const wait = best.s - mm.ready
    if (wait > 120e3) push(mm, 'wait', mm.ready, best.s)             // 2분 넘게 작업자를 기다린 시간만 따로 표시
    else if (wait > 0) push(mm, 'run', mm.ready, best.s)
    mm.waitWork += Math.max(0, (best.s0 - mm.ready) - nonWork(cal, mm.ready, best.s0))      // 작업자를 기다린 시간만 (하루 한도로 미뤄진 시간은 제외)
    push(mm, st.type === 'thread' ? 'thread' : 'run', best.s, e)
    addWorker(best.wi, best.s, e)
    workerFree[best.wi] = e
    mm.ready = e
    const j = mm.jobs[st.ji]
    if (j.startMs == null) j.startMs = best.s
    j.waitMs += wait
    if (st.type === 'thread') { j.swaps += st.swaps; mm.swaps += st.swaps }
  }

  // 지표
  const jobs = new Map()
  let maxEnd = startMs, swaps = 0, workerBusy = 0, waitWork = 0
  for (const mm of M) {
    mm.jobs.forEach((j) => jobs.set(j.jobId, j))
    swaps += mm.swaps; waitWork += mm.waitWork
    if (mm.ready > maxEnd) maxEnd = mm.ready
  }
  workerSegs.forEach((L) => L.forEach((x) => { workerBusy += x.e - x.s }))
  let lateOrders = 0, lateMs = 0
  const orders = {}
  for (const [oid, end] of orderEnd) {
    const dd = due.get(oid)
    const late = dd != null && dd < BIG && end > dd ? end - dd : 0
    if (late) { lateOrders++; lateMs += late }
    orders[oid] = { endMs: end, dueMs: dd ?? null, lateMs: late }
  }
  // 우선 주문: 우선 주문에 속한 모든 장의 평균 완료 시각 (우선순위 값 가중) — 어느 자수기에서든 우선 주문이 앞에 있을수록 좋다.
  //   주문 전체의 완료 시각만 보면 느린 자수기 몫에 가려져, 여유 있는 자수기에서 다른 주문이 먼저 하게 되기 때문이다.
  const lv = {}                                             // 우선순위 값(1~9)별 { 장수, 완료 시각 합 }
  for (const j of jobs.values()) {
    const pv = prio.get(j.orderId) || 0
    if (pv > 0 && j.caps > 0 && j.endMs != null) { const x = (lv[pv] ||= { n: 0, s: 0, max: 0 }); x.n += j.caps; x.s += j.caps * (j.endMs - startMs); x.max = Math.max(x.max, j.endMs - startMs) }
  }
  const prioByLevel = Object.fromEntries(Object.entries(lv).map(([k, x]) => [k, { mean: x.s / x.n, max: x.max }]))
  const span = Math.max(1, workBetween(cal, startMs, maxEnd))
  const emb = M.map((x) => x.embMs)
  const mean = emb.length ? emb.reduce((a, b) => a + b, 0) / emb.length : 0
  const loadStd = Math.sqrt(emb.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, emb.length))
  return {
    machines: Object.fromEntries(M.map((mm) => [mm.id, { segs: mm.segs, embMs: mm.embMs, swaps: mm.swaps, endMs: mm.ready, util: mm.embMs / span }])),
    jobs, orders, workerSegs, overflow,
    metrics: {
      lateOrders, lateMs, prioByLevel, makespanMs: maxEnd - startMs, endMs: maxEnd, threadSwaps: swaps, threadMs: swaps * thMs,
      workerBusyMs: workerBusy, workerCount: cfg.workers, waitWorkMs: waitWork, loadStdMs: loadStd, embMs: emb.reduce((a, b) => a + b, 0),
    },
  }
}

// 두 시각 사이에 근무 시간이 아닌 시간 / 근무 시간
function workBetween(cal, a, b) {
  let t = 0
  for (const v of cal.iv) { const s = Math.max(a, v.s), e = Math.min(b, v.e); if (e > s) t += e - s }
  return t
}
const nonWork = (cal, a, b) => Math.max(0, (b - a) - workBetween(cal, a, b))

// 점수(작을수록 좋음) — 사전식: 미배정 수량 → 우선순위 9, 8, … 1 순서로 각 우선순위 주문의 마지막 완료 시각과 평균 완료 시각(30분 단위; 숫자가 큰 것부터 앞서 끝나야 함) → 납기 지연 건수 → 지연 시간(12시간 단위) → 실 교체 → 전체 완료 시각(하루 단위) → 작업자 대기 → 부하 편차
//   납기를 지킨 뒤에는 '빨리 끝내기'보다 '실을 덜 바꾸기'가 먼저다 — 같은 디자인·실은 같은 자수기에 모이고, 일부러 여러 자수기로 흩어 완료 시각을 몇 시간 앞당기지 않는다.
export const scoreOf = (metrics, unassignedCaps = 0) => [
  unassignedCaps, ...[9, 8, 7, 6, 5, 4, 3, 2, 1].flatMap((k) => { const x = metrics.prioByLevel?.[k]; return [Math.round((x?.max || 0) / 1800e3), Math.round((x?.mean || 0) / 1800e3)] }), metrics.lateOrders, Math.round(metrics.lateMs / 720 / 60e3), metrics.threadSwaps,
  Math.round(metrics.makespanMs / 86400e3), Math.round(metrics.waitWorkMs / 900e3), Math.round(metrics.loadStdMs / 60e3),
]
export const better = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i] } return false }
