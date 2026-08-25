// 인증 라우터 — 로그인 / 로그아웃 / 내 정보 / 비밀번호 변경 / 계정 관리(관리자).
import { Router } from 'express'
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
router.post('/login', async (req, res) => {
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

// 이름 변경 — 표시 이름만.
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: '이름을 입력하세요.' })
    await (await users()).updateOne({ username: req.user.username }, { $set: { name, updatedAt: new Date() } })
    res.json({ ok: true, user: { ...req.user, name } })
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
