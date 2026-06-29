import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import eventsRouter from './routes/events.js'
import categoriesRouter from './routes/categories.js'

dotenv.config()

// 기본 Express 앱. 진입점(index.js)에서 import해 listen 한다.
const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:6641' }))
app.use(express.json())

app.use('/api/events', eventsRouter)
app.use('/api/categories', categoriesRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

export default app
