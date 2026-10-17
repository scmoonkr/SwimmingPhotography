// 물품 이미지는 코드로 정해진다 → /images/<폴더>/<일련번호>.png (public/images 아래에 FTP 로 둔다)
//   caps01   → /images/caps/01.png      영문 접두어가 폴더
//   sewing21 → /images/sewing/21.png
//   01       → 숫자만 있는 코드는 물품 이름으로 폴더를 정한다: 수모 → caps, 자수사 → sewing
// 파일이 없으면 이미지 없음.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/images')
export const DIR_BY_NAME = [['수모', 'caps'], ['자수사', 'sewing']]

// 물품코드(itemCode) + 번호(no) 가 있으면 그대로 /images/<itemCode>/<no>.png, 없으면 옛 방식(코드로 추정)
export function optionImage(parent, opt) {
  const ic = String(parent?.itemCode || '').trim().toLowerCase()
  const no = String(opt?.no ?? '').trim()
  if (ic && no) {
    const rel = `${ic}/${no}.png`
    return fs.existsSync(path.join(ROOT, rel)) ? `/images/${rel}` : ''
  }
  return codeImage(opt?.code, parent?.name)
}

export function codeImage(code, name = '') {
  const c = String(code ?? '').trim()
  let dir, num
  const m = /^([A-Za-z]+)(\d+)$/.exec(c)
  if (m) [, dir, num] = [0, m[1].toLowerCase(), m[2]]
  else if (/^\d+$/.test(c)) { dir = DIR_BY_NAME.find(([k]) => String(name).includes(k))?.[1]; num = c }
  if (!dir) return ''
  const rel = `${dir}/${num}.png`
  return fs.existsSync(path.join(ROOT, rel)) ? `/images/${rel}` : ''
}
