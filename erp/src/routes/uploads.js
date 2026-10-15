// 이미지 업로드 — 물품·상품 옵션 사진. 서버 디스크(UPLOAD_DIR/erp/items)에 저장하고 상대 경로를 돌려준다.
// 돌려받은 path 를 옵션의 image 에 저장하면 된다.
import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { requireCap } from '../auth.js'
import { saveBuffer } from '../files.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

router.post('/image', requireCap('stock'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '이미지는 10MB 이하만 올릴 수 있습니다.' : err.message })
      const f = req.file
      if (!f) return res.status(400).json({ error: '파일이 없습니다.' })
      const ext = EXT[f.mimetype]
      if (!ext) return res.status(400).json({ error: 'jpg · png · webp · gif 이미지만 올릴 수 있습니다.' })
      // 원래 파일명은 쓰지 않는다 — 날짜 폴더 + 무작위 이름
      const d = new Date()
      const dir = `items/${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
      const rel = await saveBuffer(dir, `${crypto.randomBytes(8).toString('hex')}.${ext}`, f.buffer)
      res.status(201).json({ path: rel, url: `/api/files/${rel}` })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
})

export default router
