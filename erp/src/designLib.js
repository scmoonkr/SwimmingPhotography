// 디자인 공용 로직 — 주문에 연결된 디자인(버전)의 현재 상태를 읽는다.
//   주문: orders.designs = [{ designId, code, name(스냅샷), version, role('로고'|'이니셜'|''), note }]
//   디자인: designs { code, name, partnerId, versions: [{ no, status('디자인 중'|'확정'), previewImage, files, colors, … }] }
import { col } from './db.js'
import { oid } from './crud.js'

export const DESIGN_STATUSES = ['디자인 중', '확정']
export const DESIGN_ROLES = ['', '로고', '이니셜']

export const versionOf = (d, no) => (d?.versions || []).find((v) => v.no === no) || null
export const latestOf = (d) => (d?.versions || []).reduce((m, v) => (!m || v.no > m.no ? v : m), null)
export const latestConfirmed = (d) => (d?.versions || []).filter((v) => v.status === '확정').reduce((m, v) => (!m || v.no > m.no ? v : m), null)

// 주문들의 디자인 링크 → { orderId: [상세] }. 상세에는 쓰고 있는 버전의 상태·시안·파일·컬러가 들어 있다.
export async function designDetails(orders) {
  const ids = [...new Set(orders.flatMap((o) => (o.designs || []).map((l) => String(l.designId))))].map((x) => oid(x)).filter(Boolean)
  const ds = ids.length ? await (await col('designs')).find({ _id: { $in: ids } }).toArray() : []
  const byId = new Map(ds.map((d) => [String(d._id), d]))
  const out = new Map()
  for (const o of orders) {
    out.set(String(o._id), (o.designs || []).map((l) => {
      const d = byId.get(String(l.designId))
      const v = d ? versionOf(d, l.version) : null
      const latest = latestOf(d)
      return {
        designId: l.designId, code: d?.code || l.code, name: d?.name || l.name, role: l.role || '', note: l.note || '',
        version: l.version, status: v?.status || (d ? '' : '삭제됨'),
        latestVersion: latest?.no ?? null, latestStatus: latest?.status || '',
        preview: v?.previewImage || '', files: (v?.files || []).map((f) => ({ name: f.name, path: f.path, ext: f.ext })),
        colors: v?.colors || [], variants: v?.variants || [], baseName: v?.baseName || '기본', production: v?.production || null, widthMm: v?.widthMm ?? null, heightMm: v?.heightMm ?? null, stitches: v?.stitches ?? null,
      }
    }))
  }
  return out
}

// 컬러 세트 고르기 — 장의 수모 색이 어느 세트의 '적용 수모'에 있으면 그 세트, 없으면 기본 세트.
//   수모 번호는 '08' 과 '8', 'caps08' 을 같은 것으로 본다. piece.variant 가 있으면 그것이 우선('기본' = 기본 세트).
export const capKey = (v) => { const s = String(v ?? '').trim().toLowerCase().replace(/^caps/, ''); return /^\d+$/.test(s) ? String(Number(s)) : s }
export function pickSetName(detail, piece) {
  const base = detail?.baseName || '기본'
  const vs = detail?.variants || []
  if (!vs.length) return base
  if (piece?.variant === '기본') return base
  if (piece?.variant && vs.some((x) => x.name === piece.variant)) return piece.variant
  const k = capKey(piece?.color)
  return (k && vs.find((x) => (x.caps || []).some((c) => capKey(c) === k))?.name) || base
}

// 주문의 디자인 상태: none(연결 없음) · working(확정되지 않은 버전이 있음) · ready(모두 확정)
export function designState(details) {
  if (!details || !details.length) return 'none'
  return details.every((x) => x.status === '확정') ? 'ready' : 'working'
}
