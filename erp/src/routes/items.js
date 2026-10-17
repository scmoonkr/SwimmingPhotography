// 물품(materials — 구매하는 수모·실·자수 부자재 등) / 상품(goods — 판매하는 것) 마스터.
//
// 구조: 부모(이름·분류·발주처·기본가격 …) 1건 + options[] (색상×사이즈).
//   - 공통 정보는 부모에서 한 번만 관리한다.
//   - 옵션마다 code · 이미지 · 안전재고 · (선택) 개별 가격을 갖고, 재고·입출고·발주·검수는 옵션 code 단위다.
//   options: [{ code, color, size, image, safetyStock, price(null 이면 부모 기본가), active }]
import { Router } from 'express'
import { col, nextSeq } from '../db.js'
import { requireCap } from '../auth.js'
import { oid, escRe } from '../crud.js'
import { codeImage, optionImage, DIR_BY_NAME } from '../codeImage.js'
import { onHandMap, flatItems } from '../stockLib.js'

const str = (v) => String(v ?? '').trim()
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
const bad = (message, status = 400) => Object.assign(new Error(message), { status })
const fail = (res, e) => res.status(e.status || (e.code === 11000 ? 409 : 500))
  .json({ error: e.code === 11000 ? '이미 사용 중인 코드입니다.' : e.message })
const label = (o) => [o.color, o.size].filter(Boolean).join(' / ') || '옵션 없음'

