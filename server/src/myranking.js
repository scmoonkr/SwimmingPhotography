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

// ── 지속 페이지 (창을 띄워두고 재사용 — 세션·Turnstile 신뢰를 유지해 매번 재차단 안 당하게) ──
let pageP = null
async function getPage() {
  if (pageP) {
    try { const p = await pageP; if (p && !p.isClosed()) return p } catch {}
    pageP = null
  }
  pageP = (async () => {
    const browser = await getBrowser()
    const ctx = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } })
    return ctx.newPage()
  })()
  return pageP
}
function resetPage() { pageP = null }

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

// "2026/06/21" · "2026.06.21" → "2026-06-21"
export function normDate(s) {
  const m = String(s || '').match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/)
  if (!m) return String(s || '')
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

const GENDER_KO = { men: '남자', women: '여자', mixed: '혼성', 남자: '남자', 여자: '여자', 혼성: '혼성' }

// 검색 페이지까지 진입(진짜 Enter 제출) — 성공 시 result URL, 실패 시 null
async function reachResult(page, name) {
  // 검색창이 이미 있으면(창 유지·세션 재사용) HOME 재진입 없이 그 자리에서 재검색.
  let box = page.locator('#searchInput').first()
  let hasBox = await box.isVisible().catch(() => false)
  if (!hasBox) {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    await page.waitForTimeout(1800) // nonce/turnstile 준비 + 사람형 지연
    box = page.locator('#searchInput').first()
    hasBox = await box.isVisible().catch(() => false)
    if (!hasBox) return null
  }
  await box.click()
  await box.fill('') // 이전 검색어 제거
  for (const ch of name) await box.type(ch, { delay: 90 + (ch.charCodeAt(0) % 60) })
  await page.waitForTimeout(900)
  await box.press('Enter') // user gesture → Turnstile 고신뢰 토큰
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(1200)
  return /page=result/.test(page.url()) ? page.url() : null
}

