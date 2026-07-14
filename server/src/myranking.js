// myranking.co.kr PB(개인 최고기록) 조회 — 헤드리스 브라우저로 검색 페이지를 통과해 기록을 가져온다.
//
// 배경: myranking 은 봇 차단이 강하다. 선수명·기록이 HTML 이 아니라 이미지(name-image.php/record-image.php)로
// 렌더되고, 검색 제출은 CSRF + search_form_nonce + 허니팟 + Cloudflare Turnstile + 서버 리스크 스코어링으로 게이트된다.
// 실증 결과: (1) 순수 HTTP/curl 은 303→home 으로 거부. (2) headless 크로미움도 리스크 스코어링에서 봇 판정.
// (3) headful(실제 창) 크로미움에서 "진짜 Enter 키 입력(user gesture)"으로 제출하면 Turnstile 고신뢰 토큰이 발급돼 통과.
// 통과 후에는 result-item 의 data-idx 로 /2026/api/result/resolve-record.php 를 세션 내에서 호출하면
// {display_name, event, record, sex, age_group, comp_name, ranking} 를 평문 JSON 으로 받을 수 있다.
//
// 그래서 이 모듈은 headful 크로미움을 기본으로 쓰며(브라우저 창이 뜬다), 요청을 직렬화하고, 최대 3회 재시도한다.
// MR_HEADLESS=1 로 headless 강제 가능하나 대부분 차단되므로 디버그용이다.
import { chromium } from 'playwright'

const HOME = 'https://myranking.co.kr/index.php'
const HEADLESS = process.env.MR_HEADLESS === '1'
const NAV_TIMEOUT = 30000
const MAX_ATTEMPTS = 3

// ── 브라우저 싱글턴 (지연 실행, 끊기면 재생성) ──
let browserP = null
async function getBrowser() {
  if (browserP) {
    try { const b = await browserP; if (b.isConnected()) return b } catch {}
    browserP = null
  }
  browserP = chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled', '--lang=ko-KR'],
  })
  return browserP
}

// 프로세스 종료 시 브라우저 정리
for (const sig of ['SIGINT', 'SIGTERM', 'exit']) {
  process.on(sig, () => { try { browserP?.then((b) => b.close()).catch(() => {}) } catch {} })
}

// ── 요청 직렬화 (동시 검색은 탐지/레이스 유발) ──
let chain = Promise.resolve()
function serialize(fn) {
  const run = chain.then(fn, fn)
  chain = run.catch(() => {})
  return run
}

// ── 기록 문자열(MMss.cc) → 초 ──
// 예) "32.68" = 32.68초, "112.65" = 1분 12.65초, "207.94" = 2분 07.94초, "1:12.65" 도 허용
export function recordToSeconds(t) {
  const s = String(t == null ? '' : t).trim()
  let m = s.match(/^(\d+):(\d+)\.(\d+)$/)
  if (m) return (+m[1]) * 60 + (+m[2]) + +('0.' + m[3])
  m = s.match(/^(\d+)\.(\d+)$/)
  if (!m) return Infinity
  const intp = m[1], cc = m[2]
  const ss = intp.length > 2 ? intp.slice(-2) : intp
  const mm = intp.length > 2 ? intp.slice(0, -2) : '0'
  return (+mm) * 60 + (+ss) + +('0.' + cc)
}

// 초 → 한글 표기 "32초 68" / "1분 12초 65"
export function secondsToKorean(sec) {
  if (!isFinite(sec)) return ''
  const mm = Math.floor(sec / 60)
  const rest = sec - mm * 60
  const ss = Math.floor(rest)
  const cc = Math.round((rest - ss) * 100)
  const cc2 = String(cc).padStart(2, '0')
  return mm > 0 ? `${mm}분 ${ss}초 ${cc2}` : `${ss}초 ${cc2}`
}

const GENDER_KO = { men: '남자', women: '여자', mixed: '혼성', 남자: '남자', 여자: '여자', 혼성: '혼성' }

// 검색 페이지까지 진입(진짜 Enter 제출) — 성공 시 result URL, 실패 시 null
async function reachResult(page, name) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
  await page.waitForTimeout(1800) // nonce/turnstile 준비 + 사람형 지연
  const box = page.locator('#searchInput')
  await box.click()
  for (const ch of name) await box.type(ch, { delay: 90 + (ch.charCodeAt(0) % 60) })
  await page.waitForTimeout(900)
  await box.press('Enter') // user gesture → Turnstile 고신뢰 토큰
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(1200)
  return /page=result/.test(page.url()) ? page.url() : null
}

