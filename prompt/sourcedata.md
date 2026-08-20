# sourceData 입력 규격 (sourcedata.md)

API user 메시지에 넣는 입력 JSON의 필드 정의와 검증 규칙.
**여기 정의되지 않은 필드는 임의 해석하지 않는다.**

## 1. 구조

```
{
  athlete:          선수 기본 정보
  note:             선수 관련 추가 재료 (② 선수 문단에 녹임)
  images[]:         사진 목록 (type + url)
  events[]:         종목별 결과 (성적 판단·기록 비교의 원천)
  heats[]:          경기(Heat)별 배정 정보
  competitionInfo:  대회 정보 + 규모 통계 + notes/quotes
  poolInfo:         수영장 정보 + notes/quotes
  teamInfo:         선수 소속팀 성적
  previousTitles[]: (선택) 같은 대회 기발행 제목 — 제목 유형 중복 회피용
}
```

## 2. 영법 코드

| 코드 | 한글 | 코드 | 한글 |
|---|---|---|---|
| FR | 자유형 | BA | 배영 |
| BR | 평영 | IM | 개인혼영 |
| FL | 접영 | FRR | 계영 |
| | | MR | 혼계영 |

본문에는 한글만. 영문 코드·병기 금지.

## 3. 집계 필드 정의

| 필드 | 의미 | 기사 표기 예 |
|---|---|---|
| competitionInfo.athleteCount | 대회 전체 고유 참가 선수 수 | 「702명이 출전해」 |
| competitionInfo.startCount | 대회 총 도약 수(엔트리 건수) | 「1,571회의 도약」 |
| competitionInfo.disciplines[].athleteCount | 영법별 **고유 참가자 수** | 「자유형 392명」 |
| competitionInfo.disciplines[].startCount | 영법별 **도약 수** | 「자유형 539회」 |
| events[].athleteCount | 해당 영법(성별)의 고유 참가자 수 | 「남자 자유형에 186명이 출전해」 |
| events[].startCount | 해당 영법(성별)의 도약 수 | 「232회의 도약이 이뤄졌다」 |
| heats[].athleteCount / startCount | 해당 경기 배정 / 출발 인원 | 「7명이 배정돼 전원이 출발대에 섰다」 |
| teamInfo.athleteCount / startCount | 팀 선수 수 / 팀 도약 수 | 「선수 5명 · 7회의 도약」 |

- **startCount > athleteCount는 정상** — 한 선수가 같은 영법 50m·100m에 출전하면 참가자 1명·도약 2회.
- 참가자 수와 도약 수를 반드시 구분해 쓴다. 한쪽만 있으면 그쪽만 쓰고, 없는 값을 추정하지 않는다.

## 4. events 세부

- `best`: 라운드 무관 해당 종목 전체 최고 기록. `gold`: round=='결승'일 때 결승 1위. 예선 없는 대회에서는 동일.
- `best.diff`(선수와의 격차)는 **선수가 1~3위일 때만** 서술에 사용. 4위 이하는 격차 없이 1위 기록만 사실로.
- `records[]`: 기준 기록. **diff는 time으로 재계산해 검증** — 불일치 시 계산값 사용. 방향이 애매하면 「○초 차이다」로만.
- records의 time이 「—」이면 사유를 사실로 풀어 씀(예: 올림픽 정식 종목 아님).
- PB가 없으면 PB 행·PB 서술 생략.

## 5. notes / quotes 녹임 위치

| 필드 | 위치 | 처리 |
|---|---|---|
| notesCompetition | ① 대회 기본정보 | 사실만. 주체 없는 평가는 삭제 |
| note (athlete) | ② 선수 | 〃 |
| notesPool | ⑥ 수영장(또는 ① 병합) | 〃 |
| notesParking / notesWeather | ⑥ | 〃 |
| quotes* | quote 블록 + 인용 문단 | 주체 명시된 발언만 |

빈 문자열 = 재료 없음. 상상해 채우지 않는다.
예) `notesPool: "시설보수를하여 선수들 이용이 편리했다"` → 「대회를 앞두고 시설 보수를 진행했다」 (「편리했다」 삭제)
예) `notesCompetition: "체계적이고 선수 친화적인 준비가 돋보였다"` → 전문 삭제 (관찰 사실 없음)

## 6. images

type: ENTER(입장) / BLOCK(출발대) / START(출발) / RACE(역영) / TOUCHPAD(터치).
캡션 동작 묘사는 type이 보증하는 범위까지만. 종목 특정 불가 시 종목 언급 없이 쓰고 reviewMemo에 확인 요청.

## 7. 검증 체크 (기사 작성 전)

