// 네이버 스마트스토어(커머스 API) 주문 조회.
//   인증: OAuth2 client credentials — client_secret_sign = base64(bcrypt(`${client_id}_${timestamp}`, client_secret))
//   .env: NAVER_COMMERCE_CLIENT_ID · NAVER_COMMERCE_CLIENT_SECRET  (커머스API센터에서 발급한 애플리케이션 ID · 시크릿)
//         없으면 NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 을 대신 쓴다 (커머스API 애플리케이션 값을 넣어 둔 경우)
//   주문 조회: GET /external/v1/pay-order/seller/product-orders (조건형) — 한 번에 최대 24시간이라 하루씩 나눠 부른다.
import bcrypt from 'bcryptjs'

const BASE = 'https://api.commerce.naver.com/external'
const DAY = 24 * 3600e3

const creds = () => {
  const id = process.env.NAVER_COMMERCE_CLIENT_ID || process.env.NAVER_CLIENT_ID || ''
  const secret = process.env.NAVER_COMMERCE_CLIENT_SECRET || process.env.NAVER_CLIENT_SECRET || ''
  return { id, secret }
}
export const configured = () => { const c = creds(); return !!(c.id && c.secret) }

let cached = { token: '', exp: 0 }
async function token() {
  if (cached.token && Date.now() < cached.exp - 60e3) return cached.token
  const { id, secret } = creds()
  if (!id || !secret) throw Object.assign(new Error('스마트스토어 API 키가 .env 에 없습니다 (NAVER_COMMERCE_CLIENT_ID · NAVER_COMMERCE_CLIENT_SECRET).'), { status: 400 })
  const ts = Date.now()
  let sign
  try { sign = Buffer.from(bcrypt.hashSync(`${id}_${ts}`, secret)).toString('base64') } catch { throw Object.assign(new Error('NAVER_COMMERCE_CLIENT_SECRET 형식이 올바르지 않습니다 (커머스API센터의 애플리케이션 시크릿이어야 합니다).'), { status: 400 }) }
  const body = new URLSearchParams({ client_id: id, timestamp: String(ts), client_secret_sign: sign, grant_type: 'client_credentials', type: 'SELF' })
  const r = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw Object.assign(new Error(`스마트스토어 인증에 실패했습니다: ${j.message || j.error_description || r.statusText}`), { status: 502 })
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 10800) * 1000 }
  return cached.token
}

const fmt = (ms) => new Date(ms).toISOString().replace('Z', '+00:00')

// 한 구간(최대 24시간)의 상품주문
async function fetchRange(from, to) {
  const out = []
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ from: fmt(from), to: fmt(to), rangeType: 'PAYED_DATETIME', pageSize: '300', page: String(page) })
    const r = await fetch(`${BASE}/v1/pay-order/seller/product-orders?${q}`, { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(`스마트스토어 주문 조회 실패: ${j.message || r.statusText}`), { status: 502 })
    const list = j.data?.contents || []
    out.push(...list)
    if (!j.data?.pagination?.hasNext) break
  }
  return out
}

// 응답 한 건 → 화면용 평탄한 주문
const flat = (it) => {
  const c = it.content || it
  const o = c.order || {}, p = c.productOrder || {}, a = p.shippingAddress || {}
  return {
    productOrderId: it.productOrderId || p.productOrderId || '',
    orderId: o.orderId || '',
    paidAt: o.paymentDate || o.orderDate || '',
    orderer: o.ordererName || '', ordererTel: o.ordererTel || '',
    receiver: a.name || '', receiverTel: a.tel1 || '', address: [a.baseAddress, a.detailedAddress].filter(Boolean).join(' '), zip: a.zipCode || '',
    product: p.productName || '', option: p.productOption || '', qty: Number(p.quantity) || 0,
    amount: Number(p.totalPaymentAmount ?? p.totalProductAmount) || 0,
    status: p.productOrderStatus || '', memo: p.shippingMemo || '',
  }
}

// 최근 days 일(1~365, 오늘 포함)의 결제 주문 — 하루씩 나눠 3개씩 동시에 부른다 (커머스 API 는 초당 호출 수에 한도가 있다)
export async function recentOrders(days = 30) {
  const n = Math.max(1, Math.min(365, Math.round(Number(days)) || 30))
  const to = Date.now()
  const rows = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, n) }, async () => {
    while (next < n) { const i = next++; rows.push(...await fetchRange(to - (i + 1) * DAY, to - i * DAY)) }
  }))
  const seen = new Set()
  return rows.map(flat).filter((x) => x.productOrderId && !seen.has(x.productOrderId) && seen.add(x.productOrderId))
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))
}
