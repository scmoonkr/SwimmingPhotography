import { Router } from 'express'

const router = Router()
let categories = []
let nextId = 1

router.get('/', (req, res) => res.json(categories))

router.get('/:id', (req, res) => {
  const cat = categories.find(c => c.id === Number(req.params.id))
  if (!cat) return res.status(404).json({ error: 'Category not found' })
  res.json(cat)
})

router.post('/', (req, res) => {
  const { name, type = 'tag' } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const cat = { id: nextId++, name, type, createdAt: new Date().toISOString() }
  categories.push(cat)
  res.status(201).json(cat)
})

router.put('/:id', (req, res) => {
  const idx = categories.findIndex(c => c.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Category not found' })
  categories[idx] = { ...categories[idx], ...req.body, id: categories[idx].id }
  res.json(categories[idx])
})

router.delete('/:id', (req, res) => {
  const idx = categories.findIndex(c => c.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Category not found' })
  categories.splice(idx, 1)
  res.status(204).end()
})

export default router
