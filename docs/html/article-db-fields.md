# 기사(article) DB 필드 정의

`article.html` 본문에 **실제로 표시되는 순서(위 → 아래)** 대로 정리.
형식: `필드명 | 타입 | 내용 예시` 를 JSON 으로 표현.
**모든 필드명은 camelCase** (언더스코어 없음). 입력 시트(`_authoring/기사-입력시트.xlsx`)의 dbField 와 1:1 대응.

```json
{
  "competitionId":       { "type": "string", "example": "2026-medalbank-33333", "note": "대회 단일 소스 참조 키. category·competition·region·venue·date 는 이 대회 레코드에서 조인" },

  "category":            { "type": "string",        "example": "경기", "note": "공란 시 기본값 '경기'" },
  "region":              { "type": "string",        "example": "서울" },
  "venue":               { "type": "string",        "example": "잠실실내수영장" },
  "competition":         { "type": "string",        "example": "제33333회 메달뱅크배 수영대회" },
  "date":                { "type": "date",          "example": "2026-05-22", "note": "경기(대회)일. 대회 레코드에서 조인" },

  "athlete":             { "type": "string",        "example": "홍길동", "note": "필수·사실. 절대 생성 금지" },
  "isRegistered":        { "type": "boolean",       "example": true,  "note": "true=등록선수(전문체육) / false=비등록(생활체육). 공란→false" },
  "ageGroup":            { "type": "string",        "example": "일반부", "note": "성인부/일반부/대학부/고등부/중등부/초등부/유년부/유아부" },

  "discipline": {
    "type": "object",
    "note": "종목 구성요소. 4개를 합쳐 event 표시 문자열을 생성",
    "item": { "gender": "string(남자/여자/혼성)", "stroke": "string(자유형/배영/평영/접영/개인혼영/계영/혼계영)", "distance": "number(m)", "course": "string(LCM/SCM)" },
    "example": { "gender": "남자", "stroke": "자유형", "distance": 100, "course": "LCM" }
  },
  "event":               { "type": "string", "example": "남자 자유형 100M LCM", "note": "discipline 에서 생성(규약 13.10 실제 종목만)" },

  "round":               { "type": "string",        "example": "결선", "note": "예선/준결선/결선" },
  "rank":                { "type": "string",        "example": "1위",  "note": "예) 1위 / 예선 3위 / 실격" },
  "time":                { "type": "string",        "example": "01:33.33", "note": "원자료 00:00.00(분:초.백분초)" },
  "record":              { "type": "string",        "example": "「1분 33초 33」", "note": "time 에서 생성. 규약 13.9 한글 형식" },

  "title":               { "type": "string",        "example": "홍길동, 자유형 100m 한국신기록 수립", "note": "생성(입력 title 는 힌트)" },
  "subtitle":            { "type": "string",        "example": "잠실 실내수영장서 「1분 33초 33」… 종전 기록 「0초 33」 단축", "note": "생성" },
  "isFeatured":          { "type": "boolean",       "example": false, "note": "사이트 상단 하이라이트 노출. 공란→false" },

  "publishedAt":         { "type": "datetime",        "example": "2026-05-22T09:00:00+09:00", "note": "날짜=입력, 시각=기본값" },
  "modifiedAt":          { "type": "datetime | null", "example": null, "note": "최초 null, 수정 시 자동" },

  "photos": {
    "type": "array<object> (최대 5장)",
    "item": { "image": "string(경로/URL)", "caption": "string" },
    "note": "caption 문장은 scenes 입력을 승화해 생성. 끝에 크레딧 고정: '사진=<photoName> (@medalbankaquatics)'",
    "example": [
      {
        "image": "images/temp/20260522_048A3135.jpg",
        "caption": "홍길동이 남자 자유형 100m 결선에서 마지막 33m 구간을 헤엄치고 있다. 이날 홍 선수는 「1분 33초 33」으로 한국신기록을 수립했다. 사진=편집부 (@medalbankaquatics) / 2026년 5월 22일 잠실실내수영장"
      }
    ]
  },

  "lead":  { "type": "string", "example": "홍길동 선수가 22일 서울 잠실실내수영장에서 열린 제33333회 메달뱅크배 수영대회 남자 자유형 100m 결선에서 「1분 33초 33」을 기록하며 한국신기록을 수립했다. …", "note": "생성. backgrounds 입력을 승화(창작 금지)" },

  "body": {
    "type": "array<block> (블록 단위 본문)",
    "note": "생성. scenes·backgrounds·vibes·notes 를 승화. quotes 는 실제 발언만(공란이면 quote 블록 생략)",
    "blocks": {
      "paragraph":   { "type": "paragraph",   "text": "string" },
      "quote":       { "type": "quote",       "text": "string", "source": "string" },
      "recordTable": { "type": "recordTable", "caption": "string", "rows": [ { "segment": "string", "record": "string", "note": "string" } ] },
      "heading":     { "type": "heading",     "text": "string" }
    },
    "example": [
      { "type": "paragraph", "text": "홍 선수는 출발 반응속도 0.33초로 결선에 오른 8명 가운데 두 번째로 빠르게 입수했다. 50m 반환점을 「33초 33」에 통과한 그는 마지막까지 선두를 지키며 2위와 「0초 33」 차이로 터치패드를 찍었다." },
      { "type": "quote", "text": "마지막 33m에서 팔이 무거웠지만, 기록판을 확인하기 전까지는 멈추지 않겠다고 생각했다.", "source": "홍길동 선수" },
      { "type": "recordTable", "caption": "구간 기록", "rows": [
        { "segment": "50m",  "record": "「33초 33」",     "note": "반환점" },
        { "segment": "100m", "record": "「1분 33초 33」", "note": "한국신기록" }
      ] },
      { "type": "heading", "text": "3년 만에 다시 쓴 기록" },
      { "type": "paragraph", "text": "이번 기록은 2023년 작성된 종전 한국기록을 3년 만에 끌어내린 것이다. …" }
    ]
  },

  "tags":                { "type": "array<string>", "example": ["메달뱅크배", "자유형100m", "한국신기록"], "note": "입력 tags + 자동 보강. 공란이어도 자동 생성" },

  "reporterName":        { "type": "string", "example": "편집부", "note": "공란→'편집부'" },
  "reporterEmail":       { "type": "string", "example": "press@medalbank.com", "note": "공란→'press@medalbank.com'" },
  "photoName":           { "type": "string", "example": "편집부", "note": "공란→'편집부'. 캡션 크레딧에 사용" },
  "photoEmail":          { "type": "string", "example": "press@medalbank.com", "note": "공란→'press@medalbank.com'" },

  "copyright":           { "type": "string", "example": "ⓒ Swimming Photography. 무단 전재 및 재배포 금지." },
  "registrationNumber":  { "type": "string", "example": "인천,아 33333호" },

  "corrections": {
    "type": "array<object>",
    "item": { "timestamp": "datetime", "note": "string" },
    "note": "발행=자동 1행, 정정 시 timestamp 자동 + 사유(note) 입력",
    "example": [
      { "timestamp": "2026-05-22T09:00:00+09:00", "note": "발행" },
      { "timestamp": "2026-05-22T11:30:00+09:00", "note": "1차 수정. 50m 반환점 통과 기록을 「33초 83」에서 「33초 33」로 정정했습니다." }
    ]
  }
}
```

