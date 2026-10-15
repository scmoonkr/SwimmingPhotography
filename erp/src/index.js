import app from './app.js'
import { ensureIndexes } from './db.js'

const PORT = process.env.ERP_PORT || 6643

ensureIndexes().catch((e) => console.error('[erp] 인덱스 생성 실패:', e.message))

app.listen(PORT, () => {
  console.log(`ERP running on http://localhost:${PORT}`)
})