// result 페이지에서 record_idx 들을 resolve-record 로 평문 조회.
// resolve-record 는 초당 요청이 많으면 429(레이트리밋)로 막히므로 '순차 + 간격'으로 호출하고,
// 진행상황을 onProgress 로 보고한다. (배치 동시호출은 429 를 유발해 오히려 유실이 커짐)
// 반환: { out: 기록[], diag: { items, seen, fail, failStatus, retries, ms } }
async function collectRecords(page, onProgress) {
  // 1) 항목 메타만 먼저 수집 (fetch 없이 DOM 파싱 — 빠름)
  const metas = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.result-item[data-idx]'))
    const seen = new Set()
    const out = []
    for (const el of items) {
      const idx = el.dataset.idx, src = el.dataset.sourceTable || ''
      const key = idx + '|' + src
      if (!idx || seen.has(key)) continue
      seen.add(key)
      const txt = (sel) => (el.querySelector(sel)?.textContent || '').trim()
      const compOn = el.querySelector('.comp-name')?.getAttribute('onclick') || ''
      const medalAlt = el.querySelector('.medal')?.getAttribute('alt') || ''
      let rankDom = null
      if (/금/.test(medalAlt)) rankDom = 1
      else if (/은/.test(medalAlt)) rankDom = 2
      else if (/동/.test(medalAlt)) rankDom = 3
      else { const rm = txt('.record-rank').match(/(\d+)\s*위/); if (rm) rankDom = +rm[1] }
      out.push({
        idx, src,
        dom: {
          category: txt('.category-tag'), eventText: txt('.event-tag'),
          compName: txt('.comp-name'), compDate: txt('.comp-date'),
          compId: (compOn.match(/comp_id:\s*'?(\d+)'?/) || [])[1] || '',
          rankDom, isPB: !!el.querySelector('.pb-badge'),
        },
      })
    }
    return out
  })

  // 2) 배치 동시 resolve. 실패는 상태만 반환(재시도는 아래에서 전송오류만).
  const out = []
  const diag = { items: metas.length, seen: 0, fail: 0, failStatus: {}, retries: 0, sleepMs: 0, ms: 0 }
  const t0 = Date.now()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const resolveOne = ({ idx, src }) => page.evaluate(async ({ idx, src }) => {
    const token = (window.__CSRF_TOKEN) || (document.querySelector('meta[name="csrf-token"]') || {}).content || ''
    try {
      const r = await fetch(
        '/2026/api/result/resolve-record.php?record_idx=' + encodeURIComponent(idx) + '&source_table=' + encodeURIComponent(src),
        { credentials: 'same-origin', headers: token ? { 'X-CSRF-Token': token } : {} },
      )
      const d = await r.json().catch(() => null)
      if (d && d.ok && d.record) return { ok: true, record: d.record }
      if (d && d.ok === false) return { ok: false, status: 'ok=false' } // 서버의 확정 거부
      return { ok: false, status: r.ok ? 'badjson' : String(r.status) }
    } catch (e) { return { ok: false, status: 'throw' } }
  }, { idx, src })

  // 순차 처리(초당 요청을 낮게 유지 → 429 버스트 차단 회피).
  //  - ok=false: 재시도 없이 스킵(확정 거부)
  //  - 429: 레이트리밋 → 길게 대기 후 재시도. 연속으로 계속 막히면 남은 건 스킵(무한 대기 방지)
  //  - throw/badjson: 짧게 재시도
  const RL_CAP = 8 // 연속 429 항목 수가 이만큼이면 이후 남은 건 rate-limit 로 스킵
  let consec429 = 0, rateLimited = false
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i]
    if (rateLimited) { diag.fail++; diag.failStatus['429skip'] = (diag.failStatus['429skip'] || 0) + 1; continue }
    let ok = false, status = 'na', was429 = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const res = await resolveOne(m)
      status = res.status
      if (res.ok) { out.push({ ...res.record, ...m.dom, _idx: m.idx, _src: m.src }); ok = true; break }
      if (status === 'ok=false') break
      if (status === '429') { was429 = true; diag.retries++; await sleep(Math.min(4000 + attempt * 4000, 12000)) } // 4s→8s→12s
      else { diag.retries++; await sleep(700) } // throw/badjson
    }
    if (ok) consec429 = 0
    else {
      diag.fail++; diag.failStatus[status] = (diag.failStatus[status] || 0) + 1
      if (was429) { if (++consec429 >= RL_CAP) rateLimited = true } else consec429 = 0
    }
    if ((i + 1) % 10 === 0 && onProgress) onProgress(i + 1, metas.length, out.length, diag.fail)
    await sleep(170) // 기본 간격(≈6/s)
  }
  if (onProgress) onProgress(metas.length, metas.length, out.length, diag.fail)
  diag.ms = Date.now() - t0
  return { out, diag }
}

