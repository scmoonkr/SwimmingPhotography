// 인증 라우터 — 로그인 / 로그아웃 / 내 정보 / 비밀번호 변경 / 계정 관리(관리자).
import { Router } from 'express'
import crypto from 'node:crypto'
import {
  users, createSession, destroySession, destroyUserSessions, ensureSeedUser,
  hashPassword, verifyPassword, passwordProblem, readToken,
  setSessionCookie, clearSessionCookie, userFromRequest, requireAuth, requireAdmin,
  ROLES, capsOf, roleOf,
} from '../auth.js'

const router = Router()
const publicUser = (u) => {
  const role = roleOf(u.role)
  return { username: u.username, name: u.name || u.username, role, can: capsOf(role) }
}

// 로그인 — 아이디·비밀번호. 실패 사유(없는 아이디/틀린 비번)는 구분해 알려주지 않는다.
router.post('/signin', async (req, res) => {
  try {
    await ensureSeedUser()
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' })

    const u = await (await users()).findOne({ username })
    if (!u || u.disabled || !verifyPassword(password, u.password)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' })
    }
    const token = await createSession(u.username, req)
    setSessionCookie(res, token)
    await (await users()).updateOne({ _id: u._id }, { $set: { lastLoginAt: new Date() } })
    res.json({ ok: true, user: publicUser(u) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 네이버 로그인 (회원가입 겸용) ─────────────────────────
// 처음 로그인하면 회원(member)으로 등록된다 — 따로 가입 절차가 없다.
//   GET /api/auth/naver?r=/돌아갈경로     → 네이버 동의 화면으로 보낸다
//   GET /api/auth/naver/callback          → 네이버가 돌려보내는 곳. 계정을 찾거나 만들고 세션을 연 뒤 r 로 돌려보낸다
// .env: NAVER_CLIENT_ID · NAVER_CLIENT_SECRET (네이버 개발자센터의 애플리케이션)
//       NAVER_CALLBACK_URL — 네이버에 등록한 Callback URL 과 글자 그대로 같아야 한다
//         (공개 사이트 주소 기준: https://<사이트>/api/auth/naver/callback — 세션 쿠키가 그 주소에 심긴다)
const NAVER_STATE_COOKIE = 'sp_nv'
const naverConf = () => ({
  id: process.env.NAVER_CLIENT_ID || '',
  secret: process.env.NAVER_CLIENT_SECRET || '',
  callback: process.env.NAVER_CALLBACK_URL || 'http://localhost:6641/api/auth/naver/callback',
})
// 로그인 뒤 돌아갈 곳 — 사이트 안의 경로만('//host' 꼴 차단)
const safePath = (v) => { const s = String(v || ''); return s.startsWith('/') && !s.startsWith('//') ? s : '/videos' }
const signinError = (res, code) => res.redirect(`/signin?e=${code}`)
const cookieOf = (req, name) => {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return ''
}

router.get('/naver', (req, res) => {
  const { id, callback } = naverConf()
  if (!id) return signinError(res, 'naver_config')
  // state — 다른 사이트가 이 로그인을 대신 끝내지 못하게 하는 일회용 값. 돌아갈 경로와 함께 쿠키에 잠깐 둔다.
  const state = crypto.randomBytes(16).toString('hex')
  res.cookie(NAVER_STATE_COOKIE, `${state}|${safePath(req.query.r)}`, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/api/auth',
  })
  const q = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: callback, state })
  res.redirect(`https://nid.naver.com/oauth2.0/authorize?${q}`)
})

router.get('/naver/callback', async (req, res) => {
  try {
    const { id, secret, callback } = naverConf()
    const [state, back] = cookieOf(req, NAVER_STATE_COOKIE).split('|')
    res.clearCookie(NAVER_STATE_COOKIE, { path: '/api/auth' })
    if (!id || !secret) return signinError(res, 'naver_config')
    if (req.query.error) return signinError(res, 'naver_denied')            // 동의 화면에서 취소
    const code = String(req.query.code || '')
    if (!code || !state || state !== String(req.query.state || '')) return signinError(res, 'naver_state')

    // 인가 코드 → 접근 토큰 → 프로필
    const tq = new URLSearchParams({ grant_type: 'authorization_code', client_id: id, client_secret: secret, code, state, redirect_uri: callback })
    const tok = await (await fetch(`https://nid.naver.com/oauth2.0/token?${tq}`)).json().catch(() => null)
    if (!tok?.access_token) return signinError(res, 'naver_token')
    const me = await (await fetch('https://openapi.naver.com/v1/nid/me', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json().catch(() => null)
    const prof = me?.response
    if (!prof?.id) return signinError(res, 'naver_profile')

    // 계정 찾기(네이버 고유 id) — 없으면 회원으로 만든다. 비밀번호는 없다(아이디·비밀번호 로그인은 안 된다).
    const c = await users()
    const now = new Date()
    let u = await c.findOne({ provider: 'naver', providerId: String(prof.id) })
    let first = false
    if (!u) {
      first = true
      // 네이버가 넘겨 준 정보를 그대로 담는다. 이름 · 생년월일 · 성별은 네이버 값이라 나중에 고칠 수 없다(고칠 수 있는 것은 이메일 · 휴대폰 · 별명).
      u = {
        username: `naver_${crypto.createHash('sha256').update(String(prof.id)).digest('hex').slice(0, 16)}`,
        name: String(prof.name || prof.nickname || '네이버 회원').trim().slice(0, 40),
        email: String(prof.email || ''), role: 'member',
        provider: 'naver', providerId: String(prof.id),
        nickname: String(prof.nickname || '').trim().slice(0, 40), mobile: String(prof.mobile || '').trim().slice(0, 20),
        gender: ['M', 'F'].includes(prof.gender) ? prof.gender : '', birthyear: String(prof.birthyear || '').slice(0, 4), birthday: String(prof.birthday || '').slice(0, 5),
        createdAt: now, updatedAt: now, lastLoginAt: now,
      }
      await c.insertOne(u)
    } else {
      if (u.disabled) return signinError(res, 'disabled')
      await c.updateOne({ _id: u._id }, { $set: { lastLoginAt: now } })
    }
    setSessionCookie(res, await createSession(u.username, req))
    res.redirect(first ? '/my/page?first=1' : safePath(back))          // 처음 로그인이면 내 정보 화면으로
  } catch (e) {
    console.error('[auth] naver callback:', e.message)
    signinError(res, 'naver_error')
  }
})

router.post('/logout', async (req, res) => {
  try {
    await destroySession(readToken(req))
    clearSessionCookie(res)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 현재 로그인 상태 — 대시보드가 화면을 그리기 전에 확인한다.
router.get('/me', async (req, res) => {
  try {
    const u = await userFromRequest(req)
    if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' })
    res.json({ user: u })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 비밀번호 변경 — 현재 비밀번호를 다시 확인하고, 바꾼 뒤 다른 기기의 세션은 모두 끊는다.
router.post('/password', requireAuth, async (req, res) => {
  try {
    const current = String(req.body?.current || '')
    const next = String(req.body?.next || '')
    const u = await (await users()).findOne({ username: req.user.username })
    if (!u || !verifyPassword(current, u.password)) return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' })
    if (current === next) return res.status(400).json({ error: '지금 쓰는 비밀번호와 다른 값을 넣어주세요.' })
    const bad = passwordProblem(next)
    if (bad) return res.status(400).json({ error: bad })

    await (await users()).updateOne({ _id: u._id }, { $set: { password: hashPassword(next), updatedAt: new Date() } })
    await destroyUserSessions(u.username, readToken(req))   // 지금 쓰는 창은 살려둔다
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 내 정보 — 네이버 회원: 네이버가 넘겨 준 정보를 보여 준다(이름 · 생년월일 · 성별은 수정 불가).
router.get('/mypage', requireAuth, async (req, res) => {
  try {
    const u = await (await users()).findOne({ username: req.user.username })
    if (!u) return res.status(404).json({ error: '없는 계정입니다.' })
    const naver = u.provider === 'naver'
    res.json({
      username: u.username, provider: u.provider || '', name: u.name || '', nickname: u.nickname || '', email: u.email || '', mobile: u.mobile || '',
      gender: u.gender || '', birthyear: u.birthyear || '', birthday: u.birthday || '', createdAt: u.createdAt || null,
      locked: naver ? ['name', 'birthyear', 'birthday', 'gender'] : [],
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 내 정보 수정 — 네이버 회원은 별명 · 이메일 · 휴대폰만(이름 · 생년월일 · 성별은 네이버 값 그대로). 다른 계정은 표시 이름만.
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const b = req.body || {}
    const u = await (await users()).findOne({ username: req.user.username })
    if (!u) return res.status(404).json({ error: '없는 계정입니다.' })
    const set = { updatedAt: new Date() }
    if (u.provider === 'naver') {
      if ('nickname' in b) set.nickname = String(b.nickname ?? '').trim().slice(0, 40)
      if ('email' in b) {
        const email = String(b.email ?? '').trim().slice(0, 100)
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' })
        set.email = email
      }
      if ('mobile' in b) {
        const mobile = String(b.mobile ?? '').trim().slice(0, 20)
        if (mobile && !/^[0-9+\-\s]{7,20}$/.test(mobile)) return res.status(400).json({ error: '휴대폰 번호 형식이 올바르지 않습니다.' })
        set.mobile = mobile
      }
    } else {
      const name = String(b.name || '').trim()
      if (!name) return res.status(400).json({ error: '이름을 입력하세요.' })
      set.name = name
    }
    await (await users()).updateOne({ username: u.username }, { $set: set })
    res.json({ ok: true, user: { ...req.user, name: set.name || req.user.name } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 계정 관리 (관리자 전용) ──────────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await (await users())
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: 1 })
      .toArray()
    res.json(rows.map((u) => ({ ...publicUser(u), disabled: !!u.disabled, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim() || username
    const role = String(req.body?.role || '')
    if (!ROLES.includes(role)) return res.status(400).json({ error: '권한 값이 올바르지 않습니다.' })
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: '아이디는 영문·숫자·._- 조합 3~32자로 입력하세요.' })
    const bad = passwordProblem(password)
    if (bad) return res.status(400).json({ error: bad })
    if (await (await users()).findOne({ username })) return res.status(409).json({ error: '이미 있는 아이디입니다.' })

    await (await users()).insertOne({ username, name, role, password: hashPassword(password), createdAt: new Date(), updatedAt: new Date() })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 계정 삭제 — 자기 자신은 지울 수 없고, 마지막 관리자도 남겨둔다(아무도 못 들어가는 상태 방지).
router.delete('/users/:username', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || '')
    if (username === req.user.username) return res.status(400).json({ error: '자기 계정은 삭제할 수 없습니다.' })
    const target = await (await users()).findOne({ username })
    if (!target) return res.status(404).json({ error: '없는 계정입니다.' })
    if (roleOf(target.role) === 'admin' && await (await users()).countDocuments({ role: 'admin' }) <= 1) {
      return res.status(400).json({ error: '마지막 관리자 계정은 삭제할 수 없습니다.' })
    }
    await (await users()).deleteOne({ username })
    await destroyUserSessions(username)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 비밀번호 초기화 — 관리자가 다른 계정의 비밀번호를 새로 정한다.
router.post('/users/:username/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || '')
    const password = String(req.body?.password || '')
    const bad = passwordProblem(password)
    if (bad) return res.status(400).json({ error: bad })
    const r = await (await users()).updateOne({ username }, { $set: { password: hashPassword(password), updatedAt: new Date() } })
    if (!r.matchedCount) return res.status(404).json({ error: '없는 계정입니다.' })
    await destroyUserSessions(username)          // 초기화했으면 그 계정의 기존 로그인은 모두 끊는다
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
