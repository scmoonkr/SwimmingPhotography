// Notion 에서 내보낸 주문 CSV(주문일 · 출발필수 · 출발날짜 · 상태 · 주문자명 · 내용 · 요청사항 · 제품 · 색상 · 사이즈 · 양쪽중앙 · 디자인 코드 · 밴드중앙 · 사진)를
// 이미 있는 주문과 맞춰 본다. Notion 에서는 주문번호가 바뀌므로 '주문자명'(= 주문 제목)으로 같은 주문을 찾는다.
//   · 같은 주문이 있으면 → Notion 이 원본인 값만 바꾼다(주문일 · 출발필수 · 출발날짜 · 내용 · 요청사항 · 제품·색상·사이즈). 우리 쪽에서 만든 값
//     (제작 명세 · 디자인 연결 · priority · 메모 · 첨부 · 거래처 · 금액 · 제품종류 …)은 건드리지 않는다.
//   · 없으면 → 새 주문(새 주문번호)으로 만든다.
// plan() 은 DB 를 바꾸지 않고 해야 할 일만 계산한다.

// ── CSV (따옴표 안의 줄바꿈 처리) ─────────────────────────
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f); f = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else f += c
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row) }
  const [head, ...body] = rows
  if (!head) return []
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim()
export const normTitle = (s) => cleanName(s).toLowerCase()
const parseDate = (s) => {
  const m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
}
const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const STATUS = { 완료: '완료', '시작 전': '접수', 주문예정: '예정', 배송준비중: '배송준비' }
const stripRelUrl = (s) => String(s).replace(/\s*\(https?:\/\/[^)]*\)/g, '').trim()

// 제목 → 거래처 후보 · 수량 · 태그  ("CRS #10장 #주장훈 #직접배송")
export function parseTitle(title) {
  const toks = String(title).trim().split(/\s+(?=#)/)
  const leadTok = toks[0].startsWith('#') ? '' : toks.shift()
  let qty = null
  const tags = []
  let afterQty = false, customer = ''
  for (const t of toks) {
    const m = t.match(/^#\s*(\d+)(?:\s*\+\s*(\d+))?\s*장$/)
    if (m && qty === null) { qty = Number(m[1]) + Number(m[2] || 0); afterQty = true; continue }
    const name = cleanName(t.replace(/^#/, ''))
    if (!name) continue
    if (afterQty && !customer) customer = name
    else tags.push(name)
  }
  return { leading: cleanName(leadTok), qty, customer, tags }
}

// 행 → 주문으로 쓸 값
function fromRow(r) {
  const title = (r['주문자명'] || '').trim()
  const p = parseTitle(title)
  const status = STATUS[r['상태']]
  const noteParts = [r['밴드중앙'] && `밴드중앙: ${r['밴드중앙']}`, r['양쪽중앙'] && `양쪽중앙: ${r['양쪽중앙']}`].filter(Boolean)
  return {
    title, p, status,
    orderedAt: parseDate(r['주문일']), dueAt: parseDate(r['출발필수']), shippedAt: ['완료', '배송준비'].includes(status) ? parseDate(r['출발날짜']) : null,
    content: (r['내용'] || '').trim(), request: (r['요청사항'] || '').trim(),
    item: { productName: r['제품'] || '', designCode: stripRelUrl(r['디자인 코드'] || ''), color: r['색상'] || '', size: r['사이즈'] || '', note: noteParts.join(' / ') },
    hasItem: p.qty !== null || !!(r['제품'] || r['색상'] || r['사이즈']),
  }
}

// 가져올 만한 행인가 (구분선 · 빈 제목 · 메모성 행은 건너뛴다)
function skipReason(r) {
  const title = r['주문자명'] || ''
  if (/^[▲▼]/.test(title)) return '구분선'
  if (!title.trim() || title.trim() === '제목 없음') return '빈 제목'
  const p = parseTitle(title)
  if (!r['주문일'] && !r['출발필수'] && p.qty === null && r['상태'] !== '완료') return '메모성 행'
  return ''
}

// 계획: existing = [{ _id, orderNo, title, status, orderedAt, dueAt, shippedAt, content, request, items, pieceCount }]
export function plan(rows, existing) {
  const byTitle = new Map()
  for (const o of existing) { const k = normTitle(o.title); if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(o) }
  const used = new Set()
  const out = { creates: [], updates: [], unchanged: [], skipped: [] }
  for (const r of rows) {
    const why = skipReason(r)
    if (why) { out.skipped.push({ title: (r['주문자명'] || '').trim(), reason: why }); continue }
    const v = fromRow(r)
    const cand = (byTitle.get(normTitle(v.title)) || []).find((o) => !used.has(String(o._id)))
    if (!cand) { out.creates.push({ title: v.title, values: v }); continue }
    used.add(String(cand._id))

    const set = {}, changes = []
    const chg = (key, label, from, to) => { set[key] = to; changes.push({ label, from: String(from ?? ''), to: String(to ?? '') }) }
    if (v.orderedAt && dayKey(v.orderedAt) !== dayKey(cand.orderedAt)) chg('orderedAt', '주문일', dayKey(cand.orderedAt), dayKey(v.orderedAt))
    if (v.dueAt && dayKey(v.dueAt) !== dayKey(cand.dueAt)) chg('dueAt', '출발필수', dayKey(cand.dueAt), dayKey(v.dueAt))
    if (v.shippedAt && dayKey(v.shippedAt) !== dayKey(cand.shippedAt)) chg('shippedAt', '출발날짜', dayKey(cand.shippedAt), dayKey(v.shippedAt))
    if (v.content && v.content !== String(cand.content || '').trim()) chg('content', '내용', String(cand.content || '').slice(0, 30), v.content.slice(0, 30))
    if (v.request && v.request !== String(cand.request || '').trim()) chg('request', '요청사항', String(cand.request || '').slice(0, 30), v.request.slice(0, 30))
    // 상태는 바꾸지 않는다 — 우리 쪽 작업 단계(작업배정 · 제작중 · 검수 …)가 원본이다.
    // 품목(제품 · 색상 · 사이즈 · 디자인 코드): 제작 명세가 있으면 거기서 만든 요약이므로 건드리지 않는다.
    if (!(cand.pieceCount > 0) && v.hasItem) {
      const items = (cand.items || []).map((x) => ({ ...x }))
      if (!items.length) {
        items.push({ productName: v.item.productName, designCode: v.item.designCode, color: v.item.color, size: v.item.size, qty: v.p.qty ?? 1, unitPrice: 0, note: v.item.note })
        chg('items', '품목', '(없음)', [v.item.productName, v.item.color, v.item.size].filter(Boolean).join(' / ') || '품목 추가')
        set.items = items
      } else if (items.length === 1) {
        const it = items[0], parts = []
        for (const [k, label] of [['productName', '제품'], ['color', '색상'], ['size', '사이즈'], ['designCode', '디자인 코드']]) {
          if (v.item[k] && v.item[k] !== String(it[k] || '')) { parts.push(`${label} ${it[k] || '(없음)'} → ${v.item[k]}`); it[k] = v.item[k] }
        }
        if (parts.length) chg('items', '품목', '', parts.join(', '))
        if (parts.length) set.items = items
      }
    }
    if (changes.length) out.updates.push({ id: String(cand._id), orderNo: cand.orderNo, title: cand.title, changes, set })
    else out.unchanged.push({ title: cand.title, orderNo: cand.orderNo })
  }
  return out
}
