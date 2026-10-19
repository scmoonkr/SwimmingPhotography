<script setup lang="ts">
// 내 정보 — 네이버 로그인으로 넘어온 정보를 보여 주고, 고칠 수 있는 것만 고치게 한다.
//   이름 · 생년월일 · 성별은 네이버 값이라 수정할 수 없다. 별명 · 이메일 · 휴대폰은 수정할 수 있다.
//   처음 로그인하면(?first=1) 이 화면으로 온다.
useHead({ title: '내 정보 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const first = computed(() => route.query.first === '1')
const { refresh } = useAuth()

const f: any = import.meta.server ? useRequestFetch() : $fetch
const { data, error } = await useAsyncData<any>('mypage', () => f('/api/auth/mypage'))

const form = reactive({ nickname: '', email: '', mobile: '' })
watchEffect(() => {
  const d = data.value
  if (d) { form.nickname = d.nickname || ''; form.email = d.email || ''; form.mobile = d.mobile || '' }
})

const GENDER: Record<string, string> = { M: '남성', F: '여성' }
const birth = computed(() => {
  const d = data.value
  if (!d) return ''
  const md = String(d.birthday || '').replace('-', '월 ')
  return [d.birthyear ? `${d.birthyear}년` : '', md ? `${md}일` : ''].filter(Boolean).join(' ')
})

const busy = ref(false)
const msg = ref('')
const ok = ref(false)
const save = async () => {
  if (busy.value) return
  busy.value = true; msg.value = ''; ok.value = false
  try {
    await $fetch('/api/auth/profile', { method: 'POST', body: { nickname: form.nickname, email: form.email, mobile: form.mobile } })
    await refresh()
    ok.value = true; msg.value = '저장했습니다.'
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
      <h1 class="mp-title">내 정보</h1>
      <p v-if="first" class="mp-hello">가입을 환영합니다. 네이버에서 넘어온 정보를 확인하고, 필요하면 고쳐 주세요.</p>
      <p v-if="error" class="mp-msg bad">내 정보를 불러오지 못했습니다.</p>

      <form v-if="data" class="mp-form" @submit.prevent="save">
        <label class="mp-fld">
          <span class="mp-l">이름 <i>수정 불가</i></span>
          <input class="mp-in" :value="data.name" disabled>
        </label>
        <label class="mp-fld">
          <span class="mp-l">생년월일 <i>수정 불가</i></span>
          <input class="mp-in" :value="birth || '네이버에서 받은 정보가 없습니다'" disabled>
        </label>
        <label class="mp-fld">
          <span class="mp-l">성별 <i>수정 불가</i></span>
          <input class="mp-in" :value="GENDER[data.gender] || '네이버에서 받은 정보가 없습니다'" disabled>
        </label>

        <label class="mp-fld">
          <span class="mp-l">별명</span>
          <input v-model="form.nickname" class="mp-in" type="text" maxlength="40" autocomplete="nickname">
        </label>
        <label class="mp-fld">
          <span class="mp-l">이메일</span>
          <input v-model="form.email" class="mp-in" type="email" maxlength="100" autocomplete="email">
        </label>
        <label class="mp-fld">
          <span class="mp-l">휴대폰</span>
          <input v-model="form.mobile" class="mp-in" type="tel" maxlength="20" autocomplete="tel" placeholder="010-0000-0000">
        </label>

        <p v-if="msg" class="mp-msg" :class="ok ? 'ok' : 'bad'">{{ msg }}</p>
        <button class="mp-btn" type="submit" :disabled="busy">{{ busy ? '저장 중…' : '저장' }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.mp { display: flex; justify-content: center; padding: 48px 0 80px; font-family: var(--sans); }
.mp-box { width: min(420px, 100%); display: flex; flex-direction: column; gap: 14px; }
.mp-title { margin: 0 0 4px; font-family: var(--serif); font-size: 22px; font-weight: 700; color: var(--ink); }
.mp-hello { margin: 0; font-size: 13px; color: var(--ink-mute); line-height: 1.6; }
.mp-form { display: flex; flex-direction: column; gap: 14px; }
.mp-fld { display: flex; flex-direction: column; gap: 5px; }
.mp-l { font-size: 12px; color: var(--ink-light); }
.mp-l i { font-style: normal; margin-left: 6px; font-size: 11px; color: var(--ink-light); opacity: .8; }
.mp-in {
  font-family: var(--sans); font-size: 14px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px;
}
.mp-in:focus { outline: none; border-color: var(--orange); }
.mp-in:disabled { background: transparent; color: var(--ink-mute); cursor: not-allowed; }
.mp-msg { margin: 0; font-size: 12.5px; }
.mp-msg.bad { color: var(--bad); }
.mp-msg.ok { color: var(--ink-mute); }
.mp-btn {
  font-family: var(--sans); font-size: 14px; font-weight: 500; color: #fff; cursor: pointer;
  background: var(--orange); border: none; border-radius: 6px; padding: 11px 16px;
}
.mp-btn:hover:not(:disabled) { background: var(--orange-deep); }
.mp-btn:disabled { opacity: .5; cursor: default; }
</style>
