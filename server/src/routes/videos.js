// 영상(videos) — SwimmingPhotography DB 의 videos 컬렉션. 사진(images)과 같은 모양으로 다룬다.
//   { competitionID, competition, discipline, gender, distance, filename, url, thumbnail, size, caption,
//     athletes: [{ name, team, ageGroup, timeID, contributor }], timeIDs: [..],
//     name · team · ageGroup · timeID (첫 번째 선수 값), uploader, contributor, createdAt, updatedAt }
// 영상을 먼저 올리고(종목만 정해서), 그 뒤에 선수(기록)를 붙인다. 기록 하나에 영상이 여러 개 붙을 수 있고,
// 영상 하나에 선수가 여러 명 붙을 수도 있다(같은 조에서 함께 찍힌 경우 — 모두 같은 종목이다).
// 파일은 서버를 거치지 않는다 — 서버는 올릴 주소(presigned PUT)만 내주고, 브라우저가 스토리지로 직접 올린 뒤
// 등록(POST /)한다. url·thumbnail 은 상대경로(=스토리지 key)로 저장하고 조회 때 CLOUD_PUBLIC_URL 을 붙인다.
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import crypto from 'node:crypto'
import { SP } from '../db.js'
import { publicUrl, presignPut, presignDownload, headObject, deleteObject } from '../r2.js'
import { canAny } from '../auth.js'

