// 이미지(images) — SwimmingPhotography DB 의 images 컬렉션 조회.
// 대회(competitionID)·영법(discipline)·선수명(name)으로 필터. url·thumbnail 은 CLOUD_PUBLIC_URL 붙인 전체 URL.
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { SP } from '../db.js'
import { publicUrl, deleteObject } from '../r2.js'

const router = Router()
const coll = async () => (await SP()).collection('images')
const toId = (v) => { try { return new ObjectId(String(v)) } catch { return null } }

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

// 수정 — 편집 가능한 필드만 받는다. competitionID·competition·url·thumbnail 은 가져오기가 정하므로 제외.
// name 은 선수 매칭 키(times.name_unique)라 동명이인이면 "홍길동1" 처럼 번호가 붙은 이름을 넣어야 한다.
const EDITABLE = ['name', 'gender', 'discipline', 'distance', 'type']
router.put('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const body = req.body || {}
    const $set = { updatedAt: new Date() }
    for (const k of EDITABLE) if (body[k] !== undefined) $set[k] = String(body[k] ?? '').trim()
    if ($set.name === '') return res.status(400).json({ error: '선수명을 입력하세요.' })
    const r = await (await coll()).findOneAndUpdate({ _id }, { $set }, { returnDocument: 'after' })
    const doc = r && (r.value || r)
    if (!doc || !doc._id) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true, ...Object.fromEntries(EDITABLE.map((k) => [k, doc[k] ?? ''])) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 삭제 — images 문서 + R2 오브젝트(원본·썸네일). url/thumbnail 은 상대경로(=R2 key)로 저장돼 있다.
router.delete('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const c = await coll()
    const cur = await c.findOne({ _id }, { projection: { url: 1, thumbnail: 1 } })
    if (!cur) return res.status(404).json({ error: 'not found' })
    await c.deleteOne({ _id })
    // 전체 URL 로 저장된 예전 문서는 R2 key 를 알 수 없으므로 건너뛴다.
    for (const key of [...new Set([cur.url, cur.thumbnail].filter((k) => k && !/^https?:\/\//.test(k)))]) {
      try { await deleteObject(key) } catch { /* R2 없음/권한 이상 시 무시 */ }
    }
    res.json({ deleted: 1 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
