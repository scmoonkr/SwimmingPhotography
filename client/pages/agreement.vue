<script setup lang="ts">
// 기사 작성 규약 — 원문 data-en HTML 대신 t() 기반 Vue 템플릿으로 직접 작성.
import { computed } from 'vue'

const { t } = useLang()

useHead({
  title: computed(() => t('기사 작성 규약 — Swimming Photography', 'Article Writing Guidelines — Swimming Photography')),
  meta: [
    {
      name: 'description',
      content: 'Swimming Photography by Medalbank 기사 작성 규약. 모든 기사가 준수하는 신문체와 편집 기준을 정합니다.',
    },
  ],
})
</script>

<template>
  <div>
    <article class="doc">
          <div class="eyebrow">Editorial Standards · Version 2.0</div>
          <h1>{{ t('기사 작성 규약', 'Article Writing Guidelines') }}</h1>
          <p class="lead">{{ t('수영사진(이하 Swimming Photography)에 게재되는 모든 기사가 준수해야 할 편집 기준을 정합니다. 편집부가 직접 취재한 기사, 제보를 바탕으로 편집부가 작성한 기사, 객원기자가 작성한 기사, 모두 본 규약의 적용을 받습니다.', 'These guidelines set the editorial standards that every article published by Swimming Photography must follow. Articles reported directly by the editorial team, articles written by the editorial team from tips, and articles written by guest reporters are all subject to these guidelines.') }}</p>


        <!-- ──── 머리말 ──── -->
        <section id="preface">
          <h2>{{ t('머리말', 'Preface') }}</h2>
          <div class="preface">
            <h3>{{ t('본 규약의 목적', 'Purpose of these guidelines') }}</h3>
            <p>{{ t('본 규약은 Swimming Photography에서 발행되는 모든 기사가 준수해야 할 편집 기준을 정한다. Swimming Photography by Medalbank는 정식 등록된 정기간행물 발행 언론사(현재 등록절차 진행중)로서, 본 규약을 통해 기사의 정확성·일관성·품격을 유지하며 독자와 취재원 모두에 대한 책임을 다한다.', 'These guidelines set the editorial standards that every article published by Swimming Photography must follow. Swimming Photography by Medalbank is a registered periodical news publisher (registration currently in progress); through these guidelines it maintains the accuracy, consistency, and dignity of its articles and fulfills its responsibility to both readers and sources.') }}</p>
            <p>{{ t('본 규약은 한국기자협회 윤리강령 및 실천요강, 신문윤리실천요강, 인권보도준칙을 비롯한 국내 언론 단체의 표준과, AP·Reuters·Economist·BBC 등 국제 언론사의 편집 가이드를 폭넓게 참조하여 Swimming Photography의 사정에 맞도록 정리되었다.', 'These guidelines were compiled to suit Swimming Photography\'s circumstances, drawing broadly on the standards of domestic press bodies — including the Journalists Association of Korea\'s code of ethics and practice, the newspaper ethics practice guidelines, and the human-rights reporting guidelines — as well as the editorial guides of international outlets such as AP, Reuters, The Economist, and the BBC.') }}</p>

            <h4 style="margin-top:24px;">{{ t('적용 범위', 'Scope') }}</h4>
            <p>{{ t('본 규약은 Swimming Photography에 게재되는 모든 기사에 적용된다. 편집부가 직접 취재한 기사, 제보를 바탕으로 편집부가 작성한 기사, 객원기자가 작성한 기사, 모두 본 규약의 적용을 받는다.', 'These guidelines apply to every article published by Swimming Photography. Articles reported directly by the editorial team, articles written by the editorial team from tips, and articles written by guest reporters are all subject to them.') }}</p>

            <h4>{{ t('학습 기간', 'Learning period') }}</h4>
            <p>{{ t('객원기자는 첫 발행부터 10회까지의 기간 동안 편집부가 본 규약에 따라 원고를 변환·정리하여 발행하는 것에 동의한다. 본 기간은 Swimming Photography의 편집 기준을 함께 익히는 학습 과정이며, 편집부는 첨삭 회신과 변환 결과물을 통해 본 규약의 체화를 돕는다. 10회 이후로는 본 규약을 충분히 이해한 상태에서 직접 작성하며, 편집부는 모든 기사에 대해 동일한 다듬기 작업을 적용한다.', 'For the period from their first publication through their tenth, guest reporters agree that the editorial team will convert and arrange their manuscripts according to these guidelines before publishing. This period is a learning process for becoming familiar with Swimming Photography\'s editorial standards together, and the editorial team helps reporters internalize the guidelines through editing feedback and converted results. After the tenth article, reporters write on their own with a full understanding of the guidelines, and the editorial team applies the same polishing to every article.') }}</p>

            <div class="creed">{{ t('엄격함은 가벼움의 반대가 아니라 신뢰의 다른 이름이다.', 'Rigor is not the opposite of lightness; it is another name for trust.') }}</div>
          </div>
        </section>

        <!-- ════════ 1부 ════════ -->
        <section id="part1">
          <h2>{{ t('1부 · 신문체 핵심 규약', 'Part 1 · Core Newspaper-Style Rules') }}</h2>

          <!-- ─── 제1조 헤드라인 ─── -->
          <article id="rule-1">
            <h3><span class="num">{{ t('제1조', 'Article 1') }}</span>{{ t('헤드라인', 'Headlines') }}</h3>

            <h4>{{ t('1.1 기본 원칙', '1.1 Basic principles') }}</h4>
            <ul class="clauses">
              <li>{{ t('제목은 25자 이내로 작성하며, 사실을 중심에 둔다.', 'Write the title in 25 characters or fewer, centered on facts.') }}</li>
              <li>{{ t('부제는 30자 이내로 작성하며, 본문의 핵심을 한 줄로 요약한다.', 'Write the subtitle in 30 characters or fewer, summarizing the core of the article in one line.') }}</li>
              <li>{{ t('의문문 및 말줄임표는 사용하지 않는다. 말줄임은 마침표 3개가 아닌 약물 기호 「…」를 사용한다.', 'Do not use questions or ellipses. For an ellipsis, use the typographic mark “…” rather than three periods.') }}</li>
              <li>{{ t('두 개의 기호를 연이어 사용하지 않는다. 쉼표와 따옴표의 동시 사용 또한 금한다.', 'Do not use two symbols in a row. Using a comma and quotation marks together is also prohibited.') }}</li>
              <li>{{ t('헤드라인은 의미 단위로 자연스럽게 마무리한다.', 'End the headline naturally, on a unit of meaning.') }}</li>
            </ul>

            <h4>{{ t('1.2 금지 사항', '1.2 Prohibitions') }}</h4>
            <ul class="clauses">
              <li>{{ t('물음표·느낌표 및 일체의 이모지·이모티콘 사용을 금한다.', 'Question marks, exclamation marks, and any emoji or emoticons are prohibited.') }}</li>
              <li>{{ t('「감동의 순간」, 「눈물의 우승」 등 감정형 부제는 사용하지 않는다.', 'Do not use emotional subtitles such as “a moving moment” or “a tearful victory.”') }}</li>
              <li>{{ t('「충격」, 「참사」, 「압승」, 「굴욕」, 「대박」 등 가치 동사의 사용을 금한다.', 'Do not use value-laden words such as “shock,” “catastrophe,” “landslide,” “humiliation,” or “jackpot.”') }}</li>
              <li>{{ t('「~할 듯」, 「~전망」, 「~가능성」으로 종지하는 헤드라인은 근거 보도가 아닌 한 사용하지 않는다.', 'Do not end a headline with “likely to,” “outlook,” or “possibility” unless it is sourced reporting.') }}</li>
              <li>{{ t('사망·자살 등 민감한 사안에서는 표제에 「자살」을 사용하지 않으며, 「극단적 선택」 등 가치 판단을 함의하는 표현 대신 「사망」 또는 「숨지다」를 사용한다.', 'In sensitive matters such as death or suicide, do not use “suicide” in the headline; use “death” or “died” instead of value-laden expressions like “extreme choice.”') }}</li>
            </ul>

            <h4>{{ t('1.3 외국어 표기', '1.3 Foreign-language notation') }}</h4>
            <ul class="clauses">
              <li>{{ t('외국어 표기는 공식 회사명·대회명·상품명에 한해 허용하며, 그 외는 한글로 표기한다.', 'Foreign-language notation is allowed only for official company, competition, and product names; otherwise write in Korean.') }}</li>
            </ul>

            <div class="gb">
              <div class="good">
                <div class="head">{{ t('○ 좋은 예', '○ Good example') }}</div>
                <p>{{ t('주제: 김○○, 자유형 100m 한국신기록 수립', 'Title: KIM, ○○ Sets Korean Record in 100m Freestyle') }}</p>
                <p>{{ t('부제: 잠실서 49초 52… 종전 기록 0.18초 단축', 'Subtitle: 49.52 at Jamsil… 0.18s off the previous record') }}</p>
              </div>
              <div class="bad">
                <div class="head">{{ t('× 나쁜 예', '× Bad example') }}</div>
                <p>{{ t('주제: 와! 김○○ 선수의 감동적인 우승!!', 'Title: Wow! KIM, ○○’s moving victory!!') }}</p>
                <p>{{ t('부제: 모두를 울린 그 한 번의 터치… 눈물의 순간', 'Subtitle: The one touch that made everyone cry… a moment of tears') }}</p>
              </div>
            </div>
          </article>

          <!-- ─── 제2조 리드 ─── -->
          <article id="rule-2">
            <h3><span class="num">{{ t('제2조', 'Article 2') }}</span>{{ t('리드', 'The Lead') }}</h3>

            <h4>{{ t('2.1 기본 원칙', '2.1 Basic principles') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 단락은 6하원칙(누가·언제·어디서·무엇을·왜·어떻게)을 압축한 3~4문장으로 구성한다.', 'Compose the first paragraph as 3–4 sentences condensing the Five Ws and One H (who, when, where, what, why, how).') }}</li>
              <li>{{ t('리드만 읽어도 사건의 전모가 파악되어야 한다.', 'The lead alone should convey the full picture of the event.') }}</li>
              <li>{{ t('가장 중요한 사실을 가장 앞에 둔다. 결론을 뒤로 미루지 않는다.', 'Put the most important fact first. Do not defer the conclusion.') }}</li>
              <li>{{ t('감상·배경 묘사·해석으로 리드를 시작하지 않는다.', 'Do not open the lead with impressions, scene-setting, or interpretation.') }}</li>
            </ul>

            <h4>{{ t('2.2 세부 규칙', '2.2 Detailed rules') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 문장은 60자 이내로 작성하며, 핵심 사실(누가·무엇·언제)을 우선 배치한다.', 'Write the first sentence in 60 characters or fewer, placing the key facts (who, what, when) first.') }}</li>
              <li>{{ t('6요소 중 첫 문장에 4요소(누가·무엇·언제·어디)를, 나머지 2요소(왜·어떻게)는 둘째 문장으로 분산할 수 있다.', 'Of the six elements, four (who, what, when, where) may go in the first sentence, with the remaining two (why, how) in the second.') }}</li>
              <li>{{ t('리드에는 가치 판단·해석·전망을 담지 않는다. 이는 셋째 단락 이후에 배치한다.', 'Do not include value judgments, interpretation, or outlook in the lead; place these from the third paragraph onward.') }}</li>
              <li>{{ t('출처가 분명한 사실만 담는다. 출처가 불분명한 경우 그 사유를 본문 첫 단락에서 밝힌다.', 'Include only facts with a clear source. If the source is unclear, state the reason in the first paragraph of the body.') }}</li>
            </ul>

            <div class="gb">
              <div class="good">
                <div class="head">{{ t('○ 좋은 예', '○ Good example') }}</div>
                <p>{{ t('김○○(22·OO수영연맹)이 22일 OO 실내수영장에서 열린 제OO회 전국체전 남자 자유형 100m 결승에서 49초 52를 기록하며 한국신기록을 수립했다. 이는 종전 기록을 0.18초 단축한 것이다.', 'KIM, ○○ (22, ○○ Swimming Federation) set a Korean record of 49.52 in the men\'s 100m freestyle final at the ○○th National Sports Festival, held on the 22nd at ○○ Indoor Swimming Pool. This is 0.18 seconds faster than the previous record.') }}</p>
              </div>
              <div class="bad">
                <div class="head">{{ t('× 나쁜 예', '× Bad example') }}</div>
                <p>{{ t('어제 ○○에서는 정말 뜨거운 열기가 가득했다. 수많은 관중이 숨을 죽이고 지켜본 그 순간, 한 청년이 한국 수영의 역사를 새로 썼다. 바로 김○○ 선수다.', 'Yesterday, ○○ was full of fervent excitement. In that moment, watched breathlessly by a vast crowd, a young man rewrote the history of Korean swimming. That man is KIM, ○○.') }}</p>
              </div>
            </div>
          </article>

          <!-- ─── 제3조 본문 구조 ─── -->
          <article id="rule-3">
            <h3><span class="num">{{ t('제3조', 'Article 3') }}</span>{{ t('본문 구조', 'Body Structure') }}</h3>

            <h4>{{ t('3.1 역삼각형 구조', '3.1 Inverted-pyramid structure') }}</h4>
            <ul class="clauses">
              <li>{{ t('본문은 역삼각형 구조로 작성한다. 가장 중요한 사실을 앞에 두고, 부연 설명과 배경·맥락을 뒤에 배치한다.', 'Write the body in an inverted-pyramid structure: place the most important facts first, with elaboration, background, and context later.') }}</li>
              <li>{{ t('리드를 포함해 총 3~5단락으로 구성한다.', 'Compose it in 3–5 paragraphs including the lead.') }}</li>
              <li>{{ t('본문은 끝에서부터 단락을 잘라내도 핵심이 유지되어야 한다.', 'The core should hold even if paragraphs are cut from the end.') }}</li>
            </ul>

            <h4>{{ t('3.2 단락·문장 길이', '3.2 Paragraph and sentence length') }}</h4>
            <ul class="clauses">
              <li>{{ t('한 단락은 2~4문장으로 구성하며, 하나의 소주제만 담는다.', 'Make each paragraph 2–4 sentences, on a single subtopic.') }}</li>
              <li>{{ t('한 문장은 원칙적으로 60자 이내로 한다. 한 문장에는 하나의 사실만 담는다.', 'As a rule, keep each sentence to 60 characters or fewer, with one fact per sentence.') }}</li>
              <li>{{ t('능동형 표현을 우선한다. 「수립되었다」 대신 「○○○이 수립했다」로 쓴다.', 'Prefer the active voice: write “○○○ set it” rather than “it was set.”') }}</li>
            </ul>

            <h4>{{ t('3.3 사실과 의견의 분리', '3.3 Separating fact from opinion') }}</h4>
            <ul class="clauses">
              <li>{{ t('사실과 의견은 명확히 구분하여 작성한다. 의견을 담을 경우 「~로 보인다」, 「~로 평가된다」가 아닌 평가 주체를 명시한다.', 'Clearly separate fact from opinion. When including opinion, name who is making the assessment rather than writing “appears to” or “is regarded as.”') }}</li>
              <li>{{ t('과장·왜곡을 금한다. 추측·가정 표현(「~수도 있다」, 「~로 예상된다」)은 출처가 분명한 경우에 한해 사용한다.', 'Exaggeration and distortion are prohibited. Use speculative or hypothetical phrasing (“may,” “is expected to”) only when the source is clear.') }}</li>
            </ul>

            <h4>{{ t('3.4 표현 절제', '3.4 Restraint in expression') }}</h4>
            <ul class="clauses">
              <li>{{ t('강조 부사 사용을 금한다. 「매우」, 「정말」, 「너무」, 「엄청」, 「굉장히」, 「참으로」, 「실로」, 「그야말로」 등이 이에 해당한다.', 'Intensifying adverbs are prohibited — such as “very,” “really,” “too,” “hugely,” “extremely,” “truly,” “indeed,” and “downright.”') }}</li>
              <li>{{ t('가치 형용사 사용을 금한다. 「충격적인」, 「경악스러운」, 「비참한」, 「감격적인」, 「통쾌한」, 「참담한」 등이 이에 해당한다.', 'Value-laden adjectives are prohibited — such as “shocking,” “astonishing,” “miserable,” “moving,” “gratifying,” and “dismal.”') }}</li>
              <li>{{ t('동어 반복과 유의어 남용을 회피한다. 동일 인물을 「○○○ 선수」, 「○ 양」, 「이 선수」, 「그녀」로 무리하게 바꾸지 않는다.', 'Avoid repetition and overuse of synonyms. Do not forcibly vary references to the same person as “athlete ○○○,” “Ms. ○,” “this athlete,” or “she.”') }}</li>
            </ul>

            <h4>{{ t('3.5 권장 구조', '3.5 Recommended structure') }}</h4>
            <dl class="def">
              <div><dt>{{ t('1단락(리드)', 'Paragraph 1 (lead)') }}</dt><dd>{{ t('사건의 핵심 — 누가, 무엇을, 어떻게.', 'The heart of the event — who, what, how.') }}</dd></div>
              <div><dt>{{ t('2단락', 'Paragraph 2') }}</dt><dd>{{ t('주요 인용 또는 결정적 장면의 부연.', 'A key quote or elaboration of the decisive moment.') }}</dd></div>
              <div><dt>{{ t('3단락', 'Paragraph 3') }}</dt><dd>{{ t('전후 맥락 및 관계자의 반응.', 'Context before and after, and reactions from those involved.') }}</dd></div>
              <div><dt>{{ t('4단락(마무리)', 'Paragraph 4 (closing)') }}</dt><dd>{{ t('해당 사건의 의미 및 향후 일정·전망.', 'The significance of the event and the upcoming schedule or outlook.') }}</dd></div>
            </dl>
          </article>

          <!-- ─── 제4조 인용 ─── -->
          <article id="rule-4">
            <h3><span class="num">{{ t('제4조', 'Article 4') }}</span>{{ t('인용', 'Quotations') }}</h3>

            <h4>{{ t('4.1 기본 원칙', '4.1 Basic principles') }}</h4>
            <ul class="clauses">
              <li>{{ t('직접인용은 큰따옴표 안에 표기하며, 화자와 발화 시점을 명시한다.', 'Place direct quotations within double quotation marks, and state the speaker and when it was said.') }}</li>
              <li>{{ t('간접인용은 「~측에 따르면」, 「~라고 밝혔다」 등의 표현을 사용한다.', 'For indirect quotation, use expressions such as “according to ○○” or “○○ said.”') }}</li>
              <li>{{ t('인용 안에 다른 인용이 포함되는 경우 작은따옴표를 사용한다.', 'When a quote contains another quote, use single quotation marks.') }}</li>
              <li>{{ t('한 단락에는 직접인용을 1개만 두는 것을 원칙으로 한다.', 'As a rule, place only one direct quotation per paragraph.') }}</li>
              <li>{{ t('출처가 불분명한 경우 인용 자체를 사용하지 않는다.', 'If the source is unclear, do not use the quotation at all.') }}</li>
            </ul>

            <blockquote class="callout">
              {{ t('인용문은 신성불가침이다. 화자가 말한 그대로 옮겨야 하며, 중복되는 단어나 구절을 삭제하는 경우를 제외하고는 결코 손대지 않는다. 그러한 삭제조차 인용의 의미를 조금도 바꾸지 않을 때에만 허용된다.', 'A quotation is sacrosanct. It must be transcribed exactly as the speaker said it, and never touched except to remove a redundant word or phrase — and even that only when the deletion changes the meaning of the quote not in the slightest.') }}
              <span class="src">{{ t('출처 — Reuters Handbook of Journalism', 'Source — Reuters Handbook of Journalism') }}</span>
            </blockquote>

            <h4>{{ t('4.2 인용 동사 — 「말했다」 우선', '4.2 Attribution verbs — prefer “said”') }}</h4>
            <ul class="clauses">
              <li>{{ t('인용 동사는 「말했다」를 기본으로 한다.', 'Use “said” (「말했다」) as the default attribution verb.') }}</li>
              <li>{{ t('「주장했다」, 「강변했다」, 「토로했다」, 「강조했다」, 「역설했다」, 「발끈했다」 등은 화자의 의도를 함의하므로 사용을 자제한다.', 'Refrain from verbs like 「주장했다」 (claimed), 「강변했다」 (insisted), 「토로했다」 (confided), 「강조했다」 (stressed), 「역설했다」 (argued), or 「발끈했다」 (snapped), which impute intent to the speaker.') }}</li>
              <li>{{ t('「밝혔다」, 「전했다」, 「덧붙였다」, 「답했다」는 사실에 부합하는 경우에 한해 사용한다.', 'Use 「밝혔다」 (stated), 「전했다」 (conveyed), 「덧붙였다」 (added), and 「답했다」 (replied) only when they fit the facts.') }}</li>
            </ul>

            <h4>{{ t('4.3 「라고」와 「라며」의 구별', '4.3 Distinguishing 「라고」 and 「라며」') }}</h4>
            <ul class="clauses">
              <li>{{ t('「라고」는 발언이 종결될 때 사용한다. 예) 「"기쁘다"라고 답했다.」', 'Use 「라고」 when the utterance ends. e.g. “‘I’m glad,’ he replied.”') }}</li>
              <li>{{ t('「라며」는 발언 이후 다른 행위·진술로 연결될 때 사용한다. 예) 「"기쁘다"라며 환하게 웃었다.」', 'Use 「라며」 when the utterance leads into another action or statement. e.g. “‘I’m glad,’ he said with a broad smile.”') }}</li>
            </ul>

            <h4>{{ t('4.4 따옴표와 마침표', '4.4 Quotation marks and periods') }}</h4>
            <ul class="clauses">
              <li>{{ t('직접 인용문 끝에는 마침표를 찍지 않는다.', 'Do not put a period at the end of a direct quotation.') }}</li>
              <li>{{ t('따옴표가 문장을 종결하는 경우 따옴표 다음에 마침표를 찍는다.', 'When quotation marks end the sentence, put the period after the closing mark.') }}</li>
            </ul>

            <div class="gb">
              <div class="good">
                <div class="head">{{ t('○ 좋은 예', '○ Good example') }}</div>
                <p>{{ t('김○○ 선수는 "최선을 다하겠다"고 말했다.', 'Athlete KIM, ○○ said, “I’ll do my best.”') }}</p>
                <p>{{ t('박○○ 감독은 "훈련 계획대로 진행됐다"며 만족감을 보였다.', 'Coach PARK, ○○ said, “It went according to the training plan,” expressing satisfaction.') }}</p>
              </div>
              <div class="bad">
                <div class="head">{{ t('× 나쁜 예', '× Bad example') }}</div>
                <p>{{ t('김○○ 선수는 "최선을 다하겠다." 라고 말했다.', 'Athlete KIM, ○○ said, “I’ll do my best.” (period wrongly placed inside the quote)') }}</p>
                <p>{{ t('박○○ 감독은 "훈련 계획대로 진행됐다."고 강력히 주장했다.', 'Coach PARK, ○○ strongly claimed, “It went according to the training plan.”') }}</p>
              </div>
            </div>

            <h4>{{ t('4.5 익명 출처 7원칙', '4.5 Seven principles for anonymous sources') }}</h4>
            <ul class="clauses">
              <li class="major">{{ t('익명 출처의 정보는 의견·추측이 아닌 사실(정보)이어야 한다.', 'Information from an anonymous source must be fact, not opinion or speculation.') }}</li>
              <li class="major">{{ t('익명 외에는 입수가 불가능한 정보여야 한다.', 'It must be information obtainable in no way other than anonymously.') }}</li>
              <li class="major">{{ t('출처는 해당 정보를 정확히 알 수 있는 위치에 있어야 한다.', 'The source must be in a position to know the information accurately.') }}</li>
              <li class="major">{{ t('익명을 사용한 사유를 기사 내에 명시한다.', 'State within the article the reason anonymity was used.') }}</li>
              <li class="major">{{ t('편집부 데스크는 익명 출처의 실명을 반드시 알아야 한다.', 'The editorial desk must know the real name of the anonymous source.') }}</li>
              <li class="major">{{ t('익명을 받아들이는 경우에도 소속 기관과 일반적 지위는 가능한 한 명시한다.', 'Even when granting anonymity, identify the source’s institution and general position as far as possible.') }}</li>
              <li class="major">{{ t('일방적 주장에 근거하여 제3자를 비판·비방·공격하는 경우 익명 처리는 원칙적으로 거부한다.', 'As a rule, refuse anonymity when it is used to criticize, defame, or attack a third party on the basis of a one-sided claim.') }}</li>
            </ul>

            <h4>{{ t('4.6 교차 확인 원칙', '4.6 Cross-verification') }}</h4>
            <ul class="clauses">
              <li>{{ t('단일 출처 보도는 출처가 권위 있고 정보가 매우 구체적인 경우에 한해 허용한다.', 'Single-source reporting is allowed only when the source is authoritative and the information is highly specific.') }}</li>
              <li>{{ t('그 외에는 두 개 이상의 출처로 교차 확인을 거친다.', 'Otherwise, cross-verify with two or more sources.') }}</li>
              <li>{{ t('의견·평가·전망에 관한 인용은 반드시 실명 출처를 표기한다.', 'Quotations of opinion, assessment, or outlook must carry a named source.') }}</li>
            </ul>

            <h4>{{ t('4.7 타 매체 인용', '4.7 Quoting other outlets') }}</h4>
            <ul class="clauses">
              <li>{{ t('통신사 및 타 매체의 기사를 전재·인용할 때에는 출처를 반드시 명시한다.', 'When reprinting or quoting articles from wire services or other outlets, always cite the source.') }}</li>
              <li>{{ t('형식: 「○○통신은 ~라고 보도했다」, 「○○일보 보도에 따르면 …」', 'Format: “○○ News Agency reported that …,” “According to ○○ Daily …”') }}</li>
              <li>{{ t('일부 변경하여 자사 기사로 게재할 수 없다.', 'You may not alter parts and publish it as your own article.') }}</li>
            </ul>

            <h4>{{ t('4.8 인용 다듬기', '4.8 Editing quotations') }}</h4>
            <ul class="clauses">
              <li>{{ t('축약·정리는 원문의 취지를 훼손하지 않는 범위에서만 허용한다.', 'Condensing or tidying is allowed only insofar as it does not harm the original intent.') }}</li>
              <li>{{ t('의미를 변경하는 편집은 일체 금지한다.', 'Any edit that changes the meaning is entirely prohibited.') }}</li>
            </ul>
          </article>

          <!-- ─── 제5조 사진 캡션 ─── -->
          <article id="rule-5">
            <h3><span class="num">{{ t('제5조', 'Article 5') }}</span>{{ t('사진 캡션', 'Photo Captions') }}</h3>

            <h4>{{ t('5.1 기본 형식', '5.1 Basic format') }}</h4>
            <ul class="clauses">
              <li>{{ t('형식: 「[사진 설명]. 사진=촬영자명 / 촬영일·장소」', 'Format: “[caption]. Photo: photographer / date, place”') }}</li>
              <li>{{ t('캡션은 사진 바로 아래 별행에 배치한다.', 'Place the caption on its own line directly below the photo.') }}</li>
              <li>{{ t('촬영자명에는 직책(「기자」)을 함께 표기한다.', 'Include the photographer’s title (“reporter”) with their name.') }}</li>
            </ul>

            <h4>{{ t('5.2 2문장 구조', '5.2 Two-sentence structure') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 문장: 사진 속 동작·상황을 현재 진행형으로 묘사한다.', 'First sentence: describe the action or situation in the photo in the present progressive.') }}</li>
              <li>{{ t('둘째 문장: 맥락·결과·중요성을 과거형으로 보탠다.', 'Second sentence: add context, result, or significance in the past tense.') }}</li>
            </ul>

            <blockquote class="example">
              <span class="label">{{ t('권장 예', 'Recommended') }}</span>{{ t('김○○이 자유형 100m 결승에서 출발하고 있다. 이날 그는 53초12로 한국신기록을 수립했다. 사진=홍길동 기자 / 2026. 5. 20. 잠실 실내수영장', 'KIM, ○○ starts in the 100m freestyle final. He set a Korean record of 53.12 that day. Photo: Reporter HONG, Gildong / 20-05-2026, Jamsil Indoor Swimming Pool') }}
            </blockquote>

            <h4>{{ t('5.3 필수 정보', '5.3 Required information') }}</h4>
            <ul class="clauses">
              <li>{{ t('모든 캡션은 다음 다섯 가지를 포함한다. ① 인물(좌·우·중앙 식별) ② 동작·상황 ③ 일시 ④ 장소 ⑤ 대회·이벤트명', 'Every caption includes the following five: ① the people (identified left/right/center) ② the action or situation ③ the date and time ④ the place ⑤ the competition or event name.') }}</li>
            </ul>

            <h4>{{ t('5.4 다인 사진 위치 표기', '5.4 Positioning in group photos') }}</h4>
            <ul class="clauses">
              <li>{{ t('복수 인물 표기는 「왼쪽부터」, 「앞줄 왼쪽부터」, 「뒷줄 왼쪽부터」, 「시계 방향」으로 한다.', 'Indicate multiple people with “from the left,” “front row from the left,” “back row from the left,” or “clockwise.”') }}</li>
              <li>{{ t('「맨 왼쪽」 등의 표현은 사용하지 않는다.', 'Do not use expressions like “far left.”') }}</li>
            </ul>

            <blockquote class="example">
              <span class="label">{{ t('권장 예', 'Recommended') }}</span>{{ t('시상대에 선 메달리스트들. 왼쪽부터 박○○(은), 김○○(금), 이○○(동). 사진=정○○ 기자 / 2026. 5. 22. 잠실', 'Medalists on the podium. From the left: PARK, ○○ (silver), KIM, ○○ (gold), LEE, ○○ (bronze). Photo: Reporter JUNG, ○○ / 22-05-2026, Jamsil') }}
            </blockquote>

            <h4>{{ t('5.5 금지 표현', '5.5 Prohibited expressions') }}</h4>
            <ul class="clauses">
              <li>{{ t('「포즈를 취하고 있다」, 「바라보고 있다」, 「사진 속 인물은…」, 「웃고 있다」 등 무의미한 동사는 사용하지 않는다.', 'Do not use empty verbs such as “is posing,” “is looking,” “the person in the photo…,” or “is smiling.”') }}</li>
              <li>{{ t('사진 설명은 사진이 보여주는 정보를 명확히 전달하는 문장이어야 한다.', 'A caption should be a sentence that clearly conveys the information the photo shows.') }}</li>
            </ul>

            <h4>{{ t('5.6 비관련 사진', '5.6 Unrelated photos') }}</h4>
            <ul class="clauses">
              <li>{{ t('기사와 직접 관련이 없는 사진을 부득이 사용할 때에는 캡션에 그 사실을 명시한다 — 「관련 자료사진」, 「○○년 ○월 ○일 자료」.', 'When unavoidably using a photo not directly related to the article, state so in the caption — “related file photo,” “file photo from ○○.”') }}</li>
            </ul>

            <h4>{{ t('5.7 검증', '5.7 Verification') }}</h4>
            <ul class="clauses">
              <li>{{ t('게재 전 인명·소속·기록·일시·장소를 기자가 1차 확인하고 편집부가 2차 확인한다.', 'Before publication, the reporter first checks names, affiliations, records, date/time, and place, and the editorial team checks them again.') }}</li>
            </ul>
          </article>

          <!-- ─── 제6조 바이라인 ─── -->
          <article id="rule-6">
            <h3><span class="num">{{ t('제6조', 'Article 6') }}</span>{{ t('바이라인', 'Byline') }}</h3>

            <h4>{{ t('6.1 기본 형식', '6.1 Basic formats') }}</h4>
            <dl class="def">
              <div><dt>{{ t('객원기자 직접 작성', 'Guest reporter’s own work') }}</dt><dd>{{ t('수영사진 ○○○ 기자 / ooo@medalbank.com', 'Swimming Photography, Reporter ○○○ / ooo@medalbank.com') }}</dd></div>
              <div><dt>{{ t('편집부 작성(제보 익명)', 'Editorial team (anonymous tip)') }}</dt><dd>{{ t('수영사진 편집부', 'Swimming Photography Editorial') }}</dd></div>
              <div><dt>{{ t('편집부 작성(제보 실명)', 'Editorial team (named tip)') }}</dt><dd>{{ t('수영사진 편집부 / 제보 ○○○', 'Swimming Photography Editorial / Tip by ○○○') }}</dd></div>
              <div><dt>{{ t('제보자 보호 필요 시', 'When source protection is needed') }}</dt><dd>{{ t('수영사진 편집부 / 제보 처리: 비공개', 'Swimming Photography Editorial / Tip handling: undisclosed') }}</dd></div>
              <div><dt>{{ t('사진·취재 협조', 'Photo / reporting assistance') }}</dt><dd>{{ t('본문 말미 별행: 사진·취재 협조 ○○○', 'Separate line at the end of the body: Photo and reporting assistance by ○○○') }}</dd></div>
            </dl>

            <h4>{{ t('6.2 배치 규칙', '6.2 Placement rules') }}</h4>
            <ul class="clauses">
              <li>{{ t('바이라인은 본문 마지막 줄과 한 줄 간격을 두고 배치한다.', 'Place the byline one line below the last line of the body.') }}</li>
              <li>{{ t('이메일은 실명제 공개를 원칙으로 한다.', 'As a rule, disclose the email under the real-name policy.') }}</li>
            </ul>
          </article>

          <!-- ─── 제7조 시제 ─── -->
          <article id="rule-7">
            <h3><span class="num">{{ t('제7조', 'Article 7') }}</span>{{ t('시제', 'Tense') }}</h3>

            <h4>{{ t('7.1 기본 원칙', '7.1 Basic principles') }}</h4>
            <ul class="clauses">
              <li>{{ t('보도된 사실은 과거형으로 적는다. 예) 「우승했다」, 「가장 먼저 터치패드를 찍었다」.', 'Write reported facts in the past tense. e.g. “won,” “touched the wall first.”') }}</li>
              <li>{{ t('일반적·항구적 진술은 현재형으로 적는다. 예) 「○○○은 한국 수영의 대표 선수다」.', 'Write general or enduring statements in the present tense. e.g. “○○○ is a leading swimmer of Korea.”') }}</li>
              <li>{{ t('향후 일정·예정은 미래형으로 적는다. 예) 「다음달 ○○ 대회에 출전할 예정이다」.', 'Write upcoming schedules or plans in the future tense. e.g. “is scheduled to compete in the ○○ meet next month.”') }}</li>
              <li>{{ t('한 문단 안에서는 시제의 일관성을 유지한다.', 'Keep tense consistent within a paragraph.') }}</li>
              <li>{{ t('인용 안의 시제는 화자의 발화 시점을 따른다.', 'Tense inside a quotation follows the speaker’s point of utterance.') }}</li>
            </ul>

            <h4>{{ t('7.2 종결어 축약', '7.2 Contracting endings') }}</h4>
            <ul class="clauses">
              <li>{{ t('「하였다」 → 「했다」, 「되었다」 → 「됐다」, 「밝히었다」 → 「밝혔다」로 줄여 쓰는 것을 원칙으로 한다.', 'As a rule, contract verb endings: 「하였다」 → 「했다」, 「되었다」 → 「됐다」, 「밝히었다」 → 「밝혔다」.') }}</li>
            </ul>

            <h4>{{ t('7.3 「어제·오늘·내일」 사용 금지', '7.3 No “yesterday, today, tomorrow”') }}</h4>
            <ul class="clauses">
              <li>{{ t('본문에 「어제·오늘·내일」은 사용하지 않는다. 인용문 및 특별한 맥락에서만 허용한다.', 'Do not use 「어제·오늘·내일」 (yesterday, today, tomorrow) in the body; allow them only in quotations or special contexts.') }}</li>
              <li>{{ t('날짜가 분명한 경우 「지난」·「오는」 등의 표현도 생략한다 — 「지난 3월 25일」 → 「3월 25일」.', 'When the date is clear, also omit words like 「지난」 (last) or 「오는」 (coming) — “last March 25” → “March 25.”') }}</li>
            </ul>

            <h4>{{ t('7.4 캡션·헤드라인 시제', '7.4 Caption and headline tense') }}</h4>
            <ul class="clauses">
              <li>{{ t('사진 캡션의 첫 문장은 현재 진행형으로, 둘째 문장은 과거형으로 시제를 분리한다.', 'Split tense in captions: present progressive in the first sentence, past tense in the second.') }}</li>
              <li>{{ t('헤드라인은 명사 종지(체언형) 또는 현재형 종지 중 하나로 일관한다. 과거형은 본문에서 사용한다.', 'Keep headlines consistent in either a noun-ending or a present-tense ending; use the past tense in the body.') }}</li>
            </ul>
          </article>

          <!-- ─── 제8조 금지 표현 ─── -->
          <article id="rule-8">
            <h3><span class="num">{{ t('제8조', 'Article 8') }}</span>{{ t('금지 표현', 'Prohibited Expressions') }}</h3>
            <p style="font-size:15px;">{{ t('다음 표현은 Swimming Photography의 모든 기사에서 일절 사용하지 않는다.', 'The following are never used in any Swimming Photography article.') }}</p>

            <dl class="def">
              <div><dt>{{ t('이모지·이모티콘', 'Emoji / emoticons') }}</dt><dd>{{ t('😀, 🎉, ^^, ㅠㅠ 등 일체 금지.', '😀, 🎉, ^^, ㅠㅠ, and the like — all prohibited.') }}</dd></div>
              <div><dt>{{ t('느낌표 연속', 'Consecutive exclamation marks') }}</dt><dd>{{ t('「!!」, 「!!!」, 「?!?」 등 금지. 느낌표는 한 문장에 최대 1개.', '“!!”, “!!!”, “?!?” and the like prohibited. At most one exclamation mark per sentence.') }}</dd></div>
              <div><dt>{{ t('인터넷 줄임말', 'Internet slang') }}</dt><dd>{{ t('ㅋㅋ, ㅎㅎ, ㄷㄷ, ㅇㅇ, ㄹㅇ 등 일체 금지.', 'ㅋㅋ, ㅎㅎ, ㄷㄷ, ㅇㅇ, ㄹㅇ, and the like — all prohibited.') }}</dd></div>
              <div><dt>{{ t('1인칭', 'First person') }}</dt><dd>{{ t('「나」, 「저」, 「우리(기자 자신)」 등 사용 금지. 인용 안은 예외.', '“I,” “me,” “we (the reporter),” and the like are prohibited. Exception within quotations.') }}</dd></div>
              <div><dt>{{ t('강조 부사', 'Intensifying adverbs') }}</dt><dd>{{ t('매우, 정말, 너무, 엄청, 굉장히, 참으로, 실로, 그야말로 등 금지.', 'very, really, too, hugely, extremely, truly, indeed, downright, and the like — prohibited.') }}</dd></div>
              <div><dt>{{ t('가치 형용사', 'Value-laden adjectives') }}</dt><dd>{{ t('충격적인, 경악스러운, 비참한, 감격적인, 통쾌한, 참담한 등 금지.', 'shocking, astonishing, miserable, moving, gratifying, dismal, and the like — prohibited.') }}</dd></div>
              <div><dt>{{ t('기자 감정 표현', 'Reporter’s own emotions') }}</dt><dd>{{ t('「감동스러웠다」, 「가슴이 뛰었다」 등 기자 본인의 감정 표현 금지.', 'Expressions of the reporter’s own feelings — “it was moving,” “my heart raced,” and the like — prohibited.') }}</dd></div>
              <div><dt>{{ t('과장 형용사', 'Hyperbolic adjectives') }}</dt><dd>{{ t('엄청난, 어마어마한, 역대급, 레전드, 대박 등 금지.', 'enormous, immense, all-time-great, legend, jackpot, and the like — prohibited.') }}</dd></div>
              <div><dt>{{ t('함의 동사', 'Loaded verbs') }}</dt><dd>{{ t('주장했다, 변명했다, 발끈했다, 토로했다 등은 사실에 부합하는 경우에 한해 사용.', 'claimed, made excuses, snapped, confided, and the like — use only when they fit the facts.') }}</dd></div>
              <div><dt>{{ t('가정·추측', 'Speculation') }}</dt><dd>{{ t('「~수 있을 것」, 「~로 전망」, 「~가능성」 등은 근거 출처를 명시하지 않으면 금지.', '“could,” “outlook,” “possibility,” and the like are prohibited unless a source is cited.') }}</dd></div>
              <div><dt>{{ t('광고성 표현', 'Promotional expressions') }}</dt><dd>{{ t('특정 시설·장비·브랜드를 일방적으로 칭찬하는 표현 금지.', 'One-sided praise of a specific facility, equipment, or brand is prohibited.') }}</dd></div>
              <div><dt>{{ t('출처 불명 인용', 'Unsourced quotation') }}</dt><dd>{{ t('「~라는 말이 있다」, 「~카더라」 등 금지.', '“it is said that,” “supposedly,” and the like are prohibited.') }}</dd></div>
              <div><dt>{{ t('차별·비유 표현', 'Discriminatory metaphors') }}</dt><dd>{{ t('꿀 먹은 벙어리, 장님 문고리 잡듯, 절름발이 행정, 권력의 시녀 등 신체장애·성차별 비유 금지.', 'Metaphors that demean disability or gender — such as “mute as if they’d eaten honey,” “like a blind man grabbing a doorknob,” “lame administration,” or “handmaid of power” — are prohibited.') }}</dd></div>
              <div><dt>{{ t('출신·체류 차별', 'Origin / residency discrimination') }}</dt><dd>{{ t('출신국·민족·인종·피부색·체류자격을 차별·비하하는 표현 금지.', 'Expressions that discriminate against or demean a person’s country of origin, ethnicity, race, skin color, or residency status are prohibited.') }}</dd></div>
              <div><dt>{{ t('정체성 노출', 'Identity disclosure') }}</dt><dd>{{ t('성적 지향·성 정체성은 보도 내용과 직접 관련이 없는 한 밝히지 않는다.', 'Do not reveal sexual orientation or gender identity unless directly relevant to the report.') }}</dd></div>
              <div><dt>{{ t('어뷰징', 'Abusing') }}</dt><dd>{{ t('같거나 비슷한 기사를 제목·일부만 바꿔 반복 게재하는 행위 금지.', 'Repeatedly publishing the same or similar articles with only the title or parts changed is prohibited.') }}</dd></div>
              <div><dt>{{ t('기사형 광고', 'Advertorials') }}</dt><dd>{{ t('기사와 광고가 동일 공간에 노출되는 경우 독자가 광고임을 명확히 인식할 수 있도록 표시 의무.', 'When an article and an ad appear in the same space, there is a duty to label it so readers clearly recognize it as an ad.') }}</dd></div>
              <div><dt>{{ t('금품·향응', 'Gifts / hospitality') }}</dt><dd>{{ t('취재원으로부터의 금품·향응·접대 수수 일체 금지. 공식 취재 입장권·자료는 예외.', 'Accepting any money, hospitality, or entertainment from a source is prohibited. Official press passes and materials are an exception.') }}</dd></div>
            </dl>
          </article>
        </section>

        <!-- ════════ 2부 ════════ -->
        <section id="part2">
          <h2>{{ t('2부 · 콘텐츠 운영', 'Part 2 · Content Operations') }}</h2>

          <article id="rule-9">
            <h3><span class="num">{{ t('제9조', 'Article 9') }}</span>{{ t('사진 장수 제한 원칙', 'Rules on the Number of Photos') }}</h3>
            <ul class="clauses">
              <li>{{ t('모든 기사는 본인이 직접 촬영한 사진만을 첨부한다.', 'Every article attaches only photos the reporter took themselves.') }}</li>
              <li>{{ t('타인 촬영 사진, 인터넷 사진, 인공지능 생성 이미지는 일체 사용할 수 없다.', 'Photos taken by others, internet images, and AI-generated images may not be used at all.') }}</li>
              <li>{{ t('사진을 설명하는 충분한 분량의 글을 반드시 동반해야 하며, 사진만 게재하는 행위는 인정되지 않는다.', 'A sufficient amount of text describing the photos must accompany them; publishing photos alone is not permitted.') }}</li>
              <li>{{ t('업로드 시 촬영일·촬영 장소·사용 카메라 정보는 필수 입력 항목이다.', 'When uploading, the shooting date, location, and camera used are required fields.') }}</li>
              <li>{{ t('사진의 진위는 명예 시스템으로 운영하며, 모든 기사는 편집부의 사전 승인을 거친다. 위반이 확인되는 경우 정중하게 기자 자격을 회수할 수 있다.', 'Photo authenticity runs on an honor system, and every article goes through the editorial team\'s prior approval. If a violation is confirmed, reporter status may be respectfully revoked.') }}</li>
            </ul>
          </article>

          <article id="rule-10">
            <h3><span class="num">{{ t('제10조', 'Article 10') }}</span>{{ t('분량 가이드', 'Length Guide') }}</h3>
            <ul class="clauses">
              <li>{{ t('표준 분량은 본문 기준 1,000~1,800자로 한다.', 'The standard length is 1,000–1,800 characters of body text.') }}</li>
              <li>{{ t('인물 심층 인터뷰, 칼럼, 사진기자의 스토리 기사는 더 길게 작성할 수 있다.', 'In-depth profile interviews, columns, and photo-reporter story pieces may run longer.') }}</li>
              <li>{{ t('600자 이하의 짧은 글은 단신으로 별도 처리하며, 예외적인 경우에만 게재한다.', 'Short pieces of 600 characters or fewer are handled separately as briefs and published only in exceptional cases.') }}</li>
              <li>{{ t('분량은 한국어 공백 포함을 기준으로 하며, 헤드라인·캡션·바이라인을 제외한 본문만을 계산한다.', 'Length is counted in Korean characters including spaces, counting only the body — excluding the headline, caption, and byline.') }}</li>
            </ul>
          </article>

          <article id="rule-11">
            <h3><span class="num">{{ t('제11조', 'Article 11') }}</span>{{ t('분류 체계', 'Classification System') }}</h3>
            <p style="font-size:15px;">{{ t('모든 기사는 아래 기준으로 분류되어 발행되며, 기자는 작성 시 분야와 지역을 함께 제출한다.', 'Every article is classified and published by the criteria below, and the reporter submits both the field and the region when writing.') }}</p>

            <h4>{{ t('11.1 분야 (1개 선택)', '11.1 Field (select one)') }}</h4>
            <ul class="clauses">
              <li>{{ t('경기 — 대회, 기록, 결과', 'Meets — competitions, records, results') }}</li>
              <li>{{ t('인물 — 선수, 지도자, 마스터즈, 꿈나무 인터뷰', 'Athlete — interviews with athletes, coaches, masters, and youth swimmers') }}</li>
              <li>{{ t('현장 — 행사, 시설, 동호회 스케치', 'On Site — events, facilities, club sketches') }}</li>
              <li>{{ t('칼럼 — 오피니언, 에세이', 'Column — opinion, essays') }}</li>
              <li>{{ t('사진 — 수영사진 편집부 전용 카테고리(비공개로 관리될 수 있음.)', 'Photo — a category reserved for the Swimming Photography editorial team (may be managed privately).') }}</li>
            </ul>

            <h4>{{ t('11.2 광역 지역 (1개 선택, 필수)', '11.2 Metropolitan region (select one, required)') }}</h4>
            <ul class="clauses">
              <li>{{ t('서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주.', 'Seoul, Busan, Daegu, Incheon, Gwangju, Daejeon, Ulsan, Sejong, Gyeonggi, Gangwon, Chungbuk, Chungnam, Jeonbuk, Jeonnam, Gyeongbuk, Gyeongnam, Jeju.') }}</li>
            </ul>

            <h4>{{ t('11.3 세부 지역 태그 (선택)', '11.3 Sub-region tag (optional)') }}</h4>
            <ul class="clauses">
              <li>{{ t('필요한 경우 시·군·구 단위의 지역명을 태그로 추가할 수 있다. 예) 「고양시」, 「수성구」.', 'When needed, add a city/county/district name as a tag. e.g. “Goyang-si,” “Suseong-gu.”') }}</li>
            </ul>
          </article>
        </section>

        <!-- ════════ 3부 ════════ -->
        <section id="part3">
          <h2>{{ t('3부 · 표기·문장', 'Part 3 · Notation & Sentences') }}</h2>

          <article id="rule-12">
            <h3><span class="num">{{ t('제12조', 'Article 12') }}</span>{{ t('인명·직책 표기', 'Names and Titles') }}</h3>

            <h4>{{ t('12.1 첫 등장과 재등장', '12.1 First and later mentions') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 등장: 「풀네임(나이·소속) 직함」.', 'First mention: “Full name (age, affiliation) title.”') }}</li>
              <li>{{ t('선수 재등장: 풀네임만 쓰고 직함을 붙이지 않는다 — 「선수」 호칭은 첫 등장 한 번뿐이다.', 'Later mention of an athlete: full name only, with no title — the “athlete” title appears at first mention only.') }}</li>
              <li>{{ t('감독·코치 등 직함자 재등장: 「성+직함」.', 'Later mention of a coach or official: “surname + title.”') }}</li>
              <li>{{ t('동성동본 또는 동성 다수인 경우 재등장 시 「이름+직함」으로 식별한다.', 'When several people share a surname, identify later mentions by “given name + title.”') }}</li>
            </ul>

            <blockquote class="example">
              <span class="label">{{ t('예시', 'Examples') }}</span>{{ t('첫 등장: 김○○(22·대한수영연맹) 선수 / 재등장: 김○○', 'First: Athlete KIM, ○○ (22, Korea Swimming Federation) / Later: KIM') }}<br>
              {{ t('첫 등장: 박○○(45·서울시청 감독) 감독 / 재등장: 박 감독', 'First: Coach PARK, ○○ (45, Seoul City Hall) / Later: Coach PARK') }}
            </blockquote>

            <h4>{{ t('12.2 호칭 우선순위', '12.2 Order of address') }}</h4>
            <ul class="clauses">
              <li>{{ t('① 공식 직함을 우선한다 — 「선수」, 「감독」, 「코치」, 「이사장」, 「회장」 등.', '① Prefer an official title — “athlete,” “head coach,” “coach,” “director,” “president,” etc.') }}</li>
              <li>{{ t('② 만 19세 이상 일반 대상자에게는 「씨」를 사용한다.', '② For general subjects aged 19 or older, use “Mr./Ms.” (「씨」).') }}</li>
              <li>{{ t('③ 만 19세 미만에게는 「군」(남) 또는 「양」(여)을 사용한다.', '③ For those under 19, use 「군」 (male) or 「양」 (female).') }}</li>
              <li>{{ t('대학생 선수는 「선수」 또는 「씨」로 통일한다.', 'For college-level athletes, use “athlete” or “Mr./Ms.” consistently.') }}</li>
            </ul>

            <h4>{{ t('12.3 호칭 띄어쓰기', '12.3 Spacing of titles') }}</h4>
            <ul class="clauses">
              <li>{{ t('호칭어는 성명과 띄어 쓴다. 국립국어원 한글 맞춤법을 따른다.', 'Space the title from the name. Follow the National Institute of Korean Language\'s spelling rules.') }}</li>
              <li>{{ t('「김○○ 씨」, 「김○○ 선수」, 「김○○ 감독」 — 모두 띄어쓰기로 통일한다.', '「김○○ 씨」, 「김○○ 선수」, 「김○○ 감독」 — all use spacing consistently.') }}</li>
            </ul>

            <h4>{{ t('12.4 나이 괄호 표기', '12.4 Age in parentheses') }}</h4>
            <ul class="clauses">
              <li>{{ t('「세」를 생략하며 가운뎃점(·)으로 구분한다.', 'Omit “years old” (「세」) and separate with a middle dot (·).') }}</li>
              <li>{{ t('형식: 「김○○(22·대한수영연맹)」 — 나이와 소속을 함께 표기한다.', 'Format: “KIM, ○○ (22, Korea Swimming Federation)” — age and affiliation together.') }}</li>
              <li>{{ t('어린이의 경우 성별 병기 가능 — 「김○○(7·남)」, 「김○○ 군(7)」.', 'For children, gender may be added — “KIM, ○○ (7, male),” “KIM, ○○ (7).”') }}</li>
            </ul>

            <h4>{{ t('12.5 「전(前)」 직함', '12.5 The “former” (「전」) title') }}</h4>
            <ul class="clauses">
              <li>{{ t('「전」은 띄어 쓴다 — 「김○○ 전 감독」, 「김 전 감독」.', 'Space 「전」 (former) — “former coach KIM, ○○,” “former coach KIM.”') }}</li>
            </ul>

            <h4>{{ t('12.6 고인', '12.6 The deceased') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 등장 시에만 「고」를 붙이고 이후 생략한다 — 「고 김○○」 → 「김○○」.', 'Add 「고」 (the late) only at first mention and omit it thereafter — “the late KIM, ○○” → “KIM, ○○.”') }}</li>
            </ul>

            <h4>{{ t('12.7 외국 선수·인물', '12.7 Foreign athletes and figures') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 등장: 「한글 표기(원어)」 — 「드레셀(Caeleb DRESSEL)」.', 'First mention: “Korean transcription (original)” — “드레셀 (Caeleb DRESSEL).”') }}</li>
              <li>{{ t('재등장: 「드레셀」.', 'Later mention: “DRESSEL.”') }}</li>
              <li>{{ t('한국에 잘 알려진 외국 인물은 한글만 표기한다.', 'For foreign figures well known in Korea, write the Korean transcription only.') }}</li>
            </ul>

            <h4>{{ t('12.8 일본·중국 인명·지명', '12.8 Japanese and Chinese names and places') }}</h4>
            <ul class="clauses">
              <li>{{ t('한자 병기 없이 한글로만 표기한다.', 'Write in Korean only, without Chinese characters.') }}</li>
              <li>{{ t('「대만」으로 표기한다. 「타이완」은 사용하지 않는다.', 'Use 「대만」 (Taiwan); do not use 「타이완」.') }}</li>
            </ul>
          </article>

          <article id="rule-13">
            <h3><span class="num">{{ t('제13조', 'Article 13') }}</span>{{ t('수치·날짜·단위', 'Numbers, Dates, Units') }}</h3>

            <h4>{{ t('13.1 숫자', '13.1 Numbers') }}</h4>
            <ul class="clauses">
              <li>{{ t('0~9,999는 아라비아 숫자로, 만·억·조 단위는 한글로 표기한다 — 「13억3890만원」.', 'Write 0–9,999 in Arabic numerals and the 만·억·조 (ten-thousand, hundred-million, trillion) units in Korean — 「13억3890만원」.') }}</li>
              <li>{{ t('천 단위 쉼표는 본문에 사용하지 않는다. 도표는 예외로 한다.', 'Do not use thousands-separator commas in body text; tables are an exception.') }}</li>
              <li>{{ t('개수 단위: 아라비아 숫자+단위는 붙여 쓰며(「3개」), 한글 숫자+단위는 띄어 쓴다(「세 개」).', 'Counting units: an Arabic numeral + unit is joined (「3개」), a Korean numeral + unit is spaced (「세 개」).') }}</li>
              <li>{{ t('나이는 「살」인 경우 한글로, 「세」인 경우 숫자로 표기한다 — 「두 살」, 「5세」.', 'For age, use Korean with 「살」 and numerals with 「세」 — 「두 살」, 「5세」.') }}</li>
            </ul>

            <h4>{{ t('13.2 구간 표기', '13.2 Ranges') }}</h4>
            <ul class="clauses">
              <li>{{ t('「2억~5억원」 형식으로 양쪽에 단위어를 모두 붙인다.', 'Attach the unit on both sides, as in 「2억~5억원」.') }}</li>
              <li>{{ t('「200~300만원」은 잘못된 표기이며 「200만~300만원」으로 쓴다.', '「200~300만원」 is incorrect; write 「200만~300만원」.') }}</li>
              <li>{{ t('「여」와 「이상」을 함께 사용하지 않는다.', 'Do not use 「여」 (odd/plus) and 「이상」 (or more) together.') }}</li>
            </ul>

            <h4>{{ t('13.3 분수·비율', '13.3 Fractions and ratios') }}</h4>
            <ul class="clauses">
              <li>{{ t('분수는 「3분의 1」 식으로 띄어 쓴다.', 'Space fractions, as in 「3분의 1」 (one third).') }}</li>
              <li>{{ t('대립은 한글 「대」로 표기한다 — 「3대 2」.', 'Write oppositions with the Korean 「대」 — 「3대 2」.') }}</li>
              <li>{{ t('백분율은 「%」 기호를 사용한다.', 'Use the “%” symbol for percentages.') }}</li>
            </ul>

            <h4>{{ t('13.4 날짜·시간', '13.4 Dates and times') }}</h4>
            <ul class="clauses">
              <li>{{ t('「○월 ○일」, 「○시 ○분」은 띄어 쓴다.', 'Space 「○월 ○일」 and 「○시 ○분」.') }}</li>
              <li>{{ t('연도는 4자리로 표기한다 — 「2026년 5월」.', 'Write years in four digits — 「2026년 5월」.') }}</li>
              <li>{{ t('보도 당일은 연도·월을 생략할 수 있다 — 「22일 밝혔다」.', 'On the day of reporting, the year and month may be omitted — 「22일 밝혔다」.') }}</li>
              <li>{{ t('기간 표기는 「1~5일」 형식으로 「~」 앞뒤를 붙여 쓴다.', 'Write date ranges as 「1~5일」, with the 「~」 joined on both sides.') }}</li>
              <li>{{ t('「달」은 한글로, 「개월」은 숫자로 표기한다.', 'Use Korean with 「달」 and numerals with 「개월」.') }}</li>
            </ul>

            <h4>{{ t('13.5 「어제·오늘·내일」 사용 금지', '13.5 No “yesterday, today, tomorrow”') }}</h4>
            <ul class="clauses">
              <li>{{ t('본문에 「어제·오늘·내일」은 사용하지 않는다.', 'Do not use 「어제·오늘·내일」 (yesterday, today, tomorrow) in the body.') }}</li>
              <li>{{ t('「지난」·「오는」은 날짜가 분명한 경우 생략한다.', 'Omit 「지난」 (last) / 「오는」 (coming) when the date is clear.') }}</li>
            </ul>

            <h4>{{ t('13.6 해외 행사 시간', '13.6 Overseas event times') }}</h4>
            <ul class="clauses">
              <li>{{ t('해외 행사: 「2일(현지시간)」, 한국시간 병기 필요 시 「2일 오전 10시(한국시간 3일 오후 8시)」.', 'Overseas events: 「2일(현지시간)」; when Korean time must be added, 「2일 오전 10시(한국시간 3일 오후 8시)」.') }}</li>
              <li>{{ t('「현지시간」으로 통일한다. 「현지시각」은 사용하지 않는다.', 'Use 「현지시간」 consistently; do not use 「현지시각」.') }}</li>
            </ul>

            <h4>{{ t('13.7 분기', '13.7 Quarters') }}</h4>
            <ul class="clauses">
              <li>{{ t('「1·4분기」가 아니라 「1분기」로 줄여 표기한다.', 'Write 「1분기」 (Q1) rather than 「1·4분기」.') }}</li>
            </ul>

            <h4>{{ t('13.8 단위 부호', '13.8 Unit symbols') }}</h4>
            <ul class="clauses">
              <li>{{ t('m, kg, km, ℃ 등의 부호는 숫자에 붙여 쓴다 — 「50m」, 「70kg」, 「25℃」.', 'Join symbols like m, kg, km, ℃ to the number — 「50m」, 「70kg」, 「25℃」.') }}</li>
              <li>{{ t('한글 단위와 결합하는 경우 띄어 쓴다 — 「50 미터」.', 'When combined with a Korean unit word, space it — 「50 미터」.') }}</li>
            </ul>

            <h4>{{ t('13.9 수영 기록 표기', '13.9 Swimming record notation') }}</h4>
            <ul class="clauses">
              <li class="major">{{ t('「분·초·1/100초」를 한글 단위로 명시하며, 단위 사이는 띄어 쓴다.', 'State minutes, seconds, and hundredths with Korean units, with spaces between the units.') }}</li>
              <li>{{ t('형식: 「24초 52」, 「1분 54초 22」, 「3분 42초 11」.', 'Format: 「24초 52」, 「1분 54초 22」, 「3분 42초 11」.') }}</li>
              <li>{{ t('국제대회 및 해외선수 보도에서도 동일 형식을 사용한다.', 'Use the same format even in international-meet and foreign-athlete reporting.') }}</li>
              <li>{{ t('평초의 경우에도 1/100초 자리를 두 자리로 모두 표시한다 — 「53초 00」.', 'Even for whole seconds, show both hundredths digits — 「53초 00」.') }}</li>
            </ul>

            <h4>{{ t('13.10 종목·거리', '13.10 Events and distances') }}</h4>
            <ul class="clauses">
              <li>{{ t('형식: 「자유형 50m」, 「개인혼영 200m」, 「혼계영 400m」.', 'Format: 「자유형 50m」 (50m freestyle), 「개인혼영 200m」 (200m individual medley), 「혼계영 400m」 (400m medley relay).') }}</li>
              <li>{{ t('거리는 아라비아 숫자에 m를 붙여 쓴다.', 'Join “m” to the Arabic numeral for distance.') }}</li>
              <li>{{ t('국제대회 보도에서도 영문 병기는 하지 않는다.', 'Do not add English even in international-meet reporting.') }}</li>
            </ul>

            <h4>{{ t('13.11 대회·이벤트명', '13.11 Competition and event names') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 등장 시 「제○○회 정식 명칭」으로 풀이한다.', 'Spell out at first mention as 「제○○회 + official name」.') }}</li>
              <li>{{ t('이후 약칭을 사용한다 — 「2024 파리올림픽」, 「세계선수권」.', 'Use an abbreviation thereafter — 「2024 파리올림픽」 (2024 Paris Olympics), 「세계선수권」 (World Championships).') }}</li>
            </ul>
          </article>

          <article id="rule-14">
            <h3><span class="num">{{ t('제14조', 'Article 14') }}</span>{{ t('외래어·약어·기호', 'Loanwords, Abbreviations, Symbols') }}</h3>

            <h4>{{ t('14.1 외래어', '14.1 Loanwords') }}</h4>
            <ul class="clauses">
              <li>{{ t('국립국어원 외래어 표기법을 원칙으로 한다.', 'As a rule, follow the National Institute of Korean Language\'s loanword transcription rules.') }}</li>
              <li>{{ t('일반화된 IT 용어는 우리말 표기 없이 그대로 사용할 수 있다 — 「PC」, 「DVD」.', 'Common IT terms may be used as-is without a Korean rendering — 「PC」, 「DVD」.') }}</li>
            </ul>

            <h4>{{ t('14.2 약어 표기', '14.2 Abbreviations') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 등장: 「한글 명칭(영문 약어)」 — 「국제수영연맹(FINA)」, 「국제수영연맹(WA)」, 「대한수영연맹(KSF)」.', 'First mention: “Korean name (English abbreviation)” — 「국제수영연맹(FINA)」, 「국제수영연맹(WA)」, 「대한수영연맹(KSF)」.') }}</li>
              <li>{{ t('이후 약어만 사용한다 — 「FINA가 발표한 ~」, 「WA가 발표한 ~」, 「KSF에 따르면 ~」.', 'Use the abbreviation only thereafter — “as announced by FINA,” “as announced by WA,” “according to KSF.”') }}</li>
            </ul>

            <h4>{{ t('14.3 상장기업·국제기구', '14.3 Listed companies and international bodies') }}</h4>
            <ul class="clauses">
              <li>{{ t('상장기업 첫 등장 시 회사명에 (영문, 거래소 종목코드) 병기 — 「돌비(Dolby, NYSE: DLB)」.', 'At a listed company\'s first mention, add (English, exchange ticker) to the name — “Dolby (Dolby, NYSE: DLB).”') }}</li>
            </ul>

            <h4>{{ t('14.4 열거', '14.4 Enumeration') }}</h4>
            <ul class="clauses">
              <li>{{ t('세 가지 이상 열거 시 △ 기호를 사용한다 — 「△예선 통과 △결승 진출 △메달 획득」.', 'For three or more items, use the △ symbol — 「△예선 통과 △결승 진출 △메달 획득」.') }}</li>
              <li>{{ t('△ 뒤 단어는 △에 붙여 쓴다.', 'Join the word directly after △.') }}</li>
            </ul>

            <h4>{{ t('14.5 복합어 기호', '14.5 Compound symbols') }}</h4>
            <ul class="clauses">
              <li>{{ t('복합어 단어 사이는 가운뎃점(·)을 사용한다 — 「홍보·마케팅」.', 'Use a middle dot (·) between words in a compound — 「홍보·마케팅」.') }}</li>
              <li>{{ t('두 업체·기관 연계는 하이픈(-)으로 표기한다 — 「삼성전자-LG전자」.', 'Link two companies or bodies with a hyphen (-) — 「삼성전자-LG전자」.') }}</li>
            </ul>

            <h4>{{ t('14.6 따옴표·괄호', '14.6 Quotation marks and brackets') }}</h4>
            <ul class="clauses">
              <li>{{ t('영화·책·행사명은 작은따옴표(\'\')로 표기한다.', 'Use single quotation marks (‘ ’) for film, book, and event titles.') }}</li>
              <li>{{ t('인용·대화는 큰따옴표("")로 표기한다.', 'Use double quotation marks (“ ”) for quotations and dialogue.') }}</li>
              <li>{{ t('따옴표 안 문장에 마침표를 사용하지 않으며, 따옴표가 문장을 종결하면 따옴표 다음에 마침표를 찍는다.', 'Do not put a period inside quotation marks; when they end the sentence, place the period after the closing mark.') }}</li>
            </ul>

            <h4>{{ t('14.7 인터뷰 양식', '14.7 Interview format') }}</h4>
            <ul class="clauses">
              <li>{{ t('질문은 「-」로, 답변은 「""」로 표시한다.', 'Mark questions with “-” and answers with “ ”.') }}</li>
              <li>{{ t('인터뷰 질문 끝에는 물음표를 붙이지 않는다.', 'Do not put a question mark at the end of an interview question.') }}</li>
            </ul>

            <h4>{{ t('14.8 기타 부호', '14.8 Other marks') }}</h4>
            <ul class="clauses">
              <li>{{ t('접속사(그러나, 그러므로, 그리고, 그런데) 뒤에 쉼표를 사용하지 않는다.', 'Do not put a comma after conjunctions (however, therefore, and, but).') }}</li>
              <li>{{ t('웹주소·이메일은 다른 문장부호로 감싸지 않는다.', 'Do not wrap web addresses or emails in other punctuation.') }}</li>
              <li>{{ t('시구·노래 가사 인용은 소절을 빗금 하나(/), 절을 둘(//)로 구분한다.', 'When quoting verse or lyrics, separate lines with one slash (/) and stanzas with two (//).') }}</li>
            </ul>
          </article>
        </section>

        <!-- ════════ 4부 ════════ -->
        <section id="part4">
          <h2>{{ t('4부 · 윤리·책임', 'Part 4 · Ethics & Responsibility') }}</h2>

          <article id="rule-15">
            <h3><span class="num">{{ t('제15조', 'Article 15') }}</span>{{ t('사진 윤리', 'Photo Ethics') }}</h3>
            <ul class="clauses">
              <li>{{ t('사진의 실체적 내용을 삭제·첨가·변형하는 등의 조작을 일체 금지한다.', 'Any manipulation that deletes, adds to, or alters the substantive content of a photo is entirely prohibited.') }}</li>
              <li>{{ t('허용 보정: 노출·색감·밝기 조정, 인물·구도 변경이 없는 자르기, 먼지 제거.', 'Permitted edits: exposure, color, and brightness adjustment; cropping that does not change the subject or composition; dust removal.') }}</li>
              <li>{{ t('금지 보정: 합성, 인물 추가 또는 삭제, 내용 변경 및 왜곡.', 'Prohibited edits: compositing, adding or removing people, and changing or distorting content.') }}</li>
              <li>{{ t('부득이한 사후 보정이 포함된 경우 캡션 또는 본문 말미에 그 사실을 명시한다.', 'When unavoidable post-editing is included, state so in the caption or at the end of the body.') }}</li>
              <li>{{ t('기사와 직접 관련이 없는 사진을 사용할 때에는 캡션에 「관련 자료사진」으로 표기한다.', 'When using a photo not directly related to the article, mark it “related file photo” in the caption.') }}</li>
              <li>{{ t('초상권 보호: 수영대회가 진행중인 도중의 선수를 제외한, 일반인의 얼굴이 식별 가능한 경우 본인의 동의를 받는다. 군중·관중 등 불특정 다수 촬영은 보도 목적상 허용한다.', 'Portrait rights: except for athletes during an ongoing swim meet, obtain consent when an ordinary person\'s face is identifiable. Photographing crowds or spectators — an unspecified many — is allowed for reporting purposes.') }}</li>
            </ul>
          </article>

          <article id="rule-16">
            <h3><span class="num">{{ t('제16조', 'Article 16') }}</span>{{ t('정정·반론·수정', 'Corrections, Rebuttals, Updates') }}</h3>

            <h4>{{ t('16.1 정정 시한과 의무', '16.1 Correction deadline and duty') }}</h4>
            <ul class="clauses">
              <li>{{ t('사실 오류가 확인되거나 정정 요구를 받은 경우 확인을 거쳐 신속히 정정한다. 원칙적으로 7일 이내에 처리한다.', 'When a factual error is confirmed or a correction is requested, verify and correct it promptly — as a rule, within seven days.') }}</li>
              <li>{{ t('인터넷 기사의 경우 해당 페이지 상단 또는 하단에 「※ 정정 안내」 박스를 고정 배치한다.', 'For online articles, place a fixed “※ Correction notice” box at the top or bottom of the page.') }}</li>
            </ul>

            <h4>{{ t('16.2 정정 내용 명시', '16.2 Stating the correction') }}</h4>
            <ul class="clauses">
              <li>{{ t('① 원문에서 무엇이 잘못되었는지', '① what was wrong in the original') }}</li>
              <li>{{ t('② 무엇으로 바뀌었는지', '② what it was changed to') }}</li>
              <li>{{ t('③ 누가, 언제 수정했는지', '③ who corrected it, and when') }}</li>
            </ul>

            <blockquote class="example">
              <span class="label">{{ t('예시', 'Example') }}</span>{{ t('※ 정정 안내 (2026. 5. 23. 10:30 수정) — 본문 중 「김○○ 선수의 기록은 49초 52」는 「49초25」의 오기였습니다. 수영사진 편집부.', '※ Correction notice (updated 23-05-2026 10:30) — In the body, 「Athlete KIM, ○○\'s record was 49.52」 was a typo for 「49.25」. Swimming Photography Editorial.') }}
            </blockquote>

            <h4>{{ t('16.3 수정 흔적 표기', '16.3 Marking revision history') }}</h4>
            <ul class="clauses">
              <li>{{ t('기사 상단에 발행 시점과 모든 수정 시점을 명시한다.', 'State the publication time and all revision times at the top of the article.') }}</li>
              <li>{{ t('형식: 「2026-05-22 09:00 발행 / 11:30 1차 수정 / 11:31 2차 수정」.', 'Format: “2026-05-22 09:00 published / 11:30 first correction / 11:31 second correction.”') }}</li>
            </ul>

            <h4>{{ t('16.4 보완과 정정의 분리', '16.4 Separating supplements from corrections') }}</h4>
            <ul class="clauses">
              <li>{{ t('사실은 맞으나 표현·맥락이 부족했던 경우 「보완 안내」 박스로 정정과 구분 표기한다.', 'When the facts are right but the wording or context was lacking, mark it with a “Supplement notice” box, distinct from a correction.') }}</li>
            </ul>

            <h4>{{ t('16.5 기타', '16.5 Other') }}</h4>
            <ul class="clauses">
              <li>{{ t('단순 오탈자는 의미 변경이 없는 경우 별도 표기 없이 수정한다.', 'Simple typos with no change in meaning are corrected without a separate note.') }}</li>
              <li>{{ t('의미가 바뀌는 수정은 반드시 정정 안내 박스로 표시한다.', 'Corrections that change meaning must always be marked with a correction-notice box.') }}</li>
              <li>{{ t('반론 요청은 합리적 범위에서 본문에 반영하거나 별도 반론으로 게재한다.', 'Rebuttal requests are reflected in the body within reason or published as a separate rebuttal.') }}</li>
              <li>{{ t('부당 재전송(같거나 비슷한 기사를 제목·일부만 바꿔 반복 게재)을 금지한다.', 'Improper resending (republishing the same or similar article with only the title or parts changed) is prohibited.') }}</li>
            </ul>
          </article>

          <article id="rule-17">
            <h3><span class="num">{{ t('제17조', 'Article 17') }}</span>{{ t('보도 윤리 — 인권·미성년·사생활', 'Reporting Ethics — Human Rights, Minors, Privacy') }}</h3>

            <h4>{{ t('17.1 공인 외 개인 신상', '17.1 Private individuals\' personal details') }}</h4>
            <ul class="clauses">
              <li>{{ t('공인이 아닌 개인의 얼굴·성명·병명·가족관계 등 사생활을 공개하려면 원칙적으로 당사자의 동의를 받는다.', 'As a rule, obtain consent before disclosing the private details — face, name, medical condition, family relationships — of a non-public individual.') }}</li>
            </ul>

            <h4>{{ t('17.2 미성년 선수·취재 대상', '17.2 Minor athletes and subjects') }}</h4>
            <ul class="clauses">
              <li>{{ t('만 13세 미만 어린이의 취재·촬영은 부모·보호자·학교장의 사전 동의를 필수로 한다.', 'Reporting on or photographing children under 13 requires prior consent from a parent, guardian, or school principal.') }}</li>
              <li>{{ t('만 19세 미만 청소년의 인터뷰·촬영은 보호자의 동의를 원칙으로 한다.', 'As a rule, interviewing or photographing minors under 19 requires a guardian\'s consent.') }}</li>
              <li>{{ t('미성년 선수도 풀네임과 소속을 표기한다. 애칭·이름 단독 호칭은 금지한다.', 'Even for minor athletes, give the full name and affiliation. Nicknames or first-name-only address are prohibited.') }}</li>
            </ul>

            <h4>{{ t('17.3 미성년 신원 보호', '17.3 Protecting minors\' identity') }}</h4>
            <ul class="clauses">
              <li>{{ t('청소년·어린이가 사건·사고에 관련된 경우 본인 및 가족의 신원을 밝히지 않는다.', 'When a minor or child is involved in an incident or accident, do not reveal their or their family\'s identity.') }}</li>
              <li>{{ t('범죄에 연루된 만 18세 이하의 신원은 비공개로 한다.', 'Keep the identity of anyone 18 or under involved in a crime undisclosed.') }}</li>
            </ul>

            <h4>{{ t('17.4 차별 표현 금지', '17.4 No discriminatory expressions') }}</h4>
            <ul class="clauses">
              <li>{{ t('장애·인종·국적·성별·지역·종교·성적 지향에 대한 비하 또는 고정관념 표현을 일체 금지한다.', 'Any expression that demeans or stereotypes disability, race, nationality, gender, region, religion, or sexual orientation is entirely prohibited.') }}</li>
              <li>{{ t('외국인 선수 보도 시 출신지를 단순 기술 외에 평가의 근거로 삼지 않는다.', 'In reporting on foreign athletes, do not use their place of origin as a basis for judgment beyond simple description.') }}</li>
              <li>{{ t('성적 지향·성 정체성은 보도와 직접 관련이 없는 한 밝히지 않는다.', 'Do not reveal sexual orientation or gender identity unless directly relevant to the report.') }}</li>
            </ul>

            <h4>{{ t('17.5 2차 피해 방지', '17.5 Preventing secondary harm') }}</h4>
            <ul class="clauses">
              <li>{{ t('사고·사건·논란 보도 시 피해자 측 2차 피해가 발생하지 않도록 익명성·상세 묘사를 제한한다.', 'In reporting accidents, incidents, or controversies, limit identity-revealing details and graphic description to prevent secondary harm to victims.') }}</li>
            </ul>

            <h4>{{ t('17.6 사망 보도', '17.6 Reporting deaths') }}</h4>
            <ul class="clauses">
              <li>{{ t('자살이 의심되는 경우라도 표제·본문에 「자살」을 사용하지 않는다.', 'Even when suicide is suspected, do not use “suicide” in the headline or body.') }}</li>
              <li>{{ t('「극단적 선택」 등 가치 판단 표현 대신 「사망」, 「숨지다」를 사용한다.', 'Use “death” or “died” instead of value-laden expressions like “extreme choice.”') }}</li>
              <li>{{ t('사망 원인 추정 보도는 금지한다.', 'Reporting that speculates on the cause of death is prohibited.') }}</li>
              <li>{{ t('구체적 방법·도구·장소 보도를 금지한다.', 'Reporting specific methods, means, or locations is prohibited.') }}</li>
            </ul>
          </article>

          <article id="rule-18">
            <h3><span class="num">{{ t('제18조', 'Article 18') }}</span>{{ t('출처·이해 충돌', 'Sourcing and Conflicts of Interest') }}</h3>

            <h4>{{ t('18.1 출처 명시 의무', '18.1 Duty to cite sources') }}</h4>
            <ul class="clauses">
              <li>{{ t('타 매체 기사 인용 시 「(○○일보=○○○ 기자) 보도에 따르면」 형식으로 출처를 명시한다.', 'When quoting another outlet\'s article, cite the source as “according to a report by (○○ Daily = Reporter ○○○).”') }}</li>
              <li>{{ t('자료·통계 인용 시 대한수영연맹·국제수영연맹 등 공식 발표의 일자와 출처를 명시한다.', 'When citing data or statistics, state the date and source of the official announcement (e.g., the Korea Swimming Federation, World Aquatics).') }}</li>
              <li>{{ t('보도자료를 받은 경우 사실 검증을 거쳐 보도한다.', 'When given a press release, report only after fact-checking.') }}</li>
            </ul>

            <h4>{{ t('18.2 금품·향응 금지', '18.2 No gifts or hospitality') }}</h4>
            <ul class="clauses">
              <li>{{ t('객원기자 및 편집부는 취재원으로부터 금품·향응·접대를 일체 받지 않는다.', 'Guest reporters and the editorial team accept no money, hospitality, or entertainment from sources.') }}</li>
              <li>{{ t('예외: 공식 대회·행사 입장권, 취재 편의 자료(보도자료·자료집)는 정상적인 취재 활동의 일환으로 허용한다.', 'Exception: official competition/event passes and reporting materials (press releases, press kits) are allowed as part of normal reporting.') }}</li>
            </ul>

            <h4>{{ t('18.3 이해관계 공개', '18.3 Disclosing conflicts of interest') }}</h4>
            <ul class="clauses">
              <li>{{ t('객원기자가 취재 대상과 가족·소속·금전적 이해관계가 있는 경우 사전에 편집부에 고지한다.', 'When a guest reporter has a family, membership, or financial interest with the subject, notify the editorial team in advance.') }}</li>
              <li>{{ t('게재 시 「※ 본 기자는 ○○○와 관계가 있음을 밝힙니다」를 명시한다.', 'On publication, state “※ This reporter discloses a relationship with ○○○.”') }}</li>
              <li>{{ t('이해 충돌이 큰 경우 해당 취재를 회피하는 것을 원칙으로 한다.', 'As a rule, recuse from the assignment when the conflict of interest is significant.') }}</li>
            </ul>

            <h4>{{ t('18.4 광고 구분', '18.4 Distinguishing advertising') }}</h4>
            <ul class="clauses">
              <li>{{ t('기사형 광고·홍보 콘텐츠는 명확히 광고로 표기한다.', 'Clearly label advertorial or promotional content as advertising.') }}</li>
              <li>{{ t('「[광고]」, 「[협찬]」, 「[제공]」 등 독자가 명백히 알 수 있는 표시를 의무로 한다.', 'Labels the reader can clearly recognize — “[Ad],” “[Sponsored],” “[Provided]” — are mandatory.') }}</li>
            </ul>
          </article>

          <article id="rule-19">
            <h3><span class="num">{{ t('제19조', 'Article 19') }}</span>{{ t('인터뷰·트라우마 보도', 'Interviews and Trauma Reporting') }}</h3>

            <h4>{{ t('19.1 부적절한 질문 금지', '19.1 No inappropriate questions') }}</h4>
            <ul class="clauses">
              <li>{{ t('「기분이 어떠셨어요?」 식의 즉답 강요형 감정 질문은 사용하지 않는다.', 'Do not use emotion-demanding questions like “How did you feel?” that force an immediate answer.') }}</li>
              <li>{{ t('대안 질문 — 「지금은 어떠신가요?」, 「그때를 어떻게 경험하셨나요?」, 「○○에 대해 어떻게 생각하시나요?」', 'Alternative questions — “How are you now?”, “How did you experience that time?”, “What do you think about ○○?”') }}</li>
            </ul>

            <h4>{{ t('19.2 인터뷰 통제권 고지', '19.2 Informing of interview control') }}</h4>
            <p style="font-size:15px;">{{ t('부상·은퇴·도핑·갈등 등 민감 사안 인터뷰에서는 취재원에게 다음을 사전 고지한다.', 'In interviews on sensitive matters — injury, retirement, doping, conflict — inform the source in advance of the following.') }}</p>
            <ul class="clauses">
              <li>{{ t('「원하시면 언제든 멈추셔도 됩니다」', '“You may stop at any time you wish.”') }}</li>
              <li>{{ t('「답하기 어려운 질문은 건너뛰셔도 됩니다」', '“You may skip any question you find hard to answer.”') }}</li>
              <li>{{ t('「오프 더 레코드를 원하시는 부분이 있으면 말씀해주세요」', '“Please tell us if there is anything you\'d like off the record.”') }}</li>
            </ul>

            <h4>{{ t('19.3 기자의 자세', '19.3 The reporter\'s posture') }}</h4>
            <ul class="clauses">
              <li>{{ t('트라우마 인터뷰에서 기자는 「이해합니다」, 「그 심정 압니다」라고 말하지 않는다.', 'In a trauma interview, the reporter does not say “I understand” or “I know how you feel.”') }}</li>
              <li>{{ t('취재원의 진술을 그대로 듣고, 자신의 감정을 투영하지 않는다.', 'Listen to the source\'s account as it is, without projecting one\'s own emotions.') }}</li>
              <li>{{ t('취재원이 감정을 추스를 시간이 필요한 경우 충분히 기다린다.', 'When the source needs time to compose themselves, wait patiently.') }}</li>
            </ul>

            <h4>{{ t('19.4 미성년 선수 인터뷰', '19.4 Interviewing minor athletes') }}</h4>
            <ul class="clauses">
              <li>{{ t('만 18세 미만 인터뷰는 보호자 또는 지도자 동석·동의를 원칙으로 한다.', 'As a rule, interviews with those under 18 require a guardian or coach to be present and to consent.') }}</li>
              <li>{{ t('질문 내용은 보호자가 사전에 확인할 수 있도록 협조한다.', 'Cooperate so the guardian can review the questions in advance.') }}</li>
            </ul>
          </article>
        </section>

        <!-- ════════ 5부 ════════ -->
        <section id="part5">
          <h2>{{ t('5부 · 수영 보도 특화', 'Part 5 · Swimming-Specific Reporting') }}</h2>

          <article id="rule-20">
            <h3><span class="num">{{ t('제20조', 'Article 20') }}</span>{{ t('수영 보도 표준', 'Swimming Reporting Standards') }}</h3>

            <h4>{{ t('20.1 선수 호칭', '20.1 Addressing athletes') }}</h4>
            <ul class="clauses">
              <li>{{ t('첫 등장: 「○○○ 선수(○○세, ○○ 소속)」.', 'First mention: “Athlete ○○○ (age ○○, ○○ affiliation).”') }}</li>
              <li>{{ t('재등장: 「○○○」 — 풀네임만 쓰고 직함을 붙이지 않는다. 「○ 선수」로 줄여 쓰지 않는다.', 'Later mention: full name only, with no title. Do not abbreviate to “surname + athlete.”') }}</li>
              <li>{{ t('미성년 선수도 풀네임을 사용한다. 애칭은 금지한다.', 'Use full names even for minor athletes. Nicknames are prohibited.') }}</li>
            </ul>

            <h4>{{ t('20.2 기록 표기', '20.2 Record notation') }}</h4>
            <ul class="clauses">
              <li>{{ t('형식: 「분·초·1/100초」를 한글 단위로 명시 — 「24초 52」, 「1분 54초 22」, 「3분 42초 11」.', 'Format: state minutes, seconds, and hundredths with Korean units — 「24초 52」, 「1분 54초 22」, 「3분 42초 11」.') }}</li>
              <li>{{ t('국제대회 및 해외선수 보도에서도 동일 형식을 사용한다.', 'Use the same format even in international-meet and foreign-athlete reporting.') }}</li>
              <li>{{ t('평초는 1/100초를 두 자리로 모두 표시한다 — 「53초 00」.', 'For whole seconds, show both hundredths digits — 「53초 00」.') }}</li>
            </ul>

            <h4>{{ t('20.3 종목 표기', '20.3 Event notation') }}</h4>
            <ul class="clauses">
              <li>{{ t('영법: 자유형 / 배영 / 평영 / 접영 / 개인혼영 / 혼계영 / 계영.', 'Strokes: freestyle / backstroke / breaststroke / butterfly / individual medley / medley relay / freestyle relay.') }}</li>
              <li>{{ t('거리: 「자유형 50m」, 「개인혼영 200m」. 거리는 아라비아 숫자에 m를 붙여 쓴다.', 'Distance: 「자유형 50m」, 「개인혼영 200m」. Join “m” to the Arabic numeral.') }}</li>
              <li>{{ t('영문 병기는 하지 않는다.', 'Do not add English alongside.') }}</li>
            </ul>

            <h4>{{ t('20.4 소속 표기', '20.4 Affiliation notation') }}</h4>
            <ul class="clauses">
              <li>{{ t('클럽·실업팀·학교·연맹은 정식 명칭을 사용한다.', 'Use the official names of clubs, corporate teams, schools, and federations.') }}</li>
              <li>{{ t('첫 등장 시 풀이하고, 재등장 시 약칭으로 한다.', 'Spell out at first mention, abbreviate thereafter.') }}</li>
            </ul>

            <h4>{{ t('20.5 메달·순위', '20.5 Medals and rankings') }}</h4>
            <ul class="clauses">
              <li>{{ t('「금메달」, 「은메달」, 「동메달」을 정식 표기로 한다.', 'Use 「금메달」 (gold), 「은메달」 (silver), 「동메달」 (bronze) as the standard forms.') }}</li>
              <li>{{ t('「1위」, 「2위」, 「3위」 사용을 허용한다.', '「1위」, 「2위」, 「3위」 (1st, 2nd, 3rd) are allowed.') }}</li>
              <li>{{ t('「금」 단독 표기는 헤드라인에서만 허용한다.', '「금」 (gold) alone is allowed only in headlines.') }}</li>
            </ul>

            <h4>{{ t('20.6 신기록 표기', '20.6 Record-breaking notation') }}</h4>
            <ul class="clauses">
              <li>{{ t('정식 명칭을 사용한다 — 「세계신기록」, 「아시아신기록」, 「한국신기록」, 「대회신기록」.', 'Use the official names — “world record,” “Asian record,” “Korean record,” “meet record.”') }}</li>
              <li>{{ t('약어 병기 시: 「세계신기록(WR)」, 「한국신기록(KR)」, 「대회신기록(MR)」.', 'With abbreviations: 「세계신기록(WR)」, 「한국신기록(KR)」, 「대회신기록(MR)」.') }}</li>
              <li>{{ t('기록 갱신 폭을 함께 명시한다 — 「종전 기록을 0.18초 단축」.', 'State the margin of improvement — “0.18 seconds off the previous record.”') }}</li>
            </ul>

            <h4>{{ t('20.7 경기 결과 동사', '20.7 Result verbs') }}</h4>
            <ul class="clauses">
              <li>{{ t('허용: 「우승했다」, 「이겼다」, 「꺾었다」, 「제쳤다」, 「앞섰다」.', 'Allowed: “won,” “beat,” “defeated,” “overtook,” “led.”') }}</li>
              <li>{{ t('금지: 「굴욕 안겼다」, 「박살냈다」, 「참패시켰다」, 「대패시켰다」, 「압살했다」 등 가치 및 과장 동사.', 'Prohibited: value-laden and hyperbolic verbs like “humiliated,” “crushed,” “routed,” “thrashed,” “annihilated.”') }}</li>
            </ul>

            <h4>{{ t('20.8 국가 약어', '20.8 Country abbreviations') }}</h4>
            <ul class="clauses">
              <li>{{ t('IOC 3자 코드를 사용한다.', 'Use IOC three-letter codes.') }}</li>
              <li>{{ t('첫 등장: 「대한민국(KOR)」, 「미국(USA)」, 「일본(JPN)」 — 한글에 괄호 코드를 병기한다.', 'First mention: 「대한민국(KOR)」, 「미국(USA)」, 「일본(JPN)」 — add the bracketed code to the Korean.') }}</li>
              <li>{{ t('이후 한글만 또는 IOC 코드를 단독으로 사용한다. 한 매체 내에서 일관성을 유지한다.', 'Thereafter, use the Korean alone or the IOC code alone. Keep it consistent within the outlet.') }}</li>
            </ul>

            <h4>{{ t('20.9 올림픽·국제대회', '20.9 Olympics and international meets') }}</h4>
            <ul class="clauses">
              <li>{{ t('「올림픽」, 「올림픽경기대회」, 「동계올림픽」 등 정식 명칭을 사용한다.', 'Use official names such as “Olympics,” “Olympic Games,” “Winter Olympics.”') }}</li>
              <li>{{ t('대회 첫 등장 시 「제○○회 정식 명칭」, 이후 약칭 — 「2024 파리올림픽」, 「세계선수권」.', 'At a meet\'s first mention, 「제○○회 + official name」; abbreviate thereafter — 「2024 파리올림픽」 (2024 Paris Olympics), 「세계선수권」 (World Championships).') }}</li>
            </ul>
          </article>
        </section>

        <!-- ════════ 6부 예시 기사 ════════ -->
        <section id="samples">
          <h2>{{ t('6부 · 예시 기사', 'Part 6 · Sample Articles') }}</h2>
          <p>{{ t('아래는 본 규약을 적용한 표준 기사 예시이다. 실제 인명·기록·일자는 가상의 것이며, 형식만을 참고한다.', 'The following are standard article examples applying these guidelines. The names, records, and dates are fictitious; refer only to the format.') }}</p>

          <article class="sample">
            <div class="sample-label">{{ t('예시 1 · 경기 기사', 'Example 1 · Meets Article') }}</div>
            <h5>{{ t('김○○, 자유형 100m 한국신기록 수립', 'KIM, ○○ Sets Korean Record in 100m Freestyle') }}</h5>
            <p class="subhead">{{ t('잠실 실내수영장서 49초 52… 종전 기록 0.18초 단축', '49.52 at Jamsil Indoor Pool… 0.18s off the previous record') }}</p>
            <p>{{ t('김○○(22·대한수영연맹) 선수가 22일 잠실 실내수영장에서 열린 제○○회 전국체전 남자 자유형 100m 결승에서 49초 52를 기록하며 한국신기록을 수립했다. 이는 종전 기록을 0.18초 단축한 것으로, 김○○은 이번 대회에서만 두 번째 한국신기록 경신이다.', 'Athlete KIM, ○○ (22, Korea Swimming Federation) set a Korean record of 49.52 in the men\'s 100m freestyle final at the ○○th National Sports Festival, held on the 22nd at Jamsil Indoor Swimming Pool. The mark is 0.18 seconds faster than the previous record — KIM\'s second Korean record at this meet alone.') }}</p>
            <p>{{ t('김○○은 출발 반응 0.62초로 결승 진출자 중 두 번째로 빠른 스타트를 보였다. 첫 50m 구간은 23초18에 통과해 선두권에 자리한 뒤, 후반 50m에서 26초34의 속도를 유지하며 가장 먼저 터치패드를 찍었다.', 'KIM had the second-fastest start among the finalists, with a reaction time of 0.62 seconds. He passed the first 50m in 23.18 to sit near the front, then held a 26.34 pace over the back 50m to touch the wall first.') }}</p>
            <p>{{ t('김○○은 경기 직후 "지난 6개월간 후반 페이스 유지에 집중해 훈련했는데, 그 결과가 나와서 기쁘다"고 말했다. 이어 "이번 기록을 발판으로 내년 국제대회 출전을 목표로 준비하겠다"고 덧붙였다.', 'Just after the race, KIM said, “I trained for the past six months focusing on holding my back-half pace, and I\'m glad it paid off.” He added, “I\'ll use this result as a springboard and aim to compete at international meets next year.”') }}</p>
            <p>{{ t('대한수영연맹(KSF)에 따르면, 이번 대회 남자 자유형 100m 종목에는 총 38명이 출전했다. 김○○은 다음달 ○○에서 열리는 ○○컵 국제대회에 한국 대표로 출전할 예정이다.', 'According to the Korea Swimming Federation (KSF), 38 swimmers entered the men\'s 100m freestyle at this meet. KIM is scheduled to represent Korea at the ○○ Cup international meet in ○○ next month.') }}</p>
            <div class="caption">{{ t('김○○이 자유형 100m 결승에서 터치패드를 찍고 있다. 이날 그는 49초 52로 한국신기록을 수립했다. 사진=홍길동 기자 / 2026. 5. 22. 잠실 실내수영장', 'KIM, ○○ touches the wall in the 100m freestyle final. He set a Korean record of 49.52 that day. Photo: Reporter HONG, Gildong / 22-05-2026, Jamsil Indoor Swimming Pool') }}</div>
            <div class="byline">{{ t('수영사진 홍길동 기자 / hong@medalbank.com', 'Swimming Photography, Reporter HONG, Gildong / hong@medalbank.com') }}</div>
          </article>

          <article class="sample">
            <div class="sample-label">{{ t('예시 2 · 인물 기사', 'Example 2 · Athlete Article') }}</div>
            <h5>{{ t('"물에 들어가는 그 순간이 가장 정직하다"', '“The moment I enter the water is the most honest”') }}</h5>
            <p class="subhead">{{ t('마스터즈 12년 차 박○○, 50대의 수영 이야기', 'PARK, ○○, in her 12th year of masters swimming — a swimming story in her fifties') }}</p>
            <p>{{ t('박○○(54·○○마스터즈) 씨가 마스터즈 수영에 입문한 지 올해로 12년째다. 직장에서 은퇴를 앞두고도 매주 네 번씩 새벽 6시 강습을 거르지 않는다. 박 씨는 18일 ○○시 ○○실내수영장에서 만난 자리에서 본인의 수영 이야기를 들려주었다.', 'This year marks PARK, ○○\'s (54, ○○ Masters) twelfth year in masters swimming. Even with retirement from work approaching, she never misses the 6 a.m. class four times a week. PARK shared her swimming story when we met on the 18th at ○○ Indoor Swimming Pool in ○○.') }}</p>
            <p>{{ t('박 씨가 처음 수영을 시작한 것은 마흔두 살 때였다. 무릎 통증으로 운동 종목을 바꾸어야 했고, 평생 수영을 두려워했던 그가 처음 자유형 25m를 완주한 날을 "가장 또렷한 하루"로 기억한다고 했다.', 'PARK first started swimming at forty-two. She had to switch sports because of knee pain, and having feared the water all her life, she said she remembers the day she first completed 25m of freestyle as “the most vivid day.”') }}</p>
            <p>{{ t('박 씨는 "물에 들어가는 그 순간이 가장 정직하다"며 "몸이 준비된 만큼만 앞으로 나아가기 때문에, 매일의 훈련이 그대로 결과로 돌아온다"고 말했다. 이어 "마스터즈는 기록보다 자기 자신과의 약속을 지키는 운동"이라고 덧붙였다.', 'PARK said, “The moment I enter the water is the most honest,” adding, “You move forward only as much as your body is ready, so each day\'s training comes back exactly as the result.” She added, “Masters swimming is a sport of keeping a promise to yourself rather than chasing times.”') }}</p>
            <p>{{ t('박 씨는 지난해 ○○지역 마스터즈 대회 자유형 50m에서 본인 최고 기록을 경신했다. 올해는 평영 종목에도 처음 출전할 예정이다.', 'Last year, PARK set a personal best in the 50m freestyle at the ○○ regional masters meet. This year she is scheduled to compete in breaststroke for the first time.') }}</p>
            <div class="caption">{{ t('박○○이 새벽 훈련을 마치고 수영장을 나서고 있다. 박 씨는 12년째 마스터즈 수영을 이어가고 있다. 사진=정○○ 기자 / 2026. 5. 18. ○○실내수영장', 'PARK, ○○ leaves the pool after morning training. She is in her 12th year of masters swimming. Photo: Reporter JUNG, ○○ / 18-05-2026, ○○ Indoor Swimming Pool') }}</div>
            <div class="byline">{{ t('수영사진 정○○ 기자 / jung@medalbank.com', 'Swimming Photography, Reporter JUNG, ○○ / jung@medalbank.com') }}</div>
          </article>

          <article class="sample">
            <div class="sample-label">{{ t('예시 3 · 현장 기사 (제보 기반)', 'Example 3 · On-Site Article (tip-based)') }}</div>
            <h5>{{ t('동호회 \'○○수영\', 창립 10주년 친선 대회 개최', 'Club ‘○○ Swimming’ Holds Friendly Meet for Its 10th Anniversary') }}</h5>
            <p class="subhead">{{ t('회원 80여 명 참가… 자유형·평영·계영 세 종목 진행', 'Some 80 members take part… three events: freestyle, breaststroke, relay') }}</p>
            <p>{{ t('수영 동호회 \'○○수영\'이 창립 10주년을 기념해 15일 ○○시 ○○수영장에서 친선 대회를 개최했다. 이번 대회에는 회원 80여 명이 참가했으며, 자유형 50m·평영 50m·혼성 계영 4×50m 등 세 종목이 진행됐다.', 'The swimming club ‘○○ Swimming’ held a friendly meet on the 15th at ○○ Swimming Pool in ○○ to mark its 10th anniversary. About 80 members took part, and three events were held: 50m freestyle, 50m breaststroke, and mixed 4×50m relay.') }}</p>
            <p>{{ t('대회는 오전 10시부터 오후 3시까지 약 5시간에 걸쳐 진행됐다. 모든 종목은 친선 형식으로 운영되었고, 참가자 전원에게 기념 메달이 수여됐다. 동호회 측에 따르면 이번 대회는 회원 간 친목을 다지고 평소 훈련의 성과를 점검하는 자리로 마련됐다.', 'The meet ran about five hours, from 10 a.m. to 3 p.m. Every event was run in a friendly format, and all participants received a commemorative medal. According to the club, the meet was arranged to build camaraderie among members and to check the results of their regular training.') }}</p>
            <p>{{ t('동호회 회장 이○○ 씨는 "10년 동안 함께 물에 들어와준 모든 회원들에게 감사하다"며 "앞으로도 회원들이 부담 없이 수영을 즐길 수 있는 자리를 계속 마련하겠다"고 말했다.', 'Club president LEE, ○○ said, “I\'m grateful to every member who has gotten in the water with us for ten years,” adding, “We\'ll keep creating occasions where members can enjoy swimming without pressure.”') }}</p>
            <p>{{ t('\'○○수영\'은 2016년 회원 12명으로 출범했으며, 현재 정기 회원 수는 110여 명이다. 매주 토요일 오전 정기 강습을 운영하고 있다.', '‘○○ Swimming’ launched in 2016 with 12 members and now has about 110 regular members. It runs a regular class on Saturday mornings.') }}</p>
            <div class="caption">{{ t('참가자들이 계영 종목을 마친 뒤 시상대에 오르고 있다. 이날 대회에는 회원 80여 명이 참가했다. 사진=이○○ 회원 / 2026. 5. 15. ○○수영장', 'Participants take the podium after finishing the relay. About 80 members took part in the meet. Photo: Member LEE, ○○ / 15-05-2026, ○○ Swimming Pool') }}</div>
            <div class="byline">{{ t('수영사진 편집부 / 제보 이○○', 'Swimming Photography Editorial / Tip by LEE, ○○') }}</div>
          </article>
        </section>

        <!-- ════════ 맺음말 ════════ -->
        <section id="closing">
          <h2>{{ t('맺음말', 'Closing') }}</h2>

          <h3>{{ t('본 규약의 정신', 'The spirit of these guidelines') }}</h3>
          <p>{{ t('본 규약은 Swimming Photography의 품격을 함께 지키기 위한 편집부와 기자 간의 약속이다. 처음에는 다소 까다롭게 느껴질 수 있으나, 한 편의 기사가 한 사람의 수영 인생에 한 페이지로 새겨질 수 있도록 정성껏 다듬어 발행한다는 Swimming Photography의 정신을 함께 실천하는 길이다.', 'These guidelines are a promise between the editorial team and its reporters to protect Swimming Photography\'s dignity together. They may feel somewhat demanding at first, but they are a way of practicing, together, Swimming Photography\'s spirit of carefully polishing and publishing each article so it can be inscribed as a page in someone\'s swimming life.') }}</p>

          <h3>{{ t('문의', 'Inquiries') }}</h3>
          <p>{{ t('규약에 대한 질문, 기사 방향에 대한 사전 상의, 첨삭 회신에 대한 추가 논의 등은 수영사진 편집부 이메일로 보낼 수 있다. 모든 정식 소통은 이메일을 통해 이루어지며, 편집부는 모든 이메일에 책임지고 회신한다.', 'Questions about the guidelines, advance discussion of an article\'s direction, and further discussion of editing feedback may be sent to the Swimming Photography editorial email. All formal communication takes place by email, and the editorial team responsibly replies to every message.') }}</p>

          <h3>{{ t('개정', 'Revisions') }}</h3>
          <p>{{ t('본 규약은 운영 과정에서 보완·갱신될 수 있다. 개정 시에는 모든 객원기자에게 이메일로 안내하며, 개정 내역은 본 문서의 변경 이력에 명시한다.', 'These guidelines may be supplemented and updated in the course of operation. On revision, all guest reporters are notified by email, and the changes are recorded in this document\'s change history.') }}</p>

          <dl class="changelog">
            <dt>{{ t('v1.0 — 2026. 5. 22.', 'v1.0 — 22-05-2026') }}</dt>
            <dd>{{ t('최초 발행. Swimming Photography 신문체 8가지 규약 및 운영 3가지 규약을 정립.', 'Initial release. Established Swimming Photography\'s 8 newspaper-style rules and 3 operational rules.') }}</dd>
            <dt>{{ t('v2.0 — 2026. 5. 22.', 'v2.0 — 22-05-2026') }}</dt>
            <dd>{{ t('한국 및 영미권 대표 언론사 규약 벤치마킹 결과를 반영. 기존 11가지 규약을 20가지 규약으로 확장. 기존 1~8조에 보강 조항을 추가하고, 신규 제12조~제20조를 신설함.', 'Reflected benchmarking against leading Korean and Anglo-American news outlets\' guidelines. Expanded the existing 11 rules to 20. Added reinforcing clauses to the existing Articles 1–8 and newly established Articles 12–20.') }}</dd>
          </dl>
        </section>


          <!-- 광고 (본문 최하단 섹션) -->
          <section class="ad-section" aria-label="광고">
            <h3 class="ad-heading">{{ t('광고', 'Advertisement') }}</h3>
            <div class="ad-slot">ㅍㅇ ㅎㅇㅌ</div>
          </section>

        </article>
  </div>
</template>

<style>
/* 머리말: 타이틀 아래 보더 제거 + 박스를 보더 높이로 끌어올림 (원문 인라인 스타일 이식) */
#preface h2 { border-bottom: none; margin-bottom: 0; }
</style>
