// 자수사 컬러 표(public/images/sewing/sewing_color_*.csv: column,row,code,R,G,B,hex)를 읽어
// src/data/sewingColors.json ({ "1000": [237,236,231], … }) 으로 만든다. .emb 의 색을 가장 가까운 자수사 번호로 추천하는 데 쓴다.
//   사용: node erp/scripts/make-sewing-colors.js [csv 폴더]   (기본: erp/public/images/sewing)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(process.argv[2] || path.join(here, '../public/images/sewing'))
const out = {}
for (const f of fs.readdirSync(dir).filter((x) => /^sewing_color_.*\.csv$/i.test(x)).sort()) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  const head = lines[0].split(',')
  const ix = { code: head.indexOf('code'), r: head.indexOf('R'), g: head.indexOf('G'), b: head.indexOf('B'), hex: head.indexOf('hex') }
  for (const l of lines.slice(1)) {
    const c = l.split(',')
    const code = String(c[ix.code] || '').trim()
    // 형식 1: column,row,code,R,G,B,hex   형식 2: group,code,hex  (#RRGGBB)
    let rgb = ix.r >= 0 ? [c[ix.r], c[ix.g], c[ix.b]].map(Number) : null
    if (!rgb || !rgb.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(c[ix.hex] || '').trim())
      rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null
    }
    if (code && rgb && rgb.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) out[code] = rgb
  }
}
const dest = path.join(here, '../src/data/sewingColors.json')
fs.writeFileSync(dest, JSON.stringify(out))
console.log(`${Object.keys(out).length}개 색 → ${dest}`)
