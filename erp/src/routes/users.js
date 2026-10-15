// 계정 관리 — admin 전용.
import { Router } from 'express'
import { users, hashPassword, passwordProblem, ROLES, roleOf, destroyUserSessions, JOBS, jobsOf } from '../auth.js'

const router = Router()
const pub = (u) => ({ username: u.username, name: u.name, role: roleOf(u.role), jobs: jobsOf(u.jobs), disabled: !!u.disabled, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })

router.get('/', async (_req, res) => {
  try { res.json({ items: (await (await users()).find().sort({ username: 1 }).toArray()).map(pub) }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { username, password, name, role } = req.body || {}
    const jobs = jobsOf(req.body?.jobs)
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(String(username || ''))) return res.status(400).json({ error: '아이디는 영문·숫자·._- 3~32자입니다.' })
    if (!ROLES.includes(role)) return res.status(400).json({ error: `권한은 ${ROLES.join(' · ')} 중 하나입니다.` })
    const bad = passwordProblem(password)
    if (bad) return res.status(400).json({ error: bad })
    const c = await users()
    if (await c.findOne({ username })) return res.status(409).json({ error: '이미 있는 아이디입니다.' })
    const now = new Date()
    await c.insertOne({ username, name: String(name || username), role, jobs, password: hashPassword(password), createdAt: now, updatedAt: now })
    res.status(201).json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.patch('/:username', async (req, res) => {
  try {
    const { name, role, disabled, password } = req.body || {}
    const set = { updatedAt: new Date() }
    if (name != null) set.name = String(name)
    if (role != null) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: '잘못된 권한입니다.' })
      set.role = role
    }
    if (disabled != null) set.disabled = !!disabled
    if (req.body?.jobs != null) set.jobs = jobsOf(req.body.jobs)
    if (password) {
      const bad = passwordProblem(password)
      if (bad) return res.status(400).json({ error: bad })
      set.password = hashPassword(password)
    }
    // 마지막 admin 을 잠그거나 강등해 버리면 복구가 터미널뿐이므로 막는다
    if (req.params.username === req.user.username && (set.disabled || (set.role && set.role !== 'admin'))) {
      return res.status(400).json({ error: '본인 계정의 권한 강등·비활성화는 할 수 없습니다.' })
    }
    const r = await (await users()).updateOne({ username: req.params.username }, { $set: set })
    if (!r.matchedCount) return res.status(404).json({ error: '없는 계정입니다.' })
    if (set.password || set.disabled) await destroyUserSessions(req.params.username)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
