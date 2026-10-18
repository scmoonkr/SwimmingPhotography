// 디자인 라이브러리 — 주문 이미지를 자수 파일로 변환·디자인한 결과를 버전으로 보관하고 재주문에서 다시 쓴다.
//   · 공용 라이브러리이며 디자인마다 거래처를 적는다.
//   · 버전은 덮어쓰지 않는다. '확정'된 버전은 수정할 수 없고, 고치려면 새 버전을 만든다(주문은 쓴 버전에 고정).
//   · 상태는 단순화: 디자인 중 → 확정
//   · 컬러는 자수사 번호 — 재고관리의 자수사 물품(옵션)에서 골라 쓴다.
//   · 파일은 서버 UPLOAD_DIR/erp/designs/<코드>/v<번호>/ 에 둔다 (로그인한 사용자만 내려받음).
import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import { col, nextSeq } from '../db.js'
import { requireCap } from '../auth.js'
import { oid, escRe } from '../crud.js'
import { saveBuffer, removeRel, IMG_EXT, DESIGN_EXT, safeName } from '../files.js'
import { flatItems } from '../stockLib.js'
import { loadAppSettings } from '../settings.js'
import { latestOf, latestConfirmed, versionOf } from '../designLib.js'

const router = Router()
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n)
const num = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null))
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message })
const bad = (res, m, s = 400) => res.status(s).json({ error: m })
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } })

// 침별 컬러 — 순서가 침 번호이므로 가운데 빈 칸은 그대로 두고 뒤쪽 빈 칸만 뺀다
const normColors = (list) => {
  const out = (Array.isArray(list) ? list : []).slice(0, 30).map((x) => ({
    code: str(x?.code, 40), no: str(x?.no, 20), size: str(x?.size, 20), label: str(x?.label, 80), part: str(x?.part, 40),
  }))
  while (out.length && !out[out.length - 1].code && !out[out.length - 1].label && !out[out.length - 1].no) out.pop()
  return out
}
const hasColor = (x) => !!(x && (x.code || x.label || x.no))

const newVersion = (no, by, from) => ({
  no, status: '디자인 중', createdAt: new Date(), createdBy: by, note: '',
  previewImage: from?.previewImage || '', files: (from?.files || []).map((f) => ({ ...f })),
  colors: (from?.colors || []).map((c) => ({ ...c })),
  baseName: from?.baseName || '기본',
  variants: (from?.variants || []).map((x) => ({ name: x.name, caps: [...(x.caps || [])], colors: (x.colors || []).map((c) => ({ ...c })) })),
  widthMm: from?.widthMm ?? null, heightMm: from?.heightMm ?? null, stitches: from?.stitches ?? null,
})

async function partnerNames(docs) {
  const ids = [...new Set(docs.map((d) => String(d.partnerId || '')).filter(Boolean))].map((x) => oid(x))
  if (!ids.length) return new Map()
  const ps = await (await col('partners')).find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()
  return new Map(ps.map((p) => [String(p._id), p.name]))
}
const summary = (d, pn) => {
  const v = latestOf(d)
  return {
    _id: d._id, code: d.code, name: d.name, partnerId: d.partnerId || null, partnerName: pn.get(String(d.partnerId || '')) || '',
    tags: d.tags || [], active: d.active !== false, updatedAt: d.updatedAt,
    versionCount: (d.versions || []).length, latestVersion: v?.no ?? null, latestStatus: v?.status || '',
    preview: v?.previewImage || '', colorCount: (v?.colors || []).filter(hasColor).length,
    setCount: 1 + (v?.variants || []).length, stitches: v?.stitches ?? null,        // 컬러 세트 수(기본 포함) · 최신 버전의 스티치 수 fileCount: (v?.files || []).length,
    hasConfirmed: (d.versions || []).some((x) => x.status === '확정'),
    variants: ((latestConfirmed(d) || v)?.variants || []).map((x) => ({ name: x.name, caps: x.caps || [] })),
    baseName: (latestConfirmed(d) || v)?.baseName || '기본',
  }
}

