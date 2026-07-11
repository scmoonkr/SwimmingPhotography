/* 공용 헤더 — 모든 페이지가 동일하게 재사용하는 단일 소스.
 * 사용법: 헤더 위치에 <header id="site-header"></header> 를 두고
 *        그 뒤에 <script src="assets/header.js"></script> 를 둔다.
 * CSS 변수(--ink, --orange 등)는 각 페이지 :root에서 정의된 것을 그대로 사용. */
(function () {
  'use strict';

  // favicon (전 페이지 공용) — 없으면 주입
  if (!document.querySelector('link[rel="icon"]')) {
    var fav = document.createElement('link');
    fav.rel = 'icon'; fav.type = 'image/png'; fav.href = 'images/favicon.png';
    document.head.appendChild(fav);
  }

  var css = `
    /* 골격 규격: 헤더 상·하 패딩 = 사이드바/레이아웃 간격의 단일 소스 (브레이크포인트마다 함께 변동) */
    :root{ --frame-gap:38px; }
    /* 전체 골격 통일 — 스크롤바를 항상 강제로 표시해 페이지 간 뷰포트 폭을 고정(콘텐츠가 좌우로 흔들리지 않음) */
    html{ overflow-y:scroll; scrollbar-gutter:stable; }
    .site-head{ display:flex; justify-content:space-between; align-items:flex-end; gap:16px; padding-top:var(--frame-gap); padding-bottom:var(--frame-gap); }   /* 하단정렬 → 토글이 태그라인과 같은 줄높이(오른쪽) · 상·하 패딩 동일로 콘텐츠 시작점 고정 */
    /* 언어 토글 — index.html 그리드/리스트 토글과 동일한 dim/bold·스프링·hover 프리뷰. 태그라인과 같은 줄높이 */
    .lang-toggle{ flex:0 0 auto; font-family:var(--serif); font-size:13px; line-height:1.4; background:none; border:none; padding:0; cursor:pointer; color:var(--ink-light); }
    .lang-toggle .lt-inner{ display:inline-flex; will-change:transform; }
    .lang-toggle .lt-word{ color:var(--ink-light); font-weight:500; }
    .lang-toggle .lt-word.is-cur{ color:var(--ink); font-weight:700; }   /* 현재 언어 = 진하게 */
    .lang-toggle .lt-sep{ color:var(--ink-light); margin:0 .3em; }   /* 그리드/리스트 토글의 · 구분자와 동일 */
    .lang-toggle:hover .lt-word:not(.is-cur),
    .lang-toggle:hover .lt-sep{ color:var(--ink-mute); }
    /* 기본부터 그라데이션(글자에 클립). 평소엔 그라데이션이 계속 흐르고, hover 시 그 자리에서 멈춤 */
    .logo{
      font-family:var(--serif); font-weight:700; font-size:26px; line-height:1.2; letter-spacing:.01em;
      display:inline-block; padding-bottom:0.18em;
      background: linear-gradient(90deg, var(--ink) 0%, var(--orange) 50%, var(--ink) 100%);
      background-size:200% auto; background-position:0% center;
      -webkit-background-clip:text; background-clip:text;
      -webkit-text-fill-color:transparent; color:transparent;
      animation: logo-shine 4s linear infinite;
    }
    .logo:hover{ animation-play-state: paused; }
    @keyframes logo-shine{ 0%{ background-position:0% center; } 100%{ background-position:-200% center; } }
    .tagline{ font-family:var(--serif); font-size:13px; line-height:1.4; color:var(--ink-mute); margin-top:6px; letter-spacing:.01em; }
    @media (max-width:640px){ :root{ --frame-gap:28px; } .logo{ font-size:23px; } }
  `;

  var html =
    '<header class="site-head wrap">' +
      '<div class="head-main">' +
        '<a class="logo" href="index.html" lang="ko">Swimmingphotography<span>.com</span></a>' +   /* lang="ko" 고정 → 한/영 전환 시 로고 글자 간격 불변(한글 기준) */
        '<p class="tagline" data-en="A newspaper for every swimmer in Korea.">대한민국 모든 영자(泳者)에게 한 편의 신문을 선물합니다.</p>' +
      '</div>' +
      '<button type="button" class="lang-toggle" data-lang-toggle aria-label="Language / 언어">' +
        '<span class="lt-inner">' +
          '<span class="lt-word lt-ko"></span><span class="lt-sep" aria-hidden="true"></span><span class="lt-word lt-en"></span>' +
        '</span>' +
      '</button>' +
    '</header>';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var mount = document.getElementById('site-header');
  if (mount) {
    mount.outerHTML = html;
  }

  // 언어 토글 — index.html 그리드/리스트 토글과 동일한 dim/bold·스프링·hover 프리뷰
  var toggle = document.querySelector('[data-lang-toggle]');
  if (toggle && window.MB) {
    var ltInner = toggle.querySelector('.lt-inner');
    var ltKo = toggle.querySelector('.lt-ko');
    var ltEn = toggle.querySelector('.lt-en');
    var ltSep = toggle.querySelector('.lt-sep');
    // 표시 언어별 라벨: 한국어 모드 = "한국어 영어"(공백), 영어 모드 = "KOR, ENG"(쉼표)
    var LT = { ko: { ko: '한국어', en: '영어', sep: '·' }, en: { ko: 'KOR', en: 'ENG', sep: '·' } };
    var ltRM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ltAnim = null;
    function renderLang(mode) {   // mode = 표시할 언어 · 현재 언어 = 진하게(is-cur)
      var L = LT[mode];
      if (ltKo) { ltKo.textContent = L.ko; ltKo.classList.toggle('is-cur', mode === 'ko'); }
      if (ltEn) { ltEn.textContent = L.en; ltEn.classList.toggle('is-cur', mode === 'en'); }
      if (ltSep) ltSep.textContent = L.sep;
    }
    function ltSpring() {   // 그리드/리스트 springSwap과 동일 (오른쪽에서 슬라이드 인 + 탄성 오버슈트)
      if (!ltInner || ltRM) return;
      if (ltAnim) ltAnim.cancel();
      ltAnim = ltInner.animate([
        { transform: 'translateX(20px)', opacity: 0.15 },
        { transform: 'translateX(0px)',  opacity: 1, offset: 0.45 },
        { transform: 'translateX(-7px)', offset: 0.62 },
        { transform: 'translateX(4px)',  offset: 0.77 },
        { transform: 'translateX(-2px)', offset: 0.89 },
        { transform: 'translateX(0)' }
      ], { duration: 720, easing: 'ease-out' });
    }
    function ltExit() {   // 그리드/리스트 exitSwap과 동일 (mouse-out 부드러운 복귀)
      if (!ltInner || ltRM) return;
      if (ltAnim) ltAnim.cancel();
      ltAnim = ltInner.animate([
        { transform: 'translateX(9px)', opacity: 0.5 },
        { transform: 'translateX(0)',   opacity: 1 }
      ], { duration: 560, easing: 'ease-out' });
    }
    var curLang = function () { return window.MB.isEN() ? 'en' : 'ko'; };
    renderLang(curLang());
    // hover: 반대 언어 미리보기 + 스프링 · out: 원복 · click: 실제 전환 — 그리드/리스트와 동일
    toggle.addEventListener('mouseenter', function () { renderLang(curLang() === 'en' ? 'ko' : 'en'); ltSpring(); });
    toggle.addEventListener('mouseleave', function () { renderLang(curLang()); ltExit(); });
    toggle.addEventListener('click', function () { window.MB.setLang(curLang() === 'en' ? 'ko' : 'en'); renderLang(curLang()); ltSpring(); });
    document.addEventListener('mb:lang', function () { renderLang(curLang()); });
  }
  if (window.MB) window.MB.applyI18n();
})();
