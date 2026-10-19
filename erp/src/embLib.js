// Wilcom EmbroideryStudio(.emb) 파일에서 정보를 읽는다.
//   .emb 는 OLE 복합 파일이다. 디자인 본문(DesignDocument)은 독자 압축이라 읽지 않고, 표준 방식으로 들어 있는 두 영역만 쓴다.
//     · WilcomDesignInformationDDD — 속성 집합: 스티치 수 · 색상 수 · 색 교체/트림 수 · 색상별 RGB·스티치 수·실 길이
//     · TRUEVIEW_ICON — 실 색으로 그린 미리보기 JPEG (앞 4바이트 = 원본 길이, 뒤는 zlib)
//   브랜드 실 번호(자수사 번호)는 파일에서 읽을 수 없어 RGB 와 가장 가까운 자수사 번호를 추천한다 (matchThread).
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import CFB from 'cfb'

export const MAX_EMB_BYTES = 50 * 1024 * 1024

const here = path.dirname(fileURLToPath(import.meta.url))
let SEWING = null
function sewingColors() {
  if (!SEWING) {
    try { SEWING = JSON.parse(fs.readFileSync(path.join(here, 'data/sewingColors.json'), 'utf8')) } catch (e) { SEWING = {} }
  }
  return SEWING
}

// sRGB → CIE Lab (사람 눈에 가까운 색 거리를 위해)
function lab([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const [R, G, B] = [f(r), f(g), f(b)]
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116)
  return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))]
}
let LABS = null
// RGB 와 가장 가까운 자수사 번호 { no, de(색 차이, 작을수록 비슷함) }
export function matchThread(rgb) {
  const table = sewingColors()
  if (!LABS) LABS = Object.entries(table).map(([no, c]) => [no, lab(c)])
  if (!LABS.length) return null
  const L = lab(rgb)
  let best = null
  for (const [no, l] of LABS) {
    const de = Math.hypot(L[0] - l[0], L[1] - l[1], L[2] - l[2])
    if (!best || de < best.de) best = { no, de }
  }
  return { no: best.no, de: Math.round(best.de * 10) / 10 }
}

// OLE 속성 집합 → { 이름: 값 }
function readProps(buf) {
  const nSec = buf.readUInt32LE(24)
  if (!(nSec >= 1 && nSec <= 4)) return {}
  const off = buf.readUInt32LE(28 + 16)
  const n = buf.readUInt32LE(off + 4)
  const props = []
  for (let i = 0; i < n && i < 400; i++) props.push({ id: buf.readUInt32LE(off + 8 + i * 8), o: off + buf.readUInt32LE(off + 12 + i * 8) })
  const names = {}
  const dict = props.find((p) => p.id === 0)
  if (dict) {
    let o = dict.o
    const cnt = buf.readUInt32LE(o); o += 4
    for (let i = 0; i < cnt && i < 400; i++) {
      const id = buf.readUInt32LE(o), len = buf.readUInt32LE(o + 4)
      const raw = buf.subarray(o + 8, o + 8 + len)
      names[id] = raw.toString('latin1').replace(/\0.*$/s, '')
      o += 8 + len
    }
  }
  const val = (o) => {
    const t = buf.readUInt16LE(o)
    if (t === 3 || t === 22) return buf.readInt32LE(o + 4)
    if (t === 19) return buf.readUInt32LE(o + 4)
    if (t === 5) return buf.readDoubleLE(o + 4)
    if (t === 30) { const l = buf.readUInt32LE(o + 4); return buf.subarray(o + 8, o + 8 + l).toString('latin1').replace(/\0.*$/s, '') }
    if (t === 31) { const l = buf.readUInt32LE(o + 4); return buf.subarray(o + 8, o + 8 + l * 2).toString('utf16le').replace(/\0.*$/s, '') }
    return undefined
  }
  const out = {}
  for (const p of props) if (p.id > 1 && names[p.id]) out[names[p.id]] = val(p.o)
  return out
}

/**
 * @returns {{ stitches:number|null, colors:{r,g,b,stitches,length}[], colorChanges:number|null, trims:number|null, machine:string, jpg:Buffer|null }}
 * 읽을 수 없는 파일이면 예외를 던진다 (호출하는 쪽에서 잡아 건너뛴다).
 */
export function parseEmb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 512 || buffer.length > MAX_EMB_BYTES) throw new Error('emb 파일 크기가 올바르지 않습니다.')
  if (buffer.readUInt32BE(0) !== 0xD0CF11E0) throw new Error('emb 형식이 아닙니다(OLE 파일이 아님).')
  const cf = CFB.read(buffer, { type: 'buffer' })
  const ent = (name) => cf.FileIndex.find((e) => e.type === 2 && String(e.name).includes(name))
  const info = ent('WilcomDesignInformationDDD')
  if (!info) throw new Error('Wilcom 디자인 정보가 없는 파일입니다.')
  const p = readProps(Buffer.from(info.content))
  const colors = []
  // 색상 표: 줄마다 "번호 \t 순서 \t\t 스티치 수 \t 실 길이 \t\t R.. G.. B.. \t\t 0 \t 색값"
  for (const line of String(p.threads || '').split(/\r?\n/)) {
    const m = /(\d+)\t(\d+)\t\t(\d+)\t([\d.]+)\t\tR(\d+) G(\d+) B(\d+)/.exec(line)
    if (m) colors.push({ r: +m[5], g: +m[6], b: +m[7], stitches: +m[3], length: Math.round(+m[4]) })
  }
  let jpg = null
  const tv = ent('TRUEVIEW_ICON')
  if (tv) {
    try {
      const c = Buffer.from(tv.content)
      const raw = zlib.inflateSync(c.subarray(4), { maxOutputLength: 8 * 1024 * 1024 })
      if (raw[0] === 0xFF && raw[1] === 0xD8) jpg = raw
    } catch (e) { /* 미리보기만 없는 것으로 본다 */ }
  }
  const num = (v) => (Number.isFinite(v) ? v : null)
  return {
    stitches: num(p['number of stitches']), colors, colorChanges: num(p['number of colour changes']), trims: num(p['number of trims']),
    machine: String(p['embroidery machine name'] || ''), jpg,
  }
}
