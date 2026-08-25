// 대시보드 계정 만들기 / 비밀번호 바꾸기 (터미널용)
//
//   node server/scripts/create-user.js <아이디> <비밀번호> [admin|editor|breakingnews]
//
// 같은 아이디가 이미 있으면 비밀번호(와 권한)를 덮어쓴다 — 비밀번호를 잊었을 때의 복구 수단.
// 첫 관리자 계정을 만들 때 쓰고, 그 뒤로는 대시보드의 정보변경 > 계정 관리에서 관리한다.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { users, hashPassword, passwordProblem, ROLES } = await import('../src/auth.js')
const { getClient } = await import('../src/db.js')

const [username, password, role = 'editor'] = process.argv.slice(2)

if (!username || !password) {
  console.log('사용법: node server/scripts/create-user.js <아이디> <비밀번호> [admin|editor|breakingnews]')
  process.exit(1)
}
if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
  console.log('아이디는 영문·숫자·._- 조합 3~32자로 입력하세요.')
  process.exit(1)
}
if (!ROLES.includes(role)) {
  console.log(`권한은 ${ROLES.join(' · ')} 중 하나여야 합니다.`)
  process.exit(1)
}
const bad = passwordProblem(password)
if (bad) {
  console.log(bad)
  process.exit(1)
}

const c = await users()
const exists = await c.findOne({ username })
await c.updateOne(
  { username },
  {
    $set: {
      username,
      name: exists?.name || username,
      role,
      password: hashPassword(password),
      updatedAt: new Date(),
    },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
)
console.log(exists ? `${username} 계정의 비밀번호를 바꿨습니다. (권한: ${role})` : `${username} 계정을 만들었습니다. (권한: ${role})`)
await (await getClient()).close()
