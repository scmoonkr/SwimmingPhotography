<script setup lang="ts">
// 공용 속보 상단 티커 + 표준 모달 — docs/html/assets/breaking.js 이식.
// ① 문서 흐름 맨 위(헤더 위)에 놓이는 밝은 회색 티커(고정 아님 → 스크롤하면 같이 올라가 사라짐), 클릭 시 /breakingnews
// ② 속보 표준 모달 (max-width · 데스크탑 4:3, 모바일 9:16) — useBreaking().open(item) 으로 열림
import { computed, onBeforeUnmount, onMounted } from 'vue'

const { isEN, t } = useLang()
const { items, hasItems, openItem, load, pick, fmtDT, close } = useBreaking()

onMounted(load)

const flag = computed(() => (isEN.value ? '[Breaking]' : '[속보]'))

// 모달 본문
const noteText = computed(() => (isEN.value
  ? 'This bulletin is a first report issued for timeliness. Full details will follow in subsequent coverage.'
  : '본 속보는 신속한 전달을 위한 1보입니다. 자세한 내용은 후속 기사를 통해 보도됩니다.'))

// ESC 로 닫기
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- 상단 티커 (전체가 하나의 링크 → /breakingnews) -->
  <NuxtLink v-show="hasItems" class="bk-ticker" to="/breakingnews" aria-label="속보 전체 보기">
    <div class="bk-ticker-inner">
      <span class="bk-ticker-label">{{ t('속보', 'Breaking') }}</span>
      <div class="bk-ticker-viewport">
        <!-- 끊김 없는 무한 스크롤: 트랙 2벌(-50% 루프) -->
        <div class="bk-ticker-track">
          <template v-for="copy in 2" :key="copy">
            <template v-for="(it, i) in items" :key="copy + '-' + i">
              <span class="bk-ticker-item"><span class="bk-flag">{{ flag }}</span>{{ pick(it, 'title') }}</span>
              <span class="bk-ticker-sep" aria-hidden="true">◆</span>
            </template>
          </template>
        </div>
      </div>
      <span class="bk-ticker-end" aria-hidden="true" />
    </div>
  </NuxtLink>

  <!-- 속보 모달 -->
  <div class="bk-modal" :class="{ open: !!openItem }" role="dialog" aria-modal="true" aria-label="속보">
    <div class="ov" @click="close" />
    <div v-if="openItem" class="box">
      <div class="modal-head">
        <span><span class="bk-badge">{{ flag }}</span><span class="bk-when">{{ fmtDT(openItem.publishedAt) }}</span></span>
        <span class="bk-head-right">
          <NuxtLink class="bk-all" to="/breakingnews" @click="close">{{ t('이 시간 속보 전체 보기', 'All breaking news') }}</NuxtLink>
          <button type="button" class="x" aria-label="닫기" @click="close">×</button>
        </span>
      </div>
      <h3 class="bk-title">{{ pick(openItem, 'title') }}</h3>
      <p class="bk-sub">{{ pick(openItem, 'subtitle') }}</p>
      <p class="bk-note">{{ noteText }}</p>
    </div>
  </div>
</template>

<style>
/* ── 상단 속보 티커 — 푸터 마퀴와 동일 규격, 배경만 아주 밝은 회색톤 (고정 아님) ── */
.bk-ticker { display: block; background: #FBFBFB; overflow: hidden; }
.bk-ticker-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; height: 38px; }
.bk-ticker-label { flex: 0 0 auto; font-family: var(--serif); font-size: 13px; font-weight: 700; line-height: 1.6; letter-spacing: normal; color: var(--orange); padding-right: 16px; margin-right: 0; border-right: 1px solid rgba(26,26,26,.14); }
.bk-ticker-viewport { flex: 1 1 auto; overflow: hidden; }
.bk-ticker-end { flex: 0 0 auto; width: 0; height: calc(13px * 1.6); border-left: 1px solid rgba(26,26,26,.14); }
.bk-ticker-track { display: flex; align-items: center; width: max-content; animation: bk-ticker-scroll 66s linear infinite; }
.bk-ticker:hover .bk-ticker-track { animation-play-state: paused; }
.bk-ticker-item { font-family: var(--serif); font-size: 13px; color: var(--ink-soft); white-space: nowrap; }
.bk-ticker-item .bk-flag { color: var(--orange); font-weight: 700; margin-right: .45em; }
.bk-ticker-sep { flex: 0 0 auto; color: var(--orange); font-size: 8px; margin: 0 20px; }
@keyframes bk-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .bk-ticker-track { animation: none; } }
@media (max-width: 720px) {
  .bk-ticker-inner { height: 34px; }
  .bk-ticker-label { padding-right: 12px; }
  .bk-ticker-item { font-size: 12px; }
  .bk-ticker-sep { margin: 0 16px; }
}
@media (max-width: 640px) { .bk-ticker-inner { padding: 0 18px; } }

/* ── 속보 모달 — 표준 모달 포맷, 크기만 max-width·4:3 (모바일 9:16) ── */
.bk-modal { position: fixed; inset: 0; z-index: 1100; display: none; }
.bk-modal.open { display: block; }
.bk-modal .ov { position: absolute; inset: 0; background: rgba(26,26,26,.34); }
.bk-modal .box {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: min(1200px, calc(100% - 40px)); aspect-ratio: 4 / 3; max-height: calc(100dvh - 32px);
  background: var(--paper); border: none; border-radius: 0;
  padding: 34px 24px 30px; box-shadow: 0 18px 50px rgba(26,26,26,.18);
  font-family: var(--serif); display: flex; flex-direction: column; overflow: auto;
}
.bk-modal .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bk-modal .bk-badge { font-size: 13px; font-weight: 700; color: var(--orange); letter-spacing: .02em; }
.bk-modal .bk-when { font-size: 12.5px; color: var(--ink-light); margin-left: 10px; font-variant-numeric: tabular-nums; }
.bk-modal .bk-head-right { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 14px; }
.bk-modal .bk-all { font-family: var(--serif); font-size: 12.5px; color: var(--ink-light); transition: color .15s; }
.bk-modal .bk-all:hover { color: var(--orange); }
.bk-modal .x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 20px; line-height: 1; color: var(--ink-light); padding: 0; margin: 0; }
.bk-modal .x:hover { color: var(--ink); }
.bk-modal .bk-title { font-size: clamp(22px, 3.2vw, 34px); font-weight: 700; line-height: 1.4; letter-spacing: -.01em; color: var(--ink); margin: 20px 0 14px; }
.bk-modal .bk-sub { font-size: clamp(15px, 1.7vw, 18px); line-height: 1.9; color: var(--ink-soft); }
.bk-modal .bk-note { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--line-soft); font-size: 12.5px; color: var(--ink-mute); }
@media (max-width: 640px) {
  .bk-modal .box { aspect-ratio: 9 / 16; padding: 22px 18px 18px; }
}
@media print { .bk-ticker, .bk-modal { display: none !important; } }
</style>
