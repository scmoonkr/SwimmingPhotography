// 생산 계획 설정 — 설정 화면의 '생산 계획' 카드에서 바꾼다 (settings 컬렉션 _id:'app' 의 production).
//   실 1색 교체 시간은 앱 설정의 swapMinutes(분)를 쓴다 (자수기 화면·작업배정과 같은 값).
export const PRODUCTION_DEFAULTS = {
  workStart: '09:00', workEnd: '18:00',          // 근무 시간 (점심 포함)
  lunchStart: '12:00', lunchEnd: '13:00',         // 점심 — 작업자가 일하지 않는다 (자수기는 돌던 작업을 이어서 한다)
  workDays: [1, 2, 3, 4, 5],                      // 0=일 … 6=토 — 평일
  workers: 1,                                     // 작업자 수 (자수기 교체·수모 교체는 작업자 한 명이 한 번에 한 대)
  capChangeSec: 60,                               // 수모 한 개 탈착 + 장착
  shipBufferDays: 1,                              // 출고 전 검수·포장 여유(일) — 자수 완료 목표 = 출고일 − 여유
  stitchTable: [[6000, 600], [8000, 900], [12000, 1200]],   // [스티치 수, 수모 1개 자수 초] — 실측이 없을 때의 추정 (사이는 보간)
  defaultEmbSec: 900,                             // 실측·스티치 수가 모두 없을 때
  horizonDays: 7, lookAheadDays: 14,              // 화면에 보이는 기간 · 계획에 참고하는 출고일 범위
}

const hhmm = (v, d) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim()) ? String(v).trim().padStart(5, '0') : d)
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d }

export function normProduction(p = {}) {
  const D = PRODUCTION_DEFAULTS
  const table = (Array.isArray(p.stitchTable) ? p.stitchTable : D.stitchTable)
    .map((r) => [Number(r?.[0]), Number(r?.[1])]).filter((r) => r[0] > 0 && r[1] > 0).sort((a, b) => a[0] - b[0]).slice(0, 20)
  const days = [...new Set((Array.isArray(p.workDays) ? p.workDays : D.workDays).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
  return {
    workStart: hhmm(p.workStart, D.workStart), workEnd: hhmm(p.workEnd, D.workEnd),
    lunchStart: hhmm(p.lunchStart, D.lunchStart), lunchEnd: hhmm(p.lunchEnd, D.lunchEnd),
    workDays: days.length ? days : D.workDays,
    workers: Math.round(num(p.workers, D.workers, 1, 10)),
    capChangeSec: num(p.capChangeSec, D.capChangeSec, 1, 3600),
    shipBufferDays: Math.round(num(p.shipBufferDays, D.shipBufferDays, 0, 30)),
    stitchTable: table.length ? table : D.stitchTable,
    defaultEmbSec: num(p.defaultEmbSec, D.defaultEmbSec, 10, 36000),
    horizonDays: Math.round(num(p.horizonDays, D.horizonDays, 1, 14)),
    lookAheadDays: Math.round(num(p.lookAheadDays, D.lookAheadDays, 1, 60)),
  }
}
