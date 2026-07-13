// 공용 속보(Breaking News) — docs/html/assets/breaking.js 를 Nuxt 반응형으로 이식.
// 데이터: MongoDB(SwimmingPhotography.articles, type=breaking_news, status=published).
//   → /api/articles 로 조회 (Nitro routeRules 가 Express:6640 으로 프록시). 최신순 정렬.
//   API 실패 시 정적 폴백(public/data/breaking.json).
// 상단 티커(BreakingTicker) · 홈 속보 박스(index) · 속보 페이지(breakingnews)가 같은 상태를 공유하고,
// 클릭 시 열리는 표준 모달도 전역 단일 상태(openItem)로 관리한다.
import { computed } from 'vue'

export interface BreakingItem {
  id: string
  publishedAt: string
  title: string
  subtitle?: string
  titleENG?: string
  subtitleENG?: string
  [k: string]: any
}

export const useBreaking = () => {
  const { isEN } = useLang()

  // useState: SSR/CSR 공유 + 앱 전역 단일 상태
  const items = useState<BreakingItem[]>('breaking_items', () => [])
  const loaded = useState<boolean>('breaking_loaded', () => false)
  const openItem = useState<BreakingItem | null>('breaking_open', () => null)

  // 정렬(최신순) — publishedAt 문자열 내림차순
  const sortDesc = (arr: BreakingItem[]) => arr.slice().sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0)

  // content.blocks 에서 첫 문단 텍스트 추출 (subtitle/excerpt 폴백용)
  const firstParagraph = (t: any): string => {
    const blocks = t?.content?.blocks
    if (!Array.isArray(blocks)) return ''
    const p = blocks.find((b: any) => b?.type === 'paragraph' && b?.text)
    return p?.text || ''
  }

  // MongoDB article 문서 → BreakingItem (한글/영문 translations 매핑)
  const fromDoc = (d: any): BreakingItem => {
    const ko = d?.translations?.ko || {}
    const en = d?.translations?.en || {}
    return {
      id: String(d?._id ?? d?.id ?? ''),
      publishedAt: d?.publishedAt || '',
      title: ko.title || '',
      subtitle: ko.subtitle || ko.excerpt || firstParagraph(ko),
      titleENG: en.title || '',
      subtitleENG: en.subtitle || en.excerpt || firstParagraph(en),
    }
  }

  // 최초 1회 로드 — DB(API) 우선, 실패 시 정적 폴백
  const load = async () => {
    if (loaded.value) return
    try {
      const docs = await $fetch<any[]>('/api/articles', {
        params: { type: 'breaking_news', status: 'published', limit: 500 },
      })
      items.value = sortDesc((docs || []).map(fromDoc))
    } catch {
      // API 불가 시 정적 데이터로 폴백
      try {
        const arr = await $fetch<BreakingItem[]>('/data/breaking.json', { cache: 'no-cache' as any })
        items.value = sortDesc(arr || [])
      } catch {}
    }
    loaded.value = true
  }

  // 현재 언어에 맞는 필드 (EN 모드면 <field>ENG, 없으면 원문 폴백)
  const pick = (it: BreakingItem, f: string) => {
    const v = isEN.value ? it[f + 'ENG'] : it[f]
    return (v == null || v === '') ? (it[f] || '') : v
  }

  // 일시 포맷: KO "2026년 5월 22일 09시 33분" / EN "22-05-2026 09:33"
  const fmtDT = (s: string) => {
    const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
    if (!m) return s || ''
    return isEN.value
      ? m[3] + '-' + m[2] + '-' + m[1] + ' ' + m[4] + ':' + m[5]
      : m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일 ' + m[4] + '시 ' + m[5] + '분'
  }

  const open = (it: BreakingItem) => { openItem.value = it }
  const close = () => { openItem.value = null }

  const hasItems = computed(() => items.value.length > 0)

  return { items, hasItems, openItem, load, pick, fmtDT, open, close }
}
