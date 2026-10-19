<script setup lang="ts">
// 공용 푸터 — 하단 티커는 안내 문구(테스트 안내)를 표시.
import { computed, onMounted, ref } from 'vue'

const modalOpen = ref(false)

// 관리자(대시보드) URL — 환경별(runtimeConfig). dev: localhost:6642 / prod: admin.swimmingphotography.com
const adminUrl = useRuntimeConfig().public.adminUrl

// 로그아웃 — 로그인 중일 때만 '관리자' 다음에 보인다.
// 로그인 여부는 브라우저에서 한 번 확인한다(서버 렌더링 때는 묻지 않는다 — 공개 페이지 응답이 방문자마다 달라지지 않게).
const { user, ensure, logout } = useAuth()
const route = useRoute()
onMounted(() => { ensure() })
const loggingOut = ref(false)
const onLogout = async () => {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await logout()
    // 로그인해야 보는 화면(작업용)에 있었다면 홈으로 보낸다
    if (route.meta?.middleware === 'auth' || (Array.isArray(route.meta?.middleware) && route.meta.middleware.includes('auth'))) await navigateTo('/')
  } finally {
    loggingOut.value = false
  }
}

const NOTICE = () => '본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.'

// ── 하단 티커: 안내 문구 (테스트 안내) ──
const marqueeLabel = computed(() => '안내')
const marqueeItems = computed(() => [NOTICE()])
</script>

<template>
  <footer class="site-foot">
    <div class="wrap">
      <div class="foot-logo">
        <NuxtLink to="/" aria-label="홈으로">
          <img :src="'/images/logo_swimmingphotography.png'" alt="수영사진 Swimming Photography" height="50">
        </NuxtLink>
      </div>

      <nav class="foot-nav" aria-label="하위 메뉴">
        <NuxtLink to="/introduction">소개</NuxtLink>
        <NuxtLink to="/agreement">규약</NuxtLink>
        <NuxtLink to="/submission">제보</NuxtLink>
        <a class="fn-admin" :href="adminUrl">관리자</a>
        <!-- 로그인 중이면 로그아웃 -->
        <button v-if="user" class="fn-logout" type="button" :disabled="loggingOut" :title="user.name || user.username" @click="onLogout">로그아웃</button>
      </nav>

      <p class="promise">수영사진(Swimming Photography)의 모든 컨텐츠는 직접 취재하거나 또는 신뢰할 수 있는 기관을 통해 본인 인증이 완료된 수영인의 제보를 기반으로 합니다. 제보자가 원치 않는 경우, 신원은 보증하지만 익명으로 처리 할 수 있습니다. 본 프로젝트는 메달뱅크아쿠아틱스 매거진과는 별개로 병행하여 운영됩니다.</p>

      <p class="legal">
        <span>수영사진 · Swimming Photography · ⓒ 2026 무단 전재 및 재배포 금지</span>
        <!-- <span class="reg-detail"> · 정기간행물 등록번호 인천,아 33333호 · 등록연월일 2026년 6월 28일 · 발행·편집인 문성중 · 발행소 인천광역시 · 전화 333-333-3333</span> -->
        <!-- <button type="button" class="foot-info" aria-label="연락처 안내" title="연락처 안내" @click="modalOpen = true">i</button> -->
      </p>
    </div>
  </footer>

  <!-- 하단 티커: 기사(있으면) / 안내(없으면) -->
  <div class="foot-marquee">
    <div class="foot-marquee-inner">
      <span class="foot-marquee-label">{{ marqueeLabel }}</span>
      <div class="foot-marquee-viewport">
        <!-- 끊김 없는 루프를 위해 항목 목록을 2번 렌더 -->
        <div class="foot-marquee-track" :key="marqueeItems.join('|')">
          <template v-for="copy in 2" :key="copy">
            <template v-for="(item, i) in marqueeItems" :key="copy + '-' + i">
              <span class="foot-marquee-item" :aria-hidden="copy === 2 ? 'true' : undefined">{{ item }}</span>
              <span class="foot-marquee-sep" :aria-hidden="copy === 2 ? 'true' : undefined">◆</span>
            </template>
          </template>
        </div>
      </div>
      <span class="foot-marquee-end" aria-hidden="true" />
    </div>
  </div>

  <!-- 연락처 안내 모달 -->
  <div class="foot-modal" :class="{ open: modalOpen }" role="dialog" aria-modal="true" aria-label="연락처 안내" @keydown.esc="modalOpen = false">
    <div class="ov" @click="modalOpen = false" />
    <div class="box">
      <div class="modal-head">
        <h3>연락처 안내</h3>
        <button type="button" class="x" aria-label="닫기" @click="modalOpen = false">×</button>
      </div>
      <p>
        실제 운영되는 운영소의 연락처이지만 타업무 또는 현장 취재로 인한 부재로 연결이 원활하지 않을 수 있습니다. 최대한 빠르게 답장할 수 있는 채널은 인스타그램 DM
        <a class="ig" href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">@medalbankaquatics</a> 입니다.
      </p>
      <p>전달사항이 있으실 경우, 편하게 메세지 주세요. 최대한 신속히 처리하겠습니다.</p>
      <p class="cheer">대한민국 수영을 응원합니다.</p>
    </div>
  </div>
</template>

