// 이미지 업로드 — 물품·상품 사진. 올리면 공개 URL 을 돌려주고, 그 값을 물품의 image 에 저장한다.
import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { requireCap } from '../auth.js'
import { putObject } from '../storage.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } })
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

router.post('/image', requireCap('write'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '이미지는 5MB 이하만 올릴 수 있습니다.' : err.message })
      const f = req.file
      if (!f) return res.status(400).json({ error: '파일이 없습니다.' })
      const ext = EXT[f.mimetype]
      if (!ext) return res.status(400).json({ error: 'jpg · png · webp · gif 이미지만 올릴 수 있습니다.' })
      // 파일명은 쓰지 않는다 — 날짜 폴더 + 무작위 이름 (한글·중복 문제 없음)
      const d = new Date()
      const key = `erp/items/${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomBytes(8).toString('hex')}.${ext}`
      const r = await putObject(key, f.buffer, f.mimetype)
      res.status(201).json({ url: r.url, key: r.key })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
})

export default router
