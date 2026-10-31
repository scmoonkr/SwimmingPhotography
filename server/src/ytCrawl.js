// 유튜브 채널의 영상 목록 크롤링 + 제목 파싱 (API 키 없이 채널 /videos 페이지를 읽는다).
//   채널 페이지의 ytInitialData 에서 첫 30개를 읽고, 이어지는 목록은 youtubei/v1/browse 의 continuation 으로 끝까지 읽는다.
//   제목 형식: "{성별} {영법} {거리} {코스} {기록} {이름} {일자} {연령부} [{라운드}]"
//     예) 남자 배영 50 LCM 29초 07 권준영 2026-09-13 성인부 결선
//   형식이 다른 제목(예: '메달뱅크 테레비 | …')은 이름·기록 없이 제목·주소만 가져온다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const HEAD = { 'accept-language': 'ko-KR,ko;q=0.9', 'user-agent': UA, cookie: 'CONSENT=YES+1; SOCS=CAI' }

const find = (o, f, out = []) => {
  if (o && typeof o === 'object') { if (f(o)) out.push(o); for (const k in o) find(o[k], f, out) }
  return out
}

// 응답 한 덩어리에서 영상(id·제목)과 다음 continuation 토큰을 뽑는다. 새 화면(lockupViewModel) · 예전 화면(videoRenderer) 모두 읽는다.
function collect(data) {
  const videos = []
  for (const l of find(data, (o) => o.lockupViewModel && o.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO')) {
    const v = l.lockupViewModel
    const title = v.metadata?.lockupMetadataViewModel?.title?.content
    if (v.contentId && title) videos.push({ id: v.contentId, title })
  }
  for (const v of find(data, (o) => o.videoRenderer && o.videoRenderer.videoId)) {
    const r = v.videoRenderer
    const title = (r.title?.runs || []).map((x) => x.text).join('') || r.title?.simpleText
    if (title) videos.push({ id: r.videoId, title })
  }
  const tokens = find(data, (o) => o.continuationItemRenderer).map((o) => o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token).filter(Boolean)
  return { videos, token: tokens[0] || '' }      // 목록 맨 끝의 '더 보기' 토큰이 가장 앞에 온다(뒤쪽 것은 필터 칩)
}

// 채널(@핸들)의 전체 영상 — 최신순. maxPages 는 안전장치(한 번에 30개씩).
export async function fetchChannelVideos(handle = '@medalbankaquatics', maxPages = 60) {
  // 가끔 데이터 없는 화면이 오므로 몇 번 다시 읽는다
  let html = ''; let m = null
  for (let t = 0; t < 4 && !m; t++) {
    const res = await fetch(`https://www.youtube.com/${handle}/videos?hl=ko`, { headers: HEAD })
    if (!res.ok) throw new Error(`유튜브 채널을 읽지 못했습니다 (${res.status}).`)
    html = await res.text()
    m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)
    if (!m) await new Promise((r) => setTimeout(r, 800))
  }
  if (!m) throw new Error('유튜브 채널 화면 형식을 알 수 없습니다 (ytInitialData 없음).')
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1]
  const ver = (html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || [])[1] || '2.20240101.00.00'
  let page = collect(JSON.parse(m[1]))
  const out = new Map()
  const add = (list) => { for (const v of list) if (!out.has(v.id)) out.set(v.id, v) }
  add(page.videos)
  for (let i = 0; i < maxPages && page.token && key; i++) {
    const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}`, {
      method: 'POST', headers: { ...HEAD, 'content-type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'ko', gl: 'KR' } }, continuation: page.token }),
    })
    if (!r.ok) throw new Error(`유튜브 목록을 이어 읽지 못했습니다 (${r.status}).`)
    page = collect(await r.json())
    add(page.videos)
  }
  return [...out.values()].map((v) => ({ ...v, url: `https://www.youtube.com/watch?v=${v.id}` }))
}

const DISC = { 자유형: 'FR', 배영: 'BA', 평영: 'BR', 접영: 'FL', 개인혼영: 'IM', 계영: 'FRR', 혼계영: 'MR' }
const GENDER = { 남자: 'men', 여자: 'women', 혼성: 'mixed' }
const ROUND = { 예선: 'preliminaries', 준결승: 'semifinals', 결선: 'finals' }
const TITLE_RE = /^(남자|여자|혼성)\s+(자유형|배영|평영|접영|개인혼영|계영|혼계영)\s+(\d+)\s+(?:LCM|SCM)\s+(?:(\d+)분\s*)?(\d+)초\s*(\d+)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\S+부)(?:\s+(예선|준결승|결선))?\s*$/

// 제목 → { gender, discipline, distance, time, name, datetime, ageGroup, round } (형식이 다르면 null)
export function parseTitle(title) {
  const m = String(title || '').normalize('NFC').trim().match(TITLE_RE)
  if (!m) return null
  const [, g, d, dist, min, sec, cs, name, date, age, round] = m
  return {
    gender: GENDER[g], discipline: DISC[d], distance: `${dist}M`,
    time: min != null ? `${Number(min)}:${sec.padStart(2, '0')}.${cs}` : `${Number(sec)}.${cs}`,
    name: name.trim(), datetime: date, ageGroup: age, round: round ? ROUND[round] : '',
  }
}
