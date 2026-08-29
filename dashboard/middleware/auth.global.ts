// 로그인 안 한 상태면 어디로 들어와도 /login 으로 보낸다.
// 로그인했더라도 그 계정의 능력에 없는 화면이면 쓸 수 있는 첫 화면으로 돌려보낸다.
// 서버 API 쪽에서도 쓰기를 막고 있어(app.js), 이 미들웨어는 화면 흐름만 담당한다.

// 경로 → 필요한 능력. 목록에 없는 경로는 누구나 볼 수 있다(로그인은 필요).
const NEED: Record<string, string[]> = {
  '/': ['data'],
  '/breaking-news': ['breaking'],
  '/meets': ['articles'],
  '/stories': ['articles'],
  '/competitions': ['data'],
  '/athletes': ['data'],
  '/times': ['data'],
  '/images': ['data'],
  '/venues': ['data'],
  '/teams': ['data'],
  '/start-list': ['data'],
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, ensure, can, homePath } = useAuth()
  await ensure()

  if (to.path === '/login') {
    return user.value ? navigateTo(homePath()) : undefined
  }
  if (!user.value) {
    // 로그인 뒤 원래 가려던 곳으로 돌려보내기 위해 경로를 들고 간다
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { r: to.fullPath } })
  }

  const need = NEED[to.path]
  if (need && !can(...need)) return navigateTo(homePath())
})
