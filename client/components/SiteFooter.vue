<script setup lang="ts">
// 공용 푸터 — 하단 티커는 속보(있으면)/안내(없으면)를 표시하고 SSE로 실시간 갱신.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { t, isEN } = useLang()
const modalOpen = ref(false)

const NOTICE = () => t(
  '본 웹사이트는 현재 테스트 과정 중에 있으며 실제로 운영중이지 않습니다.',
  'This website is currently in testing and is not yet in official operation.',
)

// ── 속보 티커 ──
const breaking = ref<{ _id: string; title: string; publishedAt?: string }[]>([])
const hasBreaking = computed(() => breaking.value.length > 0)
const marqueeLabel = computed(() => (hasBreaking.value ? t('속보', 'BREAKING') : t('안내', 'NOTICE')))
// 흐를 항목: 속보 있으면 제목들, 없으면 안내 문구 1개
const marqueeItems = computed(() => (hasBreaking.value ? breaking.value.map((b) => b.title).filter(Boolean) : [NOTICE()]))

let es: EventSource | null = null
onMounted(async () => {
  // 1) 현재 속보 로드
  try {
    const list = await $fetch<any[]>('/api/articles', {
      params: { type: 'breaking_news', status: 'published', limit: 10 },
    })
    breaking.value = (list || []).map((a) => ({
      _id: String(a._id), title: a.translations?.ko?.title || '', publishedAt: a.publishedAt,
    })).filter((b) => b.title)
  } catch {}
  // 2) 실시간 구독 (새 속보 등록 시 즉시 반영)
  try {
    es = new EventSource('/api/stream')
    es.addEventListener('breaking', (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data)
        if (d?.title) breaking.value = [d, ...breaking.value.filter((b) => b._id !== d._id)].slice(0, 20)
      } catch {}
    })
  } catch {}
})
onBeforeUnmount(() => es?.close())
</script>

<template>
  <footer class="site-foot">
    <div class="wrap">
      <div class="foot-logo">
        <NuxtLink to="/" aria-label="홈으로">
          <img src="/images/logo_swimmingphotography.png" alt="수영사진 Swimming Photography" height="50">
        </NuxtLink>
      </div>

      <nav class="foot-nav" aria-label="하위 메뉴">
        <NuxtLink to="/introduction">{{ t('소개', 'About') }}</NuxtLink>
        <NuxtLink to="/agreement">{{ t('규약', 'Guidelines') }}</NuxtLink>
        <NuxtLink to="/submission">{{ t('제보', 'Submit') }}</NuxtLink>
      </nav>

      <p class="promise">{{ t(
        '수영사진(Swimming Photography)의 모든 컨텐츠는 직접 취재하거나 또는 신뢰할 수 있는 기관을 통해 본인 인증이 완료된 수영인의 제보를 기반으로 합니다. 제보자가 원치 않는 경우, 신원은 보증하지만 익명으로 처리 할 수 있습니다. 본 프로젝트는 메달뱅크아쿠아틱스 매거진과는 별개로 병행하여 운영됩니다.',
        'All content on Swimming Photography comes from our own on-site reporting or from tips by swimmers whose identity has been verified through trusted institutions. If a source prefers, we vouch for their identity while keeping them anonymous. This project runs in parallel with, but separately from, Medalbank Aquatics, the swimming magazine.',
      ) }}</p>

      <p class="legal">
        <span>{{ t('수영사진 · Swimming Photography · ⓒ 2026 무단 전재 및 재배포 금지', 'Swimming Photography · ⓒ 2026 All rights reserved.') }}</span>
        <span class="reg-detail">{{ t(
          ' · 정기간행물 등록번호 인천,아 33333호 · 등록연월일 2026년 6월 28일 · 발행·편집인 문성중 · 발행소 인천광역시 · 전화 333-333-3333',
          ' · Periodical Reg. No. Incheon,A 33333 · Registered Jun 28, 2026 · Publisher·Editor Seongjung MOON · Published in Incheon · Tel 333-333-3333',
        ) }}</span>
        <button type="button" class="foot-info" aria-label="연락처 안내" title="연락처 안내" @click="modalOpen = true">i</button>
      </p>
    </div>
  </footer>

  <!-- 하단 고정 티커: 속보(있으면) / 안내(없으면) -->
  <div class="foot-marquee" :class="{ 'is-breaking': hasBreaking }">
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
    </div>
  </div>

  <!-- 연락처 안내 모달 -->
  <div class="foot-modal" :class="{ open: modalOpen }" role="dialog" aria-modal="true" aria-label="연락처 안내" @keydown.esc="modalOpen = false">
    <div class="ov" @click="modalOpen = false" />
    <div class="box">
      <div class="modal-head">
        <h3>{{ t('연락처 안내', 'Contact') }}</h3>
        <button type="button" class="x" aria-label="닫기" @click="modalOpen = false">×</button>
      </div>
      <p>
        <template v-if="!isEN">
          실제 운영되는 운영소의 연락처이지만 타업무 또는 현장 취재로 인한 부재로 연결이 원활하지 않을 수 있습니다. 최대한 빠르게 답장할 수 있는 채널은 인스타그램 DM
          <a class="ig" href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">@medalbankaquatics</a> 입니다.
        </template>
        <template v-else>
          This is a working contact line, but we may be away on other assignments or on-site reporting, so calls may not always connect. The fastest way to reach us is an Instagram DM:
          <a class="ig" href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">@medalbankaquatics</a>.
        </template>
      </p>
      <p>{{ t("전달사항이 있으실 경우, 편하게 메세지 주세요. 최대한 신속히 처리하겠습니다.", "If you have anything to share, feel free to message us. We'll get back to you as quickly as we can.") }}</p>
      <p class="cheer">{{ t('대한민국 수영을 응원합니다.', 'We cheer for Korean swimming.') }}</p>
    </div>
  </div>
</template>

<style scoped>
.site-foot { margin-top: var(--frame-gap); padding: 0 0 var(--frame-gap); font-size: 12px; color: var(--ink-mute); line-height: 1.8; }
.foot-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.foot-nav a { font-size: 12px; color: var(--ink-light); letter-spacing: .02em; transition: color .15s; }
.foot-nav a:hover { color: var(--ink); }
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

/* 하단 안내 마퀴 */
.foot-marquee { position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; background: #141414; overflow: hidden; }
.foot-marquee-inner { max-width: 1200px; margin: 0 auto; padding: 0 32px; display: flex; align-items: center; height: 38px; }
.foot-marquee-label { flex: 0 0 auto; font-family: var(--sans); font-size: 10px; font-weight: 700; letter-spacing: .18em; color: var(--orange); text-transform: uppercase; padding-right: 16px; margin-right: 16px; border-right: 1px solid rgba(255,255,255,.18); }
.foot-marquee-viewport { flex: 1 1 auto; overflow: hidden; }
.foot-marquee-track { display: flex; align-items: center; width: max-content; animation: foot-marquee-scroll 44s linear infinite; }
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
  .foot-marquee-inner { padding: 0 14px; height: 34px; }
  .foot-marquee-label { font-size: 9px; padding-right: 12px; margin-right: 12px; letter-spacing: .14em; }
  .foot-marquee-item { font-size: 12px; }
  .foot-marquee-sep { margin: 0 16px; }
}
</style>
