// 대시보드 mock 데이터 — UI 구성용 샘플. 나중에 Express API(6640) 연동으로 교체.
// 각 엔티티: { title, en, subtitle, columns, rows }
//   columns[].cls  : 셀 스타일 클래스 (strong | mono | muted | num)
//   columns[].type : 'badge'(상태) | 'thumb'(이미지)  → DataTable 이 특수 렌더

export interface Column {
  key: string
  label: string
  cls?: 'strong' | 'mono' | 'muted' | 'num'
  type?: 'badge' | 'thumb'
  // 중첩 데이터(article 스키마 등)에서 표시값을 뽑는 접근자. 없으면 row[key] 사용.
  get?: (row: any) => any
}
export interface Entity {
  title: string
  en: string
  subtitle: string
  columns: Column[]
  rows: Record<string, any>[]
}

// 드로어 편집 필드 — get/set 으로 임의 스키마(중첩 포함) 매핑
export interface Field {
  key: string
  label: string
  // 입력형: text | textarea | select | checkbox
  // 표시전용: meta(읽기텍스트) | thumbs(썸네일 줄) | link(URL) | imagelist(썸네일+이미지명, 최대 5)
  type?: 'text' | 'textarea' | 'select' | 'checkbox' | 'meta' | 'thumbs' | 'link' | 'imagelist'
  options?: string[]
  half?: boolean   // 한 줄에 둘씩 배치 (span 2 = 반 줄). 기본: 한 줄 전체(span 4)
  span?: 1 | 2 | 3 | 4  // 4열 그리드에서 차지할 칸 수 (half 보다 우선, 세밀 배치용)
  rows?: number    // textarea 줄 수 (기본 7)
  get: (row: any) => any   // thumbs 는 url 배열, 그 외는 문자열 반환
  set: (row: any, value: any) => void
}

// 상태 라벨 → 뱃지 색 매핑 (DataTable 에서 사용)
export const badgeVariant = (v: string): string => {
  const map: Record<string, string> = {
    '진행중': 'b-good', '공개': 'b-good', '확정': 'b-good', '게시됨': 'b-good',
    '예정': 'b-warn', '검수': 'b-warn', '대기': 'b-warn',
    '취소': 'b-bad', '비공개': 'b-bad',
    '종료': 'b-mute', '초안': 'b-mute',
  }
  return map[v] || 'b-mute'
}

// 기사 미디어 포함 여부 — 목록 컬럼용
export const hasImage = (r: any): boolean =>
  !!(r?.media?.images?.length || r?.media?.thumb || r?.media?.coverImage)
export const hasYoutube = (r: any): boolean => {
  const blocks = r?.translations?.ko?.content?.blocks || []
  return blocks.some((b: any) => b?.provider === 'youtube' || /youtu\.?be/i.test(String(b?.url || '')))
}

