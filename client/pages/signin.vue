<script setup lang="ts">
// 로그인 — 작업용 화면(images · videos 등)에 들어가기 위한 것.
//   네이버 로그인만 쓴다. 처음이면 그 자리에서 회원으로 가입되고 내 정보(/my/page)로 간다(회원가입 = 네이버 로그인).
// 성공하면 원래 가려던 경로(?r=)로 돌아간다. (운영진 아이디·비밀번호 로그인은 대시보드에서 한다)
useHead({ title: '로그인 — Swimming Photography', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const { ensure } = useAuth()
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
    </div>
  </div>
</template>

<style scoped>
.lg { display: flex; justify-content: center; padding: 48px 0 80px; font-family: var(--sans); }
.lg-form { width: min(360px, 100%); display: flex; flex-direction: column; gap: 14px; }
.lg-title { margin: 0 0 6px; font-family: var(--serif); font-size: 22px; font-weight: 700; color: var(--ink); }
.lg-msg { margin: 0; font-size: 12.5px; color: var(--bad); }
/* 네이버 로그인 단추 — 네이버 초록 */
.nv-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px;
  font-size: 15px; font-weight: 700; color: #fff; text-decoration: none; background: #03C75A; border-radius: 6px;
}
.nv-btn:hover { background: #02b351; }
.nv-n { font-family: Arial, sans-serif; font-size: 17px; font-weight: 900; line-height: 1; }
</style>