1. events의 rank로 순위 분기 결정 (1위 / 2·3위 / 4위 이하)
2. records.diff 전수 재계산 — 불일치 필드는 버리고 계산값 사용
3. 같은 대회 내 복수 events의 수치가 동일 복제로 의심되면 사용 보류하고 출력 시 확인 요청
4. 선수 기록이 마스터즈기록보다 빠르면 → isRegistered(선출) 확인. true면 신기록 서술 금지, null이면 신기록 선언 없이 병기만 하고 확인 요청
5. ageGroup이 학생부면 → riskLevel medium + 보호자 동의 확인 메모
6. previousTitles 있으면 제목 유형 중복 회피, 없으면 출력 시 한 줄 안내

## 8. 샘플 입력

```json
{
  "athlete": { "name": "이강해", "gender": "남자", "group": "성인부", "ageGroup": "성인 7부", "team": "CRS압구정", "sido": "경기" },
  "note": "",
  "images": [
    { "type": "ENTER", "url": "SP-images-3611/7R500132-ENTER.jpg" },
    { "type": "RACE", "url": "SP-images-3611/7R500280-RACE.jpg" },
    { "type": "TOUCHPAD", "url": "SP-images-3611/7R500462-TOUCHPAD.jpg" }
  ],
  "events": [
    {
      "discipline": "자유형", "distance": "50M", "course": "LCM",
      "time": "23초 78", "rank": 1,
      "athleteCount": 186, "startCount": 232,
      "best": { "name": "이강해", "team": "CRS압구정", "time": "23초 78", "diff": "0.00" },
      "gold": { "name": "이강해", "team": "CRS압구정", "time": "23초 78", "diff": "0.00" },
      "team": { "athleteCount": 1, "startCount": 1, "goldCount": 1, "silverCount": 0, "bronzeCount": 0 },
      "records": [
        { "category": "PB", "time": "23초 67", "diff": "+0.11", "holder": "2017 MBC배 전국 수영대회 (2017)" },
        { "category": "세계기록", "time": "20초 88", "diff": "+2.90", "holder": "Cameron McEVOY (AUS) · 2026" },
        { "category": "올림픽기록", "time": "21초 07", "diff": "+2.71", "holder": "Caeleb DRESSEL (USA) · 2021" },
        { "category": "한국기록(여)", "time": "24초 97", "diff": "−1.19", "holder": "허연경 · 2023" },
        { "category": "한국기록(남)", "time": "21초 66", "diff": "+2.12", "holder": "지유찬 · 2025" },
        { "category": "세계마스터즈기록", "time": "22초 13", "diff": "+1.65", "holder": "Roland Schoeman · 2013" },
        { "category": "한국마스터즈기록", "time": "23초 83", "diff": "−0.05", "holder": "이병주 · 2023" }
      ]
    }
  ],
  "heats": [
    { "gender": "남자", "discipline": "자유형", "distance": "50M", "ageGroup": "성인 7부", "round": "", "heat": "249", "athleteCount": 7, "startCount": 7 }
  ],
  "competitionInfo": {
    "competitionName": "제1회 안산시수영연맹 x SOOP 전국마스터즈수영대회",
    "sido": "경기", "date": "2026-06-26",
    "teamCount": 138, "athleteCount": 702, "startCount": 1571,
    "disciplines": [
      { "startCount": 539, "discipline": "FR", "athleteCount": 392 },
      { "startCount": 363, "discipline": "BR", "athleteCount": 246 },
      { "startCount": 335, "discipline": "FL", "athleteCount": 254 },
      { "startCount": 334, "discipline": "BA", "athleteCount": 242 },
      { "startCount": 32, "discipline": "FRR", "athleteCount": 32 },
      { "startCount": 29, "discipline": "MR", "athleteCount": 29 }
    ],
    "notesCompetition": "체계적이고 선수 친화적인 준비가 돋보였다",
    "notesParking": "", "notesWeather": "",
    "quotesCompetition": "", "quotesParking": "", "quotesWeather": ""
  },
  "poolInfo": {
    "pool": "대부동 복지체육센터 수영장",
    "notesPool": "대회를 맞이하여 시설보수를하여 선수들 이용이 편리했다",
    "quotesPool": ""
  },
  "teamInfo": {
    "team": "CRS압구정", "athleteCount": 5, "startCount": 7,
    "goldCount": 1, "silverCount": 3, "bronzeCount": 0,
    "disciplines": [
      { "count": 4, "discipline": "BR" },
      { "count": 1, "discipline": "BA" },
      { "count": 1, "discipline": "FR" },
      { "count": 1, "discipline": "FL" }
    ]
  },
  "previousTitles": [
    "이강해, 자유형 금메달에 배영 은메달"
  ]
}
```
