# 출력 스키마 (schema.md)

기사 생성 API의 출력 형식. **2단계 중 하나를 지정해 사용한다.**
- **A. 기사 JSON** — 본문 블록만 (검수·미리보기용)
- **B. DB 문서 JSON** — A를 `translations.ko.content`에 넣은 전체 문서 (DB 저장용)

---

## A. 기사 JSON

```json
{
  "slug": "article-YYYYMMDD-{선수명 로마자 소문자}",
  "type": "article",
  "status": "draft",
  "langDefault": "ko",
  "availableLangs": ["ko"],
  "sourceType": "ai_generated",
  "generationJobId": null,
  "reporter": { "name": "편집부", "nameEng": "Editorial Team", "email": "press@medalbank.com" },
  "relations": { "competitionId": null, "venueId": null, "athleteId": null, "teamId": null, "timeIds": null, "imageIds": null, "startListIds": null },
  "media": {
    "thumb": "RACE 사진 url. 사진 없으면 빈 문자열",
    "coverImage": "thumb과 동일",
    "images": [
      {
        "imageId": null,
        "url": "sourceData.images[].url",
        "role": "ENTER→venue, 그 외(BLOCK·START·RACE·TOUCHPAD)→race",
        "photographer": "편집부", "photographerEng": "Editorial Team", "email": "press@medalbank.com",
        "translations": {
          "ko": { "title": "", "caption": "2문장(①현재진행형 동작 ②과거형 결과) + 「사진=편집부 (@medalbankaquatics) / YYYY년 M월 D일 수영장명」" },
          "en": { "title": "", "caption": "" },
          "ja": { "title": "", "caption": "" }
        }
      }
    ]
  },
  "tags": ["competition.masters", "discipline.{영법영문}", "distance.{거리}", "course.lcm", "medal.{gold|silver|bronze, 입상 시}", "region.{광역영문}", "region.{시군구영문}", "venue.{수영장영문}"],
  "searchTags": ["영법 한글·영문, 거리, 부, 대회약칭, 선수명, 팀명"],
  "searchCategories": ["meet", "athlete", "masters"],
  "translations": {
    "ko": {
      "title": "", "subtitle": "", "excerpt": "",
      "content": {
				"title": "",
				"subtitle": "",
				"excerpt": "",
				"lead": "【지역】 으로 시작하는 리드 3~4문장",
				"blocks": [
					{ "type": "competition", "source": "info",        "text": "① 대회 명칭·일시·장소·진행 방식. 선수·통계 언급 금지. poolInfo 사실 병합 가능" },
					{ "type": "event",       "source": "summary",     "text": "② 선수 첫 등장·출전 종목 구성·코스·결과 요약" },

					{ "type": "event",       "source": "result",      "title": "③ 첫 종목 소제목(결과 확정형)", "text": "경기번호·(레인)·기록·순위. heats 참조" },
					{ "type": "event",       "source": "event",       "text": "영법 참가·도약 수, 전체 최고 기록. events 참조" },
					{ "type": "event",       "source": "record",      "text": "기준 기록 비교 — 마스터즈 차이 먼저(선출이면 PB 중심). events.records 참조. 소제목 금지" },
					{ "type": "recordTable", "caption": "성별 영법 거리 주요 기록 비교",
						"rows": [
							{ "segment": "이번 대회",        "record": "", "note": "선수명 · 부 · 순위" },
							{ "segment": "PB",              "record": "", "note": "수립 대회 · 연도 — 없으면 행 생략" },
							{ "segment": "세계기록",         "record": "", "note": "보유자(국가) · 연도" },
							{ "segment": "올림픽기록",       "record": "", "note": "없으면 record는 —, note에 사유를 사실로" },
							{ "segment": "한국기록(여)",     "record": "", "note": "" },
							{ "segment": "한국기록(남)",     "record": "", "note": "" },
							{ "segment": "세계마스터즈기록", "record": "", "note": "" },
							{ "segment": "한국마스터즈기록", "record": "", "note": "" }
						] },
					// ③ 그룹(result→event→record→recordTable)을 종목 수만큼 성적순 반복.
					// 두 번째 종목부터 result에 title 없음(소제목 총량 규칙).
					// quotes가 있으면 quote 블록을 해당 종목 뒤에:
					{ "type": "quote", "text": "", "speaker": "", "role": "참가 선수", "source": "경기 후 현장 인터뷰", "isVerified": false },

					{ "type": "team",        "source": "info",        "title": "④ 팀 소제목", "text": "팀 선수 수·도약 수·메달. 1~3위면 선수 메달의 팀 집계 포함 명시" },
					{ "type": "team",        "source": "events",      "text": "팀 영법별 도약. teamInfo.disciplines 참조" },

					{ "type": "competition", "source": "event",       "text": "⑦ 참가 팀 수·선수 수·총 도약 수 → 종목 구성(△). competitionInfo 참조" },
					{ "type": "competition", "source": "disciplines", "text": "영법별 참가자 수 → 영법별 도약 수 (둘을 구분해 각 1문장). 여기서 기사가 끝난다" }
				],
				"categories": ["경기"],
				"tags": ["선수명", "팀명", "대회약칭", "종목1", "종목2", "시군구", "광역"],
				"seoTitle": "title과 동일 가능",
				"seoDescription": "리드 첫 문장 축약"
			},
      "categories": ["경기"], "tags": [], "seoTitle": "", "seoDescription": ""
    },
    "en": { "title": "", "subTitle": "", "excerpt": "", "content": {}, "categories": [], "tags": [], "seoTitle": "", "seoDescription": "" },
    "ja": { "title": "", "subTitle": "", "excerpt": "", "content": {},  "categories": [], "tags": [], "seoTitle": "", "seoDescription": "" }
  },
  "editorial": {
    "factChecked": false, "reviewedBy": "",
    "reviewMemo": "ai_generated 초안. 확인 필요 항목을 여기 나열",
    "riskLevel": "low"
  },
  "visibility": { "isFeatured": false, "showInHome": true, "showInSearch": true, "showInAthleteProfile": true, "showInTeamPage": true, "showInCompetitionPage": true },
  "permissions": { "consentStatus": "unknown", "canShowAthleteName": true, "canShowHighResPhoto": false },
  "stats": { "views": 0, "uniqueViews": 0, "likes": 0, "shares": 0 },
  "corrections": [],
  "publishedAt": null,
  "createdAt": "생성 시각 ISO(+09:00)",
  "updatedAt": null
}
```

## 필드 채움 규칙

- `status: "draft"`, `publishedAt: null` — AI 초안은 항상 발행 전 상태. 검수 후 발행 시 status=published, corrections에 「발행」 추가.
- `payload.data`의 단일 필드(event·rank·time·record)는 **성적이 가장 좋은 주 종목**, `events` 배열에 출전 종목 전부.
- **학생부(미성년 가능) 선수**: `riskLevel: "medium"`, reviewMemo에 「보호자 동의(규약 17.2) 확인 후 발행」 명시. 본문 풀네임·소속 표기는 정상.
- 사진이 없으면 media.thumb·coverImage 빈 문자열, images 빈 배열.
- 캡션의 동작 묘사는 사진 type이 보증하는 범위까지만(출발대에 섰다·역영하고 있다·터치하고 있다). 표정·심리 묘사 금지. 종목을 특정할 수 없으면 종목 언급 없이 쓰고 reviewMemo에 확인 요청.
- `isRegistered` 미확인이면 null. 선출 여부는 기록 비교 서술 방식에 영향을 주므로(prompt 7항) 추정하지 않는다.
