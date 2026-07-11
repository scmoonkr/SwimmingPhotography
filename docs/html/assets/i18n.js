/* 공용 다국어(KOR/ENG) 엔진 — 모든 페이지 <head>에서 header/footer 스크립트보다 먼저 로드.
 * 사용:
 *   - 정적 텍스트: <span data-en="English">한글</span>  → 영어모드에서 자동 교체(한글은 최초 1회 data-ko로 보관)
 *   - JS 렌더 콘텐츠: window.MB.isEN() 로 분기 후, 'mb:lang' 이벤트에서 재렌더
 *   - 언어 전환: window.MB.setLang('en'|'ko')  (localStorage 'mb_lang'에 저장 → 다음 방문에도 유지)
 */
(function () {
  'use strict';
  var KEY = 'mb_lang';
  function get() { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ko'; } catch (e) { return 'ko'; } }

  var MB = window.MB = window.MB || {};
  MB.lang = get;
  MB.isEN = function () { return get() === 'en'; };

  MB.applyI18n = function (root) {
    var en = get() === 'en';
    var scope = root || document;
    // 리프 텍스트: data-en (자식 요소 없는 요소에만 — textContent 교체)
    scope.querySelectorAll('[data-en]').forEach(function (el) {
      if (el.getAttribute('data-ko') === null) el.setAttribute('data-ko', el.textContent);
      el.textContent = en ? el.getAttribute('data-en') : el.getAttribute('data-ko');
    });
    // 컨테이너: data-en-html (자식 span 등을 포함해 통째 교체 — innerHTML 교체)
    scope.querySelectorAll('[data-en-html]').forEach(function (el) {
      if (el.getAttribute('data-ko-html') === null) el.setAttribute('data-ko-html', el.innerHTML);
      el.innerHTML = en ? el.getAttribute('data-en-html') : el.getAttribute('data-ko-html');
    });
    // 속성 번역: data-en-ph (placeholder)
    scope.querySelectorAll('[data-en-ph]').forEach(function (el) {
      if (el.getAttribute('data-ko-ph') === null) el.setAttribute('data-ko-ph', el.getAttribute('placeholder') || '');
      el.setAttribute('placeholder', en ? el.getAttribute('data-en-ph') : el.getAttribute('data-ko-ph'));
    });
  };

  MB.setLang = function (l) {
    l = (l === 'en') ? 'en' : 'ko';
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.classList.toggle('lang-en', l === 'en');
    document.documentElement.setAttribute('lang', l);
    MB.applyI18n();
    document.dispatchEvent(new CustomEvent('mb:lang', { detail: { lang: l, en: l === 'en' } }));
  };

  // 초기 언어 클래스는 가능한 이른 시점에(깜빡임 최소화)
  document.documentElement.classList.toggle('lang-en', get() === 'en');
  document.documentElement.setAttribute('lang', get());

  function init() { MB.applyI18n(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
