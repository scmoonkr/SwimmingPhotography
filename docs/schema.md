DB name: SwimmingPhotography
// articles
{
  _id,
  slug,
  type, // athlete_story | meet_report | team_story | photo_news | record_news
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
      content: "",
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

translations.content.{kr}
"content": {
  "lead": "...",
  "blocks": [
    {
      "type": "paragraph",
      "title": "...",
      "text": "..."
    },
    {
      "type": "highlight",
      "label": "현장 인상",
      "text": "..."
    },
    {
      "type": "stat",
      "label": "공식 기록",
      "value": "00:32.74",
      "description": "비등록 남자 평영 50m · LCM · 예선",
      "unit": "time"
    },
    {
      "type": "interval",
      "label": "구간 기록",
      "records": [
         { distance:"50M",time: "33초33", note: "반환점"},
         { distance:"100M",time: "1분 33초33", note: "한국신기록"}
      ]
    },
    {
      "type": "image",
      "imageId": "img_ansan_pool_001",
      "role": "venue",
      "caption": "...",
      "alt": "..."
    },
    {
      "type": "quote",
      "text": "마지막 33m에서 팔이 무거웠지만, 기록판을 확인하기 전까지는 멈추지 않겠다고 생각했다.",
      "speaker": "박종은",
      "role": "참가 선수",
      "source": "경기 후 현장 인터뷰",
      "isVerified": false
    },
    {
      "type": "note",
      "label": "편집자 주",
      "text": "...",
      "noteType": "fact_check"
    }
  ],
  "conclusion": "..."
}


DB name: Breaststroke
mergedTimes: {
    _id,
    "competitionName" : "제12회 김천 전국 수영대회",
    "round" : "finals",
    "isMasters" : false,
    "distance" : "100M",
    "ageGroup" : "남자고등부",
    "gender" : "men",
    "isAdult" : false,
    "rank" : 12,
    "lane" : 1,
    "team" : "덜위치칼리지서울영국학교",
    "sido" : "경북",
    "name" : "AHN SONG YOUNGSOO THOMAS",
    "grade" : "1",
    "time" : "01:07.02",
    "timeStamp" : 0.000775694444444444,
    "competitionID" : 2300,
    "poolID" : 1341,
    "pool" : "김천",
    "stemID" : 397,
    "stem" : "김천 전국 수영대회",
    "datetime" : "2022-03-12",
    "course" : "LCM",
    "teamID" : 11908,
    "type" : "event",
    "discipline" : "BR",
    "aid" : 1000001,
    "group" : "고등부",
    "measured" : "자동계측",
    "timeID" : 752966,
    "waPoints" : 611
}

competitions: {
    _id,
    "competitionID" : 1003,
    "competitionName" : "제21회 Daejeon is U 전국 마스터즈 수영대회",
    "stemID" : 1,
    "stem" : "Daejeon is U 전국 마스터즈 수영대회",
    "isMasters" : true,
    "poolID" : 927,
    "pool" : "대전용운국제수영장",
    "sido" : "대전",
    "course" : "LCM",
    "measured" : "자동계측"
}

pools: {
    _id,
    "_id" : ObjectId("6a119b6c420f8e64e1edbcfc"),
    "poolID" : 433,
    "pool" : "문학박태환수영장",
    "sido" : "인천"
}

teams: {
    _id,
    "teamID" : 2,
    "name" : "1등하고싶다",
}

DB name: MedalbankAquatics
images: {
    _id,
    "image_id" : 5592,
    "athlete_id" : 0,
    "meet_id" : 0,
    "date" : null,
    "filename" : "7R503835.jpg",
    "urls" : {
        "thumb" : "meet-0/thumbs/5592.jpg",
        "preview" : "meet-0/previews/5592.jpg",
        "large" : "meet-0/large/5592.jpg",
        "original" : "meet-0/original/5592.jpg"
    },
    "tags" : [],
    "category" : [],
    "created_at" : ISODate("2026-04-12T05:43:11.000Z")
}