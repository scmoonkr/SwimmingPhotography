// 대시보드 로그인 상태 — 서버 세션 쿠키(sp_sess)를 기준으로 한다.
// 쿠키는 httpOnly 라 JS 로 읽을 수 없으므로, 상태는 항상 /api/auth/me 로 확인한다.
// API 오류 → 사람이 읽을 문장.
// 서버가 꺼져 있으면 프록시가 { error: true, statusCode: 502 } 를 돌려준다 —
// error 를 그대로 쓰면 화면에 "true" 가 찍히므로 문자열일 때만 쓴다.
export function apiError(err: any, fallback = '요청을 처리하지 못했습니다.') {
  const d = err?.data
  if (typeof d?.error === 'string' && d.error) return d.error
  const code = err?.statusCode ?? err?.status ?? d?.statusCode
  if (code === 502 || code === 503 || code === 504 || err?.name === 'FetchError') {
    return 'API 서버에 연결할 수 없습니다. 서버(6640)가 실행 중인지 확인해주세요.'
  }
  if (typeof d?.message === 'string' && d.message) return d.message
  return fallback
}

export function useAuth() {
  const user = useState<any | null>('auth:user', () => null)
  const checked = useState<boolean>('auth:checked', () => false)
  const api = (p = '') => `${useRuntimeConfig().public.apiBase}/api/auth${p}`

  // SSR 에서는 브라우저 쿠키가 자동으로 따라가지 않는다 — 요청 헤더를 그대로 넘겨주는 fetch 를 쓴다.
  const rf = () => (import.meta.server ? useRequestFetch() : $fetch)

  const refresh = async () => {
    try {
      const r: any = await rf()(api('/me'))
      user.value = r?.user ?? null
    } catch {
      user.value = null
    }
    checked.value = true
    return user.value
  }

  // 라우트마다 다시 묻지 않는다 — 한 번 확인했으면 그 상태를 쓴다.
  const ensure = async () => (checked.value ? user.value : await refresh())

  const login = async (username: string, password: string) => {
    const r: any = await $fetch(api('/login'), { method: 'POST', body: { username, password } })
    user.value = r?.user ?? null
    checked.value = true
    return user.value
  }

  const logout = async () => {
    try { await $fetch(api('/logout'), { method: 'POST' }) } catch { /* 이미 끊겼어도 화면은 로그아웃 */ }
    user.value = null
    checked.value = true
    await navigateTo('/login')
  }

  const changePassword = (current: string, next: string) =>
    $fetch(api('/password'), { method: 'POST', body: { current, next } })

  const changeName = async (name: string) => {
    const r: any = await $fetch(api('/profile'), { method: 'POST', body: { name } })
    if (r?.user) user.value = r.user
    return r
  }

  // 능력 기반 판단 — 역할 이름을 화면 코드에 흩뿌리지 않는다.
  // 서버(auth.js)가 역할 → 능력을 정하고 /auth/me 로 실어 보낸다.
  const can = (...need: string[]) => need.some((c) => (user.value?.can || []).includes(c))
  const isAdmin = computed(() => can('users'))

  // 로그인 직후·권한 없는 경로에서 보낼 곳 — 그 계정이 실제로 쓸 수 있는 첫 화면.
  const homePath = () => (can('data') ? '/' : can('breaking') ? '/breaking-news' : can('articles') ? '/articles' : '/')

  return { user, checked, isAdmin, can, homePath, refresh, ensure, login, logout, changePassword, changeName, api }
}
