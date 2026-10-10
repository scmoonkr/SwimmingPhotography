// 로그인한 사람만 들어오는 화면용 — definePageMeta({ middleware: 'auth' }) 로 건다.
// 로그인하지 않았으면 /login 으로 보내고, 로그인 뒤 돌아올 경로(?r=)를 들려 보낸다.
export default defineNuxtRouteMiddleware(async (to) => {
  const { ensure } = useAuth()
  if (!(await ensure())) return navigateTo({ path: '/login', query: { r: to.fullPath } })
})
