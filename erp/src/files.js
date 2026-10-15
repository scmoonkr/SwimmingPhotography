// 업로드 파일 저장소 — 서버 디스크의 UPLOAD_DIR/erp 아래에 둔다.
//   erp/items/<YYYYMM>/<무작위>.jpg     물품·상품 옵션 이미지
//   erp/orders/<주문 폴더>/<파일명>      주문 첨부 이미지
// DB 에는 'erp/' 뒤의 상대 경로(예: 'items/202610/ab12.jpg')만 저장하고, 화면은 GET /api/files/<상대경로> 로 본다
// (로그인한 사용자만 열 수 있다 — 공개 버킷이 아니다).
//
// 개발 PC 처럼 UPLOAD_DIR(서버 경로)이 없는 곳에서는 .env 의 ERP_UPLOAD_DIR 로 다른 폴더를 지정할 수 있다.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { isOurImage } from './storage.js'

export const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
// 디자인 파일: 이미지 + 자수 파일(장비·프로그램별 형식) + 작업 원본. 실행·스크립트가 될 수 있는 형식(svg, html 등)은 허용하지 않는다.
export const DESIGN_EXT = new Set([
  ...IMG_EXT,
  '.dst', '.pes', '.jef', '.exp', '.emb', '.vp3', '.vip', '.xxx', '.hus', '.pec', '.sew', '.shv', '.pcs', '.t09', '.u01', '.100', '.10o', '.dsb', '.dsz', '.ofm', '.col',
  '.zip', '.pdf', '.ai', '.psd', '.eps', '.cdr',
])

export function uploadRoot() {
  const dir = process.env.ERP_UPLOAD_DIR || (process.env.UPLOAD_DIR ? path.join(process.env.UPLOAD_DIR, 'erp') : '')
  if (!dir) throw new Error('UPLOAD_DIR 가 .env 에 설정되어야 합니다.')
  return path.resolve(dir)
}

// 상대 경로 → 절대 경로. 저장소 밖으로 나가면 null (../ 차단)
export function resolveRel(rel) {
  const root = uploadRoot()
  const abs = path.resolve(root, String(rel))
  return abs.startsWith(root + path.sep) ? abs : null
}

// 저장할 수 있는 상대 경로의 모양 — items/… 또는 orders/… 아래의 이미지 파일
export const validRel = (v) => typeof v === 'string'
  && /^(items|orders|designs)\/[^\\:*?"<>|]+$/.test(v)
  && !v.split('/').some((s) => s === '..' || s === '.' || s === '')
  && (v.startsWith('designs/') ? DESIGN_EXT : IMG_EXT).has(path.extname(v).toLowerCase())

// 이미지 값으로 인정: 새 상대 경로, 또는 예전에 올린 S3 주소
export const validImage = (v) => validRel(v) || isOurImage(v)

export const safeName = (name) => {
  const base = path.basename(String(name)).replace(/[\x00-\x1f\\/:*?"<>|]/g, '_').trim()
  return base && base !== '.' && base !== '..' ? base : 'file'
}

// 이름이 겹치면 뒤에 무작위 꼬리를 붙여 덮어쓰지 않는다. 저장한 상대 경로를 돌려준다.
export async function saveBuffer(relDir, filename, buffer) {
  const dir = resolveRel(relDir)
  if (!dir) throw new Error('잘못된 저장 경로입니다.')
  await fs.mkdir(dir, { recursive: true })
  let name = safeName(filename)
  const exists = await fs.stat(path.join(dir, name)).then(() => true, () => false)
  if (exists) {
    const ext = path.extname(name)
    name = `${path.basename(name, ext)}-${crypto.randomBytes(3).toString('hex')}${ext}`
  }
  await fs.writeFile(path.join(dir, name), buffer)
  return `${relDir}/${name}`
}

export async function removeRel(rel) {
  const abs = validRel(rel) && resolveRel(rel)
  if (abs) await fs.unlink(abs).catch(() => {})
}
