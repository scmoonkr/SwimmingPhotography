<script setup lang="ts">
// 로그인 — 작업용 화면(imagesSelect 등)에 들어가기 위한 것. 대시보드와 같은 계정을 쓴다.
// 성공하면 원래 가려던 경로(?r=)로 돌아간다.
useHead({ title: '로그인 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const { login, ensure } = useAuth()
const route = useRoute()
// 외부 주소로 튕기지 않게 내부 경로만 허용 ('//host' 꼴도 막는다)
const back = computed(() => {
  const r = String(route.query.r || '')
  return r.startsWith('/') && !r.startsWith('//') ? r : '/'
})
// 이미 로그인돼 있으면 바로 보낸다
if (await ensure()) await navigateTo(back.value)

const username = ref('')
const password = ref('')
const busy = ref(false)
const msg = ref('')

const onSubmit = async () => {
  if (busy.value) return
  if (!username.value.trim() || !password.value) { msg.value = '아이디와 비밀번호를 입력하세요.'; return }
  busy.value = true; msg.value = ''
  try {
    await login(username.value.trim(), password.value)
    await navigateTo(back.value)
  } catch (err: any) {
    const e = err?.data?.error
    msg.value = typeof e === 'string' && e ? e : '로그인하지 못했습니다.'
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="lg">
    <form class="lg-form" @submit.prevent="onSubmit">
      <h1 class="lg-title">로그인</h1>
      <label class="lg-fld">
        <span class="lg-l">아이디</span>
        <input v-model="username" class="lg-input" type="text" autocomplete="username" autofocus>
      </label>
      <label class="lg-fld">
        <span class="lg-l">비밀번호</span>
        <input v-model="password" class="lg-input" type="password" autocomplete="current-password">
      </label>
      <p v-if="msg" class="lg-msg">{{ msg }}</p>
      <button class="lg-btn" type="submit" :disabled="busy">{{ busy ? '확인 중…' : '로그인' }}</button>
      <p class="lg-foot">관리자에게 계정을 발급받아 로그인하세요.</p>
    </form>
  </div>
</template>

<style scoped>
.lg { display: flex; justify-content: center; padding: 48px 0 80px; font-family: var(--sans); }
.lg-form { width: min(360px, 100%); display: flex; flex-direction: column; gap: 14px; }
.lg-title { margin: 0 0 6px; font-family: var(--serif); font-size: 22px; font-weight: 700; color: var(--ink); }
.lg-fld { display: flex; flex-direction: column; gap: 5px; }
.lg-l { font-size: 12px; color: var(--ink-light); }
.lg-input {
  font-family: var(--sans); font-size: 14px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px;
}
.lg-input:focus { outline: none; border-color: var(--orange); }
.lg-msg { margin: 0; font-size: 12.5px; color: var(--bad); }
.lg-btn {
  font-family: var(--sans); font-size: 14px; font-weight: 500; color: #fff; cursor: pointer;
  background: var(--orange); border: none; border-radius: 6px; padding: 11px 16px;
}
.lg-btn:hover:not(:disabled) { background: var(--orange-deep); }
.lg-btn:disabled { opacity: .5; cursor: default; }
.lg-foot { margin: 0; font-size: 12px; color: var(--ink-light); }
</style>
