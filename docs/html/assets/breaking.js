/* 공용 속보(Breaking News) — 모든 페이지가 재사용하는 단일 소스.
 * 역할: ① 화면 최상단 고정 속보 티커(푸터 마퀴와 동일 규격 · 밝은 회색톤, 클릭 시 breakingnews.html)
 *      ② 속보 표준 모달(폭 max-width · 데스크탑 4:3, 모바일 9:16) — window.MBBreaking.open(item)
 * 사용법: 각 페이지에서 header.js 다음에 <script src="assets/breaking.js"></script>
 * 데이터: data/breaking.json (한글 입력 + ~ENG 자동생성 필드, camelCase) */
(function () {
  'use strict';

  var css = `
    /* ── 상단 속보 티커 — 푸터 마퀴(.foot-marquee)와 동일 규격, 배경만 아주 밝은 회색톤.
       고정(fixed) 아님: 문서 흐름 맨 위에 놓여 스크롤하면 그 자리에서 같이 올라가 사라짐 ── */
    .bk-ticker{ display:block; background:#FBFBFB; overflow:hidden; }
    .bk-ticker-inner{ max-width:1200px; margin:0 auto; padding:0 24px; display:flex; align-items:center; height:38px; }   /* 좌우 24px = .wrap과 동일 → 라벨이 본문 좌측 라인과 정렬 */
    .bk-ticker-label{ flex:0 0 auto; font-family:var(--serif,serif); font-size:13px; font-weight:700; line-height:1.6; letter-spacing:normal; color:var(--orange,#FF5A00); padding-right:16px; margin-right:0; border-right:1px solid rgba(26,26,26,.14); }   /* 기사 카테고리(.art-cat)와 동일 폰트·크기 · margin 0 → 글씨가 짝대기에 닿으며 사라짐 */
    .bk-ticker-viewport{ flex:1 1 auto; overflow:hidden; }
    /* 마퀴 오른쪽 끝 짝대기 — 왼쪽(라벨 border)과 동일 규격·높이, 글씨가 여기서 나타남 */
    .bk-ticker-end{ flex:0 0 auto; width:0; height:calc(13px * 1.6); border-left:1px solid rgba(26,26,26,.14); }
    .bk-ticker-track{ display:flex; align-items:center; width:max-content; animation:bk-ticker-scroll 66s linear infinite; }   /* 44s→66s 더 천천히 */
    .bk-ticker:hover .bk-ticker-track{ animation-play-state:paused; }
    .bk-ticker-item{ font-family:var(--serif,serif); font-size:13px; color:var(--ink-soft,#2E2E2E); white-space:nowrap; }
    .bk-ticker-item .bk-flag{ color:var(--orange,#FF5A00); font-weight:700; margin-right:.45em; }
    .bk-ticker-sep{ flex:0 0 auto; color:var(--orange,#FF5A00); font-size:8px; margin:0 20px; }
    @keyframes bk-ticker-scroll{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
    @media (prefers-reduced-motion: reduce){ .bk-ticker-track{ animation:none; } }
    @media (max-width:720px){
      .bk-ticker-inner{ height:34px; }
      .bk-ticker-label{ padding-right:12px; }
      .bk-ticker-item{ font-size:12px; }
      .bk-ticker-sep{ margin:0 16px; }
    }
    @media (max-width:640px){ .bk-ticker-inner{ padding:0 18px; } }   /* .wrap 모바일 패딩(18px)과 동일 정렬 */
    /* ── 속보 모달 — 표준 모달(.foot-modal) 포맷, 크기만 max-width·4:3 (모바일 9:16) ── */
    .bk-modal{ position:fixed; inset:0; z-index:1100; display:none; }
    .bk-modal.open{ display:block; }
    .bk-modal .ov{ position:absolute; inset:0; background:rgba(26,26,26,.34); }
    .bk-modal .box{
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:min(1200px, calc(100% - 40px)); aspect-ratio:4 / 3; max-height:calc(100dvh - 32px);
      background:var(--paper,#fff); border:none; border-radius:0;
      padding:34px 24px 30px; box-shadow:0 18px 50px rgba(26,26,26,.18);   /* 좌우 24px = .wrap과 동일 → 내용 폭이 그리드 max-width 콘텐츠 폭과 일치 */
      font-family:var(--serif,serif); display:flex; flex-direction:column; overflow:auto;
    }
    .bk-modal .modal-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .bk-modal .bk-badge{ font-size:13px; font-weight:700; color:var(--orange,#FF5A00); letter-spacing:.02em; }
    .bk-modal .bk-when{ font-size:12.5px; color:var(--ink-light,#9A9A97); margin-left:10px; font-variant-numeric:tabular-nums; }
    .bk-modal .bk-head-right{ flex:0 0 auto; display:inline-flex; align-items:center; gap:14px; }
    .bk-modal .bk-all{ font-family:var(--serif,serif); font-size:12.5px; color:var(--ink-light,#9A9A97); transition:color .15s; }
    .bk-modal .bk-all:hover{ color:var(--orange,#FF5A00); }
    .bk-modal .x{ flex:0 0 auto; border:none; background:none; cursor:pointer; font-size:20px; line-height:1; color:var(--ink-light,#9A9A97); padding:0; margin:0; }
    .bk-modal .x:hover{ color:var(--ink,#1A1A1A); }
    .bk-modal .bk-title{ font-size:clamp(22px, 3.2vw, 34px); font-weight:700; line-height:1.4; letter-spacing:-.01em; color:var(--ink,#1A1A1A); margin:20px 0 14px; }
    .bk-modal .bk-sub{ font-size:clamp(15px, 1.7vw, 18px); line-height:1.9; color:var(--ink-soft,#2E2E2E); }
    /* 맨 밑 안내 문구 — 기업/언론사형, 살짝 흐리게 */
    .bk-modal .bk-note{ margin-top:auto; padding-top:16px; border-top:1px solid var(--line-soft,#F0F0EE); font-size:12.5px; color:var(--ink-mute,#6A6A68); }
    @media (max-width:640px){
      .bk-modal .box{ aspect-ratio:9 / 16; padding:22px 18px 18px; }   /* 좌우 18px = .wrap 모바일과 동일 */
    }
    /* 인쇄/캡처: 티커·모달 숨김 (푸터 마퀴와 동일 취급) */
    @media print{ .bk-ticker, .bk-modal{ display:none !important; } }
    body.capturing .bk-ticker, body.capturing .bk-modal{ display:none !important; }
  `;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var EN = function () { return !!(window.MB && window.MB.isEN()); };

  // 일시 포맷: "2026-05-22 09:33" → KO "2026년 5월 22일 09시 33분" / EN "22-05-2026 09:33" (dd-mm-yyyy)
  function fmtDT(s) {
    var m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return s || '';
    return EN() ? m[3] + '-' + m[2] + '-' + m[1] + ' ' + m[4] + ':' + m[5]
                : m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일 ' + m[4] + '시 ' + m[5] + '분';
  }
  // 날짜만: KO "2026년 5월 22일" / EN "22-05-2026"
  function fmtD(s) {
    var m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s || '';
    return EN() ? m[3] + '-' + m[2] + '-' + m[1] : m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일';
  }
  var pick = function (it, f) { var v = EN() ? it[f + 'ENG'] : it[f]; return (v == null || v === '') ? (it[f] || '') : v; };
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ── 데이터 로드 (최신순 정렬) ──
  var ITEMS = [];
  var ready = fetch('data/breaking.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; })
    .then(function (arr) {
      ITEMS = (arr || []).slice().sort(function (a, b) { return (a.publishedAt < b.publishedAt) ? 1 : (a.publishedAt > b.publishedAt) ? -1 : 0; });
      return ITEMS;
    });

  // ── 상단 티커 (전체가 하나의 링크 → breakingnews.html) ──
  var ticker = document.createElement('a');
  ticker.className = 'bk-ticker';
  ticker.href = 'breakingnews.html';
  ticker.setAttribute('aria-label', '속보 전체 보기');
  document.body.insertBefore(ticker, document.body.firstChild);   // 문서 흐름 맨 위(헤더 위) — 고정 아님

  function tickerHTML() {
    var flag = EN() ? '[Breaking]' : '[속보]';
    var one = ITEMS.map(function (it) {
      return '<span class="bk-ticker-item"><span class="bk-flag">' + flag + '</span>' + esc(pick(it, 'title')) + '</span>';
    }).join('<span class="bk-ticker-sep">◆</span>');
    if (!one) return '';
    // 끊김 없는 무한 스크롤: 트랙 2벌 (푸터 마퀴와 동일한 -50% 루프)
    var half = one + '<span class="bk-ticker-sep">◆</span>';
    return '<div class="bk-ticker-inner">' +
             '<span class="bk-ticker-label">' + (EN() ? 'Breaking' : '속보') + '</span>' +   /* .art-cat(Meets)과 같은 표기 톤 */
             '<div class="bk-ticker-viewport"><div class="bk-ticker-track">' + half + half + '</div></div>' +
             '<span class="bk-ticker-end" aria-hidden="true"></span>' +   /* 오른쪽 끝 짝대기 */
           '</div>';
  }
  function renderTicker() {
    var h = tickerHTML();
    ticker.innerHTML = h;
    ticker.style.display = h ? '' : 'none';
  }

  // ── 속보 모달 ──
  var modal = document.createElement('div');
  modal.className = 'bk-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '속보');
  modal.innerHTML =
    '<div class="ov" data-close></div>' +
    '<div class="box">' +
      '<div class="modal-head"><span><span class="bk-badge"></span><span class="bk-when"></span></span>' +
        '<span class="bk-head-right">' +
          '<a class="bk-all" href="breakingnews.html"></a>' +
          '<button type="button" class="x" data-close aria-label="닫기">×</button>' +
        '</span></div>' +
      '<h3 class="bk-title"></h3>' +
      '<p class="bk-sub"></p>' +
      '<p class="bk-note"></p>' +
    '</div>';
  document.body.appendChild(modal);

  var curItem = null;
  function fillModal(it) {
    modal.querySelector('.bk-badge').textContent = EN() ? '[Breaking]' : '[속보]';
    modal.querySelector('.bk-when').textContent = fmtDT(it.publishedAt);
    modal.querySelector('.bk-title').textContent = pick(it, 'title');
    modal.querySelector('.bk-sub').textContent = pick(it, 'subtitle');
    modal.querySelector('.bk-note').textContent = EN()
      ? 'This bulletin is a first report issued for timeliness. Full details will follow in subsequent coverage.'
      : '본 속보는 신속한 전달을 위한 1보입니다. 자세한 내용은 후속 기사를 통해 보도됩니다.';
    modal.querySelector('.bk-all').textContent = EN() ? 'All breaking news' : '이 시간 속보 전체 보기';
  }
  function open(it) { curItem = it; fillModal(it); modal.classList.add('open'); }
  function close() { curItem = null; modal.classList.remove('open'); }
  modal.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // ── 언어 전환: 티커·(열려 있으면) 모달 재렌더 ──
  document.addEventListener('mb:lang', function () { renderTicker(); if (curItem) fillModal(curItem); });

  ready.then(renderTicker);

  // 페이지 스크립트용 공개 API
  window.MBBreaking = { ready: ready, open: open, close: close, fmtDT: fmtDT, fmtD: fmtD, pick: pick, items: function () { return ITEMS; } };
})();