## 필드 분류 (A 입력 / B 생성 / C 고정)

- **A (사람이 입력·사실)** — `competitionId · category · region · venue · date · athlete · isRegistered · ageGroup · discipline(gender·stroke·distance·course) · round · rank · time`, 그리고 body 재료(`quotes` 실제 발언, scenes·backgrounds·vibes·notes).
- **B (생성·검토 전제)** — `event · record · title · subtitle · lead · body · tags · photos[].caption`.
- **C (고정·자동)** — `isFeatured(기본 false) · publishedAt(시각) · modifiedAt · reporterName · reporterEmail · photoName · photoEmail · copyright · registrationNumber · corrections`.

## 생성 규칙

- `discipline` 4요소 → `event` 표시 문자열. 예) `남자 자유형 100M LCM` (규약 13.10 실제 종목·거리만).
- `time`(00:00.00) → `record` 한글 표시. 예) `01:33.33` → `「1분 33초 33」` (규약 13.9).
- `title`(입력)은 **힌트** — 이를 가공해 최종 `title` + `subtitle` 생성.
- `scenes·backgrounds·vibes·notes` 는 **승화(사실 재구성)만, 창작 금지**. `quotes` 는 실제 발언만(공란이면 quote 블록 생략).
- 사진 캡션 끝 크레딧 **고정**: `사진=<photoName> (@medalbankaquatics)` — 우리는 직접 촬영본만 사용.

## 참고

- `category · region · competition · event · athlete` 는 **분류 필드**이자 **브레드크럼**(수영 › 카테고리 › 지역 › 대회 › 종목 › 선수) 표시에 함께 쓰인다.
- 페이지 하단의 **「같은 선수 / 같은 종목 / 같은 지역 최근 기사」** 블록은 저장 필드가 아니라, 위 분류 필드(`athlete` / `event` / `region`)로 **검색·쿼리해서 자동 생성**되는 영역이다.
- `competitionId` 로 대회 레코드를 참조하며, `category · competition · region · venue · date` 는 대회 공통 소스에서 조인한다.
- 기록(`record`)·기록표는 작성 규약 13.9 한글 형식(`「33초 33」`, `「1분 33초 33」`)을 따른다.