// "더보기"(#loadMoreBtn) 를 남은 건수가 0 이 되거나 버튼이 사라질 때까지 눌러 전체 결과를 로드.
async function loadAllResults(page) {
  let stagnant = 0
  for (let i = 0; i < 80; i++) { // 안전 상한
    const btn = page.locator('#loadMoreBtn')
    if (!(await btn.isVisible().catch(() => false))) break
    const before = await page.locator('.result-item[data-idx]').count().catch(() => 0)
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(200)
    await btn.click().catch(() => {})
    // 새 항목 로드 대기 (개수 증가 또는 버튼 사라짐)
    await page.waitForFunction(
      (n) => !document.querySelector('#loadMoreBtn') ||
        document.querySelectorAll('.result-item[data-idx]').length > n,
      before, { timeout: 10000 },
    ).catch(() => {})
    const after = await page.locator('.result-item[data-idx]').count().catch(() => 0)
    if (process.env.MR_DEBUG) console.error(`[my] loadMore #${i}: ${before} -> ${after}`)
    if (after <= before) {
      // 증가가 없어도 버튼이 남아있으면 느린 로드일 수 있어 3회까지 재시도
      if (++stagnant >= 3) break
      await page.waitForTimeout(900)
    } else {
      stagnant = 0
    }
  }
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

    // 단계별 경과시간 로그 (페이지 로드 후 왜 오래 걸리는지 추적용)
    const t0 = Date.now()
    const ts = (label) => console.log(`[my] ${name} · ${label} · +${((Date.now() - t0) / 1000).toFixed(1)}s`)

    const page = await getPage() // 창을 띄워두고 재사용 (닫지 않음)
    ts('① getPage 완료(창 준비)')
    try {
      let resultUrl = null
      let attempts = 0
      for (let i = 1; i <= MAX_ATTEMPTS && !resultUrl; i++) {
        attempts = i
        resultUrl = await reachResult(page, name).catch(() => null)
        if (!resultUrl && i < MAX_ATTEMPTS) await page.waitForTimeout(1500 + i * 800)
      }
      ts(`② reachResult 완료(검색 진입, 시도 ${attempts}회)`)
      if (!resultUrl) {
        return { ok: false, error: 'myranking 검색 진입 실패(봇 차단). 잠시 후 다시 시도하세요.', query, attempts, total: 0, matched: 0, pb: null, records: [] }
      }

      await loadAllResults(page)   // "더보기" 를 끝까지 눌러 전체 결과 로드
      const domCount = await page.locator('.result-item[data-idx]').count().catch(() => 0)
      const loadMoreVisible = await page.locator('#loadMoreBtn').isVisible().catch(() => false)
      ts(`③ loadAllResults 완료(더보기, DOM ${domCount}개 · 버튼남음=${loadMoreVisible})`)

      const onProgress = (done, total, okN, failN) => {
        if (done < total) console.log(`[my] ${name} · ④ resolve 진행 ${done}/${total} (성공 ${okN}·실패 ${failN}) · +${((Date.now() - t0) / 1000).toFixed(1)}s`)
      }
      const { out: raw, diag } = await collectRecords(page, onProgress)
      ts(`④ collectRecords 완료(resolve ${raw.length}성공/${diag.fail}실패 ${JSON.stringify(diag.failStatus)}, 재시도 ${diag.retries}건, 순차 · ${(diag.ms / 1000).toFixed(1)}s)`)

      const distRe = dist ? new RegExp('(^|\\D)' + dist + 'm') : null
      let droppedGender = 0
      const matched = raw.filter((r) => {
        const ev = String(r.event || '')
        if (discipline && !ev.includes(discipline)) return false
        if (distRe && !distRe.test(ev.replace(/\s+/g, ''))) return false
        if (genderKo && String(r.sex || '') !== genderKo) { droppedGender++; return false }
        return true
      })
      ts(`⑤ 필터 완료(matched ${matched.length} · 성별제외 ${droppedGender})`)
      if (process.env.MR_DEBUG) {
        console.error(`[my] ${name}: DOM=${domCount} loadMoreVisible=${loadMoreVisible} items=${diag.items} seenSkip=${diag.seen} resolveFail=${diag.fail} failStatus=${JSON.stringify(diag.failStatus)} resolved=${raw.length} matched=${matched.length} droppedGender=${droppedGender}`)
      }

      const withSec = matched.map((r) => ({
        record: r.record,
        recordText: secondsToKorean(recordToSeconds(r.record)),
        seconds: recordToSeconds(r.record),
        event: r.event || r.eventText,
        sex: r.sex,
        ageGroup: r.age_group,
        category: r.category,
        competition: r.compName || r.comp_name,     // 대회명
        competitionID: r.compId || '',              // 대회 ID(comp_id)
        date: normDate(r.compDate || r.comp_date),  // 대회 일자 (yyyy-mm-dd)
        rank: (r.rankDom != null ? r.rankDom : r.ranking),  // 메달→1/2/3 또는 N위
        isPB: !!r.isPB,
        pb: r.isPB ? normDate(r.compDate || r.comp_date || '') : '', // PB면 달성 일자 (yyyy-mm-dd)
        name: r.display_name, // 개인정보 마스킹된 이름(예: 문OO)
      })).sort((a, b) => a.seconds - b.seconds)
      ts(`⑥ 매핑/정렬 완료 → 반환 (총 소요)`)

      return {
        ok: true,
        query,
        attempts,
        total: raw.length,
        matched: withSec.length,
        pb: withSec[0] || null,
        records: withSec,
      }
    } catch (e) {
      resetPage() // 페이지 상태가 깨지면 다음 조회에서 새 창으로 재생성 (창은 유지)
      return { ok: false, error: 'my 조회 실패: ' + (e?.message || String(e)), query, attempts: 0, total: 0, matched: 0, pb: null, records: [] }
    }
  })
}
