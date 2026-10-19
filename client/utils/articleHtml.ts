// articles 문서(JSON) → 기사 상세 HTML 문자열.
// (분야 라벨 정규화는 목록과 같은 catKo 를 쓴다)
// docs/html/article-20260531-kimheekyung.html 구조를 그대로 재현하되, DB 문서에서 값을 채운다.
// 반환값은 <div class="layout"> … </div> (기사 본문 + 사이드바) — article/[slug].vue 가 v-html 로 렌더.
import { catKo } from './articleList'

const esc = (s: any) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escA = (s: any) => esc(s).replace(/"/g, '&quot;')
const pad2 = (n: number) => ('0' + n).slice(-2)
const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토']

// ISO(오프셋 포함) 문자열을 표기된 벽시계 그대로 파싱 (TZ 변환 없음)
const parseDT = (iso: string) => {
  const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) }
}
const koInput = (iso: string) => {
  const t = parseDT(iso); if (!t) return ''
  return `입력 ${t.y}년 ${t.mo}월 ${t.d}일 ${pad2(t.h)}시 ${pad2(t.mi)}분`
}
const koUpdated = (iso: string) => {
  const t = parseDT(iso); if (!t) return ''
  return `수정 ${t.y}년 ${t.mo}월 ${t.d}일 ${pad2(t.h)}시 ${pad2(t.mi)}분`
}
const koStamp = (iso: string) => {
  const t = parseDT(iso); if (!t) return ''
  return `${t.y}년 ${t.mo}월 ${t.d}일 ${pad2(t.h)}시 ${pad2(t.mi)}분 ${pad2(t.s)}초`
}
const koDayLabel = (dateStr: string) => {
  const t = parseDT(dateStr) || parseDT(dateStr + 'T00:00'); if (!t) return ''
  const dow = new Date(t.y, t.mo - 1, t.d).getDay()
  return `${t.y}년 ${t.mo}월 ${t.d}일 ${KO_DAYS[dow]}요일`
}
const koDate = (iso: string) => {
  const t = parseDT(iso) || parseDT(iso + 'T00:00'); if (!t) return ''
  return `${t.y}년 ${t.mo}월 ${t.d}일`
}

// 사이드바 기록 표기: 끝 두 자리(센티초)의 앞 0 제거 — "32초 01" → "32초 1"
const recKo = (r: string) => String(r || '').replace(/0(\d)\s*$/, '$1')

// 이미지 스토리지 공개 베이스 (buildArticleLayout 호출 시 opts.cloudPublicUrl 로 주입)
let CLOUD_BASE = ''
// 이미지 URL 정규화 — http 면 그대로, '/' 나 로컬 'images/' 는 로컬 절대경로,
// 그 외(R2 상대경로 등)는 CLOUD_PUBLIC_URL 을 앞에 붙인다.
const imgUrl = (u: string) => {
  const s = String(u || '')
  if (!s) return ''
  if (/^https?:\/\//.test(s) || s.startsWith('/')) return s
  if (/^images\//i.test(s)) return '/' + s                              // 로컬 public 이미지
  if (CLOUD_BASE) return CLOUD_BASE.replace(/\/+$/, '') + '/' + s        // R2 상대경로
  return '/' + s
}

// YouTube URL → 11자 video ID (watch?v= · youtu.be/ · embed/ · shorts/ · live/).
// 못 찾으면 '' — v-html 로 iframe 을 넣으므로 원본 URL 대신 검증된 ID만 사용한다.
const ytId = (url: any) => {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  )
  return m ? m[1] : ''
}

// 유튜브 영상 — 클릭 후 로드(facade). 검증된 ID만 임베드, 아니면 링크 폴백. 둘 다 아니면 ''.
const videoHtml = (url: any, caption: any) => {
  const id = ytId(url)
  if (id) {
    const cap = caption
      ? `<figcaption class="art-caption">${esc(caption)}</figcaption>`
      : ''
    return `<figure class="art-video">
          <div class="yt-frame">
            <button type="button" class="yt-facade" data-yt="${id}" aria-label="영상 재생">
              <img class="yt-poster" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">
              <span class="yt-play" aria-hidden="true"></span>
            </button>
          </div>${cap}
        </figure>`
  }
  if (/^https?:\/\//.test(String(url || ''))) {
    return `<p class="art-video-fallback"><a href="${escA(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>`
  }
  return ''
}

// ── 마크다운 (읽을거리 본문 blocks 의 { type:'markdown', text }) ───────────────
// 외부 라이브러리 없이 기사에 필요한 문법만 옮긴다.
// 안전: 먼저 esc() 로 이스케이프한 뒤 마크다운을 적용하므로 원문에 HTML 을 써도 태그로 살아나지 않는다.
const mdInline = (raw: string) => {
  let t = esc(raw)
  // 코드 조각을 먼저 빼둔다 — 그 안의 * _ 는 강조로 바꾸지 않는다
  const code: string[] = []
  t = t.replace(/`([^`]+)`/g, (_m, c) => `@@CODE${code.push(`<code>${c}</code>`) - 1}@@`)
  t = t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => `<img src="${escA(src)}" alt="${escA(alt)}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, txt, href) => `<a href="${escA(href)}" target="_blank" rel="noopener">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return t.replace(/@@CODE(\d+)@@/g, (_m, i) => code[+i])
}

