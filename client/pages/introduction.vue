<script setup lang="ts">
// 소개 페이지 — docs/html/introduction.html 이식.
// 헤더/푸터는 default 레이아웃이, .doc 타이포는 assets/css/main.css 가 담당.
import { computed } from 'vue'

const { t, isEN } = useLang()

useHead({
  title: computed(() => t('소개 — Swimming Photography', 'About — Swimming Photography')),
  meta: [
    {
      name: 'description',
      content:
        'Swimming Photography by Medalbank. 대한민국 모든 영자(泳者)에게 한 편의 신문을 선물합니다. 우리의 정체성과 운영 원칙을 소개합니다.',
    },
  ],
})

// 일곱가지 원칙 — [한글, 영어]
const principles: [string, string][][] = [
  [['호칭', 'Titles'], ['작가 · 글', 'Author · post'], ['기자 · 기사', 'Reporter · article']],
  [['보상 구조', 'Rewards'], ['좋아요 · 팔로우', 'Likes · follows'], ['명예 · 포트폴리오', 'Honor · portfolio']],
  [['독자 참여', 'Reader input'], ['댓글', 'Comments'], ['추가 제보', 'Further tips']],
  [['익명성', 'Anonymity'], ['익명 가능', 'Anonymous allowed'], ['실명제 원칙', 'Real-name policy']],
  [['발행 권한', 'Publishing'], ['본인이 게시', 'Self-posted'], ['편집부 승인 후 발행', 'Published after editorial approval']],
  [['톤', 'Tone'], ['자유', 'Free'], ['신문체 통일', 'Unified newspaper style']],
  [['사진', 'Photos'], ['자유 출처', 'Any source'], ['직접 촬영한 사진만 채택', 'Only our own photographs']],
]

// 기자 시스템 — [강조부, 설명부]
const reporters: [string, string][][] = [
  [['경기기자', 'Meet reporter'], ['대회, 기록, 결과', 'competitions, records, results']],
  [['인물기자', 'People reporter'], ['선수·지도자·마스터즈·꿈나무 인터뷰', 'interviews with athletes, coaches, masters, and youth swimmers']],
  [['현장기자', 'Field reporter'], ['행사, 시설, 동호회 스케치', 'events, facilities, club sketches']],
  [['칼럼니스트', 'Columnist'], ['오피니언, 에세이', 'opinion, essays']],
  [['사진기자', 'Photo reporter'], ['편집부 전용.', 'editorial team only.']],
]

// 세 가지 진입로 — [강조부, 설명부]
const tracks: [string, string][][] = [
  [['제보 트랙', 'Tip track'], ['내용을 제출하면 편집부가 신문체로 기사화하여 「편집부」 바이라인으로 발행합니다.', 'you submit the content, and the editorial team writes it up in newspaper style and publishes it under the “Editorial” byline.']],
  [['기사 트랙', 'Article track'], ['객원기자가 직접 작성하고 편집부가 규격화하여 「OOO 기자」 바이라인으로 발행합니다.', 'a guest reporter writes it, the editorial team standardizes it, and it runs under the “Reporter OOO” byline.']],
  [['꿈나무 트랙', 'Youth track'], ['청소년 수영인이 대한민국 수영의 의미있는 장면을 직접 취재합니다.', 'young swimmers report meaningful moments of Korean swimming themselves.']],
]

const creed: [string, string][] = [
  ['우리는 활용되는 사진을 직접 촬영하고, 내용에 책임을 싣는다.', 'We take the photographs we use ourselves, and we stand behind our content.'],
  ['우리는 기사를 발행함으로써, 기념하고, 기록하고, 보존한다.', 'By publishing articles, we commemorate, record, and preserve.'],
  ['우리는 빠르지 않지만, 가볍지 않으며, 우리는 익명이지 않다.', 'We are not fast, but we are not shallow, and we are not anonymous.'],
  ['우리는 대한민국 모든 영자(泳者)에게 한 편의 신문을 선물한다.', 'We give every swimmer in Korea a newspaper of their own.'],
]
</script>

