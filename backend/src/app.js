import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

// 모노레포 루트의 .env 를 먼저 로드 (라우터 import 보다 앞서야 한다)
const __dirname = path.dirname(fileURLToPath(import.meta.url)) // backend/src
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { requireAuth, requireCap } = await import('./auth.js')
const { crudRouter } = await import('./crud.js')
const { default: authRouter } = await import('./routes/auth.js')
const { default: usersRouter } = await import('./routes/users.js')
const { default: ordersRouter } = await import('./routes/orders.js')
const { materialsRouter, goodsRouter } = await import('./routes/items.js')
const { default: purchaseOrdersRouter } = await import('./routes/purchaseOrders.js')
const { default: stocktakesRouter } = await import('./routes/stocktakes.js')
const { default: stockRouter } = await import('./routes/stock.js')
const { default: uploadsRouter } = await import('./routes/uploads.js')

const app = express()

const allowedOrigins = (process.env.ERP_ORIGIN || 'http://localhost:6643')
  .split(',').map((s) => s.trim())
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '2mb' }))

// 관리 화면(정적) — API 와 같은 오리진이라 CORS 없이 쿠키 로그인이 된다
app.use(express.static(path.resolve(__dirname, '../public')))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)

// 이 아래는 전부 로그인 필수. 쓰기/삭제 권한은 라우터 안에서 requireCap 으로 가른다.
app.use('/api', requireAuth)
app.use('/api/users', requireCap('users'), usersRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/goods', goodsRouter)
app.use('/api/purchase-orders', purchaseOrdersRouter)
app.use('/api/stocktakes', stocktakesRouter)
app.use('/api/stock', stockRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/partners', crudRouter('partners',
  ['name', 'contactName', 'phone', 'email', 'address', 'bizNo', 'memo', 'tags'],
  { searchIn: ['name', 'contactName', 'phone', 'bizNo'] }))
app.use('/api/customers', crudRouter('customers',
  ['name', 'partnerId', 'phone', 'email', 'address', 'memo', 'tags'],
  { searchIn: ['name', 'phone', 'email'] }))

app.use((req, res) => res.status(404).json({ error: '없는 API 입니다.' }))

export default app
