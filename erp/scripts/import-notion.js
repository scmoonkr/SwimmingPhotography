// Notion '작업열' export(Markdown & CSV) → 업무관리 주문 이관.
//
//   node erp/scripts/import-notion.js --dir <export 폴더> [--dry-run] [--min-partner 2] [--update] [--skip-images]
//
//   --dry-run      DB·파일에는 아무것도 쓰지 않고 리포트(<dir>/_import-report.json)만 만든다
//   --min-partner  이 횟수 이상 나온 앞 이름만 거래처로 등록 (기본 2)
//   --update       이미 이관된 주문(같은 Notion ID)도 덮어쓴다 — 기본은 건너뛴다(화면에서 고친 내용을 지키려고)
//   --skip-images  본문 이미지를 복사하지 않는다
//   --images-dir   이미지를 모을 폴더 (기본: UPLOAD_DIR/erp). 이 PC 에 모은 뒤 FTP 로 서버 UPLOAD_DIR/erp 에 올릴 때 쓴다
//   --fields       --update 때 덮어쓸 필드만 지정 (쉼표). 예: --update --fields content,request,notes
//   --ids          이 Notion ID 만 처리 (쉼표). 예: --ids 888,905,908
//   --rollback     이 스크립트로 이관한 주문(source=notion)과 그때 만든 거래처·고객을 지운다
//
// 이미지는 UPLOAD_DIR/erp/orders/notion-<ID>/ 로 복사한다. 서버에 저장하려면 이 스크립트를 서버에서 실행한다
// (export 폴더를 서버로 복사한 뒤). 개발 PC 에서 시험할 때는 .env 의 ERP_UPLOAD_DIR 로 폴더를 지정한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { ObjectId } from 'mongodb'
import { parsePieces, normPieces, summarizePieces, extractMarkdownTables } from '../src/pieces.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// ── 인자 ────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const dir = opt('dir')
const DRY = flag('dry-run')
const UPDATE = flag('update')
const SKIP_IMAGES = flag('skip-images')
const MIN_PARTNER = Number(opt('min-partner', 2))
const ROLLBACK = flag('rollback')
const IDS = opt('ids') ? new Set(opt('ids').split(',').map((x) => x.trim())) : null
const FIELDS = opt('fields') ? opt('fields').split(',').map((x) => x.trim()).filter(Boolean) : null
const IMAGES_DIR = opt('images-dir')
if (IMAGES_DIR) process.env.ERP_UPLOAD_DIR = path.resolve(IMAGES_DIR)
const USAGE = '사용법: node erp/scripts/import-notion.js --dir <export 폴더> [--dry-run] [--min-partner 2] [--update] [--skip-images] [--images-dir <폴더>] [--rollback]'
// 오타 방지 — 모르는 옵션이 있으면 실행하지 않는다 (예: --dry-ru 가 무시되어 실제 이관이 되는 사고를 막는다)
const KNOWN = new Set(['--dir', '--dry-run', '--min-partner', '--update', '--skip-images', '--images-dir', '--rollback', '--fields', '--ids'])
const unknown = argv.filter((a, i) => a.startsWith('--') && !KNOWN.has(a))
if (unknown.length) {
  console.log(`알 수 없는 옵션: ${unknown.join(' ')}
${USAGE}`)
  process.exit(1)
}
if (!dir) {
  console.log(USAGE)
  process.exit(1)
}
if (!fs.existsSync(dir)) {
  console.log(`폴더를 찾을 수 없습니다: ${dir}`)
  if (dir.startsWith('~')) console.log('  ("~" 를 홈 폴더로 풀어 주는 건 셸입니다. PowerShell 이라면 전체 경로를 쓰세요. 예: C:/Users/<이름>/Downloads/노션내보내기)')
  console.log(`  현재 위치: ${process.cwd()}`)
  process.exit(1)
}

// ── CSV (따옴표 안의 줄바꿈 처리) ─────────────────────────
function parseCsv(text) {
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
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

// ── 값 변환 ──────────────────────────────────────────────
const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim()
const parseDate = (s) => {
  const m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
}
const STATUS = { 완료: '완료', '시작 전': '접수', 주문예정: '예정', 배송준비중: '배송준비' }
const stripRelUrl = (s) => String(s).replace(/\s*\(https?:\/\/[^)]*\)/g, '').trim()   // 관계 속성: "이름 (notion 링크)"

