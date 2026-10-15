// 제작 명세(pieces) — 주문 한 건 안의 "사람별(장별) 사양" 표.
//   { no, person(주문자), color(색상), size(사이즈), position(위치), initials(이니셜), initialColor(이니셜색상), note(비고) }
//
// 엑셀·구글시트·Notion 표를 복사해 붙인 글자(TSV · CSV · Markdown 표)를 이 구조로 바꾼다.
// 첫 줄이 제목 행이면 열 이름으로 자동 매핑하고(동의어 지원), 모르는 열은 비고에 "열이름: 값"으로 합친다.
// 운영 화면(붙여넣기)과 Notion 1회 이관이 같은 파서를 쓴다.

export const PIECE_KEYS = ['person', 'color', 'size', 'position', 'initials', 'initialsRight', 'initialColor', 'note']
export const PIECE_LABEL = {
  person: '주문자', color: '색상', size: '사이즈', position: '위치', initials: '이니셜', initialsRight: '오른쪽 이니셜', initialColor: '이니셜색상', note: '비고',
}

// 열 이름 동의어 — 비교는 공백·구두점을 뺀 소문자로 한다
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_\-./()（）:：]+/g, '')
const SYN = {
  no: ['#', '번호', 'no', '순번', '연번'],
  qty: ['수량', '개수', '장수', '갯수', 'qty', 'quantity'],
  person: ['주문자', '주문자명', '이름', '성명', '성함', '신청자', '회원', '수령자', 'name'],
  color: ['색상', '수모색상', '주문색상', '컬러', '수모컬러', '모자색상', '캡색상', 'color'],
  size: ['사이즈', '수모사이즈', '크기', '수모크기', 'size'],
  position: ['위치', '양쪽중앙', '수모양쪽중앙', '인쇄위치', '로고위치', '양쪽', '밴드중앙', 'position'],
  initials: ['이니셜', '이니셜문구', '문구', '각인', 'initial', 'initials', '왼쪽이니셜', '좌측이니셜', '이니셜왼쪽', '이니셜좌측'],
  initialsRight: ['오른쪽이니셜', '우측이니셜', '이니셜오른쪽', '이니셜우측', '오른쪽문구', '이니셜2', 'initialright', 'rightinitial'],
  initialColor: ['이니셜색상', '이니셜색', '이니셜컬러', '글자색', '글씨색', '자수색', 'initialcolor'],
  note: ['비고', '기타메모', '메모', '요청', '요청사항', '기타', '특이사항', '참고', 'note'],
}
const LOOKUP = new Map()
for (const [field, words] of Object.entries(SYN)) for (const w of words) LOOKUP.set(norm(w), field)

// ── 글자 → 행/열 ─────────────────────────────────────────
function parseMarkdown(lines) {
  const rows = []
  let acc = null
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (acc === null) {
      if (!line.trim().startsWith('|')) continue
      acc = line
    } else acc += '\n' + line
    if (!acc.trim().endsWith('|')) continue            // 셀 안에 줄바꿈이 있어 아직 행이 닫히지 않음
    const cells = acc.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    acc = null
    if (cells.length && cells.every((c) => /^:?-+:?$/.test(c))) continue    // 구분선 행
    rows.push(cells)
  }
  return rows
}

function parseDelimited(src, delim) {
  const rows = []
  let row = [], f = '', q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c
    } else if (c === '"' && f === '') q = true
    else if (c === delim) { row.push(f); f = '' }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' }
    else f += c
  }
  row.push(f); rows.push(row)
  return rows.map((r) => r.map((c) => c.trim()))
}

