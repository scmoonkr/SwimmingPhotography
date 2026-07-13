// DB 기사 문서(JSON) → 목록·검색 카드용 flat 형태.
// index.vue(홈 목록)·search.vue(검색)가 공유. 문서의 중첩 구조(translations/payload/media)에서
// 카드 렌더에 필요한 값만 평탄화한다. ENG 값이 없으면 '' → 화면에서 한글로 폴백.

export interface ArticleCard {
  slug: string
  cat: string; catENG: string
  title: string; titleENG: string
  thumb: string
  date: string          // YYYY-MM-DD (payload.data.date, 없으면 publishedAt)
  region: string; regionENG: string
  competition: string; competitionENG: string
  athlete: string; athleteENG: string
  event: string; eventENG: string
  record: string
}

export function normArticle(d: any): ArticleCard {
  const ko = d?.translations?.ko || {}
  const en = d?.translations?.en || {}
  const pd = d?.payload?.data || {}
  return {
    slug: d?.slug || '',
    cat: (ko.categories || [])[0] || pd.category || '경기',
    catENG: (en.categories || [])[0] || '',
    title: ko.title || '',
    titleENG: en.title || '',
    thumb: d?.media?.thumb || d?.media?.coverImage || (d?.media?.images && d.media.images[0]?.url) || '',
    date: pd.date || String(d?.publishedAt || '').slice(0, 10),
    region: pd.region || '', regionENG: '',
    competition: pd.competition || '', competitionENG: '',
    athlete: pd.athlete || '', athleteENG: '',
    event: pd.event || '', eventENG: '',
    record: pd.record || '',
  }
}
