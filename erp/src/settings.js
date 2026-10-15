// 앱 설정 — 화면의 '설정' 메뉴에서 바꾸는 값. settings 컬렉션의 _id:'app' 문서 하나에 둔다.
//   planDaily  : 기간 배정의 기본 하루 배정 수량(장)
//   threadKeyword : 디자인 컬러로 고르는 자수사 물품을 찾는 이름 글자 (기본 '자수사')
//   capKeyword : 작업 완료 시 재고를 차감할 물품을 찾는 이름 글자 (이름에 이 글자가 들어간 물품, 예: '수모')
// 하루 처리 한도(가동 대수 등)는 일정과 함께 쓰이므로 schedule 라우터의 /capacity 에 있다.
import { col } from './db.js'

export const APP_DEFAULTS = { planDaily: 60, capKeyword: '수모', threadKeyword: '자수사' }

export async function loadAppSettings() {
  const d = await (await col('settings')).findOne({ _id: 'app' })
  return {
    planDaily: Number.isInteger(d?.planDaily) && d.planDaily > 0 ? d.planDaily : APP_DEFAULTS.planDaily,
    capKeyword: String(d?.capKeyword || '').trim() || APP_DEFAULTS.capKeyword,
    threadKeyword: String(d?.threadKeyword || '').trim() || APP_DEFAULTS.threadKeyword,
  }
}
