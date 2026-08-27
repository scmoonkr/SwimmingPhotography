// 인증 — 비밀번호 해시(scrypt) · 세션 토큰 · 요청 인증 미들웨어.
// 외부 의존성 없이 node:crypto 만 쓴다(윈도우 개발 환경에서 네이티브 빌드 회피).
import crypto from 'node:crypto'
import { SP } from './db.js'

export const users = async () => (await SP()).collection('users')
export const sessions = async () => (await SP()).collection('sessions')

// ── 역할과 능력 ───────────────────────────────────────────
// 화면 메뉴와 서버 쓰기 권한을 같은 목록으로 가른다. 역할 이름을 화면 코드에 흩뿌리지 않고
// 여기 한 곳에서만 정의한다 — 역할이 늘어도 고칠 곳은 이 표뿐이다.
//   articles : 일반 기사 쓰기        breaking : 속보 쓰기
//   data     : 대회·기록·사진 등 쓰기  users    : 계정 관리
//   delete   : 문서 삭제 — 속보 전담 계정은 만들고 고칠 수는 있어도 지우지는 못한다
export const ROLES = ['admin', 'editor', 'breakingnews']
const CAPS = {
  admin: ['articles', 'breaking', 'data', 'users', 'delete'],
  editor: ['articles', 'breaking', 'data', 'delete'],
  breakingnews: ['breaking'],          // 속보만 — 기사·기록·사진은 읽기만 되고, 삭제도 안 된다
}
export const capsOf = (role) => CAPS[role] || CAPS.editor
export const roleOf = (role) => (ROLES.includes(role) ? role : 'editor')
// 하나라도 가지고 있으면 통과
export const canAny = (user, need) => (need || []).some((c) => (user?.can || []).includes(c))

export const SESSION_COOKIE = 'sp_sess'
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

// ── 비밀번호 ──────────────────────────────────────────────
// 저장 형식: scrypt$N$r$p$salt(hex)$hash(hex) — 파라미터를 같이 저장해 나중에 세기를 올려도 옛 해시가 검증된다.
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
    // 타이밍 공격 회피 — 길이가 같을 때만 비교가 성립한다
    const want = Buffer.from(hashHex, 'hex')
    return key.length === want.length && crypto.timingSafeEqual(key, want)
  } catch { return false }
}

// 비밀번호 규칙 — 통과하면 null, 아니면 사유 문자열
export function passwordProblem(pw) {
  const s = String(pw ?? '')
  if (s.length < 7) return '비밀번호는 7자 이상이어야 합니다.'
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return '비밀번호에 영문과 숫자를 함께 넣어주세요.'
  return null
}

// ── 세션 ─────────────────────────────────────────────────
// 쿠키에는 원본 토큰, DB 에는 해시만 둔다 — DB 가 유출돼도 그 값으로 로그인할 수 없다.
const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')

export async function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  await (await sessions()).insertOne({
    tokenHash: tokenHash(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 864e5),
    ua: String(req?.headers?.['user-agent'] || '').slice(0, 200),
  })
  return token
}

export async function destroySession(token) {
  if (!token) return
  await (await sessions()).deleteOne({ tokenHash: tokenHash(token) })
}

// 한 사용자의 세션을 전부 끊는다(비밀번호 변경 시 다른 기기 로그아웃).
export async function destroyUserSessions(userId, exceptToken) {
  const q = { userId }
  if (exceptToken) q.tokenHash = { $ne: tokenHash(exceptToken) }
  await (await sessions()).deleteMany(q)
}

// 만료 세션 자동 정리 — TTL 인덱스. 최초 1회만 시도한다.
let ttlReady = false
async function ensureTtl() {
  if (ttlReady) return
  ttlReady = true
  try { await (await sessions()).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) } catch { /* 권한 없으면 만료 검사로 대체 */ }
}

// ── 서비스 키 (사람이 아닌 호출자) ────────────────────────
// 배치 스크립트처럼 로그인 화면을 거칠 수 없는 호출자용. .env 의 SERVICE_API_KEY 와 같은 값을
// X-API-Key 헤더로 보내면 통과한다. 권한은 editor 수준으로 고정 — 키가 새더라도 계정(users)은 못 건드린다.
const SERVICE_ROLE = 'editor'
export function serviceUser(req) {
  const want = String(process.env.SERVICE_API_KEY || '')
  if (want.length < 16) return null            // 키를 안 정했거나 너무 짧으면 이 통로 자체를 닫는다
  const got = String(req.headers?.['x-api-key'] || '')
  if (got.length !== want.length) return null  // timingSafeEqual 은 길이가 같아야 한다
  if (!crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null
  return { username: 'service', name: '서비스 키', role: SERVICE_ROLE, can: capsOf(SERVICE_ROLE), isService: true }
}

// 요청의 쿠키에서 세션 토큰을 읽는다 (cookie-parser 없이 직접 파싱)
export function readToken(req) {
  const raw = req.headers?.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return ''
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,                                   // JS 에서 못 읽는다 — XSS 로 토큰 탈취 방지
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',    // 운영은 https 에서만 전송
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
}

// 세션 토큰 → 사용자. 없거나 만료면 null.
export async function userFromRequest(req) {
  await ensureTtl()
  const token = readToken(req)
  if (!token) return null
  const s = await (await sessions()).findOne({ tokenHash: tokenHash(token) })
  if (!s) return null
  if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
    await (await sessions()).deleteOne({ _id: s._id })
    return null
  }
  const u = await (await users()).findOne({ username: s.userId })
  if (!u || u.disabled) return null
  const role = roleOf(u.role)
  return { username: u.username, name: u.name || u.username, role, can: capsOf(role) }
}

// 로그인 필수 미들웨어 — req.user 를 채운다.
export async function requireAuth(req, res, next) {
  const u = await userFromRequest(req)
  if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' })
  req.user = u
  next()
}

// 특정 능력이 필요한 라우트용 (need 중 하나라도 있으면 통과)
export function requireCap(...need) {
  return (req, res, next) => {
    if (!canAny(req.user, need)) return res.status(403).json({ error: '이 작업을 할 권한이 없습니다.' })
    next()
  }
}

// 관리자 전용 (계정 관리)
export function requireAdmin(req, res, next) {
  if (!canAny(req.user, ['users'])) return res.status(403).json({ error: '관리자만 할 수 있습니다.' })
  next()
}

// 첫 관리자 계정 — users 가 비어 있을 때만 만든다.
// 비밀번호는 .env 의 ADMIN_INIT_PASSWORD, 없으면 무작위로 만들어 서버 콘솔에 한 번 찍는다.
export async function ensureSeedUser() {
  const c = await users()
  if (await c.countDocuments({}, { limit: 1 })) return
  const username = process.env.ADMIN_INIT_USER || 'admin'
  const pw = process.env.ADMIN_INIT_PASSWORD || crypto.randomBytes(9).toString('base64url')
  await c.insertOne({
    username, name: process.env.ADMIN_INIT_NAME || '관리자', role: 'admin',
    password: hashPassword(pw), createdAt: new Date(), updatedAt: new Date(),
  })
  if (!process.env.ADMIN_INIT_PASSWORD) {
    console.log(`\n[auth] 첫 관리자 계정을 만들었습니다 — 아이디: ${username} / 비밀번호: ${pw}`)
    console.log('[auth] 로그인 후 반드시 정보변경에서 비밀번호를 바꾸세요.\n')
  }
}
