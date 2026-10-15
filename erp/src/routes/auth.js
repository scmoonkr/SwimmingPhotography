import { Router } from 'express'
import {
  users, createSession, destroySession, verifyPassword, readToken,
  setSessionCookie, clearSessionCookie, userFromRequest, capsOf, roleOf, jobsOf,
} from '../auth.js'

const router = Router()

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' })
    const c = await users()
    const u = await c.findOne({ username })
    if (!u || u.disabled || !verifyPassword(password, u.password)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' })
    }
    setSessionCookie(res, await createSession(u.username, req))
    await c.updateOne({ _id: u._id }, { $set: { lastLoginAt: new Date() } })
    const role = roleOf(u.role)
    const jobs = jobsOf(u.jobs)
    res.json({ ok: true, user: { username: u.username, name: u.name || u.username, role, jobs, can: capsOf(role, jobs) } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/logout', async (req, res) => {
  try {
    await destroySession(readToken(req))
    clearSessionCookie(res)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/me', async (req, res) => {
  try {
    const user = await userFromRequest(req)
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' })
    res.json({ user })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