const mdToHtml = (src: string) => {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []            // 이어지는 문단 줄 — 한 줄 바꿈은 <br> 로 살린다
  let list: string[] = []
  let listType: 'ul' | 'ol' | '' = ''
  let quote: string[] = []
  let fence: string[] | null = null  // ``` 코드 블록
  let fenceLang = ''

  const flushPara = () => {
    if (!para.length) return
    out.push(`<p>${para.map(mdInline).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (!list.length) return
    out.push(`<${listType}>${list.map((li) => `<li>${mdInline(li)}</li>`).join('')}</${listType}>`)
    list = []; listType = ''
  }
  const flushQuote = () => {
    if (!quote.length) return
    out.push(`<blockquote>${quote.map(mdInline).join('<br>')}</blockquote>`)
    quote = []
  }
  const flushAll = () => { flushPara(); flushList(); flushQuote() }

  for (const line of lines) {
    // 코드 블록 안은 그대로 둔다
    const fenceM = line.match(/^\s*```\s*(\S*)\s*$/)
    if (fenceM) {
      if (fence) {
        out.push(`<pre class="md-code"${fenceLang ? ` data-lang="${escA(fenceLang)}"` : ''}><code>${esc(fence.join('\n'))}</code></pre>`)
        fence = null; fenceLang = ''
      } else { flushAll(); fence = []; fenceLang = fenceM[1] || '' }
      continue
    }
    if (fence) { fence.push(line); continue }

    if (!line.trim()) { flushAll(); continue }                                  // 빈 줄 = 문단 나눔
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue }

    const h = line.match(/^\s*(#{1,4})\s+(.*)$/)
    if (h) { flushAll(); const n = h[1].length + 1; out.push(`<h${n}>${mdInline(h[2])}</h${n}>`); continue }

    const q = line.match(/^\s*>\s?(.*)$/)
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue }
    flushQuote()

    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const t: 'ul' | 'ol' = ul ? 'ul' : 'ol'
      if (listType && listType !== t) flushList()
      listType = t
      list.push(ul ? ul[1] : (ol as RegExpMatchArray)[1])
      continue
    }
    flushList()
    para.push(line.trim())
  }
  if (fence) out.push(`<pre class="md-code"><code>${esc(fence.join('\n'))}</code></pre>`)
  flushAll()
  return out.join('')
}

// 기자명 — 비어 있으면 편집부
const reporterName = (n: string) => n || '편집부'
export interface RelatedItem {
  slug: string
  category?: string
  title: string
  region?: string
  date?: string   // ISO or YYYY-MM-DD
  thumb?: string  // 카드 썸네일 (media.thumb 등)
}

export interface BuildOpts {
  related?: RelatedItem[]     // "같은 대회 최근 기사" / "같은 날의 다른 기사"
  relatedHeading?: string     // 기본 "같은 대회 최근 기사"
  moreHref?: string           // "더 보기" 링크
  cloudPublicUrl?: string     // 이미지 스토리지 공개 베이스 (http 아닌 url 앞에 붙임)
}

