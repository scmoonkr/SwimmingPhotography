import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler((event) => {
  const url = event.path.split('?')[0]
  const segment = decodeURIComponent(url.replace(/^\/+|\/+$/g, ''))

  if (!segment || segment.includes('/') || segment.includes('.')) return

  const publicDir = join(process.cwd(), 'public')
  const indexPath = join(publicDir, segment, 'index.html')

  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf-8')
    return send(event, html, 'text/html')
  }
})
