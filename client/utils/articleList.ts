// DB 기사 문서(JSON) → 목록·검색 카드용 flat 형태.
// index.vue(홈 목록)·search.vue(검색)가 공유. 문서의 중첩 구조(translations/payload/media)에서
// 카드 렌더에 필요한 값만 평탄화한다. ENG 값이 없으면 '' → 화면에서 한글로 폴백.

export interface ArticleCard {
  slug: string
  cat: string; catENG: string
  title: string; titleENG: string
  thumb: string
  date: string          // YYYY-MM-DD (publishedAt 기준)
  region: string; regionENG: string
  competition: string; competitionENG: string
  athlete: string; athleteENG: string
  event: string; eventENG: string
  record: string
}

// 카테고리 슬러그(영문) → 한글 표준 라벨. 홈 필터·표시는 한글(경기/현장/인물) 기준이지만
// 일부 기사는 searchCategories 형식(meet/athlete/…)으로 저장돼 있어 매핑해 준다. 이미 한글이면 그대로.
const CAT_KO: Record<string, string> = {
  meet: '경기', meets: '경기', competition: '경기', competitions: '경기', result: '경기', results: '경기',
  athlete: '인물', athletes: '인물', people: '인물', person: '인물', masters: '인물', youth: '인물',
  onsite: '현장', 'on-site': '현장', field: '현장', event: '현장', events: '현장', facility: '현장', club: '현장',
}
export function catKo(cats: any): string {
  const raw = String((Array.isArray(cats) ? cats[0] : cats) || '').trim()
  if (!raw) return '경기'
  return CAT_KO[raw.toLowerCase()] || (['경기', '현장', '인물'].includes(raw) ? raw : '경기')
}

// 목록 날짜 — 발행일(publishedAt) 우선, 없으면 생성일(createdAt/created)로 폴백.
// (발행 전 초안이나 publishedAt 이 빈 문서도 월 그룹에 노출되도록)
export function articleDate(d: any): string {
  return String(d?.publishedAt || d?.createdAt || d?.created || d?.updatedAt || '').slice(0, 10)
}

export function normArticle(d: any): ArticleCard {
  const ko = d?.translations?.ko || {}
  const en = d?.translations?.en || {}
  return {
    slug: d?.slug || '',
    cat: catKo(ko.categories),
    catENG: (en.categories || [])[0] || '',
    title: ko.title || '',
    titleENG: en.title || '',
    thumb: d?.media?.thumb || d?.media?.coverImage || (d?.media?.images && d.media.images[0]?.url) || '',
    date: articleDate(d),   // 발행일(publishedAt) 우선, 없으면 생성일 폴백
    region: '', regionENG: '',
    competition: '', competitionENG: '',
    athlete: '', athleteENG: '',
    event: '', eventENG: '',
    record: '',
  }
}
