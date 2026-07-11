/* 공용 푸터 — 모든 페이지가 동일하게 재사용하는 단일 소스.
 * 사용법: 푸터 위치에 <footer id="site-footer"></footer> 를 두고
 *        그 뒤에 <script src="assets/footer.js"></script> 를 둔다.
 * CSS 변수(--ink, --line 등)는 각 페이지 :root에서 정의된 것을 그대로 사용. */
(function () {
  'use strict';

  var css = `
    .site-foot{ margin-top:var(--frame-gap, 38px); padding:0 0 var(--frame-gap, 38px); font-size:12px; color:var(--ink-mute); line-height:1.8; }
    /* 작은 소메뉴 — 흐릿하게. 항목 간 간격은 메인 메뉴와 동일(글자 사이 18px) */
    .foot-nav{ display:flex; align-items:center; gap:12px; margin-bottom:18px; }
    .foot-nav a{ font-size:12px; color:var(--ink-light); letter-spacing:.02em; transition:color .15s; }
    .foot-nav a:hover{ color:var(--ink); }
    /* 데스크탑에서 메인 그리드 3칸 너비(5칸 그리드 기준: 3칸+2갭 = 60% - 8px). 좁은 화면은 620px/컨테이너로 폴백 */
    .site-foot .promise{ color:var(--ink); margin-bottom:12px; max-width:max(620px, calc(60% - 8px)); }
    .site-foot .legal{ letter-spacing:.01em; }
    /* 등록·발행 정보(등록번호~전화)는 한 단계 더 흐리게 — 잘 안 보이게 */
    .site-foot .legal .reg-detail{ color:#C6C6C3; }
    .site-foot .copy{ color:var(--ink-light); margin-top:4px; }
    /* 발행 로고 — 소개/규약/제보 링크 위. 아래 간격은 nav↔promise와 동일(18px) */
    .site-foot .foot-logo{ margin-bottom:18px; }
    .site-foot .foot-logo a{ display:inline-block; }
    .site-foot .foot-logo img{ display:block; height:50px; width:auto; }
    /* 연락처 안내 i 버튼 — 흐릿한 동글뱅이 */
    .foot-info{
      display:inline-flex; align-items:center; justify-content:center;
      width:12px; height:12px; margin-left:3px; padding:0; vertical-align:super;
      border:1px solid var(--line); border-radius:50%; background:none; cursor:pointer;
      font-family:var(--serif); font-style:italic; font-size:8px; line-height:1;
      color:var(--ink-light); transition:color .15s, border-color .15s;
    }
    .foot-info:hover{ color:var(--ink); border-color:var(--ink-mute); }
    /* 인쇄/PDF: 등록·발행 상세(reg-detail)와 연락처(i), 안내 마퀴·모달 숨김 */
    @media print { .site-foot .reg-detail, .foot-info, .foot-marquee, .foot-modal { display:none !important; } }
    /* ── 모달 기본 포맷 (전 사이트 공통) ── */
    .foot-modal{ position:fixed; inset:0; z-index:1000; display:none; }
    .foot-modal.open{ display:block; }
    .foot-modal .ov{ position:absolute; inset:0; background:rgba(26,26,26,.34); }
    .foot-modal .box{
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:calc(100% - 40px); max-width:440px; background:var(--paper);
      border:1px solid var(--line); border-radius:0; padding:30px 30px 26px;
      box-shadow:0 18px 50px rgba(26,26,26,.18); font-family:var(--serif);
    }
    /* 타이틀 + 닫기(×) 동일선상 */
    .foot-modal .modal-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .foot-modal .modal-head h3{ font-size:16px; font-weight:700; color:var(--ink); margin:0; letter-spacing:-.005em; line-height:1.2; }
    .foot-modal .box p{ font-size:14px; line-height:1.85; color:var(--ink-soft,#2E2E2E); margin:0 0 10px; }
    .foot-modal .box p:last-child{ margin-bottom:0; }
    .foot-modal .box .ig{ color:var(--orange); font-weight:700; }
    .foot-modal .box .cheer{ color:var(--ink-mute); font-size:13px; margin-top:14px; }
    .foot-modal .x{
      flex:0 0 auto; border:none; background:none; cursor:pointer;
      font-size:20px; line-height:1; color:var(--ink-light); padding:0; margin:0;
    }
    .foot-modal .x:hover{ color:var(--ink); }
    /* ── 페이지 맨 아래 안내 마퀴 (design-system 티커 형식. 임시 — 나중에 삭제) ── */
    /* 항상 세로 스크롤바 → 페이지마다 폭·레이아웃 흔들림 방지 */
    html{ overflow-y:scroll; }
    /* 하단 고정 안내 마퀴가 콘텐츠를 가리지 않도록 공간 확보(마퀴 높이) */
    body{ padding-bottom:38px; }
    /* 마퀴는 스크롤 여부와 무관하게 항상 화면 바닥에 고정 */
    .foot-marquee{ position:fixed; left:0; right:0; bottom:0; z-index:900; background:#141414; overflow:hidden; }
    .foot-marquee-inner{ max-width:1200px; margin:0 auto; padding:0 32px; display:flex; align-items:center; height:38px; }
    .foot-marquee-label{ flex:0 0 auto; font-family:var(--sans); font-size:10px; font-weight:700; letter-spacing:.18em; color:var(--orange); text-transform:uppercase; padding-right:16px; margin-right:16px; border-right:1px solid rgba(255,255,255,.18); }
    .foot-marquee-viewport{ flex:1 1 auto; overflow:hidden; }
    .foot-marquee-track{ display:flex; align-items:center; width:max-content; animation:foot-marquee-scroll 44s linear infinite; }
    .foot-marquee-track:hover{ animation-play-state:paused; }
    .foot-marquee-item{ font-family:var(--serif); font-size:13px; color:rgba(255,255,255,.9); white-space:nowrap; }
    .foot-marquee-sep{ flex:0 0 auto; color:var(--orange); font-size:8px; margin:0 20px; }
    @keyframes foot-marquee-scroll{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
    @media (prefers-reduced-motion: reduce){ .foot-marquee-track{ animation:none; } }
    @media (max-width:720px){
      body{ padding-bottom:34px; }
      .foot-marquee-inner{ padding:0 14px; height:34px; }
      .foot-marquee-label{ font-size:9px; padding-right:12px; margin-right:12px; letter-spacing:.14em; }
      .foot-marquee-item{ font-size:12px; }
      .foot-marquee-sep{ margin:0 16px; }
    }
  `;

  var html =
    '<footer class="site-foot">' +
      '<div class="wrap">' +
        '<div class="foot-logo"><a href="index.html" aria-label="홈으로"><img src="images/logo_swimmingphotography.png" alt="수영사진 Swimming Photography" height="50"></a></div>' +
        '<nav class="foot-nav" aria-label="하위 메뉴">' +
          '<a href="introduction.html" data-en="About">소개</a>' +
          '<a href="agreement.html" data-en="Guidelines">규약</a>' +
          '<a href="submission.html" data-en="Submit">제보</a>' +
        '</nav>' +
        '<p class="promise" data-en="All content on Swimming Photography comes from our own on-site reporting or from tips by swimmers whose identity has been verified through trusted institutions. If a source prefers, we vouch for their identity while keeping them anonymous. This project runs in parallel with, but separately from, Medalbank Aquatics, the swimming magazine.">수영사진(Swimming Photography)의 모든 컨텐츠는 직접 취재하거나 또는 신뢰할 수 있는 기관을 통해 본인 인증이 완료된 수영인의 제보를 기반으로 합니다. 제보자가 원치 않는 경우, 신원은 보증하지만 익명으로 처리 할 수 있습니다. 본 프로젝트는 메달뱅크아쿠아틱스 매거진과는 별개로 병행하여 운영됩니다.</p>' +
        '<p class="legal"><span data-en="Swimming Photography · ⓒ 2026 All rights reserved.">수영사진 · Swimming Photography · ⓒ 2026 무단 전재 및 재배포 금지</span><span class="reg-detail" data-en=" · Periodical Reg. No. Incheon,A 33333 · Registered Jun 28, 2026 · Publisher·Editor Seongjung MOON · Published in Incheon · Tel 333-333-3333"> · 정기간행물 등록번호 인천,아 33333호 · 등록연월일 2026년 6월 28일 · 발행·편집인 문성중 · 발행소 인천광역시 · 전화 333-333-3333</span>' +
          '<button type="button" class="foot-info" aria-label="연락처 안내" title="연락처 안내">i</button>' +
        '</p>' +
      '</div>' +
    '</footer>' +
    // 페이지 맨 아래 안내 마퀴 (임시 — 나중에 삭제 예정)
    '<div class="foot-marquee">' +
      '<div class="foot-marquee-inner">' +
        '<span class="foot-marquee-label" data-en="NOTICE">안내</span>' +
        '<div class="foot-marquee-viewport">' +
          '<div class="foot-marquee-track">' +
            '<span class="foot-marquee-item" data-en="This website is currently in testing and is not yet in official operation.">본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.</span>' +
            '<span class="foot-marquee-sep">◆</span>' +
            '<span class="foot-marquee-item" data-en="This website is currently in testing and is not yet in official operation.">본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.</span>' +
            '<span class="foot-marquee-sep">◆</span>' +
            '<span class="foot-marquee-item" data-en="This website is currently in testing and is not yet in official operation.">본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.</span>' +
            '<span class="foot-marquee-sep">◆</span>' +
            '<span class="foot-marquee-item" aria-hidden="true" data-en="This website is currently in testing and is not yet in official operation.">본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.</span>' +
            '<span class="foot-marquee-sep" aria-hidden="true">◆</span>' +
            '<span class="foot-marquee-item" aria-hidden="true" data-en="This website is currently in testing and is not yet in official operation.">본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.</span>' +
            '<span class="foot-marquee-sep" aria-hidden="true">◆</span>' +
            '<span class="foot-marquee-item" aria-hidden="true" data-en="This website is currently in testing and is not yet in official operation.">본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.</span>' +
            '<span class="foot-marquee-sep" aria-hidden="true">◆</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  var modalHtml =
    '<div class="foot-modal" role="dialog" aria-modal="true" aria-label="연락처 안내">' +
      '<div class="ov" data-close></div>' +
      '<div class="box">' +
        '<div class="modal-head">' +
          '<h3 data-en="Contact">연락처 안내</h3>' +
          '<button type="button" class="x" data-close aria-label="닫기">×</button>' +
        '</div>' +
        '<p data-en-html="This is a working contact line, but we may be away on other assignments or on-site reporting, so calls may not always connect. The fastest way to reach us is an Instagram DM: <a class=&quot;ig&quot; href=&quot;https://instagram.com/medalbankaquatics&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;>@medalbankaquatics</a>.">실제 운영되는 운영소의 연락처이지만 타업무 또는 현장 취재로 인한 부재로 연결이 원활하지 않을 수 있습니다. 최대한 빠르게 답장할 수 있는 채널은 인스타그램 DM <a class="ig" href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">@medalbankaquatics</a> 입니다.</p>' +
        '<p data-en="If you have anything to share, feel free to message us. We\'ll get back to you as quickly as we can.">전달사항이 있으실 경우, 편하게 메세지 주세요. 최대한 신속히 처리하겠습니다.</p>' +
        '<p class="cheer" data-en="We cheer for Korean swimming.">대한민국 수영을 응원합니다.</p>' +
      '</div>' +
    '</div>';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var mount = document.getElementById('site-footer');
  if (mount) {
    mount.outerHTML = html;
  }

  // 연락처 안내 모달
  var modalWrap = document.createElement('div');
  modalWrap.innerHTML = modalHtml;
  var modal = modalWrap.firstChild;
  document.body.appendChild(modal);

  function open() { modal.classList.add('open'); }
  function close() { modal.classList.remove('open'); }

  var btn = document.querySelector('.foot-info');
  if (btn) btn.addEventListener('click', open);
  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  if (window.MB) window.MB.applyI18n();   // 주입된 푸터 텍스트에 현재 언어 적용
})();
