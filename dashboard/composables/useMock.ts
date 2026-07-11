// 대시보드 mock 데이터 — UI 구성용 샘플. 나중에 Express API(6640) 연동으로 교체.
// 각 엔티티: { title, en, subtitle, columns, rows }
//   columns[].cls  : 셀 스타일 클래스 (strong | mono | muted | num)
//   columns[].type : 'badge'(상태) | 'thumb'(이미지)  → DataTable 이 특수 렌더

export interface Column {
  key: string
  label: string
  cls?: 'strong' | 'mono' | 'muted' | 'num'
  type?: 'badge' | 'thumb'
}
export interface Entity {
  title: string
  en: string
  subtitle: string
  columns: Column[]
  rows: Record<string, any>[]
}

// 상태 라벨 → 뱃지 색 매핑 (DataTable 에서 사용)
export const badgeVariant = (v: string): string => {
  const map: Record<string, string> = {
    '진행중': 'b-good', '공개': 'b-good', '확정': 'b-good',
    '예정': 'b-warn', '검수': 'b-warn', '대기': 'b-warn',
    '취소': 'b-bad', '비공개': 'b-bad',
    '종료': 'b-mute', '초안': 'b-mute',
  }
  return map[v] || 'b-mute'
}

const DATA: Record<string, Entity> = {
  competitions: {
    title: '대회', en: 'Competitions', subtitle: '수영대회 일정과 개최 정보를 관리합니다.',
    columns: [
      { key: 'name', label: '대회명', cls: 'strong' },
      { key: 'date', label: '일자' },
      { key: 'venue', label: '경기장' },
      { key: 'city', label: '도시', cls: 'muted' },
      { key: 'events', label: '종목수', cls: 'num' },
      { key: 'status', label: '상태', type: 'badge' },
    ],
    rows: [
      { name: '2026 전국수영대회', date: '2026-04-26', venue: '문학박태환수영장', city: '인천', events: 48, status: '진행중' },
      { name: '제98회 전국체육대회 수영', date: '2026-05-18', venue: '김천실내수영장', city: '김천', events: 42, status: '예정' },
      { name: '2026 동아수영대회', date: '2026-06-02', venue: '올림픽수영장', city: '서울', events: 40, status: '예정' },
      { name: '2026 청소년 대표선발전', date: '2026-03-14', venue: '남부대수영장', city: '광주', events: 36, status: '종료' },
      { name: '2026 마스터즈 오픈', date: '2026-02-22', venue: '울산문수수영장', city: '울산', events: 28, status: '종료' },
      { name: '2026 봄철 기록회', date: '2026-04-05', venue: '부산사직수영장', city: '부산', events: 30, status: '취소' },
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
    title: '경기장', en: 'Venues', subtitle: '개최 수영장의 규격과 위치를 관리합니다.',
    columns: [
      { key: 'name', label: '경기장', cls: 'strong' },
      { key: 'city', label: '도시' },
      { key: 'lanes', label: '레인', cls: 'num' },
      { key: 'length', label: '길이' },
      { key: 'type', label: '유형', cls: 'muted' },
    ],
    rows: [
      { name: '문학박태환수영장', city: '인천', lanes: 10, length: '50m', type: '실내' },
      { name: '김천실내수영장', city: '김천', lanes: 8, length: '50m', type: '실내' },
      { name: '올림픽수영장', city: '서울', lanes: 10, length: '50m', type: '실내' },
      { name: '남부대수영장', city: '광주', lanes: 10, length: '50m', type: '실내' },
      { name: '울산문수수영장', city: '울산', lanes: 8, length: '50m', type: '실내' },
      { name: '부산사직수영장', city: '부산', lanes: 9, length: '50m', type: '실내' },
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
