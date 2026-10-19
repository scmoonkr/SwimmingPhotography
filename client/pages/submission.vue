<script setup lang="ts">
// 제보 페이지 — docs/html/submission.html 이식.
import { computed, ref } from 'vue'

const modalOpen = ref(false)

useHead({
  title: computed(() => '제보 — Swimming Photography'),
  meta: [
    {
      name: 'description',
      content:
        'Swimming Photography by Medalbank 제보. 당신의 수영 이야기, 대회 소식, 현장 기록을 제보해 주세요. 한 편의 기사가 되어 아카이브에 남습니다.',
    },
  ],
})
</script>

<template>
  <article class="doc">
    <div class="eyebrow">Tip-off</div>
    <h1>제보</h1>
    <p class="lead">당신의 수영 이야기, 대회 소식, 현장의 한 장면을 제보해 주세요. 작은 제보 하나가 한 편의 기사가 되어 아카이브에 남습니다.</p>

    <p style="margin-top:28px;">
      <a class="cta" href="#" @click.prevent="modalOpen = true">제보하기</a>
    </p>

    <h2>이렇게 진행됩니다</h2>
    <ul>
      <li>아래 「제보하기」를 눌러 양식에 내용을 작성합니다. 본인 인증을 거쳐 제출됩니다.</li>
      <li>편집부가 사실관계를 확인하고 신문체로 기사화합니다.</li>
      <li>편집부 승인 후 발행되며, 추가 협의가 필요하면 이메일로 연락드립니다.</li>
    </ul>

    <h2>이런 내용을 환영합니다</h2>
    <ul>
      <li>대회 결과·기록·현장 분위기</li>
      <li>선수·지도자·마스터즈·꿈나무의 이야기</li>
      <li>수영 시설, 동호회, 행사 소식</li>
      <li>직접 촬영한 사진과 그 사진에 담긴 이야기</li>
    </ul>
    <p class="muted" style="font-size:14px;">사진을 함께 보내실 경우, 가능하면 본인이 직접 촬영한 사진 한 장과 촬영일·장소를 알려주세요.</p>

    <h2>익명 제보</h2>
    <blockquote class="callout">
      제보자가 원치 않는 경우, 신원은 보증하되 익명으로 처리합니다. 익명을 선택하시면 바이라인에는 「편집부」만 표기됩니다.
      <span class="src">우리는 오직 대한민국 수영을 위해, 수영인의 마음으로만 임합니다.</span>
    </blockquote>

    <div class="note">
      모든 제보·신청·기사 제출은 양식을 통해 받습니다. 양식 제출 이후 추가 협의가 필요할 경우 편집부에서 이메일로 연락드립니다.
      정식 문의는 <a href="mailto:press@medalbank.com" style="color:var(--orange);font-weight:700;">press@medalbank.com</a> 으로도 가능합니다.
    
    </div>

    <p style="margin-top:28px;">
      <a class="cta" href="#" @click.prevent="modalOpen = true">제보하기</a>
      <NuxtLink class="cta ghost" to="/introduction" style="margin-left:8px;">소개 먼저 보기</NuxtLink>
    </p>

    <p class="muted" style="font-size:13.5px;margin-top:32px;">본 프로젝트는 메달뱅크아쿠아틱스 매거진과는 별개로 병행하여 운영됩니다. 두 프로젝트는 모두 현재진행중이며, 우리는 이 프로젝트를 진행함에 있어, 대한민국 수영을 위해, 수영인의 마음으로 임할 것을 약속드립니다.</p>

    <!-- 광고 (본문 최하단 섹션) -->
    <section class="ad-section" aria-label="광고">
      <h3 class="ad-heading">광고</h3>
      <div class="ad-slot">ㅍㅇ ㅎㅇㅌ</div>
    </section>
  </article>

  <!-- 제보 안내 모달 -->
  <div class="foot-modal" :class="{ open: modalOpen }" role="dialog" aria-modal="true" aria-label="제보 안내" @keydown.esc="modalOpen = false">
    <div class="ov" @click="modalOpen = false" />
    <div class="box">
      <div class="modal-head">
        <h3>제보 안내</h3>
        <button type="button" class="x" aria-label="닫기" @click="modalOpen = false">×</button>
      </div>
      <p>현재는 제보를 받지 않고 있습니다. 모든 제보와 관련된 트랙을 제한한 상태로, 편집부의 역량으로만 운영하고 있습니다.</p>
      <p>추후 제보 채널이 다시 열리면 안내드리겠습니다. 대한민국 수영을 응원합니다.</p>
    </div>
  </div>
</template>

<style scoped>
/* 제보 안내 모달 — footer.js 의 .foot-modal 규격 재사용(이 페이지 로컬) */
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
.foot-modal .x { flex: 0 0 auto; border: none; background: none; cursor: pointer; font-size: 20px; line-height: 1; color: var(--ink-light); padding: 0; margin: 0; }
.foot-modal .x:hover { color: var(--ink); }
</style>
