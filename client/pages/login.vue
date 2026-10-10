<script setup lang="ts">
// 로그인 — 작업용 화면(images · videos 등)에 들어가기 위한 것.
//   네이버 로그인: 일반 회원용. 처음이면 그 자리에서 회원으로 가입된다(회원가입 = 네이버 로그인).
//   아이디·비밀번호: 운영진 계정(대시보드와 같은 계정).
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

// 네이버 로그인 주소 — 서버가 네이버 동의 화면으로 보냈다가, 끝나면 r 로 돌려보낸다(페이지 전체 이동)
const naverUrl = computed(() => `/api/auth/naver?r=${encodeURIComponent(back.value)}`)
// 네이버 로그인에서 돌아온 오류(?e=)
const NAVER_ERR: Record<string, string> = {
  naver_config: '네이버 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.',
  naver_denied: '네이버 로그인을 취소했습니다.',
  naver_state: '로그인 시간이 지났습니다. 다시 시도해 주세요.',
  naver_token: '네이버 로그인에 실패했습니다. 다시 시도해 주세요.',
  naver_profile: '네이버 회원 정보를 받지 못했습니다. 다시 시도해 주세요.',
  naver_error: '네이버 로그인 중 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.',
  disabled: '사용이 중지된 계정입니다. 관리자에게 문의하세요.',
}
const naverMsg = computed(() => NAVER_ERR[String(route.query.e || '')] || '')

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
    <div class="lg-form">
      <h1 class="lg-title">로그인</h1>

      <!-- 네이버 — 일반 회원. 처음이면 바로 가입된다 -->
      <p v-if="naverMsg" class="lg-msg">{{ naverMsg }}</p>
      <a class="nv-btn" :href="naverUrl">
        <span class="nv-n" aria-hidden="true">N</span>네이버 로그인
      </a>
      <p class="lg-join">
        처음이신가요? <a class="lg-link" :href="naverUrl">회원가입(네이버)</a>
        <span class="lg-sub">네이버로 로그인하면 바로 가입됩니다.</span>
      </p>

      <div class="lg-or"><span>운영진 계정</span></div>

      <form class="lg-pw" @submit.prevent="onSubmit">
        <label class="lg-fld">
          <span class="lg-l">아이디</span>
          <input v-model="username" class="lg-input" type="text" autocomplete="username">
        </label>
        <label class="lg-fld">
          <span class="lg-l">비밀번호</span>
          <input v-model="password" class="lg-input" type="password" autocomplete="current-password">
        </label>
        <p v-if="msg" class="lg-msg">{{ msg }}</p>
        <button class="lg-btn" type="submit" :disabled="busy">{{ busy ? '확인 중…' : '로그인' }}</button>
      </form>
    </div>
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
.lg-pw { display: flex; flex-direction: column; gap: 14px; }
/* 네이버 로그인 단추 — 네이버 초록 */
.nv-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px;
  font-size: 15px; font-weight: 700; color: #fff; text-decoration: none; background: #03C75A; border-radius: 6px;
}
.nv-btn:hover { background: #02b351; }
.nv-n { font-family: Arial, sans-serif; font-size: 17px; font-weight: 900; line-height: 1; }
.lg-join { margin: 0; font-size: 13px; color: var(--ink-mute); }
.lg-link { color: var(--ink); font-weight: 700; text-decoration: underline; }
.lg-link:hover { color: var(--orange); }
.lg-sub { display: block; margin-top: 3px; font-size: 12px; color: var(--ink-light); }
/* 구분선 — 운영진 계정 */
.lg-or { display: flex; align-items: center; gap: 10px; margin: 10px 0 0; font-size: 12px; color: var(--ink-light); }
.lg-or::before, .lg-or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
</style>
