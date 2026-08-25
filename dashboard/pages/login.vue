<script setup lang="ts">
// 로그인 — 아이디·비밀번호. 성공하면 원래 가려던 경로(?r=)로 돌아간다.
definePageMeta({ layout: 'auth' })
useHead({ title: '로그인 · Swimming Photography Dashboard' })

const { login, homePath } = useAuth()
const route = useRoute()

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
    // 외부 주소로 튕기지 않게 내부 경로만 허용. 원래 가려던 곳이 없으면 그 계정이 쓸 수 있는 첫 화면으로.
    const back = String(route.query.r || '')
    await navigateTo(back.startsWith('/') ? back : homePath())
  } catch (err: any) {
    msg.value = apiError(err, '로그인하지 못했습니다.')
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-card">
    <div class="lg-brand">
      <div class="bk">Swimming Photography<span>.</span></div>
      <div class="bs">Dashboard</div>
    </div>

    <form class="lg-form" @submit.prevent="onSubmit">
      <label class="lg-fld">
        <span class="lg-l">아이디</span>
        <input v-model="username" class="lg-input" type="text" autocomplete="username" autofocus>
      </label>
      <label class="lg-fld">
        <span class="lg-l">비밀번호</span>
        <input v-model="password" class="lg-input" type="password" autocomplete="current-password">
      </label>

      <p v-if="msg" class="lg-msg">{{ msg }}</p>

      <button class="btn btn-primary lg-btn" type="submit" :disabled="busy">{{ busy ? '확인 중…' : '로그인' }}</button>
    </form>

    <p class="lg-foot">관리자에게 계정을 발급받아 로그인하세요.</p>
  </div>
</template>

<style scoped>
.login-card {
  width: min(380px, 100%); background: var(--paper); border: 1px solid var(--line);
  border-radius: 12px; padding: 34px 32px 26px; box-shadow: 0 18px 44px rgba(26, 26, 26, .10);
}
.lg-brand { text-align: center; margin-bottom: 26px; }
.lg-brand .bk { font-family: var(--serif); font-weight: 700; font-size: 20px; color: var(--ink); }
.lg-brand .bk span { color: var(--orange); }
.lg-brand .bs { font-size: 11px; color: var(--ink-light); letter-spacing: .12em; text-transform: uppercase; margin-top: 4px; }

.lg-form { display: flex; flex-direction: column; gap: 14px; }
.lg-fld { display: flex; flex-direction: column; gap: 6px; }
.lg-l { font-size: 11.5px; color: var(--ink-light); }
.lg-input {
  font-family: var(--sans); font-size: 14px; color: var(--ink); background: var(--paper);
  border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; width: 100%;
}
.lg-input:focus { outline: none; border-color: var(--orange); }
.lg-msg { margin: 0; font-size: 12.5px; color: var(--bad); background: var(--bad-bg); border-radius: 6px; padding: 9px 11px; }
.lg-btn { justify-content: center; width: 100%; padding: 11px; font-size: 13.5px; }
.lg-btn:disabled { opacity: .6; cursor: default; }
.lg-foot { margin: 18px 0 0; text-align: center; font-size: 11.5px; color: var(--ink-light); }
</style>