const router = Router()
const toId = (v) => { try { return new ObjectId(String(v)) } catch { return null } }
const abs = (p) => (!p ? '' : (/^https?:\/\//.test(p) ? p : publicUrl(p)))
// 파일명 정리 — 한글은 살리고 나머지 특수문자만 '_' 로 (images 와 같은 규칙)
const safeName = (s) => String(s).normalize('NFC').replace(/[^\w.\-가-힣]/g, '_')
// 영상 하나의 용량 한도(MB) — .env 의 VIDEO_MAX_MB, 없으면 499.
// env 는 dotenv.config 이후에 읽어야 하므로 호출 시점에 읽는다(import 시점엔 아직 안 올라와 있다).
const maxMB = () => Number(process.env.VIDEO_MAX_MB) || 499
const maxBytes = () => maxMB() * 1024 * 1024
const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i

// 컬렉션 — 처음 쓸 때 인덱스를 만든다(컬렉션이 없으면 이때 생긴다)
let indexed = false
const coll = async () => {
  const c = (await SP()).collection('videos')
  if (!indexed) {
    indexed = true
    await Promise.all([
      c.createIndex({ competitionID: 1, discipline: 1, gender: 1, distance: 1 }),
      c.createIndex({ timeIDs: 1 }),
    ]).catch(() => { indexed = false })
  }
  return c
}

// username → 표시 이름
const igOf = new Map()   // username → 인스타그램 계정(userNames 가 채운다)
const userNames = async (usernames) => {
  const who = [...new Set((usernames || []).filter(Boolean))]
  const map = new Map()
  if (who.length) {
    const us = await (await SP()).collection('users').find({ username: { $in: who } }, { projection: { username: 1, name: 1, instagram: 1 } }).toArray()
    for (const u of us) { map.set(u.username, u.name || u.username); igOf.set(u.username, String(u.instagram || '').trim()) }
  }
  return map
}
const whoOf = (v) => [v.uploader, v.contributor, ...(v.athletes || []).map((a) => a.contributor)]
const videoOut = (v, nameOf) => {
  const nm = (u) => (u ? (nameOf.get(u) || u) : '')
  return {
    _id: v._id, competitionID: v.competitionID, competition: v.competition || '',
    discipline: v.discipline || '', gender: v.gender || '', distance: v.distance || '',
    filename: v.filename || '', size: v.size || 0, caption: v.caption || '', kind: v.kind === 'cheer' ? 'cheer' : 'match',
    url: abs(v.url), thumbnail: abs(v.thumbnail),
    athletes: (v.athletes || []).map((a) => ({
      name: a.name ?? '', team: a.team ?? '', ageGroup: a.ageGroup ?? '', timeID: a.timeID ?? null,
      contributor: a.contributor ?? '', contributorName: nm(a.contributor),
    })),
    name: v.name || '', team: v.team || '', ageGroup: v.ageGroup || '', timeID: v.timeID ?? null,
    uploader: v.uploader || '', uploaderName: nm(v.uploader), uploaderInstagram: igOf.get(v.uploader) || '',
    contributor: v.contributor || '', contributorName: nm(v.contributor),
    createdAt: v.createdAt, updatedAt: v.updatedAt,
  }
}

// 유튜브 영상(youtube 컬렉션) → 표의 영상 모양. timeID 로 기록에 연결된 것만 쓴다. youtube:true 면 화면이 유튜브 플레이어로 띄운다.
const ytId = (u) => (String(u || '').match(/[?&]v=([\w-]{11})/) || String(u || '').match(/youtu\.be\/([\w-]{11})/) || [])[1] || ''
const youtubeOut = (y) => {
  const id = ytId(y.url)
  return {
    _id: String(y._id), youtube: true, competitionID: y.competitionID, competition: y.competitionName || '',
    discipline: y.discipline || '', gender: y.gender || '', distance: y.distance || '',
    filename: '', size: 0, caption: y.title || '',
    url: y.url || '', embed: id ? `https://www.youtube.com/embed/${id}` : '', thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '',
    athletes: [], name: y.name || '', team: '', ageGroup: y.ageGroup || '', timeID: y.timeID ?? null,
    uploader: '', uploaderName: '', contributor: '', contributorName: '',
    createdAt: y.updatedAt, updatedAt: y.updatedAt,
  }
}

// 기록(times) 목록 + 각 기록에 붙은 영상 — videos 페이지의 표. 대회는 필수, 성별·영법·거리는 비우면 전체.
// 영상은 videos.timeIDs 로 잇는다(영상 하나에 선수가 여럿이면 그 기록들 모두에 보인다).
router.get('/times', async (req, res) => {
  try {
    const { competitionID, discipline, gender, distance } = req.query
    if (!competitionID) return res.json([])
    const filter = { competitionID: Number(competitionID) }
    if (discipline) filter.discipline = String(discipline)
    if (gender) filter.gender = String(gender)
    if (distance) filter.distance = String(distance)
    const sp = await SP()
    const times = await sp.collection('times')
      .find(filter, { projection: { timeID: 1, name: 1, name_unique: 1, team: 1, ageGroup: 1, isAdult: 1, gender: 1, discipline: 1, distance: 1, course: 1, time: 1, timeStamp: 1, rank: 1, status: 1, round: 1, competitionID: 1 } })
      .limit(10000).toArray()
    const ids = times.map((t) => t.timeID).filter((v) => v != null)
    const vids = ids.length ? await (await coll()).find({ timeIDs: { $in: ids } }).sort({ createdAt: 1 }).toArray() : []
    const nameOf = await userNames(vids.flatMap(whoOf))
    const byTime = new Map()
    for (const v of vids) {
      const out = videoOut(v, nameOf)
      for (const id of (v.timeIDs || [])) { if (!byTime.has(id)) byTime.set(id, []); byTime.get(id).push(out) }
    }
    // 유튜브 — youtube.timeID 가 이 기록이면 같은 자리에 함께 보인다(올린 영상 뒤에)
    const yts = ids.length ? await sp.collection('youtube').find({ timeID: { $in: ids } }).sort({ _id: 1 }).toArray() : []
    for (const y of yts) {
      if (!byTime.has(y.timeID)) byTime.set(y.timeID, [])
      byTime.get(y.timeID).push(youtubeOut(y))
    }
    res.json(times.map((t) => ({
      timeID: t.timeID, competitionID: t.competitionID,
      name: (Array.isArray(t.name_unique) ? t.name_unique.join(',') : String(t.name_unique ?? '')) || t.name || '',
      team: t.team || '', ageGroup: t.ageGroup || '', isAdult: !!t.isAdult,
      gender: t.gender || '', discipline: t.discipline || '', distance: t.distance || '', course: t.course || '',
      time: t.time || '', timeStamp: t.timeStamp ?? null, rank: t.rank ?? '', status: t.status || '', round: t.round || '',
      videos: byTime.get(t.timeID) || [],
    })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 화면이 쓰는 설정 — 용량 한도(올리기 전에 안내·검사한다)
router.get('/config', (req, res) => res.json({ maxMB: maxMB() }))

// 비디오 페이지의 필터 옵션과 영상 수.
// 옵션은 대회의 실제 기록(times)에 존재하는 조합만 내리고, 수량은 임시 스토리지에 올라온
// videos 문서를 영상 하나당 한 건으로 센다. 각 항목은 자기 필터를 제외한 나머지 선택을 반영한다.
router.get('/facets', async (req, res) => {
  try {
    const { competitionID, discipline, gender, distance } = req.query
    if (!competitionID) {
      return res.json({
        genderOptions: [], disciplineOptions: [], distanceOptions: [],
        genders: {}, genderTotal: 0, disciplines: {}, disciplineTotal: 0,
        distances: {}, distanceTotal: 0, distribution: {}, distributionTotal: 0,
      })
    }
    const base = { competitionID: Number(competitionID) }

    const facetPipelines = () => ({
      genders: [
        ...(discipline ? [{ $match: { discipline: String(discipline) } }] : []),
        ...(distance ? [{ $match: { distance: String(distance) } }] : []),
        { $group: { _id: '$gender', count: { $sum: 1 } } },
      ],
      disciplines: [
        ...(gender ? [{ $match: { gender: String(gender) } }] : []),
        ...(distance ? [{ $match: { distance: String(distance) } }] : []),
        { $group: { _id: '$discipline', count: { $sum: 1 } } },
      ],
      distances: [
        ...(gender ? [{ $match: { gender: String(gender) } }] : []),
        ...(discipline ? [{ $match: { discipline: String(discipline) } }] : []),
        { $group: { _id: '$distance', count: { $sum: 1 } } },
      ],
    })
    const optionFacets = facetPipelines()
    const videoFacets = facetPipelines()
    videoFacets.distribution = [
      ...(gender ? [{ $match: { gender: String(gender) } }] : []),
      ...(discipline ? [{ $match: { discipline: String(discipline) } }] : []),
      ...(distance ? [{ $match: { distance: String(distance) } }] : []),
      { $group: { _id: '$discipline', count: { $sum: 1 } } },
    ]

    const sp = await SP()
    const [[available = {}], [counts = {}]] = await Promise.all([
      sp.collection('times').aggregate([{ $match: base }, { $facet: optionFacets }]).toArray(),
      (await coll()).aggregate([{ $match: base }, { $facet: videoFacets }]).toArray(),
    ])
    const values = (items) => (items || []).map((item) => String(item._id ?? '')).filter(Boolean)
    const toCounts = (items) => Object.fromEntries((items || []).map((item) => [String(item._id ?? ''), item.count]))
    const sum = (items) => (items || []).reduce((total, item) => total + item.count, 0)
    res.json({
      genderOptions: values(available.genders),
      disciplineOptions: values(available.disciplines),
      distanceOptions: values(available.distances),
      genders: toCounts(counts.genders),
      genderTotal: sum(counts.genders),
      disciplines: toCounts(counts.disciplines),
      disciplineTotal: sum(counts.disciplines),
      distances: toCounts(counts.distances),
      distanceTotal: sum(counts.distances),
      distribution: toCounts(counts.distribution),
      distributionTotal: sum(counts.distribution),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 목록 — 대회·영법·성별·거리 + 선택 여부(matched: has = 선수 기록에 연결됨 · none = 아직 안 됨)
// 대시보드 — videos 컬렉션 표. 최근 올린 순, skip/limit 으로 쪽을 나눈다(limit 최대 500).
router.get('/dir', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 500)
    const skip = Math.max(Number(req.query.skip) || 0, 0)
    const c = await coll()
    const [docs, total] = await Promise.all([
      c.find({}).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
      c.countDocuments({}),
    ])
    const nameOf = await userNames(docs.flatMap(whoOf))
    res.json({ total, rows: docs.map((d) => videoOut(d, nameOf)) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/', async (req, res) => {
  try {
    const { competitionID, discipline, gender, distance, matched, limit = 2000 } = req.query
    const filter = {}
    if (competitionID) filter.competitionID = Number(competitionID)
    if (discipline) filter.discipline = String(discipline)
    if (gender) filter.gender = String(gender)
    if (distance) filter.distance = String(distance)
    if (matched === 'none') filter.timeID = null          // null 은 필드가 없는 문서도 함께 잡는다
    else if (matched === 'has') filter.timeID = { $ne: null }
    const docs = await (await coll()).find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 2000, 10000)).toArray()
    const nameOf = await userNames(docs.flatMap(whoOf))
    res.json(docs.map((d) => videoOut(d, nameOf)))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 내려받기 파일 이름 — 20261106_남자_계영_200M_LCM_서브마린진수_조준성_김아론_구태규_유성찬_스위밍포토그래피_영상제공_홍길동.mp4
//   날짜는 올린 날이 아니라 대회가 열린 날(competitions.datetime). 알 수 없는 항목은 건너뛴다.
const DISC_KO = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO = { men: '남자', women: '여자', mixed: '혼성' }
const BRAND = '스위밍포토그래피'
const downloadName = async (v) => {
  const sp = await SP()
  const comp = v.competitionID != null
    ? await sp.collection('competitions').findOne({ competitionID: v.competitionID }, { projection: { datetime: 1 } })
    : null
  const m = String(comp?.datetime || '').match(/(\d{4})\D?(\d{2})\D?(\d{2})/)
  const date = m ? m[1] + m[2] + m[3] : ''
  // 코스(LCM·SCM)는 영상이 아니라 기록(times)에 있다
  const timeID = (v.timeIDs || []).find((id) => id != null) ?? v.timeID
  const time = timeID != null ? await sp.collection('times').findOne({ timeID }, { projection: { course: 1 } }) : null
  const athletes = (v.athletes && v.athletes.length ? v.athletes : [{ name: v.name, team: v.team }])
  const uniq = (list) => [...new Set(list.filter(Boolean))]
  const names = uniq(athletes.flatMap((a) => String(a.name || '').split(',').map((n) => n.trim())))
  const teams = uniq(athletes.map((a) => String(a.team || '').trim()))
  const distance = /^\d+$/.test(String(v.distance || '')) ? `${v.distance}M` : v.distance
  const who = v.uploader ? ((await userNames([v.uploader])).get(v.uploader) || v.uploader) : ''
  const ext = (String(v.filename || '').match(/\.(mp4|mov|m4v|webm)$/i) || ['.mp4'])[0].toLowerCase()
  const base = [
    date, GENDER_KO[v.gender] || v.gender, DISC_KO[v.discipline] || v.discipline, distance, time?.course,
    ...teams, ...names, BRAND, who && '영상제공', who,
  ].filter(Boolean).join('_').normalize('NFC').replace(/\s+/g, '').replace(/[\\/:*?"<>|]/g, '_')
  return base + ext
}

// 내려받기 — 저장용 주소로 넘긴다(파일은 서버를 거치지 않는다). 파일 이름은 downloadName() 규칙.
router.get('/:id/download', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const v = await (await coll()).findOne({ _id })
    if (!v || !v.url) return res.status(404).json({ error: 'not found' })
    if (/^https?:\/\//.test(v.url)) return res.redirect(v.url)
    res.redirect(await presignDownload(v.url, await downloadName(v).catch(() => v.filename)))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 올릴 주소 발급 — { competitionID, filename, contentType, size } → 영상·썸네일의 presigned PUT.
// 키는 서버가 정한다(다른 사람 파일을 덮어쓰지 못하게 난수를 넣는다).
router.post('/presign', async (req, res) => {
  try {
    const { competitionID, filename, contentType, size } = req.body || {}
    const cid = Number(competitionID)
    if (!Number.isFinite(cid)) return res.status(400).json({ error: '대회를 선택하세요.' })
    const fname = safeName(filename || '')
    if (!VIDEO_RE.test(fname)) return res.status(400).json({ error: '영상 파일(mp4·mov·m4v·webm)만 올릴 수 있습니다.' })
    if (Number(size) > maxBytes()) return res.status(400).json({ error: `영상은 ${maxMB()}MB 까지 올릴 수 있습니다.` })
    const comp = await (await SP()).collection('competitions').findOne({ competitionID: cid }, { projection: { _id: 1 } })
    if (!comp) return res.status(404).json({ error: '대회를 찾을 수 없습니다.' })

    const stamp = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const key = `SP-videos-${cid}/${stamp}_${fname}`
    const thumbKey = `SP-videos-${cid}/thumb/${stamp}.jpg`
    const ct = String(contentType || 'video/mp4')
    res.json({
      key, thumbKey, contentType: ct,
      uploadUrl: await presignPut(key, ct),
      thumbUploadUrl: await presignPut(thumbKey, 'image/jpeg'),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 등록 — 스토리지에 올린 뒤 호출. 실제로 올라갔는지(크기) 확인하고 문서를 만든다. 선수는 아직 없다.
router.post('/', async (req, res) => {
  try {
    const { competitionID, discipline, gender, distance, key, thumbKey, filename, kind } = req.body || {}
    const cid = Number(competitionID)
    const prefix = `SP-videos-${cid}/`
    if (!Number.isFinite(cid) || !String(key || '').startsWith(prefix) || String(key).includes('..')) {
      return res.status(400).json({ error: '잘못된 요청입니다.' })
    }
    const c = await coll()
    if (await c.findOne({ url: String(key) }, { projection: { _id: 1 } })) return res.status(409).json({ error: '이미 등록된 영상입니다.' })
    const head = await headObject(String(key))
    if (!head) return res.status(400).json({ error: '영상이 올라오지 않았습니다. 다시 올려주세요.' })
    if (head.size > maxBytes()) {
      await deleteObject(String(key)).catch(() => {})
      return res.status(400).json({ error: `영상은 ${maxMB()}MB 까지 올릴 수 있습니다.` })
    }
    // 썸네일은 브라우저가 못 만들 수도 있다(코덱) — 올라온 경우에만 쓴다
    const tk = String(thumbKey || '')
    const thumb = tk.startsWith(`${prefix}thumb/`) && !tk.includes('..') && await headObject(tk) ? tk : ''
    const comp = await (await SP()).collection('competitions').findOne({ competitionID: cid }, { projection: { competitionName: 1 } })
    const now = new Date()
    const doc = {
      competitionID: cid, competition: comp?.competitionName || '',
      discipline: String(discipline ?? ''), gender: String(gender ?? ''), distance: String(distance ?? ''),
      filename: safeName(filename || '') || String(key).split('/').pop(),
      url: String(key), thumbnail: thumb, size: head.size, caption: '', kind: kind === 'cheer' ? 'cheer' : 'match',
      athletes: [], timeIDs: [], name: '', team: '', ageGroup: '', timeID: null,
      uploader: req.user?.username || '', createdAt: now, updatedAt: now,
    }
    const r = await c.insertOne(doc)
    res.json(videoOut({ ...doc, _id: r.insertedId }, await userNames(whoOf(doc))))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 수정 — 종목(영법·성별·거리) · 선수 목록 · 캡션. 저장한 사람(contributor)과 시각을 남긴다.
// 선수는 images 와 같은 규칙: 남이 고른 선수는 빼거나 고칠 수 없다(관리자는 가능).
// 선수가 한 명도 남지 않으면 contributor 도 지운다.
router.put('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const body = req.body || {}
    const c = await coll()
    const cur = await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: 'not found' })
    const me = req.user?.username || ''
    const $set = { updatedAt: new Date() }
    const $unset = {}
    if (me) $set.contributor = me
    // 종목·캡션은 올린 사람(또는 운영진)만 고친다. 다른 회원은 선수 선택만 할 수 있다(보내도 무시).
    const owner = !cur.uploader || cur.uploader === me || canAny(req.user, ['data'])
    if (owner) {
      for (const k of ['discipline', 'gender', 'distance']) if (body[k] !== undefined) $set[k] = String(body[k] ?? '').trim()
      if (body.caption !== undefined) $set.caption = String(body.caption ?? '').trim()
    }

    if (Array.isArray(body.athletes)) {
      const isAdmin = canAny(req.user, ['users'])
      const mine = (x) => isAdmin || !x.contributor || x.contributor === me
      const before = cur.athletes || []
      const beforeBy = new Map(before.map((x) => [String(x.name || '').trim(), x]))   // 같은 종목 안에서 이름(name_unique)은 유일
      const list = []
      const seen = new Set()
      for (const a of body.athletes) {
        const name = String(a?.name ?? '').normalize('NFC').trim()
        if (!name || seen.has(name)) continue
        seen.add(name)
        const old = beforeBy.get(name)
        if (old && !mine(old)) { list.push({ ...old }); continue }        // 남이 고른 선수는 원래대로 둔다
        const tv = String(a?.timeID ?? '').trim()
        if (tv !== '' && !Number.isFinite(Number(tv))) return res.status(400).json({ error: 'timeID 는 숫자여야 합니다.' })
        list.push({
          name, team: String(a?.team ?? '').normalize('NFC').trim(), ageGroup: String(a?.ageGroup ?? '').trim(),
          timeID: tv === '' ? null : Number(tv), contributor: old ? (old.contributor || me) : me,
        })
      }
      const blocked = before.filter((x) => !seen.has(String(x.name || '').trim()) && !mine(x))
      if (blocked.length) {
        return res.status(403).json({ error: `다른 사람이 선택한 선수는 뺄 수 없습니다: ${blocked.map((x) => x.name).join(', ')}` })
      }
      const first = list[0] || { name: '', team: '', ageGroup: '', timeID: null }
      $set.athletes = list
      $set.timeIDs = [...new Set(list.map((a) => a.timeID).filter((v) => v != null))]
      $set.name = first.name; $set.team = first.team; $set.ageGroup = first.ageGroup; $set.timeID = first.timeID
      if (!list.length) { delete $set.contributor; $unset.contributor = '' }
    }
    const r = await c.findOneAndUpdate({ _id }, Object.keys($unset).length ? { $set, $unset } : { $set }, { returnDocument: 'after' })
    const doc = r && (r.value || r)
    res.json(videoOut(doc, await userNames(whoOf(doc))))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 삭제 — 자기가 올린 영상만(관리자는 모두). 스토리지의 영상·썸네일도 함께 지운다.
router.delete('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const c = await coll()
    const cur = await c.findOne({ _id })
    if (!cur) return res.status(404).json({ error: 'not found' })
    if (cur.uploader && cur.uploader !== req.user?.username && !canAny(req.user, ['users'])) {
      return res.status(403).json({ error: '다른 사람이 올린 영상은 삭제할 수 없습니다.' })
    }
    for (const k of [cur.url, cur.thumbnail]) {
      if (k && !/^https?:\/\//.test(k)) await deleteObject(k).catch(() => {})
    }
    await c.deleteOne({ _id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
