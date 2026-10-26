// MongoDB 연결 — 사진 서비스(server)와 같은 서버·계정(.env)을 쓰되, 데이터베이스는 MedalbankERP 로 분리한다.
// 계정·세션·주문 등 업무관리 데이터는 사진 서비스 DB 와 섞이지 않는다.
import { MongoClient } from 'mongodb'

let clientPromise = null

function buildUri() {
  const addr = process.env.MONGODB_ADDR
  const user = process.env.MONGO_USERNAME
  const pwd = process.env.MONGO_PWD
  const authSource = process.env.MONGO_AUTHSOURCE || 'admin'
  if (!addr) throw new Error('MONGODB_ADDR 가 설정되지 않았습니다 (.env 확인)')
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pwd || '')}@` : ''
  return `mongodb://${auth}${addr}/?authSource=${authSource}`
}

export function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(buildUri(), { serverSelectionTimeoutMS: 8000 })
    clientPromise = client.connect().catch((e) => { clientPromise = null; throw e })
  }
  return clientPromise
}

export const DB = async () => (await getClient()).db(process.env.MONGO_DBNAME_ERP || 'MedalbankERP')
export const col = async (name) => (await DB()).collection(name)

// 주문번호 등 순번 — counters 컬렉션의 원자적 증가
export async function nextSeq(name) {
  const r = await (await col('counters')).findOneAndUpdate(
    { _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' },
  )
  return r.seq
}

// 옛 구조(한 행 = 색상·사이즈 하나)로 저장된 물품·상품을 부모 + options[] 구조로 옮긴다. 이미 옮겨졌으면 아무 일도 하지 않는다.
async function migrateFlat(name) {
  const c = await col(name)
  const old = await c.find({ options: { $exists: false }, code: { $exists: true } }).toArray()
  if (!old.length) return 0
  const groups = new Map()
  for (const d of old) { if (!groups.has(d.name)) groups.set(d.name, []); groups.get(d.name).push(d) }
  for (const [pname, list] of groups) {
    const f = list[0]
    const parent = {
      name: pname, category: f.category || '', unit: f.unit || '개', memo: f.memo || '', active: list.some((d) => d.active !== false),
      ...(name === 'materials' ? { supplier: f.supplier || '', purchasePrice: f.purchasePrice || 0 } : { designCode: f.designCode || '', salePrice: f.salePrice || 0, bom: f.bom || [] }),
      options: list.map((d) => ({ code: d.code, color: d.color || '', size: d.size || '', image: d.image || '', safetyStock: d.safetyStock || 0, price: null, active: d.active !== false })),
      createdAt: f.createdAt || new Date(), updatedAt: new Date(), createdBy: f.createdBy || 'migrate',
    }
    await c.insertOne(parent)
    await c.deleteMany({ _id: { $in: list.map((d) => d._id) } })
  }
  return old.length
}

// 인덱스 — 시작 시 1회
export async function ensureIndexes() {
  // 옛 평면 구조의 code 유니크 인덱스는 옵션 구조와 충돌하므로 먼저 없앤다
  for (const n of ['materials', 'goods']) await (await col(n)).dropIndex('code_1').catch(() => {})
  for (const n of ['materials', 'goods']) {
    const moved = await migrateFlat(n)
    if (moved) console.log(`[erp] ${n} ${moved}건을 부모-옵션 구조로 옮겼습니다.`)
  }
  const orders = await col('orders')
  await orders.createIndex({ orderNo: 1 }, { unique: true })
  await orders.createIndex({ status: 1, dueAt: 1 })
  await orders.createIndex({ partnerId: 1, orderedAt: -1 })
  await (await col('users')).createIndex({ username: 1 }, { unique: true })
  await (await col('smartstoreOrders')).createIndex({ productOrderId: 1 }, { unique: true })
  await (await col('smartstoreOrders')).createIndex({ paidAt: -1 })
  await (await col('partners')).createIndex({ name: 1 })
  await (await col('customers')).createIndex({ name: 1 })
  // 옵션 code 는 물품·상품 각각에서 유일해야 한다 (재고의 키)
  await (await col('materials')).createIndex({ 'options.code': 1 }, { unique: true, sparse: true })
  await (await col('materials')).createIndex({ name: 1 })
  await (await col('goods')).createIndex({ 'options.code': 1 }, { unique: true, sparse: true })
  await (await col('goods')).createIndex({ name: 1 })
  await (await col('stockMoves')).createIndex({ kind: 1, code: 1, at: -1 })
  await (await col('stockMoves')).createIndex({ orderId: 1 })
  await (await col('purchaseOrders')).createIndex({ poNo: 1 }, { unique: true })
  await (await col('stocktakes')).createIndex({ no: 1 }, { unique: true })
  await (await col('workSchedules')).createIndex({ date: 1, orderNo: 1 })
  await (await col('workSchedules')).createIndex({ orderId: 1 })
  await (await col('designs')).createIndex({ code: 1 }, { unique: true })
  await (await col('designs')).createIndex({ partnerId: 1, updatedAt: -1 })
  await (await col('orders')).createIndex({ 'designs.designId': 1 })
  await (await col('activityLogs')).createIndex({ target: 1, targetId: 1, at: -1 })
}
