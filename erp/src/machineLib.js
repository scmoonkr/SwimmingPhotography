// 자수기(머신) 공용 로직 — 침 7개에 걸린 실과 작업이 필요로 하는 실을 비교한다.
//   실은 어느 침에 있든 프로그램에서 맞출 수 있으므로 '침 번호'가 아니라 '그 실이 걸려 있는가'만 본다.
//   교체 개수 = 작업에 필요한 실 중 자수기에 없는 것의 수. (필요한 실이 7개를 넘으면 넘은 만큼은 작업 중 추가 교체)
import { pickSetName } from './designLib.js'

export const NEEDLES = 7
export const thread = (v) => String(v ?? '').trim().slice(0, 20)

export const normNeedles = (list) => {
  const a = (Array.isArray(list) ? list : []).slice(0, NEEDLES).map(thread)
  while (a.length < NEEDLES) a.push('')
  return a
}

// 작업이 필요로 하는 실 번호 목록 (중복 없이, 등장 순서대로)
//   pieces : 주문의 제작 명세(장별 색상·디자인·컬러 세트·이니셜색상), details : 주문에 연결된 디자인 상세(designDetails)
//   task   : '' (로고+이니셜 한 번에) | '로고' | '이니셜'
export function threadNeeds(pieces, details, task = '') {
  const out = []
  const add = (v) => { const t = thread(v); if (t && !out.includes(t)) out.push(t) }
  const ps = pieces || []
  const ds = details || []
  if (task !== '이니셜') {
    let mapped = false
    for (const p of ps) {
      const d = p.design && ds.find((x) => x.code === p.design)
      if (!d) continue
      mapped = true
      const nm = pickSetName(d, p)
      const colors = (d.variants || []).find((x) => x.name === nm)?.colors || d.colors || []
      colors.forEach((c) => add(c.no || c.code))
    }
    if (!mapped) ds.forEach((d) => (d.colors || []).forEach((c) => add(c.no || c.code)))     // 장별 매핑 전: 연결된 디자인의 기본 컬러
  }
  if (task !== '로고') ps.forEach((p) => add(p.initialColor))
  return out
}

export const swapCount = (needles, needs) => (needs || []).filter((t) => !(needles || []).includes(t)).length

// 필요한 실을 자수기에 건다 — 이미 걸린 실은 그대로 두고, 없는 실만 필요 없는 침(빈 침 먼저)에 끼운다.
export function loadThreads(needles, needs) {
  const cur = normNeedles(needles)
  const need = (needs || []).slice()
  const missing = need.filter((t) => !cur.includes(t))
  const free = cur.map((t, i) => i).filter((i) => !cur[i]).concat(cur.map((t, i) => i).filter((i) => cur[i] && !need.includes(cur[i])))
  const next = cur.slice()
  let swaps = 0
  for (const t of missing) {
    const i = free.shift()
    if (i == null) break
    next[i] = t
    swaps++
  }
  return { needles: next, swaps, over: Math.max(0, missing.length - swaps) }
}
