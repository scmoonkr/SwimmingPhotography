// 사이드바 nav 건수 — 각 컬렉션의 실제 DB 카운트.
// SP: articles(속보/기사)·competitions·venues·times / BR: athletes·teams / MA: images.
import { Router } from 'express'
import { SP, BR, MA } from '../db.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const [sp, br, ma] = await Promise.all([SP(), BR(), MA()])
    const [breakingNews, article, competitions, venues, times, athletes, teams, images] = await Promise.all([
      sp.collection('articles').countDocuments({ type: 'breaking_news' }),
      sp.collection('articles').countDocuments({ type: 'article' }),
      sp.collection('competitions').countDocuments(),
      sp.collection('venues').countDocuments(),
      sp.collection('times').countDocuments(),
      br.collection('athletes').countDocuments(),
      br.collection('teams').countDocuments(),
      ma.collection('images').countDocuments(),
    ])
    res.json({ breakingNews, article, competitions, venues, times, athletes, teams, images, startList: 0 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