// 목록: ?q &partnerId &status(디자인 중|확정 — 최신 버전 기준)
router.get('/', async (req, res) => {
  try {
    const q = {}
    if (req.query.partnerId && oid(req.query.partnerId)) q.partnerId = oid(req.query.partnerId)
    if (req.query.active === '1') q.active = { $ne: false }
    if (req.query.q) {
      const re = { $regex: escRe(req.query.q), $options: 'i' }
      q.$or = [{ name: re }, { code: re }, { tags: re }, { memo: re }]
    }
    const limit = Math.min(Number(req.query.limit) || 100, 300)
    const docs = await (await col('designs')).find(q).sort({ updatedAt: -1 }).limit(limit).toArray()
    const pn = await partnerNames(docs)
    let items = docs.map((d) => summary(d, pn))
    if (['디자인 중', '확정'].includes(req.query.status)) items = items.filter((x) => x.latestStatus === req.query.status)
    // 거래처 이름으로도 찾는다
    if (req.query.q) {
      const re = new RegExp(escRe(req.query.q), 'i')
      const extra = await (await col('partners')).find({ name: re }, { projection: { _id: 1 } }).toArray()
      if (extra.length) {
        const more = await (await col('designs')).find({ partnerId: { $in: extra.map((p) => p._id) } }).limit(limit).toArray()
        const have = new Set(items.map((x) => String(x._id)))
        const pn2 = await partnerNames(more)
        for (const d of more) if (!have.has(String(d._id))) items.push(summary(d, pn2))
      }
    }
    res.json({ items, total: items.length })
  } catch (e) { fail(res, e) }
})

// 컬러로 쓸 자수사 옵션 — 설정의 '자수사 키워드'가 이름(또는 분류)에 들어간 물품의 옵션
router.get('/thread-options', async (_req, res) => {
  try {
    const kw = (await loadAppSettings()).threadKeyword
    const items = (await flatItems('material', { activeOnly: true })).filter((m) => m.name.includes(kw) || m.category === kw)
    res.json({
      keyword: kw,
      items: items.map((m) => ({ code: m.code, no: m.no || '', name: m.name, color: m.color, size: m.size, label: [m.name, m.color, m.size].filter(Boolean).join(' ') })),
    })
  } catch (e) { fail(res, e) }
})

router.get('/:id', async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const d = _id && await (await col('designs')).findOne({ _id })
    if (!d) return bad(res, '없는 디자인입니다.', 404)
    const pn = await partnerNames([d])
    const used = await (await col('orders')).find({ 'designs.designId': d._id }, { projection: { orderNo: 1, title: 1, 'designs.designId': 1, 'designs.version': 1 } }).sort({ orderNo: -1 }).limit(30).toArray()
    res.json({
      ...d, partnerName: pn.get(String(d.partnerId || '')) || '',
      usedBy: used.map((o) => ({ _id: o._id, orderNo: o.orderNo, title: o.title, version: o.designs.find((l) => String(l.designId) === String(d._id))?.version })),
    })
  } catch (e) { fail(res, e) }
})

router.post('/', requireCap('design'), async (req, res) => {
  try {
    const b = req.body || {}
    const name = str(b.name)
    if (!name) return bad(res, '디자인 이름은 필수입니다.')
    const now = new Date()
    const doc = {
      code: `D-${String(await nextSeq('code:designs')).padStart(4, '0')}`, name,
      partnerId: oid(b.partnerId) || null, tags: (Array.isArray(b.tags) ? b.tags : []).map((t) => str(t, 30)).filter(Boolean),
      memo: String(b.memo ?? ''), active: true, versions: [newVersion(1, req.user.username)],
      createdAt: now, updatedAt: now, createdBy: req.user.username,
    }
    const r = await (await col('designs')).insertOne(doc)
    res.status(201).json({ ...doc, _id: r.insertedId })
  } catch (e) { fail(res, e) }
})

