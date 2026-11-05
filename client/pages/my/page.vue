<script setup lang="ts">
// 내 정보 — 네이버 로그인으로 넘어온 정보를 보여 주고, 고칠 수 있는 것만 고치게 한다.
//   이름 · 생년월일 · 성별 · 이메일은 수정할 수 없다. 인스타그램 계정만 선택적으로 입력한다.
//   처음 로그인하면(?first=1) 이 화면으로 온다.
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const first = computed(() => route.query.first === '1')
const { refresh } = useAuth()

const f: any = import.meta.server ? useRequestFetch() : $fetch
const { data, error } = await useAsyncData<any>('mypage', () => f('/api/auth/mypage'))
const pageName = computed(() => data.value?.name || '내 정보')
useHead(() => ({ title: `${pageName.value} — Swimming Photography`, meta: [{ name: 'robots', content: 'noindex, nofollow' }] }))

const form = reactive({ instagram: '' })
const savedInstagram = ref('')
watchEffect(() => {
  const d = data.value
  if (d) {
    const instagram = String(d.instagram || '')
    form.instagram = instagram
    savedInstagram.value = instagram.trim()
  }
})
const instagramChanged = computed(() => form.instagram.trim() !== savedInstagram.value)

const GENDER: Record<string, string> = { M: '남성', F: '여성' }
const birth = computed(() => {
  const d = data.value
  if (!d) return ''
  const md = String(d.birthday || '').replace('-', '월 ')
  return [d.birthyear ? `${d.birthyear}년` : '', md ? `${md}일` : ''].filter(Boolean).join(' ')
})

// 프로필 사진 — 사진을 누르면 파일을 골라 바로 바꾼다. 정사각형(400px)으로 잘라 줄여서 올린다.
const photo = ref<HTMLInputElement | null>(null)
const photoBusy = ref(false)
const photoMsg = ref('')
const crop = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const side = Math.min(img.width, img.height), S = 400
    const cv = document.createElement('canvas'); cv.width = cv.height = S
    cv.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S)
    URL.revokeObjectURL(url)
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('x'))), 'image/jpeg', 0.9)
  }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('x')) }
  img.src = url
})
const pickPhoto = () => { if (!photoBusy.value) photo.value?.click() }
const onPhoto = async (ev: Event) => {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  photoBusy.value = true; photoMsg.value = ''
  try {
    const blob = await crop(file)
    const fd = new FormData(); fd.append('file', blob, 'avatar.jpg')
    const r: any = await $fetch('/api/auth/avatar', { method: 'POST', body: fd })
    if (data.value) data.value.image = r.image
  } catch (err: any) {
    const e = err?.data?.error
    photoMsg.value = typeof e === 'string' && e ? e : '사진을 올리지 못했습니다. 이미지 파일인지 확인해 주세요.'
  } finally {
    photoBusy.value = false
  }
}

