// 근무 달력 — 한국 시간(KST, +9) 기준으로 계산한다 (서버 시간대와 무관).
// 작업자는 근무 구간(점심 제외)에만 일하고, 자수기는 한 번 시작한 자수를 시간과 상관없이 이어서 한다.
const KST = 9 * 3600e3
const MIN = 60e3

export const dayStart = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d) - KST }
export const ymdOf = (ms) => new Date(ms + KST).toISOString().slice(0, 10)
export const dowOf = (ms) => new Date(ms + KST).getUTCDay()
const minOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const addDaysYmd = (ymd, n) => ymdOf(dayStart(ymd) + n * 86400e3 + 12 * 3600e3)

export class WorkCal {
  // cfg: normProduction() 결과, fromMs: 계산 시작 시각, days: 달력을 만들 일수
  constructor(cfg, fromMs, days = 60) {
    this.cfg = cfg
    this.iv = []                                  // 근무 구간 [{ s, e, date }]
    const ws = minOf(cfg.workStart), we = minOf(cfg.workEnd), ls = minOf(cfg.lunchStart), le = minOf(cfg.lunchEnd)
    const start = dayStart(ymdOf(fromMs))
    for (let i = 0; i < days; i++) {
      const d0 = start + i * 86400e3
      if (!cfg.workDays.includes(dowOf(d0 + 12 * 3600e3))) continue
      const date = ymdOf(d0 + 12 * 3600e3)
      const seg = (a, b) => { if (b > a) this.iv.push({ s: d0 + a * MIN, e: d0 + b * MIN, date }) }
      if (le > ls && ls > ws && le < we) { seg(ws, ls); seg(le, we) } else seg(ws, we)
    }
  }
  // t 이후 작업자가 일할 수 있는 가장 이른 시각
  nextStart(t) {
    for (const v of this.iv) { if (t < v.e) return Math.max(t, v.s) }
    return Infinity
  }
  // s 에서 시작해 근무 시간만 dur(ms) 소비한 끝 시각 (점심·퇴근·휴무는 건너뛴다)
  advance(s, dur) {
    let t = this.nextStart(s), left = dur
    while (left > 0 && t < Infinity) {
      const v = this.iv.find((x) => t >= x.s && t < x.e)
      if (!v) return Infinity
      const take = Math.min(left, v.e - t)
      left -= take
      t += take
      if (left > 0) t = this.nextStart(t)
    }
    return t
  }
  // 화면용: 날짜별 근무 구간 요약 (점심 제외 전체 범위)
  axis(fromYmd, days) {
    const ws = minOf(this.cfg.workStart), we = minOf(this.cfg.workEnd)
    const out = []
    for (let i = 0; i < days; i++) {
      const date = addDaysYmd(fromYmd, i)
      const d0 = dayStart(date)
      out.push({ date, work: this.cfg.workDays.includes(dowOf(d0 + 12 * 3600e3)), s: d0 + ws * MIN, e: d0 + we * MIN, lunchS: d0 + minOf(this.cfg.lunchStart) * MIN, lunchE: d0 + minOf(this.cfg.lunchEnd) * MIN })
    }
    return out
  }
}