<style scoped>
.site-foot { margin-top: var(--frame-gap); padding: 0 0 var(--frame-gap); font-size: 12px; color: var(--ink-mute); line-height: 1.8; }
.foot-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.foot-nav a { font-size: 12px; color: var(--ink-light); letter-spacing: .02em; transition: color .15s; }
.foot-nav a:hover { color: var(--ink); }
/* 로그아웃 — 링크들과 같은 글자 모양의 단추 */
.foot-nav .fn-logout { font: inherit; font-size: 12px; letter-spacing: .02em; color: var(--ink-light); background: none; border: none; padding: 0; cursor: pointer; transition: color .15s; }
.foot-nav .fn-logout:hover:not(:disabled) { color: var(--ink); }
.foot-nav .fn-logout:disabled { opacity: .5; cursor: default; }
.foot-nav .fn-admin { color: #C6C6C3; }   /* 관리자 — 한 단계 더 흐리게 (reg-detail과 동일 톤). backend 진입점 */
.site-foot .promise { color: var(--ink); margin-bottom: 12px; max-width: max(620px, calc(60% - 8px)); }
.site-foot .legal { letter-spacing: .01em; }
.site-foot .legal .reg-detail { color: #C6C6C3; }
.site-foot .copy { color: var(--ink-light); margin-top: 4px; }
.site-foot .foot-logo { margin-bottom: 18px; }
.site-foot .foot-logo a { display: inline-block; }
.site-foot .foot-logo img { display: block; height: 50px; width: auto; }

.foot-info {
  display: inline-flex; align-items: center; justify-content: center;
  width: 12px; height: 12px; margin-left: 3px; padding: 0; vertical-align: super;
  border: 1px solid var(--line); border-radius: 50%; background: none; cursor: pointer;
  font-family: var(--serif); font-style: italic; font-size: 8px; line-height: 1;
  color: var(--ink-light); transition: color .15s, border-color .15s;
}
.foot-info:hover { color: var(--ink); border-color: var(--ink-mute); }
@media print { .site-foot .reg-detail, .foot-info, .foot-marquee, .foot-modal { display: none !important; } }

/* 모달 */
.foot-modal { position: fixed; inset: 0; z-index: 1000; display: none; }
.foot-modal.open { display: block; }
.foot-modal .ov { position: absolute; inset: 0; background: rgba(26,26,26,.34); }
.foot-modal .box {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: calc(100% - 40px); max-width: 440px; background: var(--paper);
  border: 1px solid var(--line); border-radius: 0; padding: 30px 30px 26px;
  box-shadow: 0 18px 50px rgba(26,26,26,.18); font-family: var(--serif);
}
.foot-modal .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.foot-modal .modal-head h3 { font-size: 16px; font-weight: 700; color: var(--ink); margin: 0; letter-spacing: -.005em; line-height: 1.2; }
.foot-modal .box p { font-size: 14px; line-height: 1.85; color: var(--ink-soft); margin: 0 0 10px; }
.foot-modal .box p:last-child { margin-bottom: 0; }
.foot-modal .box :deep(.ig) { color: var(--orange); font-weight: 700; }
.foot-modal .box .cheer { color: var(--ink-mute); font-size: 13px; margin-top: 14px; }
.foot-modal .x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 20px; line-height: 1; color: var(--ink-light); padding: 0; margin: 0; }
.foot-modal .x:hover { color: var(--ink); }

/* 하단 안내 마퀴 — 고정(fixed) 아님: 푸터 뒤 문서 흐름 맨 아래에 놓여 스크롤해야 보임 (상단 속보 티커와 통일) */
.foot-marquee { background: #141414; overflow: hidden; }
.foot-marquee-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; height: 38px; }   /* 좌우 24px = .wrap과 동일 */
.foot-marquee-label { flex: 0 0 auto; font-family: var(--serif); font-size: 13px; font-weight: 700; line-height: 1.6; letter-spacing: normal; color: var(--orange); padding-right: 16px; margin-right: 0; border-right: 1px solid rgba(255,255,255,.18); }
.foot-marquee-viewport { flex: 1 1 auto; overflow: hidden; }
.foot-marquee-end { flex: 0 0 auto; width: 0; height: calc(13px * 1.6); border-left: 1px solid rgba(255,255,255,.18); }   /* 오른쪽 끝 짝대기 — 라벨 border와 동일 규격 */
.foot-marquee-track { display: flex; align-items: center; width: max-content; animation: foot-marquee-scroll 66s linear infinite; }
.foot-marquee-track:hover { animation-play-state: paused; }
.foot-marquee-item { font-family: var(--serif); font-size: 13px; color: rgba(255,255,255,.9); white-space: nowrap; }
.foot-marquee-sep { flex: 0 0 auto; color: var(--orange); font-size: 8px; margin: 0 20px; }
@keyframes foot-marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* 속보 모드 강조 */
.foot-marquee.is-breaking { background: #1a0d07; }
.foot-marquee.is-breaking .foot-marquee-label { color: #fff; background: var(--orange); padding: 3px 9px; border-radius: 3px; border-right: none; margin-right: 16px; }
.foot-marquee.is-breaking .foot-marquee-item { color: #fff; font-weight: 500; }
@media (prefers-reduced-motion: reduce) { .foot-marquee-track { animation: none; } }
@media (max-width: 720px) {
  .foot-marquee-inner { height: 34px; }
  .foot-marquee-label { padding-right: 12px; }
  .foot-marquee-item { font-size: 12px; }
  .foot-marquee-sep { margin: 0 16px; }
}
@media (max-width: 640px) { .foot-marquee-inner { padding: 0 18px; } }   /* .wrap 모바일 패딩(18px)과 정렬 */
</style>
