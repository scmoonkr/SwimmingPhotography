// 앱 설정 — 화면의 '설정' 메뉴에서 바꾸는 값. settings 컬렉션의 _id:'app' 문서 하나에 둔다.
//   planDaily  : 기간 배정의 기본 하루 배정 수량(장)
//   threadKeyword : 디자인 컬러로 고르는 자수사 물품을 찾는 이름 글자 (기본 '자수사')
//   productTypes : 제품종류 목록 — 주문의 '제품종류' 선택지 (설정에서 쉼표로 구분해 입력)
//   capKeyword : 작업 완료 시 재고를 차감할 물품을 찾는 이름 글자 (이름에 이 글자가 들어간 물품, 예: '수모')
// 하루 처리 한도(가동 대수 등)는 일정과 함께 쓰이므로 schedule 라우터의 /capacity 에 있다.
import { col } from './db.js'

export const APP_DEFAULTS = { planDaily: 60, capKeyword: '수모', threadKeyword: '자수사', productTypes: [] }

// "수모, 후드티 ,맨투맨" 또는 배열 → ['수모','후드티','맨투맨'] (공백 제거 · 중복 제거 · 30자·50개 제한)
export function parseTypes(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/)
  const out = []
  for (const x of list) {
    const t = String(x).trim().slice(0, 30)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= 50) break
  }
  return out
}

export async function loadAppSettings() {
  const d = await (await col('settings')).findOne({ _id: 'app' })
  return {
    planDaily: Number.isInteger(d?.planDaily) && d.planDaily > 0 ? d.planDaily : APP_DEFAULTS.planDaily,
    capKeyword: String(d?.capKeyword || '').trim() || APP_DEFAULTS.capKeyword,
    threadKeyword: String(d?.threadKeyword || '').trim() || APP_DEFAULTS.threadKeyword,
    productTypes: parseTypes(d?.productTypes),
  }
}
