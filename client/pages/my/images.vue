<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: '내가 검토한 기사들 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const { user } = useAuth()
const f: any = import.meta.server ? useRequestFetch() : $fetch

const DISC_KO: Record<string, string> = { FR: '자유형', BA: '배영', BR: '평영', FL: '접영', IM: '개인혼영', FRR: '계영', MR: '혼계영' }
const GENDER_KO: Record<string, string> = { men: '남자', women: '여자', mixed: '혼성' }
const PAGE_SIZE = 5000
const page = ref(1)

const { data: result, pending, error, refresh } = await useAsyncData<any>(
  'my-reviewed-images',
  () => f('/api/images', {
    params: { mine: '1', matched: 'has', limit: PAGE_SIZE, skip: (page.value - 1) * PAGE_SIZE, withTotal: '1' },
  }),
  { watch: [page] },
)

const rows = computed<any[]>(() => result.value?.rows || [])
const total = computed(() => Number(result.value?.total || 0))
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const visiblePages = computed(() => {
  const size = Math.min(5, pageCount.value)
  const start = Math.max(1, Math.min(page.value - 2, pageCount.value - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
})
const goPage = (next: number) => {
  page.value = Math.min(Math.max(1, next), pageCount.value)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

const athleteList = (r: any) => (Array.isArray(r?.athletes) && r.athletes.length
  ? r.athletes
  : (r?.name ? [{ name: r.name }] : []))
const athleteNames = (r: any) => [...new Set<string>(athleteList(r).map((a: any) => String(a?.name || '').trim()).filter(Boolean))]
const normalizeName = (value: any) => String(value || '').normalize('NFC').trim().replace(/\d+$/, '')
const myName = computed(() => normalizeName(user.value?.name))
const isMine = (r: any) => !!myName.value && athleteNames(r).some((name) => normalizeName(name) === myName.value)
const myPhotos = computed(() => rows.value.filter(isMine))
const colleaguePhotos = computed(() => rows.value.filter((r) => !isMine(r)))
const caption = (r: any) => [
  GENDER_KO[r.gender] || r.gender,
  DISC_KO[r.discipline] || r.discipline,
  athleteNames(r).join(', '),
].filter(Boolean).join(' ')

const selected = ref<any | null>(null)
const onSaved = async () => {
  selected.value = null
  await refresh()
}
const onDeleted = async () => {
  selected.value = null
  await refresh()
  if (page.value > pageCount.value) page.value = pageCount.value
}
</script>

<template>
  <div class="mi">
    <MyPageNav :name="user?.name || user?.username || '내 정보'" />

    <p v-if="error" class="mi-error">내가 확인한 이미지를 불러오지 못했습니다.</p>
    <p v-else class="mi-note">{{ pending ? '불러오는 중…' : `내가 확인한 이미지 총 ${total}장` }}</p>

    <template v-if="!pending && !error">
      <section class="mi-group" aria-labelledby="my-photo-heading">
        <div class="mi-heading">
          <h1 id="my-photo-heading">내 사진</h1>
          <span>{{ myPhotos.length }}장</span>
        </div>
        <div v-if="myPhotos.length" class="mi-grid">
          <button v-for="r in myPhotos" :key="r._id" class="mi-card" type="button" :title="r.filename" @click="selected = r">
            <span class="mi-image"><img :src="r.thumbnail || r.url" alt="" loading="lazy" decoding="async"></span>
            <span class="mi-caption">{{ caption(r) || '식별되지않음' }}</span>
          </button>
        </div>
        <p v-else class="mi-empty">내 이름으로 확인된 사진이 없습니다.</p>
      </section>

      <section class="mi-group" aria-labelledby="colleague-photo-heading">
        <div class="mi-heading">
          <h2 id="colleague-photo-heading">내 동료의 사진</h2>
          <span>{{ colleaguePhotos.length }}장</span>
        </div>
        <div v-if="colleaguePhotos.length" class="mi-grid">
          <button v-for="r in colleaguePhotos" :key="r._id" class="mi-card" type="button" :title="r.filename" @click="selected = r">
            <span class="mi-image"><img :src="r.thumbnail || r.url" alt="" loading="lazy" decoding="async"></span>
            <span class="mi-caption">{{ caption(r) || '식별되지않음' }}</span>
          </button>
        </div>
        <p v-else class="mi-empty">동료의 사진이 없습니다.</p>
      </section>

      <nav v-if="pageCount > 1" class="mi-pager" aria-label="내가 확인한 이미지 목록 페이지">
        <button type="button" class="mi-page" :disabled="page === 1" @click="goPage(page - 1)">이전</button>
        <button
          v-for="p in visiblePages" :key="p" type="button" class="mi-page"
          :class="{ active: p === page }" :aria-current="p === page ? 'page' : undefined" @click="goPage(p)"
        >{{ p }}</button>
        <button type="button" class="mi-page" :disabled="page === pageCount" @click="goPage(page + 1)">다음</button>
      </nav>
    </template>

    <ImageEditModal :row="selected" @close="selected = null" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<style scoped>
.mi { font-family: var(--serif); padding: 0 0 80px; }
.mi-note { margin: 14px 0 22px; padding-bottom: 13px; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.6; color: var(--ink-mute); }
.mi-error { margin: 14px 0 20px; padding: 9px 14px; border-left: 3px solid var(--bad); background: var(--bad-bg); font-family: var(--sans); font-size: 13px; color: var(--bad); }
.mi-group + .mi-group { margin-top: 48px; }
.mi-heading { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; }
.mi-heading h1, .mi-heading h2 { margin: 0; font-family: var(--serif); font-size: 16px; font-weight: 700; line-height: 1.45; color: var(--ink); }
.mi-heading span { font-size: 12px; color: var(--ink-light); }
.mi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 20px; }
.mi-card { display: flex; flex-direction: column; gap: 9px; padding: 0; border: none; background: none; text-align: left; cursor: pointer; font-family: var(--serif); color: var(--ink); }
.mi-image { display: block; aspect-ratio: 4 / 3; overflow: hidden; background: var(--paper-deep); box-shadow: inset 0 -2px 0 var(--orange); }
.mi-image img { width: 100%; height: 100%; object-fit: cover; transition: opacity .15s; }
.mi-card:hover .mi-image img { opacity: .9; }
.mi-caption { font-size: 13.5px; font-weight: 700; line-height: 1.45; color: var(--ink); word-break: keep-all; }
.mi-card:hover .mi-caption { color: var(--orange-deep); }
.mi-empty { margin: 0; padding: 36px 0; border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); text-align: center; font-size: 13px; color: var(--ink-light); }
.mi-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 38px; }
.mi-page { min-width: 24px; padding: 3px 2px; border: none; border-bottom: 1px solid transparent; background: none; font-family: var(--serif); font-size: 13px; line-height: 1.6; color: var(--ink-light); cursor: pointer; }
.mi-page:hover:not(:disabled) { color: var(--ink); }
.mi-page.active { border-bottom-color: var(--orange); color: var(--ink); font-weight: 700; }
.mi-page:disabled { opacity: .4; cursor: default; }

@media (max-width: 640px) {
  .mi-group + .mi-group { margin-top: 38px; }
  .mi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 14px; }
  .mi-caption { font-size: 13px; }
}
</style>
