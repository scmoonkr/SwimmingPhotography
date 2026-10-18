// 설정 조회·변경 — 조회는 로그인한 누구나, 변경은 관리자·매니저(write).
import { Router } from 'express'
import { col } from '../db.js'
import { requireCap } from '../auth.js'
import { loadAppSettings, parseTypes } from '../settings.js'
import { normProduction } from '../planner/config.js'

const router = Router()

router.get('/', async (_req, res) => {
  try { res.json(await loadAppSettings()) } catch (e) { res.status(500).json({ error: e.message }) }
})

// { planDaily?, capKeyword?, threadKeyword?, productTypes? } — 보낸 항목만 바꾼다
router.put('/', requireCap('settings'), async (req, res) => {
  try {
    const b = req.body || {}
    const set = {}
    if ('planDaily' in b) {
      const n = Math.round(Number(b.planDaily))
      if (!(n >= 1 && n <= 10000)) return res.status(400).json({ error: '기본 하루 배정 수량은 1~10000 사이입니다.' })
      set.planDaily = n
    }
    if ('swapMinutes' in b) {        // 자수기 실 하나를 바꾸는 데 걸리는 시간(분)
      const n = Number(b.swapMinutes)
      if (!(n > 0 && n <= 240)) return res.status(400).json({ error: '실 교체 시간은 0 초과 240분 이하입니다.' })
      set.swapMinutes = Math.round(n * 10) / 10
    }
    if ('production' in b) set.production = normProduction({ ...(await loadAppSettings()).production, ...(b.production || {}) })     // 보낸 항목만 바꾼다
    if ('capKeyword' in b) {
      const k = String(b.capKeyword ?? '').trim()
      if (!k || k.length > 20) return res.status(400).json({ error: '재고 차감 대상 물품 키워드는 1~20자입니다.' })
      set.capKeyword = k
    }
    if ('productTypes' in b) set.productTypes = parseTypes(b.productTypes)      // 쉼표로 구분한 문자열 또는 배열
    if ('threadKeyword' in b) {
      const k = String(b.threadKeyword ?? '').trim()
      if (!k || k.length > 20) return res.status(400).json({ error: '자수사 물품 키워드는 1~20자입니다.' })
      set.threadKeyword = k
    }
    if (Object.keys(set).length) {
      await (await col('settings')).updateOne({ _id: 'app' }, { $set: { ...set, updatedAt: new Date(), updatedBy: req.user.username } }, { upsert: true })
    }
    res.json(await loadAppSettings())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
