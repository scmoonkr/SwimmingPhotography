import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import eventsRouter from './routes/events.js'
import categoriesRouter from './routes/categories.js'
import articlesRouter from './routes/articles.js'
import competitionsRouter from './routes/competitions.js'
import venuesRouter from './routes/venues.js'
import timesRouter from './routes/times.js'
import athletesRouter from './routes/athletes.js'
import imagesRouter from './routes/images.js'
import countsRouter from './routes/counts.js'
import streamRouter from './routes/stream.js'
import authRouter from './routes/auth.js'
import { userFromRequest, serviceUser, canAny } from './auth.js'

// 모노레포 루트의 .env 를 로드 (서버 cwd 와 무관하게)
const __dirname = path.dirname(fileURLToPath(import.meta.url)) // server/src
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// 기본 Express 앱. 진입점(index.js)에서 import해 listen 한다.
const app = express()

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:6641,http://localhost:6642')
  .split(',').map((s) => s.trim())
// credentials: 세션 쿠키를 주고받아야 한다. origin 을 명시했으므로 아무 사이트나 붙을 수는 없다.
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.use('/api/auth', authRouter)

// 쓰기 라우트별로 필요한 능력. 하나라도 가지고 있으면 통과한다.
// /articles 는 일반 기사와 속보가 같은 라우트를 쓰므로 여기서는 둘 중 하나만 있으면 들여보내고,
// 문서가 정말 속보인지는 articles 라우터가 문서 단위로 확인한다.
const WRITE_NEED = {
  articles: ['articles', 'breaking'],
}
const DEFAULT_NEED = ['data']   // 대회·기록·사진·선수 등 나머지

// 쓰기(POST·PUT·PATCH·DELETE)는 로그인 필수. 공개 사이트(client)는 GET 만 쓰므로 읽기는 그대로 열어둔다.
// 로그인·로그아웃 자체는 예외 — 여기서 막으면 들어올 방법이 없다.
app.use('/api', async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.path.startsWith('/auth/')) return next()
  try {
    // 사람은 세션 쿠키로, 배치 스크립트는 X-API-Key 로 들어온다
    const u = serviceUser(req) || await userFromRequest(req)
    if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' })
    req.user = u
    const section = req.path.split('/')[1] || ''
    if (!canAny(u, WRITE_NEED[section] || DEFAULT_NEED)) {
      return res.status(403).json({ error: '이 작업을 할 권한이 없습니다.' })
    }
    // 삭제는 별도 능력 — 쓰기가 되더라도 delete 가 없으면 못 지운다
    if (req.method === 'DELETE' && !canAny(u, ['delete'])) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' })
    }
    next()
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.use('/api/events', eventsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/articles', articlesRouter)
app.use('/api/competitions', competitionsRouter)
app.use('/api/venues', venuesRouter)
app.use('/api/times', timesRouter)
app.use('/api/athletes', athletesRouter)
app.use('/api/images', imagesRouter)
app.use('/api/counts', countsRouter)
app.use('/api/stream', streamRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

export default app
