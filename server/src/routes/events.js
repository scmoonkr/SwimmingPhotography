import { Router } from 'express'

const router = Router()
let events = []
let nextId = 1

router.get('/', (req, res) => res.json(events))

router.get('/:id', (req, res) => {
  const event = events.find(e => e.id === Number(req.params.id))
  if (!event) return res.status(404).json({ error: 'Event not found' })
  res.json(event)
})

router.post('/', (req, res) => {
  const { name, date, location, description, categoryIds = [] } = req.body
  if (!name || !date) return res.status(400).json({ error: 'name and date are required' })
  const event = { id: nextId++, name, date, location, description, categoryIds, createdAt: new Date().toISOString() }
  events.push(event)
  res.status(201).json(event)
})

router.put('/:id', (req, res) => {
  const idx = events.findIndex(e => e.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Event not found' })
  events[idx] = { ...events[idx], ...req.body, id: events[idx].id }
  res.json(events[idx])
})

router.delete('/:id', (req, res) => {
  const idx = events.findIndex(e => e.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Event not found' })
  events.splice(idx, 1)
  res.status(204).end()
})

export default router
