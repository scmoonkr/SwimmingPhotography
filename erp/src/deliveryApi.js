// 택배 API — 딜리버리API (deliveryapi.co.kr): 택배 접수(송장번호 발급) · 접수 취소 · 배송 조회.
//   인증: 모든 요청에 `Authorization: Bearer {apiKey}:{secretKey}`  (서버에서만 쓴다 — 키를 브라우저로 내리지 않는다)
//   .env: DeliveryApiKey · DeliverySecretKey                 — 딜리버리API 콘솔에서 발급
//         DeliveryCourierAccountKey                          — 콘솔에서 택배사 계정(롯데·CJ)을 등록하면 나오는 계정 키 (접수에 필요)
//         DeliveryCourier (cj | lotte, 기본 cj)              — 그 계정의 택배사
//         SENDER_NAME · SENDER_TEL · SENDER_ADDRESS (선택)   — 보내는 사람. 비우면 택배사 계정에 등록된 발송인이 쓰인다
//   접수(등록)는 롯데택배(lotte)·CJ대한통운(cj)만 된다. 다른 택배사는 송장번호를 직접 입력하고 조회만 한다.
const BASE = 'https://api.deliveryapi.co.kr'

export const CARRIERS = [
  { id: 'cj', name: 'CJ대한통운', ship: true }, { id: 'lotte', name: '롯데택배', ship: true }, { id: 'hanjin', name: '한진택배' },
  { id: 'post', name: '우체국택배' }, { id: 'logen', name: '로젠택배' }, { id: 'kyungdong', name: '경동택배' }, { id: 'daesin', name: '대신택배' },
]
export const carrierName = (id) => CARRIERS.find((c) => c.id === id)?.name || id

const keys = () => ({ key: process.env.DeliveryApiKey || '', secret: process.env.DeliverySecretKey || '' })
export const configured = () => { const k = keys(); return !!(k.key && k.secret) }
export const accountKey = () => process.env.DeliveryCourierAccountKey || ''
export const shipCourier = () => (process.env.DeliveryCourier === 'lotte' ? 'lotte' : 'cj')
export const sender = () => ({ name: process.env.SENDER_NAME || '', tel: process.env.SENDER_TEL || '', address: process.env.SENDER_ADDRESS || '' })

async function call(path, body, method = 'POST') {
  if (!configured()) throw Object.assign(new Error('.env 에 DeliveryApiKey · DeliverySecretKey 가 없습니다.'), { status: 400 })
  const k = keys()
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', Authorization: `Bearer ${k.key}:${k.secret}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.isSuccess === false) {
    const msg = j.message || j.error || j.errorCode || r.statusText
    throw Object.assign(new Error(r.status === 429 ? '택배 API 호출 한도를 넘었습니다. 잠시 뒤 다시 시도하세요.' : `택배 API 오류: ${msg}`), { status: r.status === 401 || r.status === 403 ? 502 : (r.status >= 400 && r.status < 500 ? 400 : 502) })
  }
  return j
}

const digits = (v) => String(v || '').split('').filter((ch) => ch >= '0' && ch <= '9').join('')

// 택배 접수 — 주문 한 건. 반환: { trackingNo(비어 있을 수 있음), courierDeliveryId, historyId, message }
export async function register(o) {
  if (!accountKey()) throw Object.assign(new Error('.env 에 DeliveryCourierAccountKey (딜리버리API 콘솔에서 택배사 계정을 등록하면 나오는 계정 키)가 없습니다.'), { status: 400 })
  const s = sender()
  const item = {
    clientOrderId: String(o.productOrderId), receiverName: o.receiver, receiverPhone1: digits(o.receiverTel), receiverAddress: o.address,
    productName: [o.product, o.option].filter(Boolean).join(' / ').slice(0, 100), quantity: Math.max(1, Number(o.qty) || 1), deliveryMessage: o.memo || '',
    ...(o.zip ? { receiverZipCode: o.zip } : {}),
    ...(s.name ? { senderName: s.name } : {}), ...(s.tel ? { senderPhone1: digits(s.tel) } : {}), ...(s.address ? { senderAddress: s.address } : {}),
  }
  const j = await call('/v1/courier/deliveries/bulk-upload', { courierAccountKey: accountKey(), items: [item] })
  const d = j.data || {}
  const r = (d.results || [])[0] || {}
  if (r.success === false || d.totalFailed > 0) throw Object.assign(new Error(`택배 접수 실패: ${r.message || '택배사에서 접수를 받지 않았습니다.'}`), { status: 400 })
  return { trackingNo: digits(r.trackingNumber), courierDeliveryId: String(r.courierDeliveryId || ''), historyId: String(d.historyId || ''), message: r.message || '' }
}

// 접수 취소 — 이미 송장번호가 부여되었거나 발송 처리된 건은 택배사가 취소를 받지 않는다
export async function cancel(historyId) {
  if (!accountKey()) throw Object.assign(new Error('.env 에 DeliveryCourierAccountKey 가 없습니다.'), { status: 400 })
  await call('/v1/courier/deliveries/cancel', { courierAccountKey: accountKey(), historyId })
}

// 택배사 사이트의 조회 화면 주소 (딜리버리API 가 아니라 택배사 페이지로 바로 가고 싶을 때)
export const siteUrl = (id, no) => ({
  cj: `https://trace.cjlogistics.com/next/tracking.html?wblNo=${no}`,
  lotte: `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${no}`,
  hanjin: `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${no}`,
  post: `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${no}`,
  logen: `https://www.ilogen.com/web/personal/trace/${no}`,
}[id] || '')

// 배송 조회 → 상태 · 보내는/받는 분(마스킹됨) · 상품 · 이력(progresses). 택배사 조회 화면과 같은 내용이다.
export async function track(courierCode, trackingNo) {
  const j = await call('/v1/tracking/trace', { items: [{ courierCode, trackingNumber: trackingNo }] })
  const r = (j.results || j.data?.results || [])[0] || {}
  const d = r.data || r
  if (r.success === false || (!d.deliveryStatus && !d.deliveryStatusText)) return { found: false, message: r.message || '택배사에서 아직 이 송장번호를 찾지 못했습니다 (발급 직후이거나 번호가 틀렸을 수 있습니다).' }
  const steps = (d.progresses || []).map((p) => ({ time: p.dateTime || p.time || '', location: p.location?.name || p.location || '', status: p.status?.text || p.status || '', description: p.description || '' }))
  return {
    found: true, status: d.deliveryStatusText || d.deliveryStatus, delivered: !!d.isDelivered, deliveredAt: d.dateDelivered || '',
    courierName: d.courierName || carrierName(courierCode), trackingNo: d.trackingNumber || trackingNo,
    sender: d.senderName || '', receiver: d.receiverName || '', receiverAddress: d.receiverAddress || '', product: d.productName || '', quantity: d.productQuantity ?? null,
    steps, url: siteUrl(courierCode, trackingNo),
  }
}