router.patch('/:id', requireCap('design'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const b = req.body || {}
    const set = { updatedAt: new Date() }
    if ('name' in b) { set.name = str(b.name); if (!set.name) return bad(res, '디자인 이름은 필수입니다.') }
    if ('partnerId' in b) set.partnerId = oid(b.partnerId) || null
    if ('tags' in b) set.tags = (Array.isArray(b.tags) ? b.tags : []).map((t) => str(t, 30)).filter(Boolean)
    if ('memo' in b) set.memo = String(b.memo ?? '')
    if ('active' in b) set.active = !!b.active
    const r = _id && await (await col('designs')).findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' })
    if (!r) return bad(res, '없는 디자인입니다.', 404)
    res.json(r)
  } catch (e) { fail(res, e) }
})

// 새 버전 — 가장 최근 버전을 복사해 '디자인 중'으로 시작한다. 작업 중인 버전이 이미 있으면 만들지 않는다.
router.post('/:id/versions', requireCap('design'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const c = await col('designs')
    const d = _id && await c.findOne({ _id })
    if (!d) return bad(res, '없는 디자인입니다.', 404)
    const latest = latestOf(d)
    if (latest?.status !== '확정') return bad(res, '이미 작업 중인 버전이 있습니다. 먼저 확정하세요.', 409)
    const v = newVersion(latest.no + 1, req.user.username, latest)
    await c.updateOne({ _id }, { $push: { versions: v }, $set: { updatedAt: new Date() } })
    res.status(201).json(v)
  } catch (e) { fail(res, e) }
})

// 버전 수정 — 디자인 중인 버전만. { note?, colors?, widthMm?, heightMm?, stitches? }
router.patch('/:id/versions/:no', requireCap('design'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const no = Number(req.params.no)
    const c = await col('designs')
    const d = _id && await c.findOne({ _id })
    const v = d && versionOf(d, no)
    if (!v) return bad(res, '없는 버전입니다.', 404)
    if (v.status === '확정') return bad(res, '확정된 버전은 수정할 수 없습니다. 새 버전을 만드세요.', 409)
    const b = req.body || {}
    const set = { updatedAt: new Date() }
    const P = 'versions.$[v].'
    if ('note' in b) set[`${P}note`] = String(b.note ?? '')
    if ('widthMm' in b) set[`${P}widthMm`] = num(b.widthMm)
    if ('heightMm' in b) set[`${P}heightMm`] = num(b.heightMm)
    if ('stitches' in b) set[`${P}stitches`] = num(b.stitches)
    if ('colors' in b) set[`${P}colors`] = normColors(b.colors)      // 컬러 = 자수사 번호(+ 연결된 재고 옵션 코드). 순서 = 침 번호
    // 컬러 세트(배리에이션) — 같은 디자인이라도 수모 색에 따라 침별 컬러가 다를 때. colors 는 '기본' 세트이고,
    // 여기의 세트는 caps(적용 수모 번호)에 해당하는 장에만 쓴다. [{ name, caps: ['08','12'], colors: [...] }]
    if ('baseName' in b) set[`${P}baseName`] = str(b.baseName, 30) || '기본'        // 기본 세트의 이름 (바꿀 수 있다)
    if ('variants' in b) {
      const seen = new Set(['기본', ('baseName' in b ? str(b.baseName, 30) : v.baseName) || '기본'])
      set[`${P}variants`] = (Array.isArray(b.variants) ? b.variants : []).slice(0, 10).map((x) => {
        const name = str(x?.name, 30)
        const caps = [...new Set((Array.isArray(x?.caps) ? x.caps : String(x?.caps ?? '').split(/[,\s]+/)).map((y) => str(y, 20)).filter(Boolean))].slice(0, 40)
        return { name, caps, colors: normColors(x?.colors) }
      }).filter((x) => { if (!x.name || seen.has(x.name)) return false; seen.add(x.name); return true })
    }
    await c.updateOne({ _id }, { $set: set }, { arrayFilters: [{ 'v.no': no }] })
    res.json(versionOf(await c.findOne({ _id }), no))
  } catch (e) { fail(res, e) }
})

