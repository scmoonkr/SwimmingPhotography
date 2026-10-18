// 수모 1개의 자수 시간(초) — 디자인별 실측 > 표준 > 스티치 수 추정 > 기본값. (이니셜까지 포함한 한 번의 자수 시간)
//   실측은 '순수 자수 시간'(수모 탈착·실 교체 제외)으로 입력한다. 출처(source)를 함께 돌려줘 화면에 표시한다.
export function secPerCap(version, prod) {
  const p = version?.production || {}
  if (Number.isFinite(p.actualSecondsPerCap) && p.actualSecondsPerCap > 0) return { sec: p.actualSecondsPerCap, source: 'actual' }
  if (Number.isFinite(p.standardSecondsPerCap) && p.standardSecondsPerCap > 0) return { sec: p.standardSecondsPerCap, source: 'standard' }
  const st = Number(version?.stitches)
  if (st > 0) return { sec: fromStitches(st, prod.stitchTable), source: 'stitches' }
  return { sec: prod.defaultEmbSec, source: 'default' }
}

// 스티치 수 → 초: 표의 두 점 사이는 직선 보간, 표 밖은 양 끝 기울기로 연장 (하한 60초)
export function fromStitches(stitches, table) {
  const t = table.length ? table : [[6000, 600], [8000, 900], [12000, 1200]]
  if (t.length === 1) return Math.max(60, t[0][1] * (stitches / t[0][0]))
  let a = t[0], b = t[1]
  for (let i = 1; i < t.length; i++) { a = t[i - 1]; b = t[i]; if (stitches <= b[0]) break }
  const sec = a[1] + ((stitches - a[0]) * (b[1] - a[1])) / (b[0] - a[0])
  return Math.max(60, Math.round(sec))
}
