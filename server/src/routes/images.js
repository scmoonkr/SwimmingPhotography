// 이미지(images) — SwimmingPhotography DB 의 images 컬렉션 조회.
// 대회(competitionID)·영법(discipline)·선수명(name)으로 필터. url·thumbnail 은 CLOUD_PUBLIC_URL 붙인 전체 URL.
import { Router } from 'express'
import { SP } from '../db.js'
import { publicUrl } from '../r2.js'

const router = Router()
const coll = async () => (await SP()).collection('images')

// competitionName select 옵션 — images 에 존재하는 대회(distinct), 최신순
router.get('/competitions', async (req, res) => {
  try {
    const docs = await (await coll()).aggregate([
      { $match: { competitionID: { $ne: null } } },
      {
        $group: {
          _id: '$competitionID',
          competitionID: { $first: '$competitionID' },
          competitionName: { $first: '$competition' },
          count: { $sum: 1 },
        },
      },
      { $sort: { competitionID: -1 } },
    ]).toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// discipline select 옵션 — distinct(빈 값 제외)
router.get('/disciplines', async (req, res) => {
  try {
    const arr = await (await coll()).distinct('discipline', { discipline: { $nin: [null, ''] } })
    res.json(arr.sort())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 목록 — competitionID·discipline·name 필터
router.get('/', async (req, res) => {
  try {
    const { competitionID, discipline, name, limit = 2000 } = req.query
    const filter = {}
    if (competitionID) filter.competitionID = Number(competitionID)
    if (discipline) filter.discipline = String(discipline)
    if (name) filter.name = { $regex: String(name), $options: 'i' }
    const docs = await (await coll())
      .find(filter)
      .limit(Math.min(Number(limit) || 2000, 10000))
      .toArray()
    // 저장은 상대경로 → 표시용 url·thumbnail 은 CLOUD_PUBLIC_URL 붙인 전체 URL. path/thumbPath 는 상대경로 보존.
    const abs = (p) => (!p ? '' : (/^https?:\/\//.test(p) ? p : publicUrl(p)))
    const out = docs.map((d) => ({
      ...d,
      url: abs(d.url),
      thumbnail: abs(d.thumbnail || d.url),
      path: d.url || '',
      thumbPath: d.thumbnail || d.url || '',
    }))
    res.json(out)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
