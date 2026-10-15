// 저장된 이미지 보기 — GET /api/files/<상대경로>. 로그인한 사용자만(공개하지 않는다).
import { Router } from 'express'
import path from 'node:path'
import { validRel, resolveRel, IMG_EXT } from '../files.js'

const router = Router()

router.get('/*', (req, res) => {
  try {
    const rel = req.params[0]
    const abs = validRel(rel) && resolveRel(rel)
    if (!abs) return res.status(404).json({ error: '없는 파일입니다.' })
    res.set('Cache-Control', 'private, max-age=86400')
    res.set('X-Content-Type-Options', 'nosniff')
    // 이미지가 아닌 파일(자수 파일·pdf·zip 등)은 화면에서 열지 않고 내려받게 한다
    if (!IMG_EXT.has(path.extname(rel).toLowerCase())) {
      const name = path.basename(rel)
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
    }
    res.sendFile(abs, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: '없는 파일입니다.' })
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
