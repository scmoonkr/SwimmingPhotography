// 기사 상세 상호작용 — docs/html/article.html 스크립트 이식.
// 글자 크기(가−/가＋)·PDF/IMG 저장·URL 복사·사진 갤러리(캡션)·기사 내비게이션(앵커)·바이라인 토글.
// v-html 로 렌더된 rootEl 위에서 1회 wiring 하고, 언어 전환용 refreshLang / 정리용 cleanup 을 돌려준다.

// html2canvas 를 필요 시 CDN 에서 1회 로드 (IMG 저장용)
let html2canvasPromise: Promise<any> | null = null
const loadHtml2Canvas = (): Promise<any> => {
  if ((window as any).html2canvas) return Promise.resolve((window as any).html2canvas)
  if (html2canvasPromise) return html2canvasPromise
  html2canvasPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    s.onload = () => resolve((window as any).html2canvas)
    s.onerror = () => reject(new Error('html2canvas load failed'))
    document.head.appendChild(s)
  })
  return html2canvasPromise
}

export interface ArticleWiring { cleanup: () => void; refreshLang: () => void }

export function wireArticleInteractions(el: HTMLElement, opts: { en: () => boolean }): ArticleWiring {
  const EN = opts.en
  const langRefreshers: Array<() => void> = []
  const cleanups: Array<() => void> = []

  // ── 글자 크기 (가− / 가＋) : --read-fs 조절 (0.85 ~ 1.3) ──
  const docEl = document.documentElement
  let fs = 1
  const setFs = (d: number) => {
    fs = Math.min(1.3, Math.max(0.85, Math.round((fs + d) * 100) / 100))
    docEl.style.setProperty('--read-fs', String(fs))
  }
  el.querySelectorAll<HTMLElement>('[data-fs]').forEach((b) =>
    b.addEventListener('click', () => setFs(b.dataset.fs === 'up' ? 0.1 : -0.1)))
  cleanups.push(() => docEl.style.removeProperty('--read-fs'))

  // ── PDF 저장 : 브라우저 인쇄(→ PDF로 저장) ──
  el.querySelector<HTMLButtonElement>('[data-pdf]')?.addEventListener('click', () => window.print())

  // ── IMG 저장 : 페이지 캡처(사이드바 등 제외) → PNG 다운로드 ──
  const imgBtn = el.querySelector<HTMLButtonElement>('[data-img]')
  imgBtn?.addEventListener('click', async () => {
    const prev = imgBtn.textContent
    imgBtn.textContent = EN() ? 'Saving…' : '저장 중…'
    imgBtn.disabled = true
    const savedScroll = window.scrollY
    try {
      const html2canvas = await loadHtml2Canvas()
      window.scrollTo(0, 0)
      const maxw = parseInt(getComputedStyle(docEl).getPropertyValue('--maxw')) || 1200
      const canvas = await html2canvas(document.body, {
        backgroundColor: '#ffffff', scale: 1, useCORS: true, windowWidth: maxw,
        onclone: (doc: Document) => doc.body.classList.add('capturing'),
      })
      const a = document.createElement('a')
      a.download = (document.title || 'article').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) + '.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch (e) {
      alert(EN() ? 'Image save failed.' : '이미지 저장에 실패했습니다.')
    }
    window.scrollTo(0, savedScroll)
    imgBtn.textContent = prev
    imgBtn.disabled = false
  })

  // ── URL 복사하기 : 클립보드 복사 + 안내 문구 ──
  const copyBtn = el.querySelector<HTMLButtonElement>('[data-copy]')
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      const prev = copyBtn.textContent
      const isMobile = window.matchMedia('(max-width: 640px)').matches
      copyBtn.textContent = EN()
        ? (isMobile ? 'Copied. Paste it anywhere.' : 'Copied to clipboard. Paste it wherever you like.')
        : (isMobile ? '복사 완료. 붙여넣기 해주세요.' : '클립보드 복사 완료. 원하시는 곳에 붙여넣기 해주세요.')
      setTimeout(() => { copyBtn.textContent = prev }, 1800)
    } catch (e) {
      window.prompt(EN() ? "This article's URL" : '이 기사의 주소', window.location.href)
    }
  })

  // ── 사진 갤러리 (1~5장 슬라이드 + 캡션) ──
  el.querySelectorAll<HTMLElement>('.gallery').forEach((g) => {
    const track = g.querySelector<HTMLElement>('.gallery-track')
    const slides = [...g.querySelectorAll<HTMLElement>('.slide-photo')]
    const cap = g.querySelector<HTMLElement>('.gallery-caption')
    const dots = [...g.querySelectorAll<HTMLElement>('.gallery-dots .dot')]
    const n = slides.length
    let idx = 0
    if (n <= 1) g.classList.add('single')
    const setCap = () => {
      if (!cap || !slides[idx]) return
      cap.textContent = (EN() && slides[idx].dataset.captionEn)
        ? slides[idx].dataset.captionEn!
        : (slides[idx].getAttribute('data-caption') || '')
    }
    const go = (k: number) => {
      idx = (k + n) % n
      if (track) track.style.transform = 'translateX(-' + (idx * 100) + '%)'
      setCap()
      dots.forEach((d, j) => d.classList.toggle('active', j === idx))
    }
    langRefreshers.push(setCap)

    // ── 자동 재생(autoplay) : 5초 간격 순환 · 조작/호버/포커스 시 정지 · 1장이거나 모션 최소화면 비활성 ──
    const AUTOPLAY_MS = 5000
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let hovered = false
    let timer: ReturnType<typeof setInterval> | null = null
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null } }
    const start = () => {
      stop()
      if (reduce || n <= 1 || hovered || document.hidden) return
      timer = setInterval(() => go(idx + 1), AUTOPLAY_MS)
    }
    // 사용자가 직접 넘기면 이동 후 타이머 리셋(바로 다시 자동으로 튀지 않게)
    const nudge = (k: number) => { go(k); start() }

    g.querySelector('.gallery-prev')?.addEventListener('click', () => nudge(idx - 1))
    g.querySelector('.gallery-next')?.addEventListener('click', () => nudge(idx + 1))
    dots.forEach((d, j) => d.addEventListener('click', () => nudge(j)))
    g.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(idx - 1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudge(idx + 1) }
    })
    const vp = g.querySelector<HTMLElement>('.gallery-viewport')
    if (vp) {
      let x0: number | null = null
      vp.style.touchAction = 'pan-y'
      vp.addEventListener('pointerdown', (e) => { x0 = e.clientX })
      vp.addEventListener('pointerup', (e) => {
        if (x0 === null) return
        const dx = e.clientX - x0
        if (Math.abs(dx) > 40) nudge(dx < 0 ? idx + 1 : idx - 1)
        x0 = null
      })
      vp.addEventListener('pointercancel', () => { x0 = null })
    }

    // 호버·포커스 중에는 멈추고, 벗어나면 재개
    g.addEventListener('pointerenter', () => { hovered = true; stop() })
    g.addEventListener('pointerleave', () => { hovered = false; start() })
    g.addEventListener('focusin', () => { hovered = true; stop() })
    g.addEventListener('focusout', () => { hovered = false; start() })
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    cleanups.push(() => { stop(); document.removeEventListener('visibilitychange', onVis) })

    go(0)
    start()
  })

  // ── YouTube 영상 : 클릭 시에만 iframe 로드(facade) — 재생 전까지 플레이어·쿠키 미로드 ──
  el.querySelectorAll<HTMLButtonElement>('.yt-facade').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.yt || ''
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return   // 방어적 재검증
      const iframe = document.createElement('iframe')
      iframe.className = 'yt-iframe'
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0'
      iframe.title = 'YouTube'
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share')
      iframe.setAttribute('allowfullscreen', '')
      btn.replaceWith(iframe)
    }, { once: true })
  })

  // ── 기사 내비게이션(앵커) : 존재하는 섹션만으로 미니 메뉴 구성 + 스크롤 연동 ──
  ;(() => {
    const nav = el.querySelector<HTMLElement>('#miniNav')
    if (!nav) return
    const defs = [
      { id: 'sec-title', label: '제목', en: 'Title' },
      { id: 'sec-photo', label: '사진', en: 'Photos' },
      { id: 'sec-body', label: '기사', en: 'Article' },
      { id: 'sec-record', label: '기록', en: 'Splits' },
      { id: 'sec-reporter', label: '기자', en: 'Reporter' },
      { id: 'sec-related', label: '읽을거리', en: 'Read more' },
    ]
    const items = defs
      .map((d) => ({ d, el: el.querySelector<HTMLElement>('#' + d.id), link: null as HTMLAnchorElement | null }))
      .filter((x) => x.el)
    if (!items.length) { nav.remove(); return }

    const ul = document.createElement('ul')
    items.forEach((x) => {
      x.el!.style.scrollMarginTop = '20px'
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = '#' + x.d.id
      a.textContent = EN() ? x.d.en : x.d.label
      a.addEventListener('click', (e) => {
        e.preventDefault()
        x.el!.scrollIntoView({ behavior: 'smooth', block: 'start' })
        history.replaceState(null, '', '#' + x.d.id)
      })
      x.link = a
      li.appendChild(a)
      ul.appendChild(li)
    })
    const rail = document.createElement('div'); rail.className = 'mn-rail'
    const ind = document.createElement('div'); ind.className = 'mn-indicator'
    nav.appendChild(rail); nav.appendChild(ind); nav.appendChild(ul)

    const update = () => {
      const mark = window.scrollY + 130
      let active = 0
      items.forEach((x, i) => {
        const top = x.el!.getBoundingClientRect().top + window.scrollY
        if (top <= mark) active = i
      })
      items.forEach((x, i) => x.link!.classList.toggle('active', i === active))
      const a = items[active].link!
      const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 2)
      if (atBottom) {
        const last = items[items.length - 1].link!
        const start = a.offsetTop + a.offsetHeight / 2 - 8
        ind.style.top = start + 'px'
        ind.style.height = (last.offsetTop + last.offsetHeight / 2 + 8 - start) + 'px'
      } else {
        ind.style.top = (a.offsetTop + a.offsetHeight / 2 - 8) + 'px'
        ind.style.height = '16px'
      }
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    cleanups.push(() => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update) })
    langRefreshers.push(() => items.forEach((x) => { x.link!.textContent = EN() ? x.d.en : x.d.label }))
  })()

  // ── 바이라인 이름 클릭 → 명함 + 제보/기자 카드 토글(평소 숨김) ──
  ;(() => {
    const trigger = el.querySelector<HTMLElement>('#bylineName')
    const box = el.querySelector<HTMLElement>('.art-actions')
    if (!trigger || !box) return
    trigger.setAttribute('aria-expanded', 'false')
    trigger.addEventListener('click', () => {
      const willShow = box.hidden
      box.hidden = !willShow
      trigger.setAttribute('aria-expanded', String(willShow))
      if (willShow) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  })()

  return {
    cleanup: () => cleanups.forEach((fn) => fn()),
    refreshLang: () => langRefreshers.forEach((fn) => fn()),
  }
}
