// 이미지(images) — SwimmingPhotography DB 의 images 컬렉션 조회.
// 대회(competitionID)·영법(discipline)·선수명(name)으로 필터. url·thumbnail 은 CLOUD_PUBLIC_URL 붙인 전체 URL.
import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import { SP } from '../db.js'
import { publicUrl, putObject, deleteObject } from '../r2.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 2000 } })
const safeName = (s) => String(s).replace(/[^\w.\-가-힣]/g, '_')
const coll = async () => (await SP()).collection('images')
const toId = (v) => { try { return new ObjectId(String(v)) } catch { return null } }

// 대회 select 옵션 — SP.competitions 에 등록된 대회 '전부', 최신순.
// (images 에 있는 대회만 뽑으면 아직 사진을 안 올린 대회를 고를 수 없어 업로드 대상 선택이 안 된다.)
// count 는 그 대회에 등록된 이미지 수(없으면 0).
router.get('/competitions', async (req, res) => {
  try {
    const docs = await (await SP()).collection('competitions').aggregate([
      { $match: { competitionID: { $ne: null } } },
      { $lookup: { from: 'images', localField: 'competitionID', foreignField: 'competitionID', as: '_i' } },
      {
        $project: {
          _id: 0,
          competitionID: 1,
          competitionName: { $ifNull: ['$competitionName', ''] },
          datetime: { $ifNull: ['$datetime', ''] },
          count: { $size: '$_i' },
        },
      },
      // 일자 내림차순 — competitionID 순으로 하면 나중에 등록된 옛 대회가 맨 위로 와서
      // '최근 대회 자동 선택'이 엉뚱한 대회를 고른다.
      { $sort: { datetime: -1, competitionID: -1 } },
    ]).toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 파일명 파싱 결과 → times 매칭 (업로드 전 확인용)
// POST { competitionID, items: [{ filename, name, gender, discipline, distance }] }
// 매칭 키
//   개인       : competitionID + name_unique + gender + discipline + distance
//   계영(FRR·MR): competitionID + name_unique + discipline + distance
//     계영은 gender·team 을 보지 않는다 — 멤버 명단(name_unique)이 이미 그 팀의 조합이라
//     男/女/혼성 표기가 파일명과 달라도 같은 팀으로 봐야 하고, team 은 파일명에 없다.
//   times.name_unique 는 names 와 같은 문자열 배열이다.
//   개인 ["홍길동1"] 은 그 값 하나로 맞추고,
//   계영 ["임승욱","주의현","신우진","최성호"] 은 파일명에 멤버 한 명만 적히므로
//   '멤버 각각'으로 맞춘다(명단 전체를 적은 파일명도 받도록 join 값도 함께 건다).
// 같은 종목을 예선·결선 두 번 뛰면 여러 건이 잡힌다 → times 를 모두 돌려주고 화면에서 판단.
const RELAY = ['FRR', 'MR']
const isRelay = (d) => RELAY.includes(String(d || '').toUpperCase())
const nuStr = (v) => (Array.isArray(v) ? v.join(',') : String(v ?? ''))
router.post('/match', async (req, res) => {
  try {
    const { competitionID, items } = req.body || {}
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: '대상이 없습니다.' })
    const cid = (competitionID != null && competitionID !== '') ? Number(competitionID) : null
    if (cid == null) return res.status(400).json({ error: '대회를 선택하세요.' })

    const names = [...new Set(items.map((i) => String(i?.name || '').trim()).filter(Boolean))]
    // 배열 필드라 $in 은 '원소' 매칭이다. 개인은 원소가 곧 이름이라 그대로 걸리고,
    // 계영("A,B,C,D")은 콤마로 끊은 배열 전체 일치로 따로 건다. 최종 판정은 아래 join 비교로 한다.
    const or = []
    const singles = names.filter((n) => !n.includes(','))
    if (singles.length) or.push({ name_unique: { $in: singles } })
    for (const n of names.filter((x) => x.includes(','))) {
      or.push({ name_unique: n.split(',').map((s) => s.trim()).filter(Boolean) })
    }
    const rows = or.length
      ? await (await SP()).collection('times').find(
        { competitionID: cid, $or: or },
        { projection: { timeID: 1, name: 1, name_unique: 1, gender: 1, ageGroup: 1, team: 1, discipline: 1, distance: 1, round: 1, time: 1, rank: 1 } },
      ).limit(20000).toArray()
      : []

    // 계영은 gender 를 키에서 뺀다(team 은 파일명에 없어 아예 안 본다) — 이름·영법·거리만.
    const keyOf = (nm, g, d, dist) => (isRelay(d)
      ? ['R', nm, d, dist]
      : ['I', nm, g, d, dist]).map((v) => String(v ?? '')).join('|')
    // name_unique.includes(파일명의 name) 이 되도록 '원소 각각'을 키로 건다.
    // (개인은 원소가 하나라 그 이름 하나, 계영은 멤버 각각. 명단 전체를 적은 파일명도 받도록 join 도 함께.)
    const idx = new Map()
    const put = (k, r) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(r) }
    for (const r of rows) {
      const arr = Array.isArray(r.name_unique) ? r.name_unique : (r.name_unique ? [String(r.name_unique)] : [])
      const keys = new Set([...arr, ...(arr.length > 1 ? [arr.join(',')] : [])].filter(Boolean))
      for (const k of keys) put(keyOf(k, r.gender, r.discipline, r.distance), r)
    }

    const out = items.map((it) => {
      const hit = idx.get(keyOf(String(it?.name || '').trim(), it?.gender, it?.discipline, it?.distance)) || []
      return {
        filename: it?.filename ?? '',
        status: hit.length === 1 ? 'ok' : (hit.length ? 'multi' : 'none'),
        // 여러 건이어도 같은 선수라 ageGroup·team 은 동일하다
        ageGroup: hit[0]?.ageGroup ?? '',
        team: hit[0]?.team ?? '',
        timeIDs: hit.map((r) => r.timeID ?? null),
        times: hit.map((r) => ({
          timeID: r.timeID ?? null, round: r.round || '', time: r.time || '', rank: r.rank ?? null,
        })),
      }
    })
    const count = (s) => out.filter((o) => o.status === s).length
    // 하나도 안 맞을 때 '대회를 잘못 골랐는지' 화면에서 판단할 수 있도록 그 대회의 기록 수를 함께 준다
    const timesInCompetition = await (await SP()).collection('times').countDocuments({ competitionID: cid })
    res.json({ total: out.length, ok: count('ok'), multi: count('multi'), none: count('none'), timesInCompetition, items: out })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 사진 저장 — 원본·썸네일을 R2 에 올리고 images 컬렉션에 upsert.
// multipart: files[](원본) · thumbs[](썸네일, files 와 같은 순서) ·
//   competitionID · competitionName · meta(JSON: [{ filename, name, gender, discipline, distance, type, timeID }])
// 키: (competitionID, filename) — 같은 파일을 다시 올리면 덮어쓴다.
router.post('/import', upload.fields([{ name: 'files', maxCount: 1000 }, { name: 'thumbs', maxCount: 1000 }]), async (req, res) => {
  try {
    const files = (req.files && req.files.files) || []
    const thumbs = (req.files && req.files.thumbs) || []
    let meta = []
    try { meta = JSON.parse(req.body.meta || '[]') } catch { meta = [] }
    if (!files.length) return res.status(400).json({ error: '파일이 없습니다.' })
    if (meta.length !== files.length) return res.status(400).json({ error: 'files 와 meta 개수가 맞지 않습니다.' })

    const competitionID = (req.body.competitionID != null && req.body.competitionID !== '') ? Number(req.body.competitionID) : null
    if (competitionID == null) return res.status(400).json({ error: '대회를 선택하세요.' })
    const competition = req.body.competitionName || ''
    const folder = `SP-images-${competitionID}`

    const now = new Date()
    const ops = []
    const failed = []
    for (let i = 0; i < files.length; i++) {
      const m = meta[i] || {}
      const fname = safeName(m.filename || files[i].originalname)
      const key = `${folder}/${fname}`
      const thumbKey = `${folder}/thumb/${fname}`
      try {
        await putObject(key, files[i].buffer, files[i].mimetype)
      } catch (e) {
        failed.push({ filename: fname, error: e.message })
        continue
      }
      let thumbnail = key
      if (thumbs[i] && thumbs[i].buffer) {
        try { await putObject(thumbKey, thumbs[i].buffer, thumbs[i].mimetype || 'image/jpeg'); thumbnail = thumbKey } catch { /* 썸네일 실패는 원본으로 대체 */ }
      }
      const timeID = (m.timeID != null && m.timeID !== '') ? Number(m.timeID) : null
      ops.push({
        updateOne: {
          filter: { competitionID, filename: fname },
          update: {
            $set: {
              competitionID, competition, filename: fname, timeID,
              // name 은 선수 매칭 키(times.name_unique). 드로어에서 확인·수정한 값을 그대로 쓴다.
              name: String(m.name ?? ''), gender: String(m.gender ?? ''),
              discipline: String(m.discipline ?? ''), distance: String(m.distance ?? ''),
              type: String(m.type ?? ''),
              ageGroup: String(m.ageGroup ?? ''), team: String(m.team ?? ''),
              // url·thumbnail 은 CLOUD_PUBLIC_URL 을 뺀 상대경로(=R2 key)로 저장. 조회 시 붙인다.
              url: key, thumbnail,
              updatedAt: now,
            },
          },
          upsert: true,
        },
      })
    }
    if (!ops.length) return res.status(500).json({ error: '업로드에 모두 실패했습니다.', failed })
    const rw = await (await coll()).bulkWrite(ops, { ordered: false })
    res.json({
      count: ops.length,
      upserted: rw.upsertedCount || 0,
      modified: rw.modifiedCount || 0,
      failed,
    })
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
const EDITABLE = ['name', 'team', 'gender', 'discipline', 'distance', 'type']
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
