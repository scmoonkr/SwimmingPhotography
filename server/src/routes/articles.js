// articles 컬렉션 CRUD (SwimmingPhotography DB) — 속보 등 기사.
// GET /api/articles?type=breaking_news&status=published&limit=100
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { SP } from '../db.js'
import { broadcast } from '../sse.js'
import { canAny } from '../auth.js'

const router = Router()
const coll = async () => (await SP()).collection('articles')

const toId = (id) => {
  try { return new ObjectId(id) } catch { return null }
}

// 속보 전담 계정(breaking 만 가진 역할) 보호 —
// 속보와 일반 기사가 이 라우트를 함께 쓰므로, 경로만으로는 갈라지지 않는다.
// 그래서 손대려는 '문서의 type' 을 확인한다. 생성은 type 을 breaking_news 로 강제하고,
// 수정·삭제·게시는 대상이 전부 속보일 때만 통과시킨다.
const BN = 'breaking_news'
async function onlyBreaking(req, res, next) {
  if (canAny(req.user, ['articles'])) return next()      // 기사 권한이 있으면 제한 없음
  if (!canAny(req.user, ['breaking'])) return res.status(403).json({ error: '이 작업을 할 권한이 없습니다.' })
  try {
    // 생성 — 무엇을 보내든 속보로 고정한다
    if (req.method === 'POST' && req.path === '/') {
      if (req.body?.type && req.body.type !== BN) return res.status(403).json({ error: '속보만 만들 수 있습니다.' })
      req.body = { ...req.body, type: BN }
      return next()
    }
    // 일괄 게시·초안 — ids 중 하나라도 속보가 아니면 전체 거부
    if (req.method === 'POST' && (req.path === '/publish' || req.path === '/unpublish')) {
      const oids = ((req.body && req.body.ids) || []).map(toId).filter(Boolean)
      if (!oids.length) return next()                    // 빈 목록은 라우트가 400 으로 답한다
      const n = await (await coll()).countDocuments({ _id: { $in: oids }, type: BN })
      if (n !== oids.length) return res.status(403).json({ error: '속보가 아닌 항목이 섞여 있습니다.' })
      return next()
    }
    // 수정·삭제 — 대상 문서가 속보여야 한다
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const doc = await (await coll()).findOne({ _id }, { projection: { type: 1 } })
    if (!doc) return res.status(404).json({ error: 'not found' })
    if (doc.type !== BN) return res.status(403).json({ error: '속보만 수정할 수 있습니다.' })
    if (req.method === 'PUT' && req.body?.type && req.body.type !== BN) {
      return res.status(403).json({ error: '속보의 종류는 바꿀 수 없습니다.' })   // 속보를 기사로 바꿔치기 방지
    }
    next()
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// 목록 카드(홈·검색)가 실제로 쓰는 필드만. 본문(translations.*.body)과 이미지 캡션까지 실어 보내면
// 500건 기준 응답이 7MB 에 달해 홈 SSR 이 무거워진다 — 같은 건수를 0.4MB 로 줄인다.
const CARD_PROJECTION = {
  slug: 1, type: 1, status: 1,
  publishedAt: 1, createdAt: 1, created: 1, updatedAt: 1,
  visibility: 1,
  'media.thumb': 1, 'media.coverImage': 1, 'media.images.url': 1,
  'translations.ko.title': 1, 'translations.ko.categories': 1,
  'translations.en.title': 1, 'translations.en.categories': 1,
}

// 목록. type/status 외에 category(searchCategories 포함), q(제목 부분검색) 지원.
// fields=card 면 카드용 필드만 추려 보낸다(홈·검색처럼 목록만 그리는 화면용).
router.get('/', async (req, res) => {
  try {
    const { type, status, category, q, slug, featured, dateFrom, hasImage, fields, limit = 200 } = req.query
    const filter = {}
    if (type) filter.type = type
    if (status) filter.status = status          // 전체(미지정) / published / draft
    if (slug) filter.slug = String(slug)
    if (category) filter.searchCategories = String(category)
    if (q) filter['translations.ko.title'] = { $regex: String(q), $options: 'i' }
    // 홈 상단 하이라이트: visibility.isFeatured=true 인 기사만
    if (featured === 'true' || featured === '1') filter['visibility.isFeatured'] = true
    // 작성일자(createdAt) >= dateFrom — createdAt 이 문자열/Date 혼재라 $toDate 로 변환해 비교
    if (dateFrom) {
      const from = new Date(String(dateFrom))
      if (!Number.isNaN(from.getTime())) {
        filter.$expr = { $gte: [{ $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } }, from] }
      }
    }
    // 이미지 존재 — media.images 1개 이상, 또는 coverImage/thumb 존재
    if (hasImage === 'true' || hasImage === '1') {
      filter.$or = [
        { 'media.images.0': { $exists: true } },
        { 'media.coverImage': { $nin: [null, ''] } },
        { 'media.thumb': { $nin: [null, ''] } },
      ]
    }
    const docs = await (await coll())
      .find(filter, fields === 'card' ? { projection: CARD_PROJECTION } : undefined)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(Number(limit) || 200)
      .toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 단건
router.get('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const doc = await (await coll()).findOne({ _id })
    if (!doc) return res.status(404).json({ error: 'not found' })
    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 생성
router.post('/', onlyBreaking, async (req, res) => {
  try {
    const now = new Date()
    const doc = { ...req.body, createdAt: now, updatedAt: now }
    delete doc._id
    const r = await (await coll()).insertOne(doc)
    const saved = { ...doc, _id: r.insertedId }
    // 속보면 접속 중인 모든 클라이언트에 실시간 push
    if (saved.type === 'breaking_news' && saved.status === 'published') {
      broadcast('breaking', {
        _id: String(saved._id),
        title: saved.translations?.ko?.title || '',
        publishedAt: saved.publishedAt || '',
      })
    }
    res.status(201).json(saved)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 일괄 게시 — { ids: [...] } → status:'published', publishedAt(없으면 현재시각) 설정
router.post('/publish', onlyBreaking, async (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || []
    const oids = ids.map(toId).filter(Boolean)
    if (!oids.length) return res.status(400).json({ error: 'ids 가 비어 있습니다.' })
    const now = new Date()
    const c = await coll()
    // publishedAt 이 이미 있으면 유지, 없거나 비어 있으면 now 로 채움
    await c.updateMany(
      { _id: { $in: oids }, $or: [{ publishedAt: null }, { publishedAt: '' }, { publishedAt: { $exists: false } }] },
      { $set: { publishedAt: now } },
    )
    const r = await c.updateMany(
      { _id: { $in: oids } },
      { $set: { status: 'published', updatedAt: now } },
    )
    // 속보는 게시 즉시 실시간 push
    const pubDocs = await c.find({ _id: { $in: oids }, type: 'breaking_news' }).toArray()
    for (const d of pubDocs) {
      broadcast('breaking', { _id: String(d._id), title: d.translations?.ko?.title || '', publishedAt: d.publishedAt || '' })
    }
    res.json({ matched: r.matchedCount, modified: r.modifiedCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 일괄 초안 — { ids: [...] } → status:'draft' (게시 취소). publishedAt 은 유지.
router.post('/unpublish', onlyBreaking, async (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || []
    const oids = ids.map(toId).filter(Boolean)
    if (!oids.length) return res.status(400).json({ error: 'ids 가 비어 있습니다.' })
    const r = await (await coll()).updateMany(
      { _id: { $in: oids } },
      { $set: { status: 'draft', updatedAt: new Date() } },
    )
    res.json({ matched: r.matchedCount, modified: r.modifiedCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 수정
router.put('/:id', onlyBreaking, async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const body = { ...req.body, updatedAt: new Date() }
    delete body._id
    delete body.createdAt
    const r = await (await coll()).findOneAndUpdate(
      { _id },
      { $set: body },
      { returnDocument: 'after' },
    )
    const doc = r && (r.value || r)
    if (!doc || !doc._id) return res.status(404).json({ error: 'not found' })
    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 삭제
router.delete('/:id', onlyBreaking, async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const r = await (await coll()).deleteOne({ _id })
    if (!r.deletedCount) return res.status(404).json({ error: 'not found' })
    res.status(204).end()
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
