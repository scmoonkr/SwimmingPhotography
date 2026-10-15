// 인증 — scrypt 비밀번호 · 세션 쿠키. 사진 서비스와 계정을 공유하지 않는다(별도 users 컬렉션).
// 역할: admin(전부 + 계정관리) · manager(읽기·쓰기) · viewer(조회 전용)
import crypto from 'node:crypto'
import { col } from './db.js'

export const ROLES = ['admin', 'manager', 'worker', 'viewer']
// 업무(job) — manager 가 맡는 일. 계정에 여러 개를 줄 수 있다 (예: manager/order,work).
//   order : 주문관리 — 주문·거래처·고객 입력, 작업 배정(일정 계획)
//   work  : 작업관리 — 디자인, 작업 시작·완료, 재고(자수사·수모), 하루 처리 한도
// 업무를 지정하지 않은 manager 는 모든 업무를 한다(예전 계정과 같은 동작).
export const JOBS = ['order', 'work']
//   orders  : 주문·거래처·고객 쓰기 + 작업 배정      design : 디자인 쓰기      stock : 재고(물품·상품·발주·출고·검수) 쓰기
//   work    : 작업 시작·완료                          settings: 설정 변경       delete/users : 관리자
const JOB_CAPS = {
  order: ['orders', 'settings'],
  work: ['work', 'design', 'stock', 'settings'],
}
// 관리자는 모든 능력을 가진다 — 업무가 늘어 새 능력이 생겨도 자동으로 포함된다(아래 requireCap 에서도 관리자는 항상 통과).
const ALL_CAPS = [...new Set(['read', 'write', 'delete', 'users', ...Object.values(JOB_CAPS).flat()])]
const ROLE_CAPS = {
  admin: ALL_CAPS,
  manager: ['read'],
  worker: ['read', 'work'],          // 작업자 — 조회와 작업 시작·완료만
  viewer: ['read'],
}
export const capsOf = (role, jobs) => {
  const base = ROLE_CAPS[role] || ROLE_CAPS.viewer
  if (role !== 'manager') return base
  const picked = (Array.isArray(jobs) ? jobs : []).filter((j) => JOB_CAPS[j])
  const use = picked.length ? picked : JOBS
  return [...new Set([...base, ...use.flatMap((j) => JOB_CAPS[j])])]
}
export const jobsOf = (jobs) => (Array.isArray(jobs) ? jobs : []).filter((j) => JOBS.includes(j))
export const roleOf = (role) => (ROLES.includes(role) ? role : 'viewer')

export const users = () => col('users')
const sessions = () => col('sessions')

export const SESSION_COOKIE = 'erp_sess'
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(String(pw), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, saltHex, hashHex] = String(stored || '').split('$')
    if (alg !== 'scrypt') return false
    const key = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), hashHex.length / 2, { N: +N, r: +r, p: +p })
    const want = Buffer.from(hashHex, 'hex')
    return key.length === want.length && crypto.timingSafeEqual(key, want)
  } catch { return false }
}

export function passwordProblem(pw) {
  const s = String(pw ?? '')
  if (s.length < 7) return '비밀번호는 7자 이상이어야 합니다.'
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return '비밀번호에 영문과 숫자를 함께 넣어주세요.'
  return null
}

// 쿠키에는 원본 토큰, DB 에는 해시만 둔다
const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')

let ttlReady = false
export async function createSession(username, req) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  const c = await sessions()
  if (!ttlReady) {
    ttlReady = true
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {})
  }
  await c.insertOne({
    tokenHash: tokenHash(token), username, createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 864e5),
    ua: String(req?.headers?.['user-agent'] || '').slice(0, 200),
  })
  return token
}

export async function destroySession(token) {
  if (token) await (await sessions()).deleteOne({ tokenHash: tokenHash(token) })
}

// 비밀번호 변경·비활성화 시 그 사용자의 세션을 전부 끊는다
export async function destroyUserSessions(username) {
  await (await sessions()).deleteMany({ username })
}

export function readToken(req) {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return ''
}

const cookieOpts = () => ({
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/',
})
export const setSessionCookie = (res, token) => res.cookie(SESSION_COOKIE, token, { ...cookieOpts(), maxAge: SESSION_DAYS * 864e5 })
export const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE, cookieOpts())

export async function userFromRequest(req) {
  const token = readToken(req)
  if (!token) return null
  const s = await (await sessions()).findOne({ tokenHash: tokenHash(token) })
  if (!s || new Date(s.expiresAt) < new Date()) return null
  const u = await (await users()).findOne({ username: s.username })
  if (!u || u.disabled) return null
  const role = roleOf(u.role)
  const jobs = jobsOf(u.jobs)
  return { username: u.username, name: u.name || u.username, role, jobs, can: capsOf(role, jobs) }
}

// 모든 업무 API 는 로그인 필수 (조회도 포함 — 공개 데이터가 아니다)
export async function requireAuth(req, res, next) {
  try {
    const u = await userFromRequest(req)
    if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' })
    req.user = u
    next()
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// 여러 능력을 주면 하나라도 있으면 통과한다
// 관리자(admin)는 어떤 능력이든 통과한다.
export const requireCap = (...caps) => (req, res, next) =>
  req.user?.role === 'admin' || caps.some((c) => req.user?.can.includes(c)) ? next() : res.status(403).json({ error: '이 작업을 할 권한이 없습니다.' })
