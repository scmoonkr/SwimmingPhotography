// 기록(times) — 대상: SwimmingPhotography DB 의 times 컬렉션.
// 원본 Breaststroke DB 의 mergedTimes 에서 대회·일자로 '가져와(upsert)' 관리하고, 수동 추가/편집/삭제도 지원.
import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import { SP, BR } from '../db.js'
import { putObject } from '../r2.js'

const router = Router()
const coll = async () => (await SP()).collection('times')          // 대상
const imagesColl = async () => (await SP()).collection('images')   // 이미지 메타
const toId = (id) => { try { return new ObjectId(id) } catch { return null } }

// 이미지 업로드용 multer (메모리) — 원본 files[] + 썸네일 thumbs[]
const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1000 } })
const safeName = (s) => String(s).replace(/[^\w.\-가-힣]/g, '_')
// name_unique 는 names 와 같은 문자열 배열. 매칭·표시에 문자열이 필요할 때 쓴다.
// (배열/문자열 어느 쪽으로 저장돼 있든 받아준다 — 예전 문서 호환)
export const nuStr = (v) => (Array.isArray(v) ? v.join(',') : String(v ?? ''))

// 동명이인 조회 — GET /homonyms?competitionID=&name=
// 이미지의 name 은 times.name_unique 와 같아야 매칭된다.
// (competitionID + name_unique) 가 없으면 그 이름은 동명이인이라 번호가 붙은 상태이므로,
// 같은 이름의 후보들을 name_unique 별로 묶어 돌려준다.  (/:id 보다 먼저 등록)
router.get('/homonyms', async (req, res) => {
  try {
    const { competitionID, name } = req.query
    const nm = String(name || '').trim()
    if (!nm) return res.json({ isHomonym: false, candidates: [] })
    const c = await coll()
    const match = {}
    if (competitionID != null && competitionID !== '') match.competitionID = Number(competitionID)

    // 지금 이름 그대로 매칭되는 기록이 있는지 — 있으면 동명이인 문제 아님
    const hit = await c.countDocuments({ ...match, name_unique: nm }, { limit: 1 })

    // 후보 — 끝의 번호를 뗀 이름("홍길동1" → "홍길동")으로 같은 이름의 선수를 모은다
    const base = nm.replace(/\d+$/, '') || nm
    const candidates = await c.aggregate([
      { $match: { ...match, name: base } },
      {
        $group: {
          _id: { name_unique: { $ifNull: ['$name_unique', '$name'] }, gender: '$gender', ageGroup: '$ageGroup', team: '$team' },
          name: { $first: '$name' },
          timeCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.name_unique': 1 } },
    ]).toArray()

    res.json({
      isHomonym: !hit,
      base,
      candidates: candidates.map((g) => ({
        name: g.name ?? '',
        name_unique: g._id.name_unique ?? '',
        gender: g._id.gender ?? '',
        ageGroup: g._id.ageGroup ?? '',
        team: g._id.team ?? '',
        timeCount: g.timeCount,
      })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 대회 select 옵션 (필터용) — times 컬렉션에 실제로 존재하는 대회(distinct), 최신순
router.get('/competitions', async (req, res) => {
  try {
    const docs = await (await coll()).aggregate([
      { $match: { competitionID: { $ne: null } } },
      {
        $group: {
          _id: '$competitionID',
          competitionID: { $first: '$competitionID' },
          competitionName: { $first: '$competitionName' },
          datetime: { $first: '$datetime' },
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

// 목록 (SP.times) — 대회·성별·영법·거리·코스·일자 필터
router.get('/', async (req, res) => {
  try {
    const { competitionID, gender, discipline, distance, course, date, name, limit = 2000 } = req.query
    const filter = {}
    if (competitionID) filter.competitionID = Number(competitionID)
    if (gender) filter.gender = String(gender)
    if (discipline) filter.discipline = String(discipline)
    if (distance) filter.distance = String(distance)
    if (course) filter.course = String(course)
    if (date) filter.datetime = { $regex: `^${String(date)}` }
    if (name) filter.name = { $regex: String(name), $options: 'i' }
    const lim = Math.min(Number(limit) || 2000, 10000)
    // images 컬렉션을 timeID 로 조인 — 각 행에 images:[{filename,type,url,thumbnail}] 부여.
    // (내보내기 image1~5·목록 이미지 표시용) times 문서에는 이미지를 저장하지 않고 항상 조인으로만 만든다.
    const docs = await (await coll()).aggregate([
      { $match: filter },
      { $limit: lim },
      { $lookup: { from: 'images', localField: 'timeID', foreignField: 'timeID', as: '_imgs' } },
      {
        $addFields: {
          images: { $map: { input: '$_imgs', as: 'i', in: { filename: '$$i.filename', type: '$$i.type', url: '$$i.url', thumbnail: '$$i.thumbnail' } } },
        },
      },
      { $project: { _imgs: 0 } },
    ]).toArray()
    res.json(docs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 가져오기 — mergedTimes(대회+일자) → SP.times upsert (timeID 기준, 없으면 원본 _id)
router.post('/import', async (req, res) => {
  try {
    const { competitionID, competition, date } = req.body || {}
    const filter = {}
    if (competitionID != null && competitionID !== '') filter.competitionID = Number(competitionID)
    if (competition) filter.competitionName = { $regex: String(competition), $options: 'i' }
    if (date) filter.datetime = { $regex: `^${String(date)}` }
    if (!Object.keys(filter).length) return res.status(400).json({ error: '대회 또는 일자를 지정하세요.' })

    // 대회정보가 SP.competitions 에 없으면 원본(Breaststroke)에서 복사해 추가
    // 겸해서 대회명(compName)을 확보한다 — mergedTimes 에 competitionName 이 없는 기록을 채우는 용도.
    let competitionAdded = false
    let compName = ''
    const cid = (competitionID != null && competitionID !== '') ? Number(competitionID) : null
    if (cid != null) {
      const spComp = (await SP()).collection('competitions')
      const exists = await spComp.findOne({ competitionID: cid })
      if (exists) {
        compName = exists.competitionName || exists.stem || ''
      } else {
        const brComp = await (await BR()).collection('competitions').findOne({ competitionID: cid })
        if (brComp) {
          compName = brComp.competitionName || brComp.stem || ''
          const cc = { ...brComp }; delete cc._id
          if (cc.gungu == null) cc.gungu = '' // 군구 — 원본(BR)엔 없는 SP 전용 필드
          await spComp.insertOne(cc); competitionAdded = true
        }
      }
    }

    const rows = await (await BR()).collection('mergedTimes').find(filter).limit(10000).toArray()
    if (!rows.length) return res.json({ matched: 0, inserted: 0, skipped: 0, competitionAdded })
    const c = await coll()
    // 이미 SP.times 에 있는 것은 제외하고 '없는 것만' insert (timeID 기준, 없으면 원본 _id)
    const tids = rows.map((r) => r.timeID).filter((v) => v != null)
    const sids = rows.filter((r) => r.timeID == null).map((r) => String(r._id))
    const [exTid, exSid] = await Promise.all([
      tids.length ? c.distinct('timeID', { timeID: { $in: tids } }) : [],
      sids.length ? c.distinct('_srcId', { _srcId: { $in: sids } }) : [],
    ])
    const exTidSet = new Set(exTid), exSidSet = new Set(exSid)
    const toInsert = rows
      .filter((r) => (r.timeID != null) ? !exTidSet.has(r.timeID) : !exSidSet.has(String(r._id)))
      .map((r) => {
        const d = { ...r }; delete d._id
        if (d.timeID == null) d._srcId = String(r._id)
        if (!d.competitionName && compName) d.competitionName = compName // 원본에 대회명이 없으면 대회 문서로 보완
        return d
      })
    if (toInsert.length) await c.insertMany(toInsert, { ordered: false })

    // 이미 들어와 있던 기록 중 대회명이 비어 있는 것도 같이 보완
    let nameFilled = 0
    if (cid != null && compName) {
      const nf = await c.updateMany(
        { competitionID: cid, $or: [{ competitionName: { $exists: false } }, { competitionName: null }, { competitionName: '' }] },
        { $set: { competitionName: compName } },
      )
      nameFilled = nf.modifiedCount || 0
    }

    // name_unique — 이미지 매칭용 유일 선수명. names 와 같은 '문자열 배열'이다.
    //   개인: names ["장진원"]                      → name_unique ["장진원"]
    //   계영: names ["임승욱","주의현","신우진",…]  → name_unique ["임승욱","주의현","신우진",…]
    // 매칭·표시에 문자열이 필요하면 ','.join 한다(개인은 이름 그대로가 된다).
    //
    // 선수 식별 키는 (competitionID·name·gender·ageGroup·team). 이미지는 이름 하나로 매칭되므로
    // 한 대회 안에 같은 이름이 둘 이상이면(동명이인) 어느 쪽 이미지인지 구분되지 않는다.
    // 그래서 동명이인일 때만 이름에 일련번호를 붙인다. (이미지 파일명 규칙과 동일)
    //   대회 안에 홍길동 이 한 명뿐   → ["홍길동"]
    //   홍길동 men 1그룹 A팀         → ["홍길동1"]
    //   홍길동 men 초등3 B팀         → ["홍길동2"]
    // 번호는 '대회별로' 매긴다 — 전역으로 매기면 같은 사람이 대회마다 다른 번호를 받는다.
    // 따라서 name_unique 는 대회 안에서만 유일하고, 매칭할 때 competitionID 를 함께 봐야 한다.
    // 이미 부여된 번호는 유지한다(다시 가져오기 해도 흔들리지 않도록).
    //
    // 계영(FRR·MR)은 names 를 그대로 name_unique 로 쓴다 — 번호를 매기지 않는다.
    // 멤버는 개인전에도 출전하는 선수들이라 개인 기록 쪽에서 이미 구분되고,
    // 계영 자체는 종목·거리·소속으로 갈리기 때문이다.
    // 덤으로 원본 name 의 들쭉날쭉한 공백(", " vs ",")도 정규화된다.
    const RELAY = ['FRR', 'MR']
    const nameUniqueOps = []
    const combos = await c.aggregate([
      { $match: { name: { $type: 'string', $ne: '' }, discipline: { $nin: RELAY } } },
      {
        $group: {
          _id: { competitionID: '$competitionID', name: '$name', gender: '$gender', ageGroup: '$ageGroup', team: '$team' },
          assigned: { $addToSet: '$name_unique' },
          firstSeen: { $min: '$datetime' },
        },
      },
    ]).toArray()

    // (대회·이름) 으로 묶어 그 안에서 번호를 매긴다
    const byPerson = new Map()
    for (const g of combos) {
      const k = JSON.stringify([g._id.competitionID ?? null, g._id.name])
      if (!byPerson.has(k)) byPerson.set(k, [])
      byPerson.get(k).push(g)
    }
    // nu 는 문자열 하나(개인 이름). 저장은 names 와 같은 배열 형태로 하고,
    // 조회·매칭에 바로 쓸 수 있도록 join 한 문자열을 unique 필드로 함께 둔다(개인 기록만).
    const nuOf = (g, nu) => {
      nameUniqueOps.push({
        updateMany: {
          // 값이 null 이면 필드가 없는 문서까지 함께 매칭된다($group 과 동일 기준)
          filter: {
            competitionID: g._id.competitionID ?? null,
            name: g._id.name,
            gender: g._id.gender ?? null,
            ageGroup: g._id.ageGroup ?? null,
            team: g._id.team ?? null,
            $or: [{ name_unique: { $ne: [nu] } }, { unique: { $ne: nu } }],
          },
          update: { $set: { name_unique: [nu], unique: nu } },
        },
      })
    }
    for (const list of byPerson.values()) {
      const pname = list[0]._id.name
      // 동명이인이 아니면 번호 없이 이름 그대로
      if (list.length === 1) { nuOf(list[0], pname); continue }
      const used = new Set()
      const numOf = new Map()
      // 1) 기존 번호 유지 — name_unique 가 "이름+숫자" 꼴이면 그 숫자를 그대로 쓴다
      for (const g of list) {
        const cur = (g.assigned || []).map(nuStr).find((v) => v && v.startsWith(pname))
        const n = cur ? Number(cur.slice(pname.length)) : NaN
        if (Number.isInteger(n) && n > 0 && !used.has(n)) { used.add(n); numOf.set(g, n) }
      }
      // 2) 새 조합에 빈 번호 배정 — 먼저 나온(일자 빠른) 조합부터.
      //    ageGroup 까지 같은 동명이인이 있을 수 있어 gender·team 으로 최종 tie-break.
      const pending = list.filter((g) => !numOf.has(g)).sort((a, b) =>
        String(a.firstSeen || '').localeCompare(String(b.firstSeen || ''))
        || String(a._id.ageGroup || '').localeCompare(String(b._id.ageGroup || ''))
        || String(a._id.gender || '').localeCompare(String(b._id.gender || ''))
        || String(a._id.team || '').localeCompare(String(b._id.team || '')))
      let next = 1
      for (const g of pending) {
        while (used.has(next)) next++
        used.add(next); numOf.set(g, next)
      }
      for (const [g, n] of numOf) nuOf(g, `${pname}${n}`)
    }

    // ── 계영(FRR·MR) — name_unique = names 그대로 ──
    // 계영 멤버는 개인전에도 출전하는 선수들이므로 동명이인 번호를 따로 매기지 않는다.
    // (개인 기록 쪽에서 이미 번호가 매겨져 있고, 계영은 종목·거리·소속으로 구분된다.)
    let relaySet = 0
    const relays = await c.aggregate([
      { $match: { discipline: { $in: RELAY }, name: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: { competitionID: '$competitionID', name: '$name', gender: '$gender', ageGroup: '$ageGroup', team: '$team' },
          names: { $first: '$names' },
        },
      },
    ]).toArray()
    for (const g of relays) {
      const list = Array.isArray(g.names) ? g.names.map((s) => String(s || '').trim()).filter(Boolean) : []
      // names 가 없으면 원본 name 을 콤마로 끊어 쓴다
      const nu = list.length ? list : String(g._id.name).split(',').map((s) => s.trim()).filter(Boolean)
      nameUniqueOps.push({
        updateMany: {
          filter: {
            competitionID: g._id.competitionID ?? null,
            name: g._id.name,
            gender: g._id.gender ?? null,
            ageGroup: g._id.ageGroup ?? null,
            team: g._id.team ?? null,
            discipline: { $in: RELAY },
            name_unique: { $ne: nu },
          },
          update: { $set: { name_unique: nu } },
        },
      })
      relaySet++
    }

    let nameUniqueSet = 0
    if (nameUniqueOps.length) {
      const nu = await c.bulkWrite(nameUniqueOps, { ordered: false })
      nameUniqueSet = nu.modifiedCount || 0
    }

    // 이미지의 name 도 같은 값으로 맞춘다 — images 는 timeID 로 times 와 이어져 있으므로,
    // 나중에 동명이인이 생겨 번호가 바뀌어도(홍길동 → 홍길동1) 다시 가져오기 때 함께 따라온다.
    // (images 에는 별도 name_unique 를 두지 않고 name 하나로 매칭한다.)
    let imageNameSet = 0
    {
      // images.name 은 문자열 하나이므로 name_unique 배열을 ','.join 해서 넣는다
      const pairs = await c.aggregate([
        { $match: { timeID: { $ne: null }, 'name_unique.0': { $exists: true } } },
        { $group: { _id: '$name_unique', timeIDs: { $addToSet: '$timeID' } } },
      ]).toArray()
      const imgOps = pairs.map((p) => {
        const nm = nuStr(p._id)
        return {
          updateMany: {
            filter: { timeID: { $in: p.timeIDs }, name: { $ne: nm } },
            update: { $set: { name: nm } },
          },
        }
      })
      if (imgOps.length) {
        const ir = await (await imagesColl()).bulkWrite(imgOps, { ordered: false })
        imageNameSet = ir.modifiedCount || 0
      }
    }

    // eventRank — 종목(부) 단위 순위. rank 는 heat 별 순위라,
    // 같은 (성별·부·영법·거리·라운드) 안에서 timeStamp 오름차순으로 다시 매긴다.
    // round 가 있으면 각 라운드별로 매겨져 결승 기록엔 '결승 기준' 순위가 부여된다.
    // DQ/DNS·빈 time 은 순위 제외. 동타임은 같은 순위(1224 방식).
    let eventRanked = 0
    if (cid != null) {
      const groups = await c.aggregate([
        { $match: { competitionID: cid, time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] }, timeStamp: { $type: 'number' } } },
        { $sort: { timeStamp: 1 } },
        {
          $group: {
            _id: { gender: '$gender', ageGroup: '$ageGroup', discipline: '$discipline', distance: '$distance', round: '$round' },
            docs: { $push: { id: '$_id', ts: '$timeStamp' } },
          },
        },
      ]).toArray()
      const rankOps = []
      for (const g of groups) {
        let rank = 0, seen = 0, prevTs = null
        for (const d of g.docs) {
          seen++
          if (prevTs === null || d.ts !== prevTs) rank = seen // 동타임이면 같은 순위, 다르면 현재 위치
          prevTs = d.ts
          rankOps.push({ updateOne: { filter: { _id: d.id }, update: { $set: { eventRank: rank } } } })
        }
      }
      if (rankOps.length) { const rr = await c.bulkWrite(rankOps, { ordered: false }); eventRanked = rr.modifiedCount + rr.upsertedCount }
    }

    // 선수 요약 재집계 → SP.athletes upsert
    // 단체전(FRR·MR)·time 없거나 "" · DQ/DNS 제외 — athletes 는 개인 선수만 담는다.
    // (계영은 times 에 name_unique 만 매겨두고, 이미지 매칭은 times 로 직접 한다.)
    // 키: (competitionID·name·gender·ageGroup·team) — name_unique 를 정하는 조합과 동일.
    const summary = await c.aggregate([
      { $match: { time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] }, discipline: { $nin: RELAY } } },
      {
        $group: {
          _id: { competitionID: '$competitionID', name: '$name', gender: '$gender', ageGroup: '$ageGroup', team: '$team' },
          name_unique: { $first: '$name_unique' },   // 위에서 SP.times 에 매긴 유일 선수명
          group: { $first: '$group' },
          timeCount: { $sum: 1 },
        },
      },
    ]).toArray()
    let athletesUpserted = 0
    if (summary.length) {
      const now = new Date()
      const athColl = (await SP()).collection('athletes')
      const ops = summary.map((s) => {
        // 유일키 — athletes.js 의 athleteKey() 와 같은 정규화
        const key = {
          competitionID: s._id.competitionID ?? null,
          name: s._id.name ?? '',
          gender: s._id.gender ?? '',
          ageGroup: s._id.ageGroup ?? '',
          team: s._id.team ?? '',
        }
        return {
          updateOne: {
            filter: key,
            update: {
              $set: {
                ...key,
                name_unique: Array.isArray(s.name_unique) ? s.name_unique : (s.name_unique ? [s.name_unique] : []),
                unique: nuStr(s.name_unique),   // name_unique.join(',') — 조회·매칭용
                group: s.group ?? '',
                timeCount: s.timeCount,
                updatedAt: now,
              },
            },
            upsert: true,
          },
        }
      })
      const rw = await athColl.bulkWrite(ops, { ordered: false })
      athletesUpserted = (rw.upsertedCount || 0) + (rw.modifiedCount || 0)
    }

    // 이 대회의 참가 규모 집계 → SP.competitions 에 기록
    // 팀수 = 소속 distinct, 선수수 = name+gender distinct(단체전 제외), start수 = 개인 출전 기록 수
    let stats = null
    if (cid != null) {
      const IND = { discipline: { $nin: ['FRR', 'MR'] } } // 단체전(계영) 제외
      const [agg] = await c.aggregate([
        { $match: { competitionID: cid, time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] } } },
        {
          $facet: {
            teams: [{ $match: { team: { $type: 'string', $ne: '' } } }, { $group: { _id: '$team' } }, { $count: 'n' }],
            athletes: [{ $match: IND }, { $group: { _id: { name: '$name', gender: '$gender' } } }, { $count: 'n' }],
            starts: [{ $match: IND }, { $count: 'n' }],
            // 종목별 — [{ discipline, athleteCount(선수 distinct), startCount(기록수) }] (계영 포함, startCount 내림차순)
            disciplines: [
              { $match: { discipline: { $type: 'string', $ne: '' } } },
              { $group: { _id: '$discipline', names: { $addToSet: { n: '$name', g: '$gender' } }, startCount: { $sum: 1 } } },
              { $project: { _id: 0, discipline: '$_id', athleteCount: { $size: '$names' }, startCount: 1 } },
              { $sort: { startCount: -1 } },
            ],
          },
        },
        {
          $project: {
            teamCount: { $ifNull: [{ $arrayElemAt: ['$teams.n', 0] }, 0] },
            athleteCount: { $ifNull: [{ $arrayElemAt: ['$athletes.n', 0] }, 0] },
            startCount: { $ifNull: [{ $arrayElemAt: ['$starts.n', 0] }, 0] },
            disciplines: '$disciplines',
          },
        },
      ]).toArray()
      // 팀 × (성별·영법·거리) 상세 — [{ team, gender, discipline, distance, athleteCount, startCount, goldCount, silverCount, bronzeCount }]
      const teamRows = await c.aggregate([
        { $match: { competitionID: cid, time: { $type: 'string', $ne: '' }, status: { $nin: ['DQ', 'DNS'] }, team: { $type: 'string', $ne: '' } } },
        {
          $group: {
            _id: { team: '$team', gender: '$gender', discipline: '$discipline', distance: '$distance' },
            names: { $addToSet: '$name' },
            startCount: { $sum: 1 },
            goldCount: { $sum: { $cond: [{ $eq: ['$rank', 1] }, 1, 0] } },
            silverCount: { $sum: { $cond: [{ $eq: ['$rank', 2] }, 1, 0] } },
            bronzeCount: { $sum: { $cond: [{ $eq: ['$rank', 3] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            team: '$_id.team', gender: '$_id.gender', discipline: '$_id.discipline', distance: '$_id.distance',
            athleteCount: { $size: '$names' },
            startCount: 1, goldCount: 1, silverCount: 1, bronzeCount: 1,
          },
        },
        { $sort: { team: 1, gender: 1, discipline: 1, distance: 1 } },
      ]).toArray()

      if (agg) {
        stats = { ...agg, teamRows: teamRows.length }
        await (await SP()).collection('competitions').updateOne(
          { competitionID: cid },
          { $set: { ...agg, teams: teamRows, statsUpdatedAt: new Date() } },
        )
      }
    }

    res.json({ matched: rows.length, inserted: toInsert.length, skipped: rows.length - toInsert.length, competitionAdded, nameFilled, nameUniqueSet, relaySet, imageNameSet, eventRanked, athletes: summary.length, athletesUpserted, stats })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 일괄 삭제 — { ids: [...] }
router.post('/delete-many', async (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || []
    const oids = ids.map(toId).filter(Boolean)
    if (!oids.length) return res.status(400).json({ error: 'ids 가 비어 있습니다.' })
    const r = await (await coll()).deleteMany({ _id: { $in: oids } })
    res.json({ deleted: r.deletedCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 파일(CSV) 행 업서트 — { rows: [{ timeID, name, gender, heat, ageGroup, team,
//   discipline, distance, round, time, rank,
//   notesAthlete, notesTime, quotesAthlete, quotesTime }] }
// timeID 있으면 그 키로 upsert, 없으면 insert.
// CSV 의 image1~5 컬럼은 저장하지 않는다 — 이미지는 images 컬렉션에만 두고 timeID 로 조인한다.
// (그 컬럼은 '이미지 가져오기' 드로어가 폴더에서 읽을 파일명을 고르는 데만 쓴다.)
// 메모/인용 컬럼(선수·기록) — 값이 있는 것만 저장.
const NOTE_FIELDS = ['notesAthlete', 'notesTime']
const QUOTE_FIELDS = ['quotesAthlete', 'quotesTime']
router.post('/import-rows', async (req, res) => {
  try {
    const rows = (req.body && req.body.rows) || []
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows 가 비어 있습니다.' })
    const num = (v) => (v === '' || v == null ? null : Number(v))
    const str = (v) => (v == null ? '' : String(v).trim())
    const c = await coll()
    const ops = []
    for (const r of rows) {
      const doc = {
        name: str(r.name), gender: str(r.gender), heat: num(r.heat), ageGroup: str(r.ageGroup),
        team: str(r.team), discipline: str(r.discipline), distance: str(r.distance),
        round: str(r.round), time: str(r.time).replace(/^'/, ''), rank: num(r.rank),
      }
      for (const f of [...NOTE_FIELDS, ...QUOTE_FIELDS]) {
        const v = str(r[f])
        if (v) doc[f] = v
      }
      const timeID = num(r.timeID)
      if (timeID != null && !Number.isNaN(timeID)) {
        doc.timeID = timeID
        ops.push({ updateOne: { filter: { timeID }, update: { $set: doc }, upsert: true } })
      } else {
        ops.push({ insertOne: { document: doc } })
      }
    }
    const rw = await c.bulkWrite(ops, { ordered: false })
    res.json({
      received: rows.length,
      upserted: rw.upsertedCount || 0,
      modified: rw.modifiedCount || 0,
      inserted: rw.insertedCount || 0,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 이미지 가져오기 — 디렉터리 이미지들을 R2 업로드 후 images 컬렉션 upsert.
// multipart: files[](원본) · thumbs[](썸네일, files 와 동일 순서) ·
//   meta(JSON: [{ filename, timeID, type }]) · competitionID · competitionName
router.post('/images-import', imgUpload.fields([{ name: 'files', maxCount: 1000 }, { name: 'thumbs', maxCount: 1000 }]), async (req, res) => {
  try {
    const files = (req.files && req.files.files) || []
    const thumbs = (req.files && req.files.thumbs) || []
    let meta = []
    try { meta = JSON.parse(req.body.meta || '[]') } catch { meta = [] }
    if (!files.length || meta.length !== files.length) {
      return res.status(400).json({ error: 'files 와 meta 개수가 맞지 않습니다.' })
    }
    const competitionID = req.body.competitionID != null && req.body.competitionID !== '' ? Number(req.body.competitionID) : null
    const competition = req.body.competitionName || ''
    const folder = `SP-images-${competitionID ?? 'unknown'}`
    const im = await imagesColl()

    // timeID 별 times 레코드 조회 → 선수 정보(name·gender·부·소속·영법·코스·거리) 채우기
    const tIds = [...new Set(meta.map((m) => Number(m.timeID)).filter((n) => Number.isFinite(n)))]
    const tMap = new Map()
    if (tIds.length) {
      const tdocs = await (await coll())
        .find({ timeID: { $in: tIds } }, { projection: { timeID: 1, name: 1, name_unique: 1, gender: 1, ageGroup: 1, team: 1, discipline: 1, course: 1, distance: 1 } })
        .toArray()
      for (const d of tdocs) tMap.set(d.timeID, d)
    }

    const ops = []
    for (let i = 0; i < files.length; i++) {
      const m = meta[i] || {}
      const fname = safeName(m.filename || files[i].originalname)
      const key = `${folder}/${fname}`         // 상대경로 (CLOUD_PUBLIC_URL 제외)
      const thumbKey = `${folder}/thumb/${fname}`
      await putObject(key, files[i].buffer, files[i].mimetype)
      let thumbnail = key
      if (thumbs[i] && thumbs[i].buffer) {
        await putObject(thumbKey, thumbs[i].buffer, thumbs[i].mimetype || 'image/jpeg')
        thumbnail = thumbKey
      }
      const timeID = m.timeID != null && m.timeID !== '' ? Number(m.timeID) : null
      const t = tMap.get(timeID) || {}
      ops.push({
        updateOne: {
          filter: { timeID, filename: fname },
          update: {
            $set: {
              timeID, filename: fname, competition, competitionID, type: m.type || '',
              // url·thumbnail 은 CLOUD_PUBLIC_URL 을 제외한 상대경로로 저장. 조회 시 CLOUD_PUBLIC_URL 을 붙임.
              url: key, thumbnail,
              // name — 선수 매칭 키. times.name_unique(배열)를 ','.join 해서 쓴다(동명이인이면 "홍길동1").
              name: nuStr(t.name_unique) || t.name || '', gender: t.gender || '', ageGroup: t.ageGroup || '',
              team: t.team || '', discipline: t.discipline || '', course: t.course || '', distance: t.distance || '',
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      })
    }
    const rw = await im.bulkWrite(ops, { ordered: false })
    res.json({ count: files.length, upserted: rw.upsertedCount || 0, modified: rw.modifiedCount || 0 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 생성 (수동 기록추가)
router.post('/', async (req, res) => {
  try {
    const doc = { ...req.body }
    delete doc._id
    const r = await (await coll()).insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 수정
router.put('/:id', async (req, res) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ error: 'invalid id' })
    const body = { ...req.body }
    delete body._id
    const r = await (await coll()).findOneAndUpdate({ _id }, { $set: body }, { returnDocument: 'after' })
    const doc = r && (r.value || r)
    if (!doc || !doc._id) return res.status(404).json({ error: 'not found' })
    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 삭제
router.delete('/:id', async (req, res) => {
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
