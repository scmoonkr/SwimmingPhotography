// 로그인 상태 — 서버 세션 쿠키(sp_sess) 기준. 대시보드와 같은 계정·같은 API(/api/auth)를 쓴다.
// 쿠키는 httpOnly 라 JS 로 읽을 수 없으므로 상태는 /api/auth/me 로 확인한다.
// 공개 사이트는 대부분 로그인이 필요 없다 — 작업용 화면(images)만 middleware 'auth' 로 막는다.
export function useAuth() {
  const user = useState<any | null>('auth:user', () => null)
  const checked = useState<boolean>('auth:checked', () => false)

  const refresh = async () => {
    try {
      // SSR 에서는 브라우저 쿠키가 자동으로 따라가지 않는다 — 요청 헤더를 넘겨주는 fetch 를 쓴다
      const f: any = import.meta.server ? useRequestFetch() : $fetch
      const r: any = await f('/api/auth/me')
      user.value = r?.user ?? null
    } catch {
      user.value = null
    }
    checked.value = true
    return user.value
  }
  // 한 번 확인했으면 그 상태를 쓴다
  const ensure = async () => (checked.value ? user.value : await refresh())

  const signin = async (username: string, password: string) => {
    const r: any = await $fetch('/api/auth/signin', { method: 'POST', body: { username, password } })
    user.value = r?.user ?? null
    checked.value = true
    return user.value
  }

  // 로그아웃 — 서버 세션을 끊고 쿠키를 지운다. 이미 끊겼어도 화면은 로그아웃 상태로 둔다.
  const logout = async () => {
    try { await $fetch('/api/auth/logout', { method: 'POST' }) } catch { /* 이미 끊김 */ }
    user.value = null
    checked.value = true
  }

  return { user, checked, ensure, refresh, signin, logout }
}