// result 페이지에서 record_idx 들을 resolve-record 로 평문 조회
async function collectRecords(page) {
  return page.evaluate(async () => {
    const token = (window.__CSRF_TOKEN) || (document.querySelector('meta[name="csrf-token"]') || {}).content || ''
    const items = Array.from(document.querySelectorAll('.result-item[data-idx]'))
    const seen = new Set()
    const out = []
    for (const el of items) {
      const idx = el.dataset.idx, src = el.dataset.sourceTable || ''
      const key = idx + '|' + src
      if (!idx || seen.has(key)) continue
      seen.add(key)
      try {
        const r = await fetch(
          '/2026/api/result/resolve-record.php?record_idx=' + encodeURIComponent(idx) + '&source_table=' + encodeURIComponent(src),
          { credentials: 'same-origin', headers: token ? { 'X-CSRF-Token': token } : {} },
        )
        const d = await r.json()
        if (d && d.ok && d.record) out.push({ ...d.record, _idx: idx, _src: src })
      } catch {}
    }
    return out
  })
}

/**
 * 선수의 특정 종목 PB 조회.
 * @param {object} q
 * @param {string} q.name       선수명 (예: 문성중)
 * @param {string} q.discipline 영법 한글 (예: 평영). 생략 시 전체
 * @param {string|number} q.distance 거리 (예: "50M" | "50"). 생략 시 전체
 * @param {string} [q.gender]   men|women|mixed 또는 남자|여자|혼성. 있으면 sex 로 필터
 * @returns {Promise<{ok:boolean, error?:string, query:object, attempts:number, total:number, matched:number, pb:object|null, records:object[]}>}
 */
export function lookupPB(q) {
  return serialize(async () => {
    const name = String(q?.name || '').trim()
    if (!name) return { ok: false, error: '선수명이 필요합니다.', query: q || {} }
    const discipline = String(q?.discipline || '').trim()
    const distRaw = String(q?.distance || '').trim()
    const dist = distRaw.replace(/[^0-9]/g, '') // "50M" → "50"
    const genderKo = GENDER_KO[String(q?.gender || '').trim()] || ''
    const query = { name, discipline, distance: dist, gender: genderKo || undefined }

    const browser = await getBrowser()
    const ctx = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    try {
      let resultUrl = null
      let attempts = 0
      for (let i = 1; i <= MAX_ATTEMPTS && !resultUrl; i++) {
        attempts = i
        resultUrl = await reachResult(page, name).catch(() => null)
        if (!resultUrl && i < MAX_ATTEMPTS) await page.waitForTimeout(1500 + i * 800)
      }
      if (!resultUrl) {
        return { ok: false, error: 'myranking 검색 진입 실패(봇 차단). 잠시 후 다시 시도하세요.', query, attempts, total: 0, matched: 0, pb: null, records: [] }
      }

      const raw = await collectRecords(page)
      const distRe = dist ? new RegExp('(^|\\D)' + dist + 'm') : null
      const matched = raw.filter((r) => {
        const ev = String(r.event || '')
        if (discipline && !ev.includes(discipline)) return false
        if (distRe && !distRe.test(ev.replace(/\s+/g, ''))) return false
        if (genderKo && String(r.sex || '') !== genderKo) return false
        return true
      })

      const withSec = matched.map((r) => ({
        record: r.record,
        recordText: secondsToKorean(recordToSeconds(r.record)),
        seconds: recordToSeconds(r.record),
        event: r.event,
        sex: r.sex,
        ageGroup: r.age_group,
        competition: r.comp_name,
        date: r.comp_date,
        rank: r.ranking,
        name: r.display_name, // 개인정보 마스킹된 이름(예: 문OO)
      })).sort((a, b) => a.seconds - b.seconds)

      return {
        ok: true,
        query,
        attempts,
        total: raw.length,
        matched: withSec.length,
        pb: withSec[0] || null,
        records: withSec,
      }
    } finally {
      await ctx.close().catch(() => {})
    }
  })
}
