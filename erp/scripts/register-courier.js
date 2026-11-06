// 딜리버리API 에 택배사 계정(CJ·롯데) 등록 → courierAccountKey 를 .env 의 DeliveryCourierAccountKey 에 저장 (터미널용, 한 번만)
//
//   node erp/scripts/register-courier.js          — .env 의 CJ_ID · CJ_PWD (DeliveryCourier=lotte 면 LOTTE_ID · LOTTE_PWD)
//   CJ 는 문자 인증이 필요하다: 화면에 나오는 안내대로 3분 안에 문자를 보내면 등록이 끝난다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV = path.resolve(__dirname, '../../.env')
dotenv.config({ path: ENV })

const BASE = 'https://api.deliveryapi.co.kr/v1'
const die = (m) => { console.log(m); process.exit(1) }
const provider = process.env.DeliveryCourier === 'lotte' ? 'lotte' : 'cj'
const id = provider === 'cj' ? process.env.CJ_ID : process.env.LOTTE_ID
const pwd = provider === 'cj' ? process.env.CJ_PWD : process.env.LOTTE_PWD
if (!process.env.DeliveryApiKey || !process.env.DeliverySecretKey) die('.env 에 DeliveryApiKey · DeliverySecretKey 가 없습니다.')
if (!id || !pwd) die(`.env 에 ${provider === 'cj' ? 'CJ_ID · CJ_PWD' : 'LOTTE_ID · LOTTE_PWD'} 가 없습니다.`)

const headers = { 'content-type': 'application/json', Authorization: `Bearer ${process.env.DeliveryApiKey}:${process.env.DeliverySecretKey}` }
const call = async (p, body, method = 'POST') => {
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
const save = (key) => {
  const txt = fs.readFileSync(ENV, 'utf8')
  const line = `DeliveryCourierAccountKey=${key}`
  fs.writeFileSync(ENV, /^DeliveryCourierAccountKey=.*$/m.test(txt) ? txt.replace(/^DeliveryCourierAccountKey=.*$/m, line) : `${txt.trimEnd()}\n${line}\n`)
  console.log(`등록 완료 — .env 의 DeliveryCourierAccountKey 를 ${key} 로 저장했습니다. erp 서버를 재시작하세요.`)
}

// 이미 등록된 계정이 있으면 그 키를 쓴다
const list = await call('/courier/accounts', null, 'GET')
const have = (list.j.data?.accounts || list.j.data || []).find?.((a) => a.providerId === provider && a.accountId === id)
if (have?.courierAccountKey) { save(have.courierAccountKey); process.exit(0) }

const reg = await call('/courier/accounts/register', { providerId: provider, accountId: id, accountPassword: pwd, accountName: '메달뱅크' })
if (reg.j.data?.courierAccountKey) { save(reg.j.data.courierAccountKey); process.exit(0) }
const sessionId = reg.j.data?.sessionId || reg.j.sessionId
if (reg.j.errorCode !== 'COURIER_OTP_REQUIRED' || !sessionId) die(`등록 실패 (${reg.status}): ${reg.j.message || reg.j.error || reg.j.errorCode || JSON.stringify(reg.j)}`)

console.log(`문자 인증 필요 → ${reg.j.message || reg.j.data?.message}`)
console.log('문자를 보내면 자동으로 확인합니다 (최대 3분)...')
for (let t = 0; t < 60; t++) {
  await new Promise((ok) => setTimeout(ok, 3000))
  const v = await call('/courier/accounts/validate/verify-otp', { providerId: provider, sessionId, otpCode: '' })
  if (v.j.data?.courierAccountKey) { save(v.j.data.courierAccountKey); process.exit(0) }
  const st = v.j.data?.status || v.j.status || v.j.errorCode
  if (st !== 'PENDING' && v.j.isSuccess === false) die(`인증 실패 (${v.status}): ${v.j.message || st}`)
}
die('3분 안에 인증이 확인되지 않았습니다. 다시 실행하세요.')
