// articles 컬렉션 CRUD (SwimmingPhotography DB) — 속보 등 기사.
// GET /api/articles?type1=breaking_news&status=published&limit=100
// 기사 유형은 type1 로 가른다 — record(경기기록)·breaking_news(속보)·athlete·venue·notice·column.
import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import { SP } from '../db.js'
import { putObject, deleteObject } from '../r2.js'
import { broadcast } from '../sse.js'
import { canAny } from '../auth.js'

const router = Router()
const coll = async () => (await SP()).collection('articles')

// 이미지 업로드 (읽을거리 기사용) — competitions 라우터와 같은 규격
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i
const safeName = (s) => String(s).replace(/[^\w.\-가-힣]/g, '_')
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 50 },   // 장당 20MB, 최대 50장
  fileFilter: (req, file, cb) => cb(null, IMAGE_EXT.test(file.originalname)),
})

const toId = (id) => {
  try { return new ObjectId(id) } catch { return null }
}

// 기사 본문의 video 블록을 선수(athletes) 문서의 json.video 로 옮겨 적는다.
// 기사 쪽에서 유튜브를 넣거나 고치면 소스 payload 도 같은 값을 갖게 되어,
// 다음에 export_athletes 로 다시 뽑아도 영상이 그대로 따라온다.
// 영상이 없는 기사는 아무것도 하지 않는다(선수 쪽 값을 지우지 않는다).
async function syncVideoToAthlete(doc) {
  try {
    const blocks = doc?.translations?.ko?.content?.blocks
    if (!Array.isArray(blocks)) return
    const v = blocks.find((b) => b?.type === 'video' && b?.url)
    if (!v) return
    // 선수 문서 키 — athletes 라우터의 athleteKey 와 같은 조합
    const key = {
      competitionID: (doc.competitionID != null && doc.competitionID !== '') ? Number(doc.competitionID) : null,
      name: String(doc.name || ''),
      gender: String(doc.gender || ''),
      ageGroup: String(doc.ageGroup || ''),
      team: String(doc.team || ''),
    }
    if (!key.name) return
    await (await SP()).collection('athletes').updateOne(
      key,
      { $set: { 'json.video': { url: String(v.url), caption: String(v.caption || '') } } },
    )
  } catch { /* 본체 저장은 이미 끝났다 — 되돌려 적기 실패로 응답을 깨지 않는다 */ }
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
    // 일괄 게시·초안·게시일자 — ids 중 하나라도 속보가 아니면 전체 거부
    if (req.method === 'POST' && ['/publish', '/unpublish', '/published-at'].includes(req.path)) {
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
  name: 1,                       // 홈 목록의 선수명 정렬용
  publishedAt: 1, createdAt: 1, created: 1, updatedAt: 1,
  visibility: 1,
  'media.thumb': 1, 'media.coverImage': 1, 'media.images.url': 1,
  'translations.ko.title': 1, 'translations.ko.categories': 1,
  'translations.en.title': 1, 'translations.en.categories': 1,
  // 영상 유무만 보면 되므로 블록의 type 만. 본문(text)은 응답 대부분을 차지해 빼둔다.
  'translations.ko.content.blocks.type': 1,
}

// 대시보드 기사 표가 그리는 열만. 본문(blocks[].text)이 응답의 대부분이라 그것만 빼도
// 500건 응답이 6.2MB → 1MB 아래로 줄어든다. 블록은 이미지·유튜브 유무 판정에만 쓰므로
// type·url 두 필드만 남긴다. 행을 클릭하면 대시보드가 그 기사 하나를 전체로 다시 받는다.
const LIST_PROJECTION = {
  slug: 1, type: 1, type1: 1, status: 1,
  createdAt: 1, publishedAt: 1, updatedAt: 1,
  competitionID: 1, name: 1, ageGroup: 1, team: 1, gender: 1,
  'visibility.isFeatured': 1,
  'reporter.name': 1,
  'media.thumb': 1, 'media.coverImage': 1, 'media.images.url': 1,
  'translations.ko.title': 1, 'translations.ko.categories': 1,
  'translations.ko.content.blocks.type': 1, 'translations.ko.content.blocks.url': 1,
}

// 목록. type/status 외에 category(searchCategories 포함), q(제목 부분검색) 지원.
// fields=card 면 카드용 필드만 추려 보낸다(홈·검색처럼 목록만 그리는 화면용).
router.get('/', async (req, res) => {
  try {
    const { type, type1, status, category, q, slug, competitionID, featured, dateFrom, hasImage, fields, skip, withTotal, sort, limit = 200 } = req.query
    const filter = {}
    if (type) filter.type = type
    // type1 — 기사 유형(record·breaking_news·athlete·venue·notice·column).
    // 쉼표로 여러 개를 받는다(읽을거리 페이지가 네 종류를 한 번에 본다).
    if (type1) {
      const list = String(type1).split(',').map((v) => v.trim()).filter(Boolean)
      if (list.length === 1) filter.type1 = list[0]
      else if (list.length > 1) filter.type1 = { $in: list }
    }
    if (status) filter.status = status          // 전체(미지정) / published / draft
    if (slug) filter.slug = String(slug)
    if (category) filter.searchCategories = String(category)
    if (q) filter['translations.ko.title'] = { $regex: String(q), $options: 'i' }
    if (competitionID !== undefined && String(competitionID).trim() !== '') filter.competitionID = Number(competitionID)
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
    const c = await coll()
    const cursor = c
      .find(filter, fields === 'card' ? { projection: CARD_PROJECTION }
        : fields === 'list' ? { projection: LIST_PROJECTION } : undefined)
      // 기본은 게시일 최신순(공개 사이트 기준). sort=created 면 작성일 최신순(대시보드 목록).
      // 마지막 _id 는 동점 깨기 — 같은 배치로 만든 기사들은 createdAt·publishedAt 이 전부 같아서,
      // 이게 없으면 skip 으로 쪽을 넘길 때 순서가 뒤바뀌어 같은 기사가 두 쪽에 나오고 어떤 기사는 아예 안 나온다.
      .sort(sort === 'created'
        ? { createdAt: -1, publishedAt: -1, _id: -1 }
        : { publishedAt: -1, createdAt: -1, _id: -1 })
    const from = Math.max(0, Number(skip) || 0)
    if (from) cursor.skip(from)
    const docs = await cursor.limit(Number(limit) || 200).toArray()

    // 쪽 나누기용 — 같은 조건의 전체 건수가 있어야 마지막 쪽을 알 수 있다.
    // 옵트인이라 기존 호출자(배열을 그대로 받는 쪽)는 응답 모양이 바뀌지 않는다.
    if (withTotal === '1' || withTotal === 'true') {
      return res.json({ rows: docs, total: await c.countDocuments(filter), skip: from, limit: Number(limit) || 200 })
    }
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
    await syncVideoToAthlete(saved)
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
    const pubDocs = await c.find({ _id: { $in: oids }, type1: 'breaking_news' }).toArray()
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

// 일괄 게시일자 — { ids: [...], date: 'YYYY-MM-DD' } → publishedAt 을 그 날짜로 바꾼다.
// status 는 건드리지 않는다 — 초안은 초안 그대로, 날짜만 고치는 기능이다.
// 시각은 UTC 자정으로 둔다: 목록·공개 사이트가 ISO 앞 10자리로 날짜를 보여주므로
// KST 자정(=전날 15:00Z)으로 저장하면 하루 전으로 표시된다.
router.post('/published-at', onlyBreaking, async (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || []
    const date = String((req.body && req.body.date) || '').trim()
    const oids = ids.map(toId).filter(Boolean)
    if (!oids.length) return res.status(400).json({ error: 'ids 가 비어 있습니다.' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).' })
    const at = new Date(`${date}T00:00:00.000Z`)
    if (Number.isNaN(at.getTime())) return res.status(400).json({ error: '없는 날짜입니다.' })
    const r = await (await coll()).updateMany(
      { _id: { $in: oids } },
      { $set: { publishedAt: at, updatedAt: new Date() } },
    )
    res.json({ matched: r.matchedCount, modified: r.modifiedCount, publishedAt: at })
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
    await syncVideoToAthlete(doc)
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

// ── 이미지 업로드 — multipart 'files' → R2 올린 뒤 media.images 에 추가 ──
// 대회 이미지와 같은 방식. 첫 장은 썸네일·커버가 비어 있으면 함께 채운다(홈 그리드가 썸네일을 쓴다).
router.post('/:id/images', upload.array('files', 50), async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const c = await coll()
    const doc0 = await c.findOne({ _id }, { projection: { slug: 1, 'media.thumb': 1, 'media.coverImage': 1 } })
    if (!doc0) return res.status(404).json({ error: 'not found' })
    const files = req.files || []
    if (!files.length) return res.json({ added: 0, images: [] })

    const prefix = `SP-articles-${doc0.slug || String(_id)}`
    const now = new Date()
    const items = []
    for (const f of files) {
      const name = safeName(f.originalname)
      const { url } = await putObject(`${prefix}/${name}`, f.buffer, f.mimetype)
      items.push({ imageId: null, url, key: `${prefix}/${name}`, filename: name, size: f.size, uploadedAt: now })
    }
    const $set = { updatedAt: new Date() }
    if (!doc0.media?.thumb) $set['media.thumb'] = items[0].url
    if (!doc0.media?.coverImage) $set['media.coverImage'] = items[0].url

    const r = await c.findOneAndUpdate(
      { _id },
      { $push: { 'media.images': { $each: items } }, $set },
      { returnDocument: 'after' },
    )
    const doc = r && (r.value || r)
    res.json({ added: items.length, results: items, images: (doc && doc.media && doc.media.images) || items, media: doc && doc.media })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── 이미지 삭제 — { url } 로 media.images 에서 빼고 R2 오브젝트도 지운다 ──
router.delete('/:id/images', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const url = req.body && req.body.url
    if (!url) return res.status(400).json({ error: 'url 이 필요합니다.' })
    const c = await coll()
    const cur = await c.findOne({ _id }, { projection: { media: 1 } })
    const target = ((cur && cur.media && cur.media.images) || []).find((im) => im.url === url)

    const $set = { updatedAt: new Date() }
    // 지운 사진이 썸네일·커버였다면 남은 첫 장으로 옮긴다
    const rest = ((cur && cur.media && cur.media.images) || []).filter((im) => im.url !== url)
    if (cur?.media?.thumb === url) $set['media.thumb'] = rest[0]?.url || ''
    if (cur?.media?.coverImage === url) $set['media.coverImage'] = rest[0]?.url || ''

    const r = await c.findOneAndUpdate(
      { _id },
      { $pull: { 'media.images': { url } }, $set },
      { returnDocument: 'after' },
    )
    const doc = r && (r.value || r)
    if (target?.key) { try { await deleteObject(target.key) } catch { /* 오브젝트가 이미 없어도 문서에서는 지운다 */ } }
    res.json({ ok: true, images: (doc && doc.media && doc.media.images) || [], media: doc && doc.media })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
