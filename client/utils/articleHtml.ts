// articles 문서(JSON) → 기사 상세 HTML 문자열.
// docs/html/article-20260531-kimheekyung.html 구조를 그대로 재현하되, DB 문서에서 값을 채운다.
// 반환값은 <div class="layout"> … </div> (기사 본문 + 사이드바) — article/[slug].vue 가 v-html 로 렌더.

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
const enInput = (iso: string) => {
  const t = parseDT(iso); if (!t) return ''
  return `Filed ${pad2(t.d)}-${pad2(t.mo)}-${t.y} ${pad2(t.h)}:${pad2(t.mi)}`
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
const enDate = (iso: string) => {
  const t = parseDT(iso) || parseDT(iso + 'T00:00'); if (!t) return ''
  return `${pad2(t.d)}-${pad2(t.mo)}-${t.y}`
}

// public 루트 기준 절대경로로 정규화
const imgUrl = (u: string) => {
  const s = String(u || '')
  if (!s) return ''
  if (/^https?:\/\//.test(s) || s.startsWith('/')) return s
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

// data-en 은 값이 있을 때만 부여 (없으면 EN 모드에서 한글이 그대로 노출되도록)
const attrEn = (en: string) => (en ? ` data-en="${escA(en)}"` : '')

export interface RelatedItem {
  slug: string
  category?: string
  categoryEn?: string
  title: string
  titleEn?: string
  region?: string
  date?: string   // ISO or YYYY-MM-DD
  thumb?: string  // 카드 썸네일 (media.thumb 등)
}

export interface BuildOpts {
  related?: RelatedItem[]     // "같은 대회 최근 기사" / "같은 날의 다른 기사"
  relatedHeading?: string     // 기본 "같은 대회 최근 기사"
  moreHref?: string           // "더 보기" 링크
}

export function buildArticleLayout(doc: any, opts: BuildOpts = {}): string {
  const ko = doc?.translations?.ko || {}
  const en = doc?.translations?.en || {}
  const pd = doc?.payload?.data || {}
  const cat = (ko.categories && ko.categories[0]) || pd.category || '경기'
  const images: any[] = (doc?.media?.images) || []
  const blocks: any[] = (ko.content && ko.content.blocks) || []
  const tags: string[] = ko.tags || []
  const reporter = doc?.reporter || {}
  const corrections: any[] = doc?.corrections || []
  const related = opts.related || []

  // ── 브레드크럼 ──
  const crumb: string[] = []
  crumb.push(`<a href="/" data-en="Swimming">수영</a>`)
  crumb.push(`<a href="/search?cat=${encodeURIComponent(cat)}">${esc(cat)}</a>`)
  if (pd.region) crumb.push(`<a href="/search?city=${encodeURIComponent(pd.region)}">${esc(pd.region)}</a>`)
  if (pd.competition) crumb.push(`<a href="/search?competition=${encodeURIComponent(pd.competition)}">${esc(pd.competition)}</a>`)
  if (pd.event) crumb.push(`<a href="/search?event=${encodeURIComponent(pd.event)}">${esc(pd.event)}</a>`)
  if (pd.athlete) crumb.push(`<a href="/search?athlete=${encodeURIComponent(pd.athlete)}">${esc(pd.athlete)}</a>`)
  const breadcrumb = `<nav class="breadcrumb" aria-label="위치">${crumb.join('<span class="sep">›</span>')}</nav>`

  // ── 메타(입력/수정) ──
  let metaDates = `<time datetime="${escA(doc.publishedAt)}"${attrEn(enInput(doc.publishedAt))}>${esc(koInput(doc.publishedAt))}</time>`
  if (doc.updatedAt) metaDates += `<a class="revised" href="#corrections"><time datetime="${escA(doc.updatedAt)}">${esc(koUpdated(doc.updatedAt))}</time></a>`

  // ── 갤러리 ──
  let gallery = ''
  if (images.length) {
    const slides = images.map((im) => {
      const cko = (im.translations && im.translations.ko && im.translations.ko.caption) || ''
      const cen = (im.translations && im.translations.en && im.translations.en.caption) || ''
      const capEn = cen ? ` data-caption-en="${escA(cen)}"` : ''
      return `<div class="slide-photo" data-caption="${escA(cko)}"${capEn}><img src="${escA(imgUrl(im.url))}" alt=""></div>`
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

  // ── 본문 블록 (data-en/​data-en-html 로 영문 병기 — en.content 있으면 언어 전환 시 표시) ──
  const enBlocks: any[] = (en.content && en.content.blocks) || []
  let recordUsed = false
  const bodyParts: string[] = []
  if (ko.content && ko.content.lead) {
    bodyParts.push(`<p class="lead"${attrEn((en.content && en.content.lead) || '')}>${esc(ko.content.lead)}</p>`)
  }
  blocks.forEach((b, i) => {
    if (!b || !b.type) return
    const eb = (enBlocks[i] && enBlocks[i].type === b.type) ? enBlocks[i] : null
    if (b.type === 'heading') {
      bodyParts.push(`<h2${attrEn(eb ? (eb.text || eb.title || '') : '')}>${esc(b.text || b.title || '')}</h2>`)
    } else if (b.type === 'paragraph') {
      if (b.title) bodyParts.push(`<h2${attrEn(eb ? (eb.title || '') : '')}>${esc(b.title)}</h2>`)
      bodyParts.push(`<p${attrEn(eb ? (eb.text || '') : '')}>${esc(b.text || '')}</p>`)
    } else if (b.type === 'quote') {
      const cite = b.speaker ? `<cite>${esc(b.speaker)}${b.speaker.endsWith('선수') ? '' : ' 선수'}</cite>` : ''
      // cite 자식이 있어 텍스트만 바꾸면 깨지므로 data-en-html 로 통째 치환
      if (eb && (eb.text || eb.speaker)) {
        const enSpeaker = eb.speaker || b.speaker || ''
        const enCite = enSpeaker ? `<cite>${esc(enSpeaker)}</cite>` : ''
        bodyParts.push(`<blockquote data-en-html="${escA(esc(eb.text || b.text || '') + enCite)}">${esc(b.text || '')}${cite}</blockquote>`)
      } else {
        bodyParts.push(`<blockquote>${esc(b.text || '')}${cite}</blockquote>`)
      }
    } else if (b.type === 'recordTable') {
      const idAttr = recordUsed ? '' : ' id="sec-record"'
      recordUsed = true
      const erows: any[] = (eb && eb.rows) || []
      const rows = (b.rows || []).map((r: any, j: number) => {
        const er = erows[j] || {}
        return `<tr><td>${esc(r.segment)}</td><td${attrEn(er.record || '')}>${esc(r.record)}</td><td${attrEn(er.note || '')}>${esc(r.note || '')}</td></tr>`
      }).join('')
      bodyParts.push(`<table class="record-table"${idAttr}>
          <caption${attrEn((eb && eb.caption) || '')}>${esc(b.caption || '')}</caption>
          <thead><tr><th data-en="Category">구분</th><th data-en="Time">기록</th><th data-en="Note">비고</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`)
    } else if (b.type === 'video') {
      // 유튜브 영상 — 클릭 후 로드(facade). 검증된 ID만 임베드, 아니면 링크 폴백.
      const id = ytId(b.url)
      if (id) {
        const cap = b.caption
          ? `<figcaption class="art-caption"${attrEn(b.captionEn || '')}>${esc(b.caption)}</figcaption>`
          : ''
        bodyParts.push(`<figure class="art-video">
          <div class="yt-frame">
            <button type="button" class="yt-facade" data-yt="${id}" aria-label="영상 재생">
              <img class="yt-poster" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">
              <span class="yt-play" aria-hidden="true"></span>
            </button>
          </div>${cap}
        </figure>`)
      } else if (/^https?:\/\//.test(String(b.url || ''))) {
        bodyParts.push(`<p class="art-video-fallback"><a href="${escA(b.url)}" target="_blank" rel="noopener">${esc(b.url)}</a></p>`)
      }
    } else if (b.type === 'highlight' || b.type === 'note') {
      // 콜아웃(인용/인터뷰와 같은 좌측 보더 형식, 색만 구별) — highlight=강조, note=편집자 주
      // 라벨은 label · title 어느 쪽이든 수용(생성 파이프라인은 note 에 title 사용)
      const isNote = b.type === 'note'
      const tag = isNote ? (b.noteType === 'fact_check' ? 'FACT NOTE' : 'NOTE') : 'HIGHLIGHT'
      const label = b.label || b.title || (isNote ? '편집자 주' : '현장 인상')
      const enLabel = eb ? (eb.label || eb.title || '') : ''
      const labelSpan = label ? `<span class="co-label"${attrEn(enLabel)}>${esc(label)}</span>` : ''
      bodyParts.push(`<aside class="art-callout ${isNote ? 'art-note' : 'art-highlight'}">
          <p class="co-kicker">${labelSpan}<span class="co-tag">${tag}</span></p>
          <p class="co-text"${attrEn(eb ? (eb.text || '') : '')}>${esc(b.text || '')}</p>
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
      const labelSpan = label ? `<span${attrEn(eb ? (eb.label || eb.title || '') : '')}>${esc(label)}</span> · ` : ''
      bodyParts.push(`<div class="art-stat">
          <p class="stat-label">${labelSpan}OFFICIAL RESULT</p>
          <p class="stat-value">${esc(value)}</p>
          ${desc ? `<p class="stat-desc"${attrEn(eb ? (eb.description || '') : '')}>${esc(desc)}</p>` : ''}
        </div>`)
    }
  })
  // 맺음말 — content.conclusion(문자열)을 본문 맨 끝에 표시
  if (ko.content && ko.content.conclusion) {
    bodyParts.push(`<p class="art-conclusion"${attrEn((en.content && en.content.conclusion) || '')}>${esc(ko.content.conclusion)}</p>`)
  }
  const bodyHtml = `<div class="art-body" id="sec-body">${bodyParts.join('\n')}</div>`

  // ── 태그 ──
  const tagsHtml = tags.length
    ? `<nav class="art-tags" aria-label="키워드">${tags.map((tg) => `<a href="/search?q=${encodeURIComponent(tg)}">#${esc(tg)}</a>`).join('')}</nav>`
    : ''

  // ── 바이라인 ──
  const byline = `<p class="art-byline" id="sec-reporter"><strong><button type="button" class="byline-name" id="bylineName">${esc(reporter.name || '편집부')}</button></strong> / ${esc(reporter.email || 'press@medalbank.com')}</p>`

  // ── 저작권·등록 ──
  const legal = `<div class="art-legal"><span class="copy">${esc(pd.copyright || 'ⓒ Swimming Photography. 무단 전재 및 재배포 금지.')}</span> ${pd.registrationNumber ? `<span class="reg">정기간행물 등록번호 ${esc(pd.registrationNumber)}.</span>` : ''}</div>`

  // ── 기자 명함/제보 박스 ──
  const actions = `
      <div class="art-actions" hidden>
        <div class="namecard">
          <div class="nc-press">Swimming Photography<span class="nc-org">수영 전문 일간지</span></div>
          <div class="nc-name">${esc(reporter.name || '편집부')}</div>
          <div class="nc-contact">${esc(reporter.email || 'press@medalbank.com')}</div>
        </div>
        <div class="action-box">
          <div class="reporter-part">
            <div class="rb-label" data-en="Who wrote this">이 기사를 쓴 기자</div>
            <div class="rb-head">
              <div class="rb-avatar">${esc((reporter.name || '편')[0])}</div>
              <div>
                <div class="rb-name">${esc(reporter.name || '편집부')}</div>
                <div class="rb-field"><span class="field">${esc(cat)}</span></div>
              </div>
            </div>
          </div>
          <div class="tip-part">
            <div class="tip-label">Have your say?</div>
            <p data-en="Your tips can become the starting point for our follow-up reporting.">제보해주시는 내용은 후속 취재의 출발점이 될 수 있습니다.</p>
            <a href="#" class="btn" data-form="제보-폼-URL" data-en="Share your story">이야기 제보하기</a>
          </div>
        </div>
      </div>`

  // ── 정정·수정 이력 ──
  const corrItems = (corrections.length ? corrections : [{ timestamp: doc.publishedAt, note: '발행' }])
    .map((c: any) => `<li><span class="ts">${esc(koStamp(c.timestamp))}</span> — ${esc(c.note || '')}</li>`).join('')
  const correctionsHtml = `
      <section class="corrections" id="corrections">
        <h3 data-en="Corrections &amp; Updates">정정·수정 이력</h3>
        <div class="corrections-box">
          <ul>${corrItems}</ul>
          <p class="note" data-en="We record and fully disclose every correction.">모든 정정 내역을 표기하며, 전체 공개합니다.</p>
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
          <span class="lg-title"><span class="lg-cat"${attrEn(r.categoryEn || '')}>${esc(r.category || '경기')}</span><span${attrEn(r.titleEn || '')}>${esc(r.title)}</span></span>
          <span class="lg-date"${attrEn(r.date ? enDate(r.date) : '')}>${esc(koDate(r.date || ''))}</span>
        </a>`
    }).join('')
    relatedHtml = `
      <section class="listing" id="sec-related">
        <div class="listing-head">
          <h2 data-en="More from this meet">${esc(opts.relatedHeading || '같은 대회 최근 기사')}</h2>
          ${opts.moreHref ? `<a class="listing-more" href="${escA(opts.moreHref)}" data-en="See more">더 보기</a>` : ''}
        </div>
        <div class="listing-grid">${cards}</div>
      </section>`
  }

  const ad = `
      <section class="ad-section" aria-label="광고">
        <h3 class="ad-heading" data-en="Advertisement">광고</h3>
        <div class="ad-slot">ㅍㅇ ㅎㅇㅌ</div>
      </section>`

  // ── 제보 안내 모달 (이야기 제보하기 → 열림, article.html 이식) ──
  const tipModal = `
    <div class="foot-modal" id="tipModal" role="dialog" aria-modal="true" aria-label="제보 안내">
      <div class="ov" data-close></div>
      <div class="box">
        <div class="modal-head">
          <h3 data-en="About tips">제보 안내</h3>
          <button type="button" class="x" data-close aria-label="닫기">×</button>
        </div>
        <p data-en="We are not accepting tips at this time. All tip-related channels are currently closed, and we operate solely through the editorial team.">현재는 제보를 받지 않고 있습니다. 모든 제보와 관련된 트랙을 제한한 상태로, 편집부의 역량으로만 운영하고 있습니다.</p>
        <p data-en="We'll let you know when the tip channel reopens. We cheer for Korean swimming.">추후 제보 채널이 다시 열리면 안내드리겠습니다. 대한민국 수영을 응원합니다.</p>
      </div>
    </div>`

  // ── 사이드바: 이 기사의 기록 (경기 기사) ──
  let sideRecord = ''
  if (pd.event || pd.record) {
    const rows: string[] = []
    if (pd.record) rows.push(`<div class="rec-time"><span>${esc(pd.record)}</span>${pd.rank ? `<span class="rec-flag">${esc(pd.rank)}</span>` : ''}</div>`)
    if (pd.date) rows.push(`<div class="rr"><span class="k" data-en="Date">날짜</span><span class="v">${esc(koDayLabel(pd.date))}</span></div>`)
    if (pd.athlete) rows.push(`<div class="rr"><span class="k" data-en="Athlete">선수</span><span class="v">${esc(pd.athlete)}</span></div>`)
    if (pd.competition) rows.push(`<div class="rr"><span class="k" data-en="Meet">대회</span><span class="v">${esc(pd.competition)}</span></div>`)
    if (pd.venue) rows.push(`<div class="rr"><span class="k" data-en="Venue">수영장</span><span class="v">${esc(pd.venue)}</span></div>`)
    sideRecord = `
      <div class="side-module mobile-hide">
        <h3>${esc(pd.event || pd.record)}</h3>
        <div class="side-record">${rows.join('')}</div>
      </div>`
  }

  // ── 사이드바: 같은 날의 다른 기사 ──
  let sideLatest = ''
  if (related.length) {
    const lis = related.slice(0, 4).map((r) =>
      `<li><a href="/article/${escA(r.slug)}"><span class="d">${esc(koDate(r.date || ''))}</span><span class="t"><span class="s-cat">${esc(r.category || '경기')}</span>${esc(r.title)}</span></a></li>`).join('')
    sideLatest = `
      <div class="side-module mobile-hide">
        <h3 data-en="More from this day">같은 날의 다른 기사</h3>
        <ul class="side-latest">${lis}</ul>
      </div>`
  }

  const sidebar = `
    <aside class="sidebar">
      <div class="side-module mobile-hide">
        <h3 data-en="In this article">자세히 보기</h3>
        <nav class="mini-nav" id="miniNav" aria-label="기사 내비게이션"></nav>
      </div>
      ${sideRecord}
      ${sideLatest}
      <div class="side-module mobile-hide">
        <h3 data-en="Browse by category">분야 바로가기</h3>
        <div class="side-chips">
          <a href="/?cat=%EA%B2%BD%EA%B8%B0" data-en="Meets">경기</a>
          <a href="/?cat=%EC%9D%B8%EB%AC%BC" data-en="Athlete">인물</a>
          <a href="/?cat=%ED%98%84%EC%9E%A5" data-en="On Site">현장</a>
          <a href="/breakingnews" data-en="Breaking">속보</a>
        </div>
      </div>
      <div class="side-module mobile-hide">
        <h3 data-en="Search articles">기사 찾아보기</h3>
        <form class="side-search" id="sideSearch" role="search">
          <input type="search" class="side-search-input" id="sideSearchInput"
                 placeholder="도시·대회·종목·선수·제목 검색" data-en-ph="Search city, meet, event, athlete, title" aria-label="검색">
        </form>
      </div>
      <div class="side-module">
        <h3 data-en="Explore Korean swimming records">우리나라 수영 기록 둘러보기</h3>
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
      <span class="art-cat"${attrEn((en.categories && en.categories[0]) || '')}>${esc(cat)}</span>
      <h1 class="art-title" id="sec-title"${attrEn(en.title || '')}>${esc(ko.title || '')}</h1>
      ${ko.subtitle ? `<p class="art-sub"${attrEn(en.subtitle || '')}>${esc(ko.subtitle)}</p>` : ''}
      <div class="art-meta">
        <div class="meta-dates">${metaDates}</div>
        <div class="tools" role="group" aria-label="기사 도구">
          <span class="tools-left">
            <button type="button" data-pdf data-en="Save PDF">PDF 저장</button>
            <button type="button" data-img data-en="Save IMG">IMG 저장</button>
            <button type="button" data-copy data-en="Copy URL">URL 복사하기</button>
          </span>
          <span class="tools-right">
            <button type="button" class="fs" data-fs="down" aria-label="글자 작게" data-en="A−">가−</button>
            <button type="button" class="fs" data-fs="up" aria-label="글자 크게" data-en="A＋">가＋</button>
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