function parseRows(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim()
  if (!src) return []
  const lines = src.split('\n')
  if (lines.some((l) => l.trim().startsWith('|'))) return parseMarkdown(lines)
  if (!src.includes('\t')) {
    // "정본/M/2개/VAUGHN" 처럼 '/' 로 나눈 줄 — 줄의 절반 이상이 '/' 를 2개 이상 가지면 '/' 로 나눈다
    const filled = lines.filter((l) => l.trim())
    if (filled.filter((l) => (l.match(/\//g) || []).length >= 2).length * 2 >= filled.length) {
      return filled.map((l) => l.split('/').map((c) => c.trim()))
    }
  }
  return parseDelimited(src, src.includes('\t') ? '\t' : ',')
}

// ── 자유 형식: "정본/M/2개/VAUGHN", "박태훈 / M 1장 / TAEHUN" ──────────
// 제목 행이 없고 칸의 순서도 제각각일 때, 칸의 '내용'을 보고 알아맞힌다.
//   수량(2개·1장·3벌) · 사이즈(S M L XL …) · 색상(블랙 …) 을 먼저 찾고, 남는 칸은 차례로 주문자 → 이니셜 → 비고.
const UNIT = '(?:개|장|벌|매|ea|pcs|pc)'
const QTY_RE = new RegExp(`^(\\d{1,3})\\s*${UNIT}$`, 'i')
const SIZE_QTY_RE = new RegExp(`^(\\S+)\\s+(\\d{1,3})\\s*${UNIT}$`, 'i')      // "M 1장"
const QTY_SIZE_RE = new RegExp(`^(\\d{1,3})\\s*${UNIT}\\s+(\\S+)$`, 'i')      // "1장 M"
const SIZE_RE = /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|FREE|F|SMALL|MEDIUM|LARGE|스몰|미디움|미디엄|라지|엠|엘)$/i
const COLORS = new Set([
  '블랙', '화이트', '네이비', '레드', '블루', '핑크', '스카이', '오렌지', '그린', '옐로우', '옐로', '퍼플', '마룬', '오트밀', '민트', '라임',
  '브라운', '그레이', '회색', '검정', '흰색', '파랑', '빨강', '남색', '보라', '노랑', '초록', '하늘',
  'black', 'white', 'navy', 'red', 'blue', 'pink', 'orange', 'green', 'yellow', 'purple', 'maroon', 'gray', 'grey', 'brown', 'mint',
])
const MAX_EXPAND = 100

function classifyRow(cells) {
  const p = { no: 0, person: '', color: '', size: '', position: '', initials: '', initialsRight: '', initialColor: '', note: '' }
  let qty = null
  const rest = []
  for (const raw of cells) {
    const c = String(raw ?? '').trim()
    if (!c) continue
    let m
    if (qty === null && (m = c.match(QTY_RE))) { qty = Number(m[1]); continue }
    if ((m = c.match(SIZE_QTY_RE)) && SIZE_RE.test(m[1]) && !p.size) { p.size = m[1]; qty = Number(m[2]); continue }
    if ((m = c.match(QTY_SIZE_RE)) && SIZE_RE.test(m[2]) && !p.size) { p.size = m[2]; qty = Number(m[1]); continue }
    if (!p.size && SIZE_RE.test(c)) { p.size = c; continue }
    if (COLORS.has(c.toLowerCase())) {
      if (!p.color) { p.color = c; continue }
      if (!p.initialColor) { p.initialColor = c; continue }      // 색상이 이미 있으면 두 번째 색상은 이니셜색상
    }
    rest.push(c)
  }
  if (qty === null) {                       // 단위 없는 숫자("2")는 수량으로 본다
    const i = rest.findIndex((c) => /^\d{1,2}$/.test(c))
    if (i > 0) { qty = Number(rest[i]); rest.splice(i, 1) }
  }
  p.person = rest[0] || ''
  p.initials = rest[1] || ''
  p.position = rest[2] || ''
  p.note = rest.slice(3).join(' / ')
  return { piece: p, qty: Math.min(Math.max(qty ?? 1, 1), MAX_EXPAND) }
}

// 정해진 순서 형식: "주문자/사이즈/컬러/수량/이니셜/이니셜컬러/위치"
//   2번째 칸이 사이즈이고 4번째 칸이 수량인 줄이 절반 이상이면 이 순서대로 넣는다 (이니셜컬러가 색상 단어가 아니어도 된다).
const TEMPLATE = ['person', 'size', 'color', 'qty', 'initials', 'initialColor', 'position']
const QTY_ONLY_RE = new RegExp(`^(\\d{1,3})\\s*${UNIT}?$`, 'i')
function looksTemplate(rows) {
  const cell = (c) => String(c ?? '').trim()
  const hit = rows.filter((r) => r.length >= 6 && SIZE_RE.test(cell(r[1])) && QTY_ONLY_RE.test(cell(r[3]))).length
  return rows.length > 0 && hit * 2 >= rows.length
}

// 제목 행이 없는 입력이 자유 형식인지:
//   · 줄의 절반 이상에 단위가 붙은 수량(2개·1장)이 있거나,
//   · 칸이 5개 이하로 짧고 줄의 절반 이상에 사이즈가 있다 ("김철수/블랙/L/KIM").
// 번호·위치·이니셜색상까지 있는 긴 표(6칸 이상)는 순서대로 넣는 쪽(positional)이 맞다.
function looksFree(rows) {
  if (!rows.length) return false
  const cell = (c) => String(c ?? '').trim()
  const qtyHit = rows.filter((r) => r.some((c) => QTY_RE.test(cell(c)) || QTY_SIZE_RE.test(cell(c)) || SIZE_QTY_RE.test(cell(c)))).length
  if (qtyHit * 2 >= rows.length) return true
  const width = Math.max(...rows.map((r) => r.length))
  const sizeHit = rows.filter((r) => r.some((c) => SIZE_RE.test(cell(c)))).length
  return width <= 5 && sizeHit * 2 >= rows.length
}

// ── 표 → pieces ──────────────────────────────────────────
export function parsePieces(text) {
  const rows = parseRows(text).filter((r) => r.some((c) => String(c).trim()))
  const warnings = []
  if (!rows.length) return { pieces: [], mapping: [], warnings: ['붙여넣은 내용이 비어 있습니다.'] }

  const width = Math.max(...rows.map((r) => r.length))
  let cols            // [{ field | null, label }]
  let body
  const head = rows[0].map((h) => LOOKUP.get(norm(h)) || null)
  // 제목 행 판정: 비어 있지 않은 칸의 절반 이상이 열 이름이어야 한다 (데이터 값이 우연히 '메모' 같은 단어일 수 있음)
  const filled = rows[0].filter((c) => String(c).trim()).length
  if (head.filter(Boolean).length >= 2 && head.filter(Boolean).length >= filled / 2) {
    const used = new Set()
    cols = Array.from({ length: width }, (_, i) => {
      const f = head[i]
      const label = String(rows[0][i] ?? '').trim()
      if (f && !used.has(f)) { used.add(f); return { field: f, label } }
      if (f) warnings.push(`'${label}' 열이 같은 항목(${PIECE_LABEL[f] || f})과 겹쳐 비고에 합쳤습니다.`)
      return { field: null, label }
    })
    body = rows.slice(1)
  } else if (looksTemplate(rows)) {
    const pieces = []
    let expanded = 0
    for (const r of rows) {
      const p = { no: 0, person: '', color: '', size: '', position: '', initials: '', initialsRight: '', initialColor: '', note: '' }
      let qty = 1
      const extra = []
      r.forEach((raw, i) => {
        const v = String(raw ?? '').trim()
        if (!v) return
        const f = TEMPLATE[i]
        if (f === 'qty') { const m = v.match(QTY_ONLY_RE); qty = m ? Math.min(Math.max(Number(m[1]), 1), MAX_EXPAND) : 1 }
        else if (f) p[f] = v
        else extra.push(v)
      })
      p.note = extra.join(' / ')
      if (!PIECE_KEYS.some((k) => p[k])) continue
      for (let n = 0; n < qty; n++) pieces.push({ ...p })
      if (qty > 1) expanded += qty - 1
    }
    pieces.forEach((p, i) => { p.no = i + 1 })
    warnings.push(`주문자 · 사이즈 · 컬러 · 수량 · 이니셜 · 이니셜컬러 · 위치 순서로 인식했습니다.${expanded ? ` 수량이 2 이상인 줄은 그 수만큼 펼쳤습니다(+${expanded}줄).` : ''}`)
    const mapping = TEMPLATE.map((f, i) => ({ header: ['주문자', '사이즈', '컬러', '수량', '이니셜', '이니셜컬러', '위치'][i], field: f }))
    return { pieces, mapping, format: 'template', warnings }
  } else if (looksFree(rows)) {
    // 자유 형식 — 칸의 내용을 보고 분류하고, 수량(2개)은 그 수만큼 줄로 펼친다
    const pieces = []
    let expanded = 0
    for (const r of rows) {
      const { piece, qty } = classifyRow(r)
      if (!PIECE_KEYS.some((k) => piece[k])) continue
      for (let n = 0; n < qty; n++) pieces.push({ ...piece })
      if (qty > 1) expanded += qty - 1
    }
    pieces.forEach((p, i) => { p.no = i + 1 })
    warnings.push(`자유 형식으로 인식했습니다(주문자 · 사이즈 · 수량 · 이니셜 …).${expanded ? ` 수량이 2 이상인 줄은 그 수만큼 펼쳤습니다(+${expanded}줄).` : ''} 색상·위치는 표에서 채워 주세요.`)
    return { pieces, mapping: [], format: 'free', warnings }
  } else {
    // 제목 행이 없으면 순서대로: (번호) 주문자 색상 사이즈 위치 이니셜 이니셜색상 비고
    const firstNumeric = rows.every((r) => /^\d+$/.test(String(r[0] ?? '').trim()))
    const order = firstNumeric ? ['no', ...PIECE_KEYS] : [...PIECE_KEYS]
    cols = Array.from({ length: width }, (_, i) => ({ field: order[i] || null, label: '' }))
    body = rows
    warnings.push('제목 행을 찾지 못해 순서대로 넣었습니다(주문자, 색상, 사이즈, 위치, 이니셜, 이니셜색상, 비고).')
  }

  const pieces = []
  let expanded = 0
  for (const r of body) {
    const p = { no: 0, person: '', color: '', size: '', position: '', initials: '', initialsRight: '', initialColor: '', note: '' }
    const extra = []
    let qty = 1
    cols.forEach((c, i) => {
      const v = String(r[i] ?? '').trim()
      if (!v) return
      if (c.field === 'no') p.no = Number(v) || 0
      else if (c.field === 'qty') { const m = v.match(QTY_ONLY_RE); qty = m ? Math.min(Math.max(Number(m[1]), 1), MAX_EXPAND) : 1 }
      else if (c.field) p[c.field] = v
      else extra.push(c.label ? `${c.label}: ${v}` : v)
    })
    p.note = [p.note, ...extra].filter(Boolean).join(' / ')
    if (!PIECE_KEYS.some((k) => p[k])) continue
    for (let n = 0; n < qty; n++) pieces.push({ ...p })
    if (qty > 1) expanded += qty - 1
  }
  if (expanded) {                         // 수량을 펼쳤으면 번호를 처음부터 다시 매긴다
    pieces.forEach((p, i) => { p.no = i + 1 })
    warnings.push(`수량이 2 이상인 줄은 그 수만큼 펼쳤습니다(+${expanded}줄).`)
  }
  pieces.forEach((p, i) => { if (!p.no) p.no = i + 1 })
  const mapping = cols.map((c, i) => ({ header: c.label || `${i + 1}열`, field: c.field }))
  return { pieces, mapping, format: 'table', warnings }
}

// ── 저장용 정리 ──────────────────────────────────────────
const s = (v, n = 200) => String(v ?? '').trim().slice(0, n)
export function normPieces(list) {
  const out = []
  for (const p of (Array.isArray(list) ? list : []).slice(0, 1000)) {
    const o = {
      no: Number(p?.no) || 0,
      person: s(p?.person), color: s(p?.color), size: s(p?.size), position: s(p?.position),
      initials: s(p?.initials), initialsRight: s(p?.initialsRight), initialColor: s(p?.initialColor), note: s(p?.note, 1000),
    }
    if (!PIECE_KEYS.some((k) => o[k])) continue
    out.push(o)
  }
  out.forEach((o, i) => { if (!o.no) o.no = i + 1 })
  return out
}

// 색상×사이즈별 수량 — 품목 요약·재고 확인용
export function summarizePieces(pieces) {
  const m = new Map()
  for (const p of pieces) {
    const k = `${p.color || ''}\u0000${p.size || ''}`
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m].map(([k, qty]) => { const [color, size] = k.split('\u0000'); return { color, size, qty } })
    .sort((a, b) => a.color.localeCompare(b.color, 'ko') || a.size.localeCompare(b.size, 'ko'))
}

// 마크다운 본문에서 표를 떼어 낸다 → { rest: 표를 뺀 본문, tables: [표 텍스트] }
export function extractMarkdownTables(text) {
  const lines = String(text ?? '').split('\n')
  const out = [], tables = []
  let i = 0
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('|')) { out.push(lines[i]); i++; continue }
    const block = []
    let acc = null
    while (i < lines.length) {
      const l = lines[i]
      if (acc === null && !l.trim().startsWith('|')) break
      acc = acc === null ? l : `${acc}\n${l}`
      i++
      if (acc.trim().endsWith('|')) { block.push(acc); acc = null }
    }
    if (acc !== null) block.push(acc)
    tables.push(block.join('\n'))
  }
  return { rest: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), tables }
}