<template>
  <article class="doc">
    <div class="eyebrow">{{ t('소개', 'About') }}</div>
    <h1>{{ t('수영사진 | Swimming Photography', 'Swimming Photography') }}</h1>
    <p class="lead">{{ t(
      '본 프로젝트는 메달뱅크아쿠아틱스 매거진과는 완전히 별개로, 하지만 항상 병행하여 운영됩니다. 두 프로젝트는 모두 현재진행중이며, 우리는 이 프로젝트를 진행함에 있어, 대한민국 수영을 위해, 수영인의 마음으로 임할 것을 약속드립니다.',
      'This project runs entirely separately from the Medalbank Aquatics magazine, yet always in parallel. Both projects are ongoing, and in running this one we promise to work for Korean swimming, with the heart of a swimmer.',
    ) }}</p>

    <h2>{{ t('우리가 하는 일', 'What we do') }}</h2>
    <p>{{ t(
      '수영사진(Swimming Photography)은 정식 등록을 마친 언론사(현재 등록절차 진행중)로서, 수영을 사랑하는 수영 전문 신문입니다. 우리는 수영 대회에 가고, 수영 사진을 찍고, 수영과 관련된 글을 적습니다. 전국 각지의 수영 이야기를 한 곳에 모아, 모든 수영인의 노력을 보존하고자 합니다.',
      'Swimming Photography is a registered news outlet (registration currently in progress) — a swimming newspaper that loves the sport. We go to swim meets, take swimming photographs, and write about swimming. We gather swimming stories from across the country in one place to preserve the efforts of every swimmer.',
    ) }}</p>
    <p>{{ t(
      '우리가 원하는 것은, 소비하는 콘텐츠가 아닌, 기여하는 저장소입니다. 우리의 사진은 실제의 모습을 담고, 우리의 기사는 현재의 상황을 적습니다. 우리의 기자는 오직 수영만을 기록합니다. 팔로우도 댓글도 필요 없습니다. 오직 수영 이야기만 있습니다.',
      'What we want is not content to consume, but an archive to contribute to. Our photographs capture what really happened; our articles record how things stand now. Our reporters document swimming and nothing else. No follows, no comments — only swimming stories.',
    ) }}</p>
    <p>{{ t(
      '대한민국 수영을 위해 직접 마음을 쓰고, 힘을 보태며, 실천하겠습니다. 여러분의 수영 생활을 응원하고, 기념하며, 축하합니다.',
      'We will care, contribute, and act for Korean swimming ourselves. We support, commemorate, and celebrate your life in the water.',
    ) }}</p>

    <h2>{{ t('우리의 약속', 'Our promise') }}</h2>
    <blockquote class="callout">
      {{ t(
        '수영사진(Swimming Photography)의 모든 컨텐츠는 직접 취재 또는 신뢰할 수 있는 기관을 통해 본인 인증이 완료된 수영인의 제보를 기반으로 합니다. 제보자가 원치 않는 경우, 신원은 보증하지만 익명으로 처리 할 수 있습니다.',
        'All content on Swimming Photography is based on our own reporting or on tips from swimmers whose identity has been verified through trusted institutions. If a source prefers, we vouch for their identity while keeping them anonymous.',
      ) }}
      <span class="src">{{ t(
        '우리는 이 프로젝트를 진행함에 있어, 대한민국 수영을 위해, 수영인의 마음으로 임할 것을 약속드립니다.',
        'In running this project, we promise to work for Korean swimming, with the heart of a swimmer.',
      ) }}</span>
    </blockquote>

    <h2>{{ t('우리가 지키는 일곱가지 원칙', 'The seven principles we keep') }}</h2>
    <p>{{ t(
      '우리의 선택은 일반적인 콘텐츠 플랫폼과 다릅니다. 이 차이가 우리의 정체성을 결정합니다.',
      'Our choices differ from those of ordinary content platforms. That difference defines who we are.',
    ) }}</p>
    <table>
      <thead>
        <tr>
          <th>{{ t('원칙', 'Principle') }}</th>
          <th>{{ t('일반 플랫폼', 'Typical platform') }}</th>
          <th>{{ t('우리의 선택', 'Our choice') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in principles" :key="i">
          <td>{{ t(row[0][0], row[0][1]) }}</td>
          <td>{{ t(row[1][0], row[1][1]) }}</td>
          <td>{{ t(row[2][0], row[2][1]) }}</td>
        </tr>
      </tbody>
    </table>

    <h2>{{ t('기자 시스템', 'The reporter system') }}</h2>
    <p>{{ t(
      '기자는 다섯 개 분야로 나뉘며, 겸직이 가능합니다. 현재는 기자의 채용을 진행하고 있지 않습니다.',
      'Reporters are divided into five fields, and one person may cover more than one. We are not currently recruiting reporters.',
    ) }}</p>
    <ul>
      <li v-for="(r, i) in reporters" :key="i">
        <strong>{{ t(r[0][0], r[0][1]) }}</strong> — {{ t(r[1][0], r[1][1]) }}
      </li>
    </ul>
    <p>
      <template v-if="!isEN">객원기자 신청은 가볍게 받되, 첫 한두 편의 기사가 실질적인 심사가 됩니다. 편집부는 초기 기사를 정성껏 첨삭하며 우리의 톤을 함께 익혀나갑니다. 첫 발행부터 10회까지는 편집부가 규격에 맞추어 원고를 다듬어 발행하는 <strong>학습 기간</strong>이며, 이후에는 직접 규격에 맞추어 작성하게 됩니다.</template>
      <template v-else>We welcome guest-reporter applications casually, but your first one or two articles are the real review. The editorial team carefully edits your early pieces as you learn our tone together. From your first publication through the tenth is a <strong>learning period</strong> in which the editorial team shapes your manuscript to our standards before publishing; after that, you write to the standards yourself.</template>
    </p>

    <h2>{{ t('세 가지 진입로', 'Three ways in') }}</h2>
    <p>{{ t(
      '누구나 세 가지 방식으로 우리 모두의 프로젝트에 참여할 수 있습니다. 현재는 세 트랙 모두 제한한 상태이며, 편집부의 역량으로 운영하고 있습니다.',
      "Anyone can take part in this shared project in three ways. All three tracks are currently limited, and we operate through the editorial team's own capacity.",
    ) }}</p>
    <ul>
      <li v-for="(tr, i) in tracks" :key="i">
        <strong>{{ t(tr[0][0], tr[0][1]) }}</strong> — {{ t(tr[1][0], tr[1][1]) }}
      </li>
    </ul>
    <p>
      <template v-if="!isEN">세 트랙 모두 동일한 신문체와 규격을 적용하므로, 독자는 외관만으로 셋을 구분할 수 없습니다. 자세한 편집 기준은 <NuxtLink to="/agreement" style="color:var(--orange);font-weight:700;">기사 작성 규약</NuxtLink>에서 확인하실 수 있습니다.</template>
      <template v-else>All three tracks apply the same newspaper style and standards, so readers cannot tell them apart by appearance alone. You can find the detailed editorial standards in the <NuxtLink to="/agreement" style="color:var(--orange);font-weight:700;">Article Writing Guidelines</NuxtLink>.</template>
    </p>

    <div class="creed-block">
      <p v-for="(c, i) in creed" :key="i">{{ t(c[0], c[1]) }}</p>
    </div>

    <!-- 광고 (본문 최하단 섹션) -->
    <section class="ad-section" aria-label="광고">
      <h3 class="ad-heading">{{ t('광고', 'Advertisement') }}</h3>
      <div class="ad-slot">ㅍㅇ ㅎㅇㅌ</div>
    </section>
  </article>
</template>
