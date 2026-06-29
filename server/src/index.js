import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import eventsRouter from './routes/events.js'
import categoriesRouter from './routes/categories.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 6640

app.use(cors({ origin: 'http://localhost:6641' }))
app.use(express.json())

app.use('/api/events', eventsRouter)
app.use('/api/categories', categoriesRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