export function buildArticleLayout(doc: any, opts: BuildOpts = {}): string {
  CLOUD_BASE = opts.cloudPublicUrl || ''
  const ko = doc?.translations?.ko || {}
  // 부제 — 문서마다 subtitle / subTitle 로 키가 섞여 있어 둘 다 받는다.
  const koSub = ko.subtitle || ko.subTitle || ''
  // 분야 — ko.categories 에 'meet' 처럼 영문 슬러그가 들어 있는 문서가 있어 한글 라벨로 정규화한다.
  // (홈·검색 필터가 한글 기준이라 /search?cat= 링크도 한글이어야 맞다.)
  const cat = catKo(ko.categories)
  const images: any[] = (doc?.media?.images) || []
  const blocks: any[] = (ko.content && ko.content.blocks) || []
  const tags: string[] = ko.tags || []
  const reporter = doc?.reporter || {}
  const corrections: any[] = doc?.corrections || []
  const related = opts.related || []

  // ── 브레드크럼 ──
  const crumb: string[] = []
  crumb.push(`<a href="/">수영</a>`)
  crumb.push(`<a href="/search?cat=${encodeURIComponent(cat)}">${esc(cat)}</a>`)
  const breadcrumb = `<nav class="breadcrumb" aria-label="위치">${crumb.join('<span class="sep">›</span>')}</nav>`

  // ── 메타(입력/수정) ──
  let metaDates = `<time datetime="${escA(doc.publishedAt)}">${esc(koInput(doc.publishedAt))}</time>`
  if (doc.updatedAt) metaDates += `<a class="revised" href="#corrections"><time datetime="${escA(doc.updatedAt)}">${esc(koUpdated(doc.updatedAt))}</time></a>`

  // ── 갤러리 ── media.images 가 있으면 항상 lead 앞에 슬라이드로 보인다.
  // 본문 image 블록 중 슬라이드와 같은 사진은 아래에서 건너뛴다(중복 방지).
  const slideUrls = new Set(images.map((im) => imgUrl(im && im.url)).filter(Boolean))
  let gallery = ''
  if (images.length) {
    const slides = images.map((im) => {
      const cko = (im.translations && im.translations.ko && im.translations.ko.caption) || ''
      return `<div class="slide-photo" data-caption="${escA(cko)}"><img src="${escA(imgUrl(im.url))}" alt=""></div>`
    }).join('')
    const dots = images.map((_, i) => `<button class="dot" type="button" aria-label="${i + 1}번째 사진"></button>`).join('')
    gallery = `
      <div class="gallery" id="sec-photo" tabindex="0" aria-roledescription="사진 슬라이드">
        <div class="gallery-viewport">
          <div class="gallery-track">${slides}</div>
          <button class="gallery-prev" type="button" aria-label="이전 사진">&lsaquo;</button>
          <button class="gallery-next" type="button" aria-label="다음 사진">&rsaquo;</button>
          <div class="gallery-dots">${dots}</div>
        </div>
        <p class="art-caption gallery-caption"></p>
      </div>`
  }

  // ── 본문 블록 ──
  let recordUsed = false
  const bodyParts: string[] = []
  if (ko.content && ko.content.lead) {
    bodyParts.push(`<p class="lead">${esc(ko.content.lead)}</p>`)
  }
  blocks.forEach((b) => {
    if (!b || !b.type) return
    if (b.type === 'heading') {
      bodyParts.push(`<h2>${esc(b.text || b.title || '')}</h2>`)
    } else if (b.type === 'paragraph') {
      if (b.title) bodyParts.push(`<h2>${esc(b.title)}</h2>`)
      bodyParts.push(`<p>${esc(b.text || '')}</p>`)
    } else if (b.type === 'quote') {
      const cite = b.speaker ? `<cite>${esc(b.speaker)}${b.speaker.endsWith('선수') ? '' : ' 선수'}</cite>` : ''
      bodyParts.push(`<blockquote>${esc(b.text || '')}${cite}</blockquote>`)
    } else if (b.type === 'recordTable') {
      const idAttr = recordUsed ? '' : ' id="sec-record"'
      recordUsed = true
      const rows = (b.rows || []).map((r: any) => {
        return `<tr><td>${esc(r.segment)}</td><td>${esc(r.record)}</td><td>${esc(r.note || '')}</td></tr>`
      }).join('')
      bodyParts.push(`<table class="record-table"${idAttr}>
          <caption>${esc(b.caption || '')}</caption>
          <thead><tr><th>구분</th><th>기록</th><th>비고</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`)
    } else if (b.type === 'markdown') {
      // 읽을거리 본문 — 마크다운 한 덩어리.
      const html = mdToHtml(b.text || '')
      if (html) bodyParts.push(`<div class="art-md">${html}</div>`)
    } else if (b.type === 'video') {
      const v = videoHtml(b.url, b.caption)
      if (v) bodyParts.push(v)
    } else if (b.type === 'highlight' || /^note/.test(String(b.type))) {
      // 콜아웃(인용/인터뷰와 같은 좌측 보더 형식, 색만 구별) — highlight=강조, note=편집자 주
      // 라벨은 label · title 어느 쪽이든 수용(생성 파이프라인은 note 에 title 사용). notexx 등 note* 오타도 수용.
      const isNote = /^note/.test(String(b.type))
      const tag = isNote ? (b.noteType === 'fact_check' ? 'FACT NOTE' : 'NOTE') : 'HIGHLIGHT'
      const label = b.label || b.title || (isNote ? '편집자 주' : '현장 인상')
      const labelSpan = label ? `<span class="co-label">${esc(label)}</span>` : ''
      bodyParts.push(`<aside class="art-callout ${isNote ? 'art-note' : 'art-highlight'}">
          <p class="co-kicker">${labelSpan}<span class="co-tag">${tag}</span></p>
          <p class="co-text">${esc(b.text || '')}</p>
        </aside>`)
    } else if (b.type === 'stat') {
      // 공식 기록(결과 카드) — 큰 기록 + 설명. value/description 형(스키마) 과
      // items[] 형(생성 파이프라인) 모두 수용: items 면 '기록' 항목을 대표값, 나머지를 설명으로.
      const label = b.label || b.title || ''
      let value = b.value || ''
      let desc = b.description || ''
      if (!value && Array.isArray(b.items) && b.items.length) {
        const hit = b.items.find((it: any) => /기록|time|record/i.test(String(it.label || '')))
        value = (hit && hit.value) || b.items[0].value || ''
        if (!desc) desc = b.items.filter((it: any) => it.value && it.value !== value).map((it: any) => it.value).join(' · ')
      }
      const labelSpan = label ? `<span>${esc(label)}</span> · ` : ''
      bodyParts.push(`<div class="art-stat">
          <p class="stat-label">${labelSpan}OFFICIAL RESULT</p>
          <p class="stat-value">${esc(value)}</p>
          ${desc ? `<p class="stat-desc">${esc(desc)}</p>` : ''}
        </div>`)
    } else if (b.type === 'image') {
      // 본문 인라인 사진 — url(R2 상대경로/절대) → imgUrl 로 정규화, 캡션 병기
      const u = imgUrl(b.url || (b.image && b.image.url) || '')
      if (u && !slideUrls.has(u)) {
        const cap = b.caption
          ? `<figcaption class="art-caption">${esc(b.caption)}</figcaption>`
          : ''
        bodyParts.push(`<figure class="art-figure"><img src="${escA(u)}" alt="${escA(b.alt || '')}" loading="lazy">${cap}</figure>`)
      }
    } else {
      // 기타 블록(result·eventSummary 등) — title/text 있으면 표시 (버려지지 않도록)
      if (b.title) bodyParts.push(`<h2>${esc(b.title)}</h2>`)
      if (b.text) bodyParts.push(`<p>${esc(b.text)}</p>`)
    }
    // 문서의 youtube { url, caption } — 경기 요약(event/summary) 블록 바로 다음에 표시
    if (b.type === 'event' && b.source === 'summary' && doc?.youtube) {
      const v = videoHtml(doc.youtube.url, doc.youtube.caption)
      if (v) bodyParts.push(v)
    }
  })
  // 맺음말 — content.conclusion(문자열)을 본문 맨 끝에 표시
  if (ko.content && ko.content.conclusion) {
    bodyParts.push(`<p class="art-conclusion">${esc(ko.content.conclusion)}</p>`)
  }
  const bodyHtml = `<div class="art-body" id="sec-body">${bodyParts.join('\n')}</div>`

  // ── 태그 ──
  const tagsHtml = tags.length
    ? `<nav class="art-tags" aria-label="키워드">${tags.map((tg) => `<a href="/search?q=${encodeURIComponent(tg)}">#${esc(tg)}</a>`).join('')}</nav>`
    : ''

  // ── 바이라인 ──
  const byline = `<p class="art-byline" id="sec-reporter"><strong><button type="button" class="byline-name" id="bylineName">${esc(reporterName(reporter.name))}</button></strong> / ${esc(reporter.email || 'press@medalbank.com')}</p>`

  // ── 저작권·등록 ──
  const legal = `<div class="art-legal"><span class="copy">ⓒ Swimming Photography. 무단 전재 및 재배포 금지.</span></div>`

  // ── 기자 명함/제보 박스 ──
  const actions = `
      <div class="art-actions" hidden>
        <div class="namecard">
          <div class="nc-press">Swimming Photography<span class="nc-org">수영 전문 일간지</span></div>
          <div class="nc-name">${esc(reporterName(reporter.name))}</div>
          <div class="nc-contact">${esc(reporter.email || 'press@medalbank.com')}</div>
        </div>
        <div class="action-box">
          <div class="reporter-part">
            <div class="rb-label">이 기사를 쓴 기자</div>
            <div class="rb-head">
              <div class="rb-avatar">${esc((reporter.name || '편')[0])}</div>
              <div>
                <div class="rb-name">${esc(reporterName(reporter.name))}</div>
                <div class="rb-field"><span class="field">${esc(cat)}</span></div>
              </div>
            </div>
          </div>
          <div class="tip-part">
            <div class="tip-label">Have your say?</div>
            <p>제보해주시는 내용은 후속 취재의 출발점이 될 수 있습니다.</p>
            <a href="#" class="btn" data-form="제보-폼-URL">이야기 제보하기</a>
          </div>
        </div>
      </div>`

  // ── 정정·수정 이력 ──
  const corrItems = (corrections.length ? corrections : [{ timestamp: doc.publishedAt, note: '발행' }])
    .map((c: any) => `<li><span class="ts">${esc(koStamp(c.timestamp))}</span> — <span>${esc(c.note || '')}</span></li>`).join('')
  const correctionsHtml = `
      <section class="corrections" id="corrections">
        <h3>정정·수정 이력</h3>
        <div class="corrections-box">
          <ul>${corrItems}</ul>
          <p class="note">모든 정정 내역을 표기하며, 전체 공개합니다.</p>
        </div>
      </section>`

  // ── 같은 대회 최근 기사 (related) ──
  let relatedHtml = ''
  if (related.length) {
    // article.html 스타일: 이미지 그리드 카드(.listing-grid / .lg-card)
    const cards = related.map((r) => {
      const thumbStyle = r.thumb ? ` style="background-image:url('${escA(imgUrl(r.thumb))}')"` : ''
      return `<a class="lg-card" href="/article/${escA(r.slug)}">
          <span class="lg-thumb"${thumbStyle}></span>
          <span class="lg-title"><span class="lg-cat">${esc(r.category || '대회')}</span><span>${esc(r.title)}</span></span>
          <span class="lg-date">${esc(koDate(r.date || ''))}</span>
        </a>`
    }).join('')
    relatedHtml = `
      <section class="listing" id="sec-related">
        <div class="listing-head">
          <h2>${esc(opts.relatedHeading || '같은 대회 최근 기사')}</h2>
          ${opts.moreHref ? `<a class="listing-more" href="${escA(opts.moreHref)}">더 보기</a>` : ''}
        </div>
        <div class="listing-grid">${cards}</div>
      </section>`
  }

  const ad = `
      <section class="ad-section" aria-label="광고">
        <h3 class="ad-heading">광고</h3>
        <div class="ad-slot">ㅍㅇ ㅎㅇㅌ</div>
      </section>`

  // ── 제보 안내 모달 (이야기 제보하기 → 열림, article.html 이식) ──
  const tipModal = `
    <div class="foot-modal" id="tipModal" role="dialog" aria-modal="true" aria-label="제보 안내">
      <div class="ov" data-close></div>
      <div class="box">
        <div class="modal-head">
          <h3>제보 안내</h3>
          <button type="button" class="x" data-close aria-label="닫기">×</button>
        </div>
        <p>현재는 제보를 받지 않고 있습니다. 모든 제보와 관련된 트랙을 제한한 상태로, 편집부의 역량으로만 운영하고 있습니다.</p>
        <p>추후 제보 채널이 다시 열리면 안내드리겠습니다. 대한민국 수영을 응원합니다.</p>
      </div>
    </div>`

  // ── 사이드바: 이 기사의 기록 (payload 제거로 미표시) ──
  const sideRecord = ''

  // ── 사이드바: 같은 날의 다른 기사 ──
  let sideLatest = ''
  if (related.length) {
    const lis = related.slice(0, 4).map((r) =>
      `<li><a href="/article/${escA(r.slug)}"><span class="d">${esc(koDate(r.date || ''))}</span>`
      + `<span class="t"><span class="s-cat">${esc(r.category || '대회')}</span>`
      + `<span>${esc(r.title)}</span></span></a></li>`).join('')
    sideLatest = `
      <div class="side-module mobile-hide">
        <h3>같은 날의 다른 기사</h3>
        <ul class="side-latest">${lis}</ul>
      </div>`
  }

  const sidebar = `
    <aside class="sidebar">
      <div class="side-module mobile-hide">
        <h3>자세히 보기</h3>
        <nav class="mini-nav" id="miniNav" aria-label="기사 내비게이션"></nav>
      </div>
      ${sideRecord}
      ${sideLatest}
      <div class="side-module mobile-hide">
        <h3>분야 바로가기</h3>
        <div class="side-chips">
          <a href="/?cat=%EB%8C%80%ED%9A%8C">대회</a>
          <a href="/?cat=%EC%9D%B8%EB%AC%BC">인물</a>
          <a href="/?cat=%ED%98%84%EC%9E%A5">현장</a>
          <a href="/breakingnews">속보</a>
        </div>
      </div>
      <div class="side-module mobile-hide">
        <h3>기사 찾아보기</h3>
        <form class="side-search" id="sideSearch" role="search">
          <input type="search" class="side-search-input" id="sideSearchInput"
                 placeholder="도시·대회·종목·선수·제목 검색" aria-label="검색">
        </form>
      </div>
      <div class="side-module">
        <h3>우리나라 수영 기록 둘러보기</h3>
        <a class="side-records" href="https://medalbank.com" target="_blank" rel="noopener">
          <img src="/images/logo_medalbank.png" alt="메달뱅크" class="sr-logo">
        </a>
      </div>
      <div class="side-module mobile-hide">
        <h3>With support from</h3>
        <a class="side-support" href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">
          <img src="/images/logo_medalbankaquatics.png" alt="메달뱅크 아쿠아틱스" class="ss-logo">
        </a>
      </div>
    </aside>`

  return `<div class="layout">
    <article class="article">
      ${breadcrumb}
      <span class="art-cat">${esc(cat)}</span>
      <h1 class="art-title" id="sec-title">${esc(ko.title || '')}</h1>
      ${koSub ? `<p class="art-sub">${esc(koSub)}</p>` : ''}
      <div class="art-meta">
        <div class="meta-dates">${metaDates}</div>
        <div class="tools" role="group" aria-label="기사 도구">
          <span class="tools-left">
            <button type="button" data-pdf>PDF 저장</button>
            <button type="button" data-img>IMG 저장</button>
            <button type="button" data-copy>URL 복사하기</button>
          </span>
          <span class="tools-right">
            <button type="button" class="fs" data-fs="down" aria-label="글자 작게">가−</button>
            <button type="button" class="fs" data-fs="up" aria-label="글자 크게">가＋</button>
          </span>
        </div>
      </div>
      ${gallery}
      ${bodyHtml}
      ${tagsHtml}
      ${byline}
      ${legal}
      ${actions}
      ${correctionsHtml}
      ${relatedHtml}
      ${ad}
    </article>
    ${sidebar}
    ${tipModal}
  </div>`
}