// 제목 → 거래처 후보 · 수량 · 담당 고객 · 태그
//   "CRS #10장 #주장훈 #직접배송" → leading CRS · qty 10 · customer 주장훈 · tags [직접배송]
//   #N장 앞의 #태그는 태그, 바로 뒤 첫 #토큰은 담당 고객, 그 뒤는 태그. #N장 이 없으면 모두 태그.
function parseTitle(title) {
  const toks = String(title).trim().split(/\s+(?=#)/)
  const leadTok = toks[0].startsWith('#') ? '' : toks.shift()
  const leading = cleanName(leadTok)
  let qty = null, qtyNote = ''
  const tags = []
  let customer = ''
  let afterQty = false
  for (const t of toks) {
    const m = t.match(/^#\s*(\d+)(?:\s*\+\s*(\d+))?\s*장$/)
    if (m && qty === null) {
      qty = Number(m[1]) + Number(m[2] || 0)
      if (m[2]) qtyNote = `${m[1]}+${m[2]}장`
      afterQty = true
      continue
    }
    const name = cleanName(t.replace(/^#/, ''))
    if (!name) continue
    if (afterQty && !customer) customer = name
    else tags.push(name)
  }
  return { leading, qty, qtyNote, customer, tags }
}

// ── md (본문 · 이미지) ───────────────────────────────────
const PROP_KEYS = ['상태', '주문일', 'ID', '출발필수', '출발날짜', '내용', '요청사항', '제품', '색상', '사이즈', '양쪽중앙', '디자인 코드', '밴드중앙', '사진', '주문번호', '운송장번호', '임시번호']
function parseMd(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')
  let i = 0
  if (/^#\s/.test(lines[0] || '')) i = 1
  while (i < lines.length && lines[i].trim() === '') i++
  // 머리말(속성 줄): 알려진 속성 이름으로 시작하는 줄과 그 이어지는 줄. 첫 빈 줄에서 끝난다.
  let id = null
  const start = i
  let seen = false
  while (i < lines.length) {
    const ln = lines[i]
    const m = ln.match(/^([^:]{1,12}):\s?(.*)$/)
    if (m && PROP_KEYS.includes(m[1].trim())) {
      seen = true
      if (m[1].trim() === 'ID') id = m[2].trim()
      i++
    } else if (seen && ln.trim() !== '') i++        // 여러 줄 값의 이어지는 줄
    else break
  }
  if (!seen) i = start
  const rest = lines.slice(i).join('\n')
  const images = []
  const body = rest.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_, p) => {
    if (!/^https?:/.test(p)) images.push(decodeURIComponent(p))
    return ''
  }).replace(/\n{3,}/g, '\n\n').trim()
  return { id, body, images }
}

// ── 읽기 ────────────────────────────────────────────────
const files = fs.readdirSync(dir)
const allCsv = files.find((f) => f.endsWith('_all.csv')) || files.find((f) => f.endsWith('.csv'))
if (!allCsv) { console.log('폴더에서 CSV 를 찾지 못했습니다.'); process.exit(1) }
const rows = parseCsv(fs.readFileSync(path.join(dir, allCsv), 'utf8'))

const mdById = new Map()
for (const f of files.filter((x) => x.endsWith('.md'))) {
  const md = parseMd(path.join(dir, f))
  if (md.id) mdById.set(md.id, md)
}

// ── 분류 ────────────────────────────────────────────────
const report = {
  source: path.basename(allCsv), dryRun: DRY, rows: rows.length,
  skipped: { separator: [], blank: [], memoLike: [] },
  review: [], statusUnknown: [], images: { found: 0, copied: 0, missing: [] },
  partners: [], customers: 0, ordersNew: 0, ordersExisting: 0,
}
const keep = []
for (const r of rows) {
  const title = r['주문자명'] || ''
  const id = r['ID']
  if (!id) { report.skipped.blank.push({ id, title }); continue }
  if (/^[▲▼]/.test(title)) { report.skipped.separator.push({ id, title }); continue }
  if (!title.trim() || title.trim() === '제목 없음') { report.skipped.blank.push({ id, title }); continue }
  const p = parseTitle(title)
  // 주문이 아닌 메모성 행: 주문일·출발필수·#N장이 없고 아직 끝나지 않은 것
  if (!r['주문일'] && !r['출발필수'] && p.qty === null && r['상태'] !== '완료') {
    report.skipped.memoLike.push({ id, title, memo: (r['내용'] || '').slice(0, 60) })
    continue
  }
  keep.push({ r, p })
}

if (IDS) for (let i = keep.length - 1; i >= 0; i--) if (!IDS.has(keep[i].r['ID'])) keep.splice(i, 1)

// 거래처: 앞 이름이 MIN_PARTNER 번 이상 나온 것만
const lead = new Map()
for (const { p } of keep) if (p.leading) lead.set(p.leading, (lead.get(p.leading) || 0) + 1)
const partnerNames = new Set([...lead].filter(([, n]) => n >= MIN_PARTNER).map(([k]) => k))
report.partners = [...lead].filter(([k]) => partnerNames.has(k)).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, orders: n }))
report.partnersSkipped = lead.size - partnerNames.size

// ── 문서 만들기 ──────────────────────────────────────────
const now = new Date()
const docs = keep.map(({ r, p }) => {
  const id = r['ID']
  const md = mdById.get(id)
  const status = STATUS[r['상태']]
  const needs = []
  if (!status) { needs.push('status-unknown'); report.statusUnknown.push({ id, status: r['상태'] }) }
  if (p.qty === null) needs.push('qty-missing')
  if (!r['주문일']) needs.push('ordered-date-missing')

  const designCode = stripRelUrl(r['디자인 코드'])
  const noteParts = [
    r['밴드중앙'] && `밴드중앙: ${r['밴드중앙']}`,
    r['양쪽중앙'] && `양쪽중앙: ${r['양쪽중앙']}`,
    r['임시번호'] && `임시번호: ${r['임시번호']}`,
    p.qtyNote && `수량표기: ${p.qtyNote}`,
  ].filter(Boolean)
  const hasItem = p.qty !== null || r['제품'] || r['색상'] || r['사이즈']
  const items = hasItem ? [{
    productName: r['제품'] || '', designCode, color: r['색상'] || '', size: r['사이즈'] || '',
    qty: p.qty ?? 1, unitPrice: 0, note: noteParts.join(' / '),
  }] : []

  // 내용·요청사항은 각각의 필드로, Notion 페이지 본문은 첫 메모로 남긴다(이후 화면에서 메모를 계속 추가)
  //   본문의 표(사람별 사양)는 제작 명세로 옮기고, 표를 뺀 나머지 글만 메모로 둔다
  const ext = md?.body ? extractMarkdownTables(md.body) : { rest: '', tables: [] }
  const pieces = normPieces(ext.tables.flatMap((t) => parsePieces(t).pieces).map((x, i) => ({ ...x, no: 0 })))
  if (pieces.length && p.qty !== null && p.qty !== pieces.length) needs.push('pieces-count-mismatch')
  const notes = ext.rest ? [{ _id: new ObjectId(), text: ext.rest, by: 'notion', byName: 'Notion', at: parseDate(r['주문일']) || new Date() }] : []
  // 제작 명세가 있으면 품목은 색상×사이즈별 수량 요약으로 둔다
  if (pieces.length) {
    items.length = 0
    for (const g of summarizePieces(pieces)) items.push({ productName: r['제품'] || '', designCode, color: g.color, size: g.size, qty: g.qty, unitPrice: 0, note: '' })
  }
  const shipped = ['완료', '배송준비'].includes(status) ? parseDate(r['출발날짜']) : null

  return {
    notionId: id, leading: p.leading, customerName: p.customer,
    doc: {
      title: r['주문자명'].trim(),
      partnerId: null, customerId: null,
      orderedAt: parseDate(r['주문일']), dueAt: parseDate(r['출발필수']), shippedAt: shipped,
      status: status || '접수', priority: 0, tags: p.tags,
      content: (r['내용'] || '').trim(), request: (r['요청사항'] || '').trim(), notes, pieces, pieceCount: pieces.length, attachments: [],
      items, vat: false, paid: 0,
      shipping: { method: '', trackingNo: r['운송장번호'] || '', address: '', direct: p.tags.includes('직접배송') },
      amounts: { supply: 0, vat: 0, total: 0, paid: 0, balance: 0 },
      source: { system: 'notion', id, importedAt: now },
      needsReview: needs,
    },
    images: md?.images || [],
  }
})
for (const d of docs) if (d.doc.needsReview.length) report.review.push({ id: d.notionId, title: d.doc.title, reasons: d.doc.needsReview })
report.customersSeen = new Set(docs.map((d) => d.customerName).filter(Boolean)).size

// ── 이미지 복사 ──────────────────────────────────────────
async function copyImages(d) {
  const { uploadRoot } = await import('../src/files.js')
  const root = uploadRoot()
  const outDir = path.join(root, 'orders', `notion-${d.notionId}`)
  const rels = []
  for (const name of d.images) {
    const src = path.join(dir, name)
    report.images.found++
    if (!fs.existsSync(src)) { report.images.missing.push({ id: d.notionId, file: name }); continue }
    const safe = path.basename(name).replace(/[\x00-\x1f\\/:*?"<>|]/g, '_')
    const dst = path.join(outDir, safe)
    if (!DRY) {
      fs.mkdirSync(outDir, { recursive: true })
      if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst)
    }
    report.images.copied++
    rels.push(`orders/notion-${d.notionId}/${safe}`)
  }
  return rels
}

// ── DB ──────────────────────────────────────────────────
let db = null
try { db = await import('../src/db.js') } catch (e) { console.log('db 모듈 로드 실패:', e.message) }

async function main() {
  let existing = new Set()
  if (db) {
    try {
      const c = await db.col('orders')
      existing = new Set((await c.find({ 'source.system': 'notion' }, { projection: { 'source.id': 1 } }).toArray()).map((o) => o.source.id))
    } catch (e) {
      if (!DRY) throw e
      console.log('(DB 에 연결하지 못해 기존 이관 건수는 건너뜁니다:', e.message + ')')
    }
  }
  const targets = docs.filter((d) => UPDATE || !existing.has(d.notionId))
  report.ordersNew = docs.filter((d) => !existing.has(d.notionId)).length
  report.ordersExisting = docs.length - report.ordersNew

  // 이미지
  if (!SKIP_IMAGES) {
    for (const d of targets) d.doc.attachments = await copyImages(d)
  }

  if (!DRY) {
    await db.ensureIndexes()
    const partners = await db.col('partners')
    const customers = await db.col('customers')
    const orders = await db.col('orders')

    const partnerId = new Map()
    for (const name of partnerNames) {
      const r = await partners.findOneAndUpdate(
        { name }, { $setOnInsert: { name, createdAt: now, updatedAt: now, createdBy: 'import' } },
        { upsert: true, returnDocument: 'after' },
      )
      partnerId.set(name, r._id)
    }
    const customerId = new Map()
    for (const d of targets) {
      if (!d.customerName) continue
      const pid = partnerId.get(d.leading) || null
      const key = `${d.customerName}|${pid || ''}`
      if (!customerId.has(key)) {
        const r = await customers.findOneAndUpdate(
          { name: d.customerName, partnerId: pid },
          { $setOnInsert: { name: d.customerName, partnerId: pid, createdAt: now, updatedAt: now, createdBy: 'import' } },
          { upsert: true, returnDocument: 'after' },
        )
        customerId.set(key, r._id)
      }
      d.doc.customerId = customerId.get(key)
    }
    report.customers = customerId.size
    for (const d of targets) d.doc.partnerId = partnerId.get(d.leading) || null

    // 주문번호 = Notion ID. (이미 쓰이고 있는 번호와 겹치면 새 번호를 받는다)
    const sorted = [...targets].sort((a, b) =>
      (a.doc.orderedAt?.getTime() ?? a.doc.dueAt?.getTime() ?? 0) - (b.doc.orderedAt?.getTime() ?? b.doc.dueAt?.getTime() ?? 0)
      || Number(a.notionId) - Number(b.notionId))
    const maxId = Math.max(0, ...docs.map((d) => Number(d.notionId)))
    await (await db.col('counters')).updateOne({ _id: 'orderNo' }, { $max: { seq: maxId } }, { upsert: true })   // 이후 새 주문은 그 다음 번호
    const taken = new Set((await orders.find({}, { projection: { orderNo: 1 } }).toArray()).map((o) => o.orderNo))
    for (const d of sorted) {
      const base = { ...d.doc, updatedAt: now }
      if (existing.has(d.notionId)) {
        const key = { 'source.system': 'notion', 'source.id': d.notionId }
        let set = base
        if (FIELDS) set = Object.fromEntries(Object.entries(base).filter(([k]) => FIELDS.includes(k)))
        // 화면에서 사람이 추가한 메모는 지킨다 — Notion 에서 온 메모만 다시 만든다
        if ('notes' in set) {
          const cur = await orders.findOne(key, { projection: { notes: 1 } })
          set = { ...set, notes: [...base.notes, ...(cur?.notes || []).filter((n) => n.by !== 'notion')] }
        }
        // 예전 구조의 합쳐진 memo 필드는 정리한다
        await orders.updateOne(key, { $set: set, $unset: { memo: '' } })
      } else {
        const want = Number(d.notionId)
        const orderNo = Number.isInteger(want) && !taken.has(want) ? want : await db.nextSeq('orderNo')
        taken.add(orderNo)
        await orders.insertOne({ ...base, orderNo, createdAt: d.doc.orderedAt || now, createdBy: 'import' })
      }
    }
  }

  fs.writeFileSync(path.join(dir, '_import-report.json'), JSON.stringify(report, null, 2))
  const k = report.skipped
  console.log(`\n${DRY ? '[드라이런] ' : ''}Notion 이관 결과 — ${report.source}`)
  console.log(`  CSV 행              ${report.rows}`)
  console.log(`  제외: 구분선 ${k.separator.length} · 빈 제목 ${k.blank.length} · 메모성 ${k.memoLike.length}`)
  console.log(`  이관 대상 주문      ${docs.length} (신규 ${report.ordersNew} · 이미 있음 ${report.ordersExisting}${UPDATE ? ' → 덮어씀' : ' → 건너뜀'})`)
  console.log(`  거래처(${MIN_PARTNER}건 이상)    ${partnerNames.size} (그 외 ${report.partnersSkipped}개 이름은 제목에만 남김)`)
  console.log(`  담당 고객 이름      ${report.customersSeen}`)
  console.log(`  확인 필요(리뷰)     ${report.review.length}`)
  console.log(`  이미지              ${report.images.copied}/${report.images.found}${report.images.missing.length ? ` (없음 ${report.images.missing.length})` : ''}${SKIP_IMAGES ? ' — 건너뜀' : ''}`)
  console.log(`  리포트              ${path.join(dir, '_import-report.json')}`)
  if (!DRY && !SKIP_IMAGES && report.images.copied) {
    const { uploadRoot } = await import('../src/files.js')
    console.log(`
  이미지 폴더         ${path.join(uploadRoot(), 'orders')}`)
    console.log('  → 이 안의 notion-* 폴더들을 서버 UPLOAD_DIR/erp/orders/ 아래로 FTP 업로드하세요.')
  }
  if (db) await (await db.getClient()).close()
}

async function rollback() {
  const orders = await db.col('orders')
  const partners = await db.col('partners')
  const customers = await db.col('customers')
  const o = await orders.deleteMany({ 'source.system': 'notion' })
  // 이관 때 만든 거래처·고객 중 지금 어떤 주문에서도 쓰지 않는 것만 지운다
  const used = async (field, id) => !!(await orders.findOne({ [field]: id }, { projection: { _id: 1 } }))
  let pn = 0, cn = 0
  for (const p of await partners.find({ createdBy: 'import' }).toArray()) if (!(await used('partnerId', p._id))) { await partners.deleteOne({ _id: p._id }); pn++ }
  for (const c of await customers.find({ createdBy: 'import' }).toArray()) if (!(await used('customerId', c._id))) { await customers.deleteOne({ _id: c._id }); cn++ }
  console.log(`되돌림: 주문 ${o.deletedCount} · 거래처 ${pn} · 고객 ${cn} 삭제 (이미지 파일은 그대로 둡니다)`)
  await (await db.getClient()).close()
}

;(ROLLBACK ? rollback() : main()).catch(async (e) => {
  console.error('이관 실패:', e.message)
  if (db) await (await db.getClient()).close().catch(() => {})
  process.exit(1)
})
