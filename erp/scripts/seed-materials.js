// 기본 소모품(자수 부자재) 물품 등록 — 이미 같은 이름이 있으면 건너뛴다(여러 번 실행해도 안전).
//
//   node erp/scripts/seed-materials.js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { col, nextSeq, getClient, ensureIndexes } = await import('../src/db.js')

const CATEGORY = '자수 부자재'
const ITEMS = [
  { name: '자수사 (윗실)' },
  { name: '종이 보빈 (사전 권취 보빈)' },
  { name: '자수 바늘 (DB-K5)' },
  { name: '심지' },
  { name: '미싱 오일 (공업용 윤활유)' },
  { name: '청소 솔 (브러시)' },
  { name: '에어 스프레이 (먼지 제거제)' },
  { name: '핀셋' },
  { name: '쪽가위 (미니 가위)' },
]

await ensureIndexes()
const c = await col('materials')
let added = 0
for (const it of ITEMS) {
  if (await c.findOne({ name: it.name })) continue
  const now = new Date()
  await c.insertOne({
    name: it.name, category: CATEGORY, unit: '개', supplier: '', purchasePrice: 0, memo: '', active: true,
    // 옵션이 없는 소모품은 옵션 1개(색상·사이즈 비움)로 둔다 — 색상·사이즈가 생기면 화면에서 옵션을 추가하면 된다
    options: [{ code: `M-${String(await nextSeq('code:materials')).padStart(4, '0')}`, color: '', size: '', image: '', safetyStock: 0, price: null, active: true }],
    createdAt: now, updatedAt: now, createdBy: 'seed',
  })
  added++
}
console.log(`물품 ${added}건을 등록했습니다. (이미 있던 ${ITEMS.length - added}건은 건너뜀)`)
await (await getClient()).close()