function itemRouter({ name, kind, prefix, priceKey, defaults, buildExtra, searchIn }) {
  const router = Router()
  const newCode = async () => `${prefix}-${String(await nextSeq(`code:${name}`)).padStart(4, '0')}`

  const parentFields = (b = {}) => {
    const d = {}
    if ('name' in b) d.name = str(b.name)
    if ('category' in b) d.category = str(b.category)
    if ('itemCode' in b) {            // 물품코드 (caps, sewing …) — 이미지 폴더이자 옵션 코드의 앞부분
      const ic = str(b.itemCode).toLowerCase()
      if (ic && !/^[a-z]+$/.test(ic)) throw bad('물품코드는 영문 소문자만 쓸 수 있습니다. 예: caps, sewing')
      d.itemCode = ic
    }
    if ('unit' in b) d.unit = str(b.unit) || '개'
    if ('memo' in b) d.memo = String(b.memo ?? '')
    if ('active' in b) d.active = !!b.active
    if (priceKey in b) d[priceKey] = num(b[priceKey])
    return { ...d, ...buildExtra(b) }
  }

  // 옵션 정리 — 새 옵션(code 없음)에는 코드를 부여하고, 색상×사이즈 중복은 거절한다.
  async function normOptions(list, itemCode = '') {
    const src = Array.isArray(list) && list.length ? list : [{}]
    const seen = new Set()
    const codes = new Set()
    const out = []
    // 물품코드가 있으면 옵션 코드 = 물품코드 + 번호 (+ -사이즈) 로 만든다 → (물품코드, 사이즈, 번호) 가 같으면 중복
    const nos = src.map((o) => str(o.no)).filter(Boolean)
    let nextNo = nos.reduce((m, n) => (/^\d+$/.test(n) ? Math.max(m, Number(n)) : m), 0)
    for (const o of src) {
      const color = str(o.color), size = str(o.size)
      const key = `${color}|${size}`
      if (!itemCode && seen.has(key)) throw bad(`같은 색상·사이즈가 중복되었습니다: ${label({ color, size })}`)
      seen.add(key)
      // 코드를 직접 줄 수 있다 (비우면 자동). 재고의 키라서 공백·슬래시 없이 40자 이하, 같은 물품 안에서 중복 불가.
      let no = ''
      let given = str(o.code)
      if (itemCode && given && !str(o.no)) {
        // 물품코드를 붙이기 전에 만든 옛 옵션: 코드(재고 키)를 그대로 둔다
      } else if (itemCode) {
        no = str(o.no) || String(++nextNo).padStart(2, '0')
        if (!/^[A-Za-z0-9]+$/.test(no)) throw bad(`번호는 영문·숫자만 쓸 수 있습니다: ${no}`)
        given = `${itemCode}${no}${size ? '-' + size.replace(/[\s/\\]+/g, '_') : ''}`
      }
      if (given && (given.length > 40 || /[\s/\\]/.test(given))) throw bad(`코드는 공백·슬래시 없이 40자 이하로 입력하세요: ${given}`)
      if (given && codes.has(given)) throw bad(`코드가 중복되었습니다: ${given}`)
      const code = given || await newCode()
      codes.add(code)
      out.push({
        code, ...(itemCode ? { no } : {}), color, size,
        image: '',                                   // 이미지는 저장하지 않는다 — 표시할 때 코드로 정한다 (codeImage)
        safetyStock: num(o.safetyStock),
        price: o.price === '' || o.price == null ? null : num(o.price),
        active: o.active !== false,
      })
    }
    return out
  }

  // 다른 물품이 이미 쓰는 코드는 쓸 수 없다 (재고의 키). 어느 물품이 쓰는지 알려 준다.
  async function assertCodesFree(c, options, selfId, itemCode = '') {
    const codes = options.map((o) => o.code)
    const q = { 'options.code': { $in: codes } }
    if (selfId) q._id = { $ne: selfId }
    const hit = await c.findOne(q, { projection: { name: 1, 'options.code': 1 } })
    if (hit) {
      const code = hit.options.find((o) => codes.includes(o.code))?.code
      throw bad(`이미 쓰는 코드입니다: ${code} (${hit.name})${itemCode ? '' : ' — 물품코드(예: sewing)를 입력하면 같은 번호를 사이즈별로 나눠 쓸 수 있습니다 (sewing255-L, sewing255-S).'}`, 409)
    }
  }

  // 목록: 부모 1줄 + 옵션 수 · 총재고 · 부족 옵션 수 · 대표 이미지
  router.get('/', async (req, res) => {
    try {
      const q = {}
      if (req.query.category) q.category = String(req.query.category)
      if (req.query.active === '1') q.active = { $ne: false }
      if (req.query.q) {
        const re = { $regex: escRe(req.query.q), $options: 'i' }
        q.$or = [...searchIn, 'options.code', 'options.color', 'options.size'].map((f) => ({ [f]: re }))
      }
      const limit = Math.min(Number(req.query.limit) || 100, 500)
      const skip = Math.max(Number(req.query.skip) || 0, 0)
      const c = await col(name)
      const [docs, total, stock] = await Promise.all([
        c.find(q).sort({ category: 1, name: 1 }).skip(skip).limit(limit).toArray(),
        c.countDocuments(q),
        onHandMap(kind),
      ])
      const items = docs.map((d) => {
        const opts = d.options || []
        const on = (o) => stock.get(o.code)?.onHand || 0
        return {
          ...d, options: undefined, optionCount: opts.length,
          image: opts.map((o) => optionImage(d, o)).find(Boolean) || '',
          totalOnHand: opts.reduce((s, o) => s + on(o), 0),
          lowCount: opts.filter((o) => o.active !== false && o.safetyStock > 0 && on(o) <= o.safetyStock).length,
        }
      })
      res.json({ items, total })
    } catch (e) { fail(res, e) }
  })

  // 옵션 단위 평면 목록 — 발주·출고·검수의 선택 목록용 (/:id 보다 먼저 선언해야 한다)
  router.get('/options', async (req, res) => {
    try {
      const items = await flatItems(kind, { q: req.query.q, activeOnly: req.query.active === '1' })
      res.json({ items, total: items.length })
    } catch (e) { fail(res, e) }
  })

  // 상세: 옵션별 현재고 포함
  router.get('/:id', async (req, res) => {
    try {
      const _id = oid(req.params.id)
      const doc = _id && await (await col(name)).findOne({ _id })
      if (!doc) return res.status(404).json({ error: '없는 항목입니다.' })
      const stock = await onHandMap(kind, (doc.options || []).map((o) => o.code))
      doc.options = (doc.options || []).map((o) => ({ ...o, image: optionImage(doc, o), onHand: stock.get(o.code)?.onHand || 0 }))
      res.json(doc)
    } catch (e) { fail(res, e) }
  })

  // 등록 — options 를 직접 주거나, colors[] × sizes[] 로 조합을 만든다. 이름은 하나뿐이어야 한다.
  router.post('/', requireCap('stock'), async (req, res) => {
    try {
      const b = req.body || {}
      const d = parentFields(b)
      // 새 물품은 이름으로 물품코드를 정해 준다 (수모 → caps, 자수사 → sewing). 직접 입력한 값이 우선.
      if (!d.itemCode) d.itemCode = DIR_BY_NAME.find(([k]) => String(d.name || '').includes(k))?.[1] || ''
      if (!d.name) return res.status(400).json({ error: '이름은 필수입니다.' })
      const c = await col(name)
      if (await c.findOne({ name: d.name })) return res.status(409).json({ error: `이미 있는 이름입니다: ${d.name} — 기존 항목에 옵션을 추가하세요.` })

      let options = b.options
      if (!Array.isArray(options) || !options.length) {
        const list = (v) => [...new Set((Array.isArray(v) ? v : []).map(str).filter(Boolean))]
        const colors = list(b.colors), sizes = list(b.sizes)
        options = []
        for (const color of colors.length ? colors : ['']) for (const size of sizes.length ? sizes : ['']) options.push({ color, size })
      }
      const now = new Date()
      const normed = await normOptions(options, d.itemCode)
      await assertCodesFree(c, normed, null, d.itemCode)
      const doc = {
        category: '', unit: '개', memo: '', active: true, ...defaults, ...d,
        options: normed, createdAt: now, updatedAt: now, createdBy: req.user.username,
      }
      const r = await c.insertOne(doc)
      res.status(201).json({ ...doc, _id: r.insertedId })
    } catch (e) { fail(res, e) }
  })

  // 수정 — options 를 보내면 전체 교체한다(기존 code 유지). 입출고 이력이 있는 옵션은 뺄 수 없다.
  router.patch('/:id', requireCap('stock'), async (req, res) => {
    try {
      const _id = oid(req.params.id)
      const c = await col(name)
      const cur = _id && await c.findOne({ _id })
      if (!cur) return res.status(404).json({ error: '없는 항목입니다.' })
      const set = { ...parentFields(req.body), updatedAt: new Date() }
      if (set.name && set.name !== cur.name && await c.findOne({ name: set.name, _id: { $ne: _id } })) {
        return res.status(409).json({ error: `이미 있는 이름입니다: ${set.name}` })
      }
      if (Array.isArray(req.body?.options)) {
        const next = await normOptions(req.body.options, set.itemCode ?? cur.itemCode ?? '')
        await assertCodesFree(c, next, _id, set.itemCode ?? cur.itemCode ?? '')
        const keep = new Set(next.map((o) => o.code))
        const removed = (cur.options || []).filter((o) => !keep.has(o.code))
        if (removed.length) {
          const used = await (await col('stockMoves')).distinct('code', { kind, code: { $in: removed.map((o) => o.code) } })
          if (used.length) {
            const names = removed.filter((o) => used.includes(o.code)).map(label).join(', ')
            return res.status(409).json({ error: `입출고 이력이 있는 옵션은 삭제할 수 없습니다(사용 중지로 바꾸세요): ${names}` })
          }
        }
        set.options = next
      }
      res.json(await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' }))
    } catch (e) { fail(res, e) }
  })

  router.delete('/:id', requireCap('delete'), async (req, res) => {
    try {
      const _id = oid(req.params.id)
      const c = await col(name)
      const cur = _id && await c.findOne({ _id })
      if (!cur) return res.status(404).json({ error: '없는 항목입니다.' })
      if (await (await col('stockMoves')).findOne({ kind, code: { $in: (cur.options || []).map((o) => o.code) } })) {
        return res.status(409).json({ error: '입출고 이력이 있어 삭제할 수 없습니다. 사용여부를 중지로 바꾸세요.' })
      }
      await c.deleteOne({ _id })
      res.json({ ok: true })
    } catch (e) { fail(res, e) }
  })

  return router
}

export const materialsRouter = itemRouter({
  name: 'materials', kind: 'material', prefix: 'M', priceKey: 'purchasePrice',
  defaults: { supplier: '', purchasePrice: 0 },
  buildExtra: (b) => ('supplier' in b ? { supplier: str(b.supplier) } : {}),    // 발주처
  searchIn: ['name', 'category', 'supplier'],
})

export const goodsRouter = itemRouter({
  name: 'goods', kind: 'goods', prefix: 'G', priceKey: 'salePrice',
  defaults: { designCode: '', salePrice: 0, bom: [] },
  buildExtra: (b) => {
    const d = {}
    if ('designCode' in b) d.designCode = str(b.designCode)
    // 구성 물품(BOM) — 이 상품 1개를 만드는 데 드는 물품(옵션 코드)과 수량
    if ('bom' in b) d.bom = (Array.isArray(b.bom) ? b.bom : []).map((x) => ({ code: str(x.code), qty: num(x.qty) })).filter((x) => x.code && x.qty > 0)
    return d
  },
  searchIn: ['name', 'category', 'designCode'],
})