// 확정 — 자수 파일 또는 컬러가 하나 이상 있어야 한다.
router.post('/:id/versions/:no/confirm', requireCap('design'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const no = Number(req.params.no)
    const c = await col('designs')
    const d = _id && await c.findOne({ _id })
    const v = d && versionOf(d, no)
    if (!v) return bad(res, '없는 버전입니다.', 404)
    if (v.status === '확정') return bad(res, '이미 확정된 버전입니다.', 409)
    if (!(v.files || []).length && !(v.colors || []).some(hasColor) && !(v.variants || []).some((x) => (x.colors || []).some(hasColor))) return bad(res, '컬러(자수사)를 지정하거나 자수 파일을 올린 뒤 확정하세요.')
    await c.updateOne({ _id }, { $set: { 'versions.$[v].status': '확정', 'versions.$[v].confirmedAt': new Date(), 'versions.$[v].confirmedBy': req.user.username, updatedAt: new Date() } }, { arrayFilters: [{ 'v.no': no }] })
    res.json(versionOf(await c.findOne({ _id }), no))
  } catch (e) { fail(res, e) }
})

// 실측 자수 시간 — 수모 1개(이니셜 포함)를 자수하는 순수 기계 시간. 반복 주문·대량 주문이면 1개를 직접 해 보고 입력한다.
//   { actualMinutes?, standardMinutes? }  비우면(0·null) 해제 → 스티치 수 추정으로 돌아간다. 확정된 버전에도 입력할 수 있다.
router.patch('/:id/versions/:no/production', requireCap('design', 'work'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const no = Number(req.params.no)
    const c = await col('designs')
    const d = _id && await c.findOne({ _id })
    if (!d || !versionOf(d, no)) return bad(res, '없는 버전입니다.', 404)
    const b = req.body || {}
    const sec = (k) => { const n = Number(b[k]); return Number.isFinite(n) && n > 0 && n <= 600 ? Math.round(n * 60 * 10) / 10 : null }
    const set = { updatedAt: new Date() }
    const P = 'versions.$[v].production.'
    if ('actualMinutes' in b) { set[`${P}actualSecondsPerCap`] = sec('actualMinutes'); set[`${P}actualAt`] = new Date(); set[`${P}actualBy`] = req.user.username }
    if ('standardMinutes' in b) set[`${P}standardSecondsPerCap`] = sec('standardMinutes')
    await c.updateOne({ _id }, { $set: set }, { arrayFilters: [{ 'v.no': no }] })
    res.json(versionOf(await c.findOne({ _id }), no))
  } catch (e) { fail(res, e) }
})

// 확정 되돌리기 — 관리자만. 가장 최신 버전이 확정된 경우에 '디자인 중'으로 되돌려 다시 수정할 수 있게 한다.
router.post('/:id/versions/:no/reopen', async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return bad(res, '관리자만 확정을 되돌릴 수 있습니다.', 403)
    const _id = oid(req.params.id)
    const no = Number(req.params.no)
    const c = await col('designs')
    const d = _id && await c.findOne({ _id })
    const v = d && versionOf(d, no)
    if (!v) return bad(res, '없는 버전입니다.', 404)
    if (v.status !== '확정') return bad(res, '확정된 버전이 아닙니다.', 409)
    if (latestOf(d)?.no !== no) return bad(res, '더 새로운 버전이 있어 되돌릴 수 없습니다.', 409)
    await c.updateOne({ _id }, { $set: { 'versions.$[v].status': '디자인 중', updatedAt: new Date() }, $unset: { 'versions.$[v].confirmedAt': '', 'versions.$[v].confirmedBy': '' } }, { arrayFilters: [{ 'v.no': no }] })
    res.json(versionOf(await c.findOne({ _id }), no))
  } catch (e) { fail(res, e) }
})

