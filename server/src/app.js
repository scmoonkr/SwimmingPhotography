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
import streamRouter from './routes/stream.js'

// 모노레포 루트의 .env 를 로드 (서버 cwd 와 무관하게)
const __dirname = path.dirname(fileURLToPath(import.meta.url)) // server/src
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// 기본 Express 앱. 진입점(index.js)에서 import해 listen 한다.
const app = express()

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:6641,http://localhost:6642')
  .split(',').map((s) => s.trim())
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '2mb' }))

app.use('/api/events', eventsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/articles', articlesRouter)
app.use('/api/competitions', competitionsRouter)
app.use('/api/venues', venuesRouter)
app.use('/api/stream', streamRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

export default app