const busy = ref(false)
const msg = ref('')
const ok = ref(false)
watch(() => form.instagram, () => {
  if (ok.value) { ok.value = false; msg.value = '' }
})
const save = async () => {
  if (busy.value || !instagramChanged.value) return
  busy.value = true; msg.value = ''; ok.value = false
  try {
    const instagram = form.instagram.trim()
    await $fetch('/api/auth/profile', { method: 'POST', body: { instagram } })
    await refresh()
    savedInstagram.value = instagram
    if (data.value) data.value.instagram = instagram
    ok.value = true; msg.value = '입력하신 내용대로 저장되었습니다.'
  } catch (err: any) {
    const e = err?.data?.error
    msg.value = typeof e === 'string' && e ? e : '저장하지 못했습니다.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mp">
    <div class="mp-box">
      <MyPageNav :name="pageName" />
      <p v-if="first" class="mp-hello">가입을 환영합니다. 네이버에서 넘어온 정보를 확인하고, 필요하면 고쳐 주세요.</p>
      <p v-if="error" class="mp-msg bad">내 정보를 불러오지 못했습니다.</p>

      <div v-if="data" class="mp-content">
        <div class="mp-photo">
          <button type="button" class="mp-av" :disabled="photoBusy" title="사진을 눌러 바꾸기" aria-label="프로필 사진 바꾸기" @click="pickPhoto">
            <img v-if="data.image" :src="data.image" alt="프로필 사진" referrerpolicy="no-referrer">
            <span v-else class="mp-ph">{{ (data.name || '?').slice(0, 1) }}</span>
            <span class="mp-cam">{{ photoBusy ? '올리는 중…' : '사진 변경' }}</span>
          </button>
          <input ref="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden @change="onPhoto">
          <p v-if="photoMsg" class="mp-msg bad">{{ photoMsg }}</p>
        </div>

        <form class="mp-form" @submit.prevent="save">
          <div class="mp-fld mp-fld-disabled">
            <div class="mp-label-row">
              <span class="mp-l">이름</span>
              <details class="mp-info">
                <summary aria-label="이름 안내">i</summary>
                <div class="mp-info-pop">네이버 로그인으로 받은 정보라 직접 수정할 수 없습니다.</div>
              </details>
            </div>
            <input class="mp-in" :value="data.name" disabled>
          </div>
          <div class="mp-fld mp-fld-disabled">
            <div class="mp-label-row">
              <span class="mp-l">생년월일</span>
              <details class="mp-info">
                <summary aria-label="생년월일 안내">i</summary>
                <div class="mp-info-pop">네이버 로그인으로 받은 정보라 직접 수정할 수 없습니다.</div>
              </details>
            </div>
            <input class="mp-in" :value="birth || '네이버에서 받은 정보가 없습니다'" disabled>
          </div>
          <div class="mp-fld mp-fld-disabled">
            <div class="mp-label-row">
              <span class="mp-l">성별</span>
              <details class="mp-info">
                <summary aria-label="성별 안내">i</summary>
                <div class="mp-info-pop">네이버 로그인으로 받은 정보라 직접 수정할 수 없습니다.</div>
              </details>
            </div>
            <input class="mp-in" :value="GENDER[data.gender] || '네이버에서 받은 정보가 없습니다'" disabled>
          </div>

          <div class="mp-fld mp-fld-disabled">
            <div class="mp-label-row">
              <label class="mp-l" for="mypage-email">이메일</label>
              <details class="mp-info">
                <summary aria-label="이메일 변경 안내">i</summary>
                <div class="mp-info-pop">
                  이메일 주소는 기본적으로는 변경이 불가합니다. 스위밍포토그래피닷컴에 입력된 본인 이메일 주소의 변경을 희망하시는 분은
                  <a href="https://instagram.com/medalbankaquatics" target="_blank" rel="noopener">@medalbankaquatics</a>로 DM 주시면 순차적으로 확인하고 처리하겠습니다.
                </div>
              </details>
            </div>
            <input id="mypage-email" class="mp-in" :value="data.email" type="email" disabled>
          </div>

          <div class="mp-fld">
            <div class="mp-label-row">
              <label class="mp-l" for="mypage-instagram">인스타그램 계정</label>
              <details class="mp-info">
                <summary aria-label="인스타그램 계정 입력 안내">i</summary>
                <div class="mp-info-pop">이 내용은 필수입력사항이 아닙니다. 희망시에만 입력해주세요. 추후 본인 이름이 공개된 모든 곳에 링크로 제공될 수 있습니다. 추후 내용 변경도 가능합니다.</div>
              </details>
            </div>
            <input id="mypage-instagram" v-model="form.instagram" class="mp-in" type="text" maxlength="100" autocomplete="off" placeholder="@username">
          </div>

          <p v-if="msg" class="mp-msg" :class="ok ? 'ok' : 'bad'">{{ msg }}</p>
          <button class="mp-btn" type="submit" :disabled="busy || !instagramChanged">{{ busy ? '저장 중…' : '저장' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 메인페이지 기준 — 헤더 바로 아래에서 메뉴가 시작되고, 평면 그리드·Serif·얇은 선을 공유한다. */
.mp { font-family: var(--serif); padding: 0 0 80px; }
.mp-box { width: min(960px, 100%); margin: 0 auto 0 0; display: flex; flex-direction: column; align-items: stretch; gap: 20px; }
.mp-hello { margin: 0; padding: 12px 16px; border-left: 3px solid var(--orange); background: var(--paper-deep); font-size: 13px; color: var(--ink-mute); line-height: 1.6; }
.mp-content { width: 100%; display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--frame-gap); align-items: start; padding-top: 20px; border-top: 1px solid var(--line); }
.mp-photo { width: 200px; margin: 14px 0; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.mp-av { position: relative; width: 200px; aspect-ratio: 1; padding: 0; border: none; border-radius: 0; overflow: hidden; background: var(--paper-deep); cursor: pointer; }
.mp-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mp-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-family: var(--serif); font-size: 46px; color: var(--ink-light); }
.mp-cam { position: absolute; left: 0; right: 0; bottom: 0; padding: 7px 0; font-family: var(--serif); font-size: 11px; color: #fff; background: rgba(0, 0, 0, .55); opacity: 0; transition: opacity .15s; }
.mp-av:hover .mp-cam, .mp-av:focus-visible .mp-cam, .mp-av:disabled .mp-cam { opacity: 1; }
.mp-form { display: flex; flex-direction: column; gap: 14px; }
.mp-fld { display: flex; flex-direction: column; gap: 5px; }
.mp-label-row { position: relative; display: flex; align-items: center; gap: 5px; min-height: 17px; }
.mp-l { font-family: var(--sans); font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--ink-mute); }
.mp-l i { font-style: normal; margin-left: 6px; font-size: 11px; color: var(--ink-light); opacity: .8; }
.mp-info { position: relative; }
.mp-info summary {
  display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; list-style: none;
  border: 1px solid var(--line); border-radius: 50%; font-family: var(--serif); font-size: 8px; font-style: italic;
  font-weight: 500; line-height: 1; color: var(--ink-light); cursor: pointer; user-select: none;
  transform: translateY(-5px);   /* 위첨자처럼 살짝 위로 — transform 이라 줄 높이는 변하지 않는다 */
}
.mp-info summary::-webkit-details-marker { display: none; }
.mp-info summary:hover, .mp-info[open] summary { border-color: var(--ink-light); color: var(--ink-mute); }
.mp-info-pop {
  position: absolute; z-index: 10; top: calc(100% + 8px); left: -6px; width: min(360px, calc(100vw - 48px));
  padding: 12px 14px; border: 1px solid var(--line); background: var(--paper); box-shadow: 0 12px 32px rgba(26, 26, 26, .12);
  font-family: var(--serif); font-size: 12px; font-weight: 400; letter-spacing: 0; line-height: 1.7; color: var(--ink-mute);
}
.mp-info-pop a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
.mp-info-pop a:hover { color: var(--orange-deep); }
.mp-in {
  font-family: var(--serif); font-size: 14px; color: var(--ink);
  background: var(--paper-deep); border: 1px solid transparent; border-radius: 2px; padding: 10px 11px;
}
.mp-in:focus { outline: none; box-shadow: inset 0 -2px 0 var(--orange); }
.mp-fld-disabled .mp-l { color: var(--ink-light); }
.mp-in:disabled {
  background: #EEEDEA; border-color: #E1E0DC; color: var(--ink-light); cursor: not-allowed; opacity: 1;
  -webkit-text-fill-color: var(--ink-light);
}
.mp-msg { margin: 0; font-size: 13px; }
.mp-msg.bad { color: var(--bad); }
.mp-msg.ok { color: var(--ink-mute); }
.mp-btn {
  align-self: flex-start; font-family: var(--sans); font-size: 14px; font-weight: 700; letter-spacing: 0.02em; color: var(--paper); cursor: pointer;
  background: var(--orange); border: none; border-radius: 2px; padding: 13px 28px; transition: background .15s;
}
.mp-btn:hover:not(:disabled) { background: var(--orange-deep); }
.mp-btn:disabled { opacity: .5; cursor: default; }

@media (max-width: 640px) {
  .mp-box { width: 100%; gap: 18px; }
  .mp-content { grid-template-columns: 1fr; gap: 24px; padding-top: 18px; }
  .mp-photo { width: 100%; margin: 14px 0; align-items: stretch; }
  .mp-av { width: 100%; }
}
</style>