// 파일 올리기 — 이미지(jpg·png·webp·gif)는 시안 이미지로, 그 밖의 허용 형식은 자수 파일 목록에 추가한다.
router.post('/:id/versions/:no/files', requireCap('design'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) return bad(res, err.code === 'LIMIT_FILE_SIZE' ? '파일은 50MB 이하만 올릴 수 있습니다.' : err.message)
      const f = req.file
      if (!f) return bad(res, '파일이 없습니다.')
      const _id = oid(req.params.id)
      const no = Number(req.params.no)
      const c = await col('designs')
      const d = _id && await c.findOne({ _id })
      const v = d && versionOf(d, no)
      if (!v) return bad(res, '없는 버전입니다.', 404)
      if (v.status === '확정') return bad(res, '확정된 버전에는 파일을 추가할 수 없습니다. 새 버전을 만드세요.', 409)
      // multer 는 파일명을 latin1 로 읽는다 — 한글 이름을 복원한다
      const name = safeName(Buffer.from(f.originalname, 'latin1').toString('utf8'))
      const ext = path.extname(name).toLowerCase()
      if (!DESIGN_EXT.has(ext)) return bad(res, `올릴 수 없는 형식입니다(${ext || '확장자 없음'}). 자수 파일·이미지·zip·pdf 등만 가능합니다.`)
      const rel = await saveBuffer(`designs/${d.code}/v${no}`, name, f.buffer)
      const P = 'versions.$[v].'
      if (IMG_EXT.has(ext)) {
        await c.updateOne({ _id }, { $set: { [`${P}previewImage`]: rel, updatedAt: new Date() } }, { arrayFilters: [{ 'v.no': no }] })
      } else {
        await c.updateOne({ _id }, { $push: { [`${P}files`]: { name: path.basename(rel), path: rel, ext: ext.slice(1), size: f.size, at: new Date(), by: req.user.username } }, $set: { updatedAt: new Date() } }, { arrayFilters: [{ 'v.no': no }] })
      }
      res.status(201).json(versionOf(await c.findOne({ _id }), no))
    } catch (e) { fail(res, e) }
  })
})

router.delete('/:id/versions/:no/files', requireCap('design'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const no = Number(req.params.no)
    const rel = String(req.query.path || '')
    const c = await col('designs')
    const d = _id && await c.findOne({ _id })
    const v = d && versionOf(d, no)
    if (!v) return bad(res, '없는 버전입니다.', 404)
    if (v.status === '확정') return bad(res, '확정된 버전의 파일은 지울 수 없습니다.', 409)
    const P = 'versions.$[v].'
    if (v.previewImage === rel) await c.updateOne({ _id }, { $set: { [`${P}previewImage`]: '' } }, { arrayFilters: [{ 'v.no': no }] })
    else if ((v.files || []).some((x) => x.path === rel)) await c.updateOne({ _id }, { $pull: { [`${P}files`]: { path: rel } } }, { arrayFilters: [{ 'v.no': no }] })
    else return bad(res, '없는 파일입니다.', 404)
    // 다른 버전이 같은 파일을 쓰고 있지 않을 때만 디스크에서 지운다 (새 버전은 파일을 복사해 참조한다)
    const after = await c.findOne({ _id })
    const stillUsed = (after.versions || []).some((x) => x.previewImage === rel || (x.files || []).some((f) => f.path === rel))
    if (!stillUsed) await removeRel(rel)
    res.json(versionOf(after, no))
  } catch (e) { fail(res, e) }
})

router.delete('/:id', requireCap('delete'), async (req, res) => {
  try {
    const _id = oid(req.params.id)
    const d = _id && await (await col('designs')).findOne({ _id })
    if (!d) return bad(res, '없는 디자인입니다.', 404)
    if (await (await col('orders')).findOne({ 'designs.designId': _id })) return bad(res, '주문에서 쓰고 있어 삭제할 수 없습니다. 사용 중지로 바꾸세요.', 409)
    await (await col('designs')).deleteOne({ _id })
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

export default router
