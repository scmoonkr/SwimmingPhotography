DB name: SwimmingPhotography
// articles
{
  _id,
  slug, // lee-kanghae-freestyle-backstroke-50-lcm-ansan-20260626
  type: "article",
	article_type, // athlete_story | meet_report | team_story | photo_news | record_news | breaking_news
  status, // draft | published | hidden | archived

  langDefault: "ko",
  availableLangs: ["ko", "en", "ja"],

  sourceType: "ai_generated", // manual | ai_generated | imported
  generationJobId,

  reporter: {
    name: "편집부",
    nameEng: "Editorial Team",
    email: "press@medalbank.com"
  },

  // SwimmingPhotography에 없으면 Breaststroke,MedalbankAquaticsDB에서 가져온다
  relations: {
    competitionId,
    venueId, // Breaststroke.pools 참조
    athleteId,
    teamId: // Breaststroke.teams 참조
    timeIds: // Breaststroke.mergedTimes 참조
    imageIds: // MedalbankAquatics.images 참조
    startListIds,
  },

  media: {
    thumb: "",
    coverImage: "",
    images: [
      {
        imageId,
        url: "",
        thumb: "",
        role: "race", // race | award | team_photo | cheering | profile | venue
        photographer: "",
        photographerEng: "",
        email: "",
        translations: {
          ko: { title: "", caption: "" },
          en: { title: "", caption: "" },
          ja: { title: "", caption: "" }
        }
      }
    ],
		youtube: [
			{
        url: "",
        translations: {
          ko: { title: "", caption: "" },
          en: { title: "", caption: "" },
          ja: { title: "", caption: "" }
        }
      }
		]
  },

	tags:[
    "competition.meet",
    "discipline.freestyle",
    "distance.100",
    "course.lcm",
    "medal.gold",
    "record.pb",
    "record.meet_record",
    "team.blue_sharks",
    "venue.jamsil",
    "region.seoul"
 ],

  searchTags: [
    "자유형",
    "freestyle",
    "自由形",
    "100m",
    "개인최고기록",
    "PB"
  ],

  searchCategories: [
    "record",
    "athlete",
    "masters"
  ],

  translations: {
    ko: {
      title: "",
      subtitle: "",
      excerpt: "",
      content: "content" : {
				"lead" : "【안산】 CRS압구정 소속 이강해는 2026년 6월 26일 경기도 안산 대부동 복지체육센터 수영장에서 열린 제1회 안산시수영연맹 x SOOP 전국마스터즈수영대회 남자 성인 7부 경기에 출전했다. 이강해는 자유형 50m LCM Heat 249에서 23초 78로 터치패드를 찍으며 1위를 차지했고, 배영 50m LCM Heat 221에서는 29초 50으로 2위에 올랐다.",
				"blocks" : [
						{
								"type" : "profile",
								"sourceRef" : "athlete",
								"athleteId" : null,
								"name" : "이강해",
								"gender" : "남자",
								"group" : "성인부",
								"ageGroup" : "성인 7부",
								"team" : "CRS압구정",
								"sido" : "경기",
								"eventCount" : NumberInt(2),
								"medalCount" : NumberInt(2),
								"bestRank" : NumberInt(1),
								"reusable" : true,
								"isVerified" : true
						},
				],
				"categories" : [
					"경기"
				],
				"tags" : [
						"이강해",
						"CRS압구정",
						"자유형 50m",
						"배영 50m",
						"안산",
						"전국마스터즈수영대회"
				],
				"seoTitle" : "이강해, 안산 전국마스터즈 자유형 50m 우승",
				"seoDescription" : "CRS압구정 소속 이강해가 제1회 안산시수영연맹 x SOOP 전국마스터즈수영대회 남자 성인 7부 자유형 50m에서 23초 78로 1위, 배영 50m에서 29초 50으로 2위를 기록했다."

			}
      categories: [],
      tags: [],
      seoTitle: "",
      seoDescription: ""
    },
    en: {
      title: "",
      subTitle: "",
      excerpt: "",
      content: "",
      categories: [],
      tags: [],
      seoTitle: "",
      seoDescription: ""
    },
    ja: {
      title: "",
      subTitle: "",
      excerpt: "",
      content: "",
      categories: [],
      tags: [],
      seoTitle: "",
      seoDescription: ""
    }
  },

  payload: {
    type: "athlete_story",
    data: {}
  },

  editorial: {
    factChecked: false,
    reviewedBy: "",
    reviewMemo: "",
    riskLevel: "low" // low | medium | high
  },

  visibility: {
    isFeatured: false,
    showInHome: true,
    showInSearch: true,
    showInAthleteProfile: true,
    showInTeamPage: true,
    showInCompetitionPage: true
  },

  permissions: {
    consentStatus: "unknown", // granted | denied | unknown
    canShowAthleteName: true,
    canShowHighResPhoto: false
  },

  stats: {
    views: 0,
    uniqueViews: 0,
    likes: 0,
    shares: 0
  },

  publishedAt,
  createdAt,
  updatedAt
}