// title 로부터 slug 생성 (한글·영문·숫자 유지, 나머지는 하이픈)
export const slugify = (s: string) =>
  (s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'article'

const mkReporter = (name = '편집부') => ({
  name,
  nameEng: name === '편집부' ? 'Editorial Team' : name,
  email: 'press@medalbank.com',
})

// docs/schema.md 의 articles 스키마에 맞춘 속보 객체 생성
const mkArticle = (o: {
  title: string; reporter?: string; categories: string[]; tags: string[]
  lead: string; paragraphs: string[]; publishedAt: string; updatedAt: string
}) => ({
  slug: slugify(o.title),
  type: 'breaking_news',
  status: 'published',
  langDefault: 'ko',
  sourceType: 'manual',
  reporter: mkReporter(o.reporter),
  searchTags: o.tags,
  searchCategories: o.categories,
  translations: {
    ko: {
      title: o.title,
      subtitle: '',
      excerpt: o.lead.slice(0, 60),
      content: {
        lead: o.lead,
        blocks: o.paragraphs.map((text) => ({ type: 'paragraph', text })),
      },
      categories: o.categories,
      tags: o.tags,
      seoTitle: o.title,
      seoDescription: o.lead.slice(0, 80),
    },
  },
  publishedAt: o.publishedAt,
  updatedAt: o.updatedAt,
})

// 시도 목록 (필터·셀렉트 공용)
export const SIDO_LIST = ['서울', '부산', '대구', '인천', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '광주', '경북', '경남', '제주', '해외']

// 속보 분류 목록 (value=searchCategories 슬러그, label=표시)
export const BN_CATEGORIES = [
  { v: 'meet', l: '경기' },
  { v: 'record', l: '기록' },
  { v: 'athlete', l: '인물' },
  { v: 'venue', l: '현장·시설' },
  { v: 'notice', l: '안내' },
  { v: 'column', l: '칼럼' },
]

// 신규 등록용 빈 경기장(venues) 객체
export const blankVenue = () => ({
  pool: '',
  sido: '',
  lanes: null,
  length: '50m',
  address: '',
})

// 신규 등록용 빈 대회(Breaststroke.competitions) 객체
export const blankCompetition = () => ({
  competitionName: '',
  datetime: '',
  pool: '',
  sido: '',
  course: 'LCM',
  isMasters: false,
  measured: '자동계측',
  sketch: '',       // 대회 스케치
  poolSketch: '',   // 수영장 스케치
})

// 신규 등록용 빈 기사(article) 객체 — type 으로 속보/기사 구분
export const blankArticle = (type = 'breaking_news') => ({
  slug: '',
  type,
  status: 'published',
  langDefault: 'ko',
  sourceType: 'manual',
  reporter: mkReporter('편집부'),
  searchTags: [] as string[],
  searchCategories: [] as string[],
  translations: {
    ko: {
      title: '', subtitle: '', excerpt: '',
      content: { lead: '', blocks: [] as any[] },
      categories: [] as string[], tags: [] as string[],
      seoTitle: '', seoDescription: '',
    },
  },
  publishedAt: '',
  updatedAt: '',
})

const DATA: Record<string, Entity> = {
  breakingNews: {
    title: '속보', en: 'Breaking News', subtitle: '긴급 소식·속보를 게시하고 관리합니다.',
    columns: [
      { key: 'title', label: '헤드라인', cls: 'strong', get: (r) => r.translations?.ko?.title || '' },
      { key: 'categories', label: '분류', get: (r) => (r.searchCategories || []).join(', ') },
      { key: 'reporter', label: '출처', cls: 'muted', get: (r) => r.reporter?.name || '' },
      { key: 'tags', label: '태그', get: (r) => (r.searchTags || []).join(', ') },
      { key: 'publishedAt', label: '게시', cls: 'mono', get: (r) => r.publishedAt || '' },
    ],
    rows: [
      mkArticle({
        title: '홍길동, 자유형 100m 한국신기록 수립', reporter: '편집부',
        categories: ['record', 'athlete'], tags: ['자유형', 'freestyle', '100m', '한국신기록', 'PB'],
        lead: '잠실 실내수영장서 1분 33초 33… 종전 기록 0.33초 단축.',
        paragraphs: [
          '홍길동 선수가 2026 전국수영대회 남자 자유형 100m 결승에서 1분 33초 33으로 한국신기록을 수립했다. 종전 기록을 0.33초 앞당긴 기록이다.',
          '홍 선수는 이번 대회 남자 자유형 50m에 이어 100m에서도 한국신기록을 경신해, 한 대회에서 두 개의 신기록을 작성했다.',
        ],
        publishedAt: '2026-05-22 09:12', updatedAt: '2026-05-22 09:30',
      }),
      mkArticle({
        title: '남자 계영 400m 결승, 0.33초 차 은메달', reporter: '편집부',
        categories: ['meet'], tags: ['계영', 'relay', '400m', '은메달'],
        lead: '마지막 영자의 역영으로 0.33초 차 은메달.',
        paragraphs: ['남자 계영 400m 결승에서 대표팀이 0.33초 차이로 은메달을 획득했다. 마지막 영자의 역영이 돋보였다.'],
        publishedAt: '2026-05-22 11:48', updatedAt: '2026-05-22 11:48',
      }),
      mkArticle({
        title: '이서연, 접영 100m 대회신기록 경신', reporter: '편집부',
        categories: ['record', 'athlete'], tags: ['접영', 'butterfly', '100m', '대회신기록'],
        lead: '58초 91, 대회신기록으로 금메달.',
        paragraphs: ['이서연 선수가 접영 100m에서 58초 91로 대회신기록을 경신하며 금메달을 차지했다.'],
        publishedAt: '2026-05-22 10:05', updatedAt: '2026-05-22 10:05',
      }),
      mkArticle({
        title: '잠실 실내수영장, 리모델링 마치고 재개장', reporter: '제보',
        categories: ['venue'], tags: ['잠실', 'venue', '재개장'],
        lead: '3개월 리모델링 마치고 재개장.',
        paragraphs: ['잠실 실내수영장이 3개월간의 리모델링을 마치고 재개장했다. 전광판과 레인 로프가 전면 교체됐다.'],
        publishedAt: '2026-05-20 08:30', updatedAt: '2026-05-20 08:30',
      }),
      mkArticle({
        title: '박도현, 평영 100m 결승 진출', reporter: '편집부',
        categories: ['meet', 'athlete'], tags: ['평영', 'breaststroke', '100m'],
        lead: '준결승 조 1위로 결승 진출.',
        paragraphs: ['박도현 선수가 평영 100m 준결승에서 조 1위로 결승에 진출했다. 결승은 내일 오후 진행된다.'],
        publishedAt: '2026-05-21 12:20', updatedAt: '2026-05-21 12:20',
      }),
      mkArticle({
        title: '2026 전국수영대회 2일차 일정 변경 안내', reporter: '조직위',
        categories: ['notice'], tags: ['안내', 'schedule'],
        lead: '2일차 오전 경기 30분 순연.',
        paragraphs: ['기상 상황에 따라 2일차 오전 경기 일정이 30분씩 순연됩니다. 자세한 사항은 조직위 공지를 확인하세요.'],
        publishedAt: '2026-05-19 07:50', updatedAt: '2026-05-19 07:50',
      }),
    ],
  },

  article: {
    title: '기사', en: 'Articles', subtitle: '기사를 작성하고 관리합니다.',
    columns: [
      { key: 'title', label: '제목', cls: 'strong', get: (r) => r.translations?.ko?.title || '' },
      { key: 'type', label: '유형', cls: 'muted', get: (r) => (r.type === 'breaking_news' ? '속보' : '기사') },
      { key: 'status', label: '상태', type: 'badge', get: (r) => (r.status === 'published' ? '게시됨' : '초안') },
      { key: 'reporter', label: '출처', cls: 'muted', get: (r) => r.reporter?.name || '' },
      { key: 'hasImage', label: '이미지', get: (r) => (hasImage(r) ? '○' : '') },
      { key: 'hasYoutube', label: '유튜브', get: (r) => (hasYoutube(r) ? '○' : '') },
      { key: 'createdAt', label: '작성', cls: 'mono', get: (r) => String(r.createdAt || '').slice(0, 10) },
      { key: 'publishedAt', label: '게시', cls: 'mono', get: (r) => String(r.publishedAt || '').slice(0, 10) },
    ],
    rows: [], // 실제 데이터는 API(/api/articles?type=article)에서 로드
  },

  competitions: {
    title: '대회', en: 'Competitions', subtitle: '수영대회 일정과 개최 정보를 관리합니다. (SwimmingPhotography DB)',
    columns: [
      { key: 'competitionName', label: '대회명', cls: 'strong' },
      { key: 'datetime', label: '일자', cls: 'mono' },
      { key: 'pool', label: '경기장' },
      { key: 'sido', label: '지역', cls: 'muted' },
      { key: 'course', label: 'Course' },
      { key: 'isMasters', label: '구분', get: (r) => (r.isMasters ? '마스터즈' : '일반') },
      // 기록가져오기 때 집계되는 참가 규모
      { key: 'scale', label: '팀 / 선수 / start', cls: 'muted', get: (r) => (r.startCount == null ? '—' : `${r.teamCount ?? 0} / ${r.athleteCount ?? 0} / ${r.startCount}`) },
    ],
    // 실제 데이터는 API(/api/competitions)에서 로드. 아래는 nav 카운트/폴백용 샘플.
    rows: [
      { competitionName: '제11회 서울특별시연맹회장배 수영대회', datetime: '2026-06-28', pool: '서울체육고등학교 수영장', sido: '서울', course: 'LCM', isMasters: true },
      { competitionName: '2026 제6회 포항시장배 마스터즈 수영대회', datetime: '2026-06-21', pool: '포항 다원복합센터 수영장', sido: '경남', course: 'LCM', isMasters: true },
    ],
  },

  athletes: {
    title: '선수', en: 'Athletes', subtitle: '선수 프로필과 소속·주종목을 관리합니다.',
    columns: [
      { key: 'name', label: '이름', cls: 'strong' },
      { key: 'team', label: '소속팀' },
      { key: 'gender', label: '성별', cls: 'muted' },
      { key: 'birth', label: '출생', cls: 'num' },
      { key: 'event', label: '주종목' },
      { key: 'best', label: '최고기록', cls: 'mono' },
    ],
    rows: [
      { name: '김민준', team: '인천체고', gender: '남', birth: 2005, event: '자유형 200m', best: '1:47.32' },
      { name: '이서연', team: '서울체고', gender: '여', birth: 2006, event: '접영 100m', best: '58.91' },
      { name: '박도현', team: '경남수영연맹', gender: '남', birth: 2004, event: '평영 100m', best: '1:00.44' },
      { name: '최지우', team: '광주체고', gender: '여', birth: 2007, event: '배영 200m', best: '2:11.08' },
      { name: '정하늘', team: '부산광역시청', gender: '남', birth: 2002, event: '자유형 400m', best: '3:49.77' },
      { name: '한예린', team: '대구수영클럽', gender: '여', birth: 2005, event: '개인혼영 200m', best: '2:14.63' },
    ],
  },

  teams: {
    title: '팀', en: 'Teams', subtitle: '소속팀·클럽과 등록 선수 현황을 관리합니다.',
    columns: [
      { key: 'name', label: '팀명', cls: 'strong' },
      { key: 'region', label: '지역' },
      { key: 'athletes', label: '선수', cls: 'num' },
      { key: 'coach', label: '감독' },
      { key: 'founded', label: '창단', cls: 'num' },
    ],
    rows: [
      { name: '인천체고', region: '인천', athletes: 24, coach: '오세훈', founded: 1998 },
      { name: '서울체고', region: '서울', athletes: 31, coach: '남기훈', founded: 1985 },
      { name: '경남수영연맹', region: '경남', athletes: 18, coach: '류재석', founded: 2003 },
      { name: '광주체고', region: '광주', athletes: 20, coach: '문정아', founded: 1991 },
      { name: '부산광역시청', region: '부산', athletes: 15, coach: '강태오', founded: 1979 },
      { name: '대구수영클럽', region: '대구', athletes: 27, coach: '백승호', founded: 2011 },
    ],
  },

  venues: {
    title: '경기장', en: 'Venues', subtitle: '개최 수영장의 규격과 위치를 관리합니다. (SwimmingPhotography DB)',
    columns: [
      { key: 'pool', label: '수영장명', cls: 'strong' },
      { key: 'sido', label: '시도', cls: 'muted' },
      { key: 'lanes', label: '레인', cls: 'num' },
      { key: 'length', label: '규격' },
      { key: 'address', label: '위치' },
    ],
    // 실제 데이터는 API(/api/venues)에서 로드. 아래는 nav 카운트/폴백용 샘플.
    rows: [
      { pool: '문학박태환수영장', sido: '인천', lanes: 10, length: '50m', address: '인천 미추홀구' },
      { pool: '올림픽수영장', sido: '서울', lanes: 10, length: '50m', address: '서울 송파구' },
    ],
  },

  times: {
    title: '기록', en: 'Times', subtitle: '경기별 선수 기록과 순위를 관리합니다.',
    columns: [
      { key: 'athlete', label: '선수', cls: 'strong' },
      { key: 'event', label: '종목' },
      { key: 'time', label: '기록', cls: 'mono' },
      { key: 'competition', label: '대회', cls: 'muted' },
      { key: 'date', label: '일자' },
      { key: 'rank', label: '순위', cls: 'num' },
    ],
    rows: [
      { athlete: '김민준', event: '자유형 200m', time: '1:47.32', competition: '2026 전국수영대회', date: '2026-04-26', rank: 1 },
      { athlete: '이서연', event: '접영 100m', time: '58.91', competition: '2026 전국수영대회', date: '2026-04-26', rank: 1 },
      { athlete: '박도현', event: '평영 100m', time: '1:00.44', competition: '2026 전국수영대회', date: '2026-04-26', rank: 2 },
      { athlete: '최지우', event: '배영 200m', time: '2:11.08', competition: '2026 청소년 대표선발전', date: '2026-03-14', rank: 1 },
      { athlete: '정하늘', event: '자유형 400m', time: '3:49.77', competition: '2026 마스터즈 오픈', date: '2026-02-22', rank: 3 },
      { athlete: '한예린', event: '개인혼영 200m', time: '2:14.63', competition: '2026 전국수영대회', date: '2026-04-26', rank: 2 },
    ],
  },

  images: {
    title: '사진', en: 'Images', subtitle: '촬영 사진의 태그·공개 여부를 관리합니다.',
    columns: [
      { key: 'file', label: '파일', type: 'thumb' },
      { key: 'competition', label: '대회', cls: 'muted' },
      { key: 'event', label: '종목' },
      { key: 'tags', label: '태그' },
      { key: 'date', label: '촬영일' },
      { key: 'status', label: '상태', type: 'badge' },
    ],
    rows: [
      { file: '048A0201.jpg', competition: '2026 전국수영대회', event: '자유형 200m', tags: '김민준 · 결승', date: '2026-04-26', status: '공개' },
      { file: '7R505742.jpg', competition: '2026 전국수영대회', event: '접영 100m', tags: '이서연 · 시상', date: '2026-04-26', status: '공개' },
      { file: '048A4162.jpg', competition: '2026 전국수영대회', event: '평영 100m', tags: '박도현', date: '2026-04-26', status: '검수' },
      { file: '048A9667.jpg', competition: '2026 청소년 대표선발전', event: '배영 200m', tags: '최지우 · 스타트', date: '2026-03-14', status: '공개' },
      { file: '7R500462.jpg', competition: '2026 마스터즈 오픈', event: '자유형 400m', tags: '단체', date: '2026-02-22', status: '비공개' },
      { file: '048A1009.jpg', competition: '2026 전국수영대회', event: '개인혼영 200m', tags: '한예린', date: '2026-04-26', status: '검수' },
    ],
  },

  startList: {
    title: '출발명단', en: 'Start List', subtitle: '경기별 조·레인 배정(스타트 리스트)을 관리합니다.',
    columns: [
      { key: 'competition', label: '대회', cls: 'muted' },
      { key: 'event', label: '종목', cls: 'strong' },
      { key: 'heat', label: '조', cls: 'num' },
      { key: 'lane', label: '레인', cls: 'num' },
      { key: 'athlete', label: '선수' },
      { key: 'team', label: '소속', cls: 'muted' },
      { key: 'seed', label: '시드기록', cls: 'mono' },
    ],
    rows: [
      { competition: '2026 전국수영대회', event: '자유형 200m', heat: 3, lane: 4, athlete: '김민준', team: '인천체고', seed: '1:48.10' },
      { competition: '2026 전국수영대회', event: '자유형 200m', heat: 3, lane: 5, athlete: '정하늘', team: '부산광역시청', seed: '1:48.44' },
      { competition: '2026 전국수영대회', event: '접영 100m', heat: 2, lane: 4, athlete: '이서연', team: '서울체고', seed: '59.20' },
      { competition: '2026 전국수영대회', event: '평영 100m', heat: 2, lane: 3, athlete: '박도현', team: '경남수영연맹', seed: '1:00.90' },
      { competition: '2026 청소년 대표선발전', event: '배영 200m', heat: 1, lane: 5, athlete: '최지우', team: '광주체고', seed: '2:12.30' },
      { competition: '2026 전국수영대회', event: '개인혼영 200m', heat: 2, lane: 6, athlete: '한예린', team: '대구수영클럽', seed: '2:15.00' },
    ],
  },
}

export const useMock = () => DATA
export const useEntity = (key: string): Entity => DATA[key]
