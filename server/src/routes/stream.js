// SSE 스트림 — GET /api/stream. 연결을 열어두고 broadcast()로 밀어준다.
import { Router } from 'express'
import { addClient } from '../sse.js'

const router = Router()

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 프록시 버퍼링 방지(대비)
  res.flushHeaders?.()
  res.write(': connected\n\n')

  addClient(res)

  // 25초마다 heartbeat (프록시/유휴 타임아웃 방지)
  const hb = setInterval(() => {
    try { res.write(': ping\n\n') } catch {}
  }, 25000)
  res.on('close', () => clearInterval(hb))
})

export default router
