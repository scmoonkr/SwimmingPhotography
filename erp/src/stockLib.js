// 재고 공용 로직 — 현재 수량은 stockMoves(입출고 이력)의 합계다.
//   kind : 'material'(물품 — 구매·소모) | 'goods'(상품 — 판매)
//   type : in 입고(+) · out 출고(−) · adjust 보정(실제 센 수량을 넣으면 차이만큼 이력이 생긴다)
import { col } from './db.js'
import { oid, escRe } from './crud.js'

export const KINDS = ['material', 'goods']
export const collOf = (kind) => (kind === 'goods' ? 'goods' : 'materials')
export const MOVE_TYPES = ['in', 'out', 'adjust']

// 옵션(색상×사이즈) 단위 평면 목록 — 부모의 공통 정보와 옵션 정보를 한 행으로 합친다.
//   price : 옵션 개별가, 없으면 부모 기본가(물품 구입가격 / 상품 판매가)
export async function flatItems(kind, { codes, q, activeOnly, category } = {}) {
  const parent = {}
  if (activeOnly) parent.active = { $ne: false }
  if (category) parent.category = category
  const pipe = [{ $match: parent }, { $unwind: '$options' }]
  const m = {}
  if (activeOnly) m['options.active'] = { $ne: false }
  if (codes) m['options.code'] = { $in: codes }
  if (q) {
    const re = { $regex: escRe(q), $options: 'i' }
    m.$or = [{ name: re }, { category: re }, { supplier: re }, { designCode: re }, { 'options.code': re }, { 'options.color': re }, { 'options.size': re }]
  }
  if (Object.keys(m).length) pipe.push({ $match: m })
  pipe.push(
    {
      $project: {
        _id: 0, parentId: '$_id', name: 1, category: 1, supplier: 1, designCode: 1, unit: 1, active: 1,
        code: '$options.code', color: '$options.color', size: '$options.size', image: '$options.image',
        safetyStock: '$options.safetyStock',
        price: { $ifNull: ['$options.price', kind === 'goods' ? '$salePrice' : '$purchasePrice'] },
      },
    },
    { $sort: { category: 1, name: 1, color: 1, size: 1 } },
  )
  return (await col(collOf(kind))).aggregate(pipe).toArray()
}

// 코드 → { onHand, lastAt }
export async function onHandMap(kind, codes) {
  const match = { kind }
  if (codes) match.code = { $in: codes }
  const rows = await (await col('stockMoves')).aggregate([
    { $match: match },
    { $group: { _id: '$code', onHand: { $sum: '$delta' }, lastAt: { $max: '$at' } } },
  ]).toArray()
  return new Map(rows.map((r) => [r._id, r]))
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status })

// 입출고 계획 — 검증하고 저장할 문서를 만든다(저장은 commitMoves).
// 한 줄이라도 잘못되면 던진다. 출고로 재고가 음수가 되는 것도 막는다.
// list: [{ kind, code, type, qty, reason, note, orderId }]
// ref : { refType, refId } — 발주입고·재고검수처럼 근거 문서가 있을 때
export async function planMoves(list, user, ref = {}) {
  const wanted = { material: new Set(), goods: new Set() }
  for (const m of list) if (wanted[m?.kind]) wanted[m.kind].add(String(m.code || '').trim())

  const known = {}
  const running = new Map()
  for (const kind of KINDS) {
    const codes = [...wanted[kind]]
    known[kind] = new Set()
    if (!codes.length) continue
    const found = await flatItems(kind, { codes })
    known[kind] = new Set(found.map((x) => x.code))
    for (const [c, v] of await onHandMap(kind, codes)) running.set(`${kind}:${c}`, v.onHand)
  }

  const now = new Date()
  const docs = []
  for (const [i, m] of list.entries()) {
    const kind = m?.kind
    const code = String(m?.code || '').trim()
    const where = `${i + 1}번째 줄(${code || '코드 없음'})`
    if (!KINDS.includes(kind)) throw fail(`${where}: kind 는 material · goods 입니다.`)
    if (!known[kind].has(code)) throw fail(`${where}: 없는 ${kind === 'goods' ? '상품' : '물품'} 코드입니다.`)
    if (!MOVE_TYPES.includes(m.type)) throw fail(`${where}: type 은 ${MOVE_TYPES.join(' · ')} 입니다.`)
    const qty = Number(m.qty)
    if (!Number.isFinite(qty) || qty < 0 || (m.type !== 'adjust' && qty === 0)) throw fail(`${where}: 수량이 올바르지 않습니다.`)

    const key = `${kind}:${code}`
    const cur = running.get(key) || 0
    // adjust 의 qty 는 "실제로 센 수량" — 현재 값과의 차이를 이력으로 남긴다
    const delta = m.type === 'in' ? qty : m.type === 'out' ? -qty : qty - cur
    if (cur + delta < 0) throw fail(`${where}: 재고(${cur})보다 많이 출고할 수 없습니다.`, 409)
    if (m.type === 'adjust' && delta === 0) continue
    running.set(key, cur + delta)
    docs.push({
      kind, code, type: m.type, delta, balance: cur + delta,
      reason: String(m.reason || '').trim(),
      note: String(m.note || '').trim(),
      orderId: oid(m.orderId) || null,
      refType: ref.refType || null, refId: ref.refId || null,
      at: now, by: user.username,
    })
  }
  return docs
}

export async function commitMoves(docs) {
  if (docs.length) await (await col('stockMoves')).insertMany(docs)
  return docs
}
