// 업무관리 계정 만들기 / 비밀번호 바꾸기 (터미널용 — 첫 admin 을 만들 때 쓴다)
//
//   node backend/scripts/create-user.js <아이디> <비밀번호> [admin|manager|viewer]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { users, hashPassword, passwordProblem, ROLES } = await import('../src/auth.js')
const { getClient } = await import('../src/db.js')

const [username, password, role = 'manager'] = process.argv.slice(2)
const die = (m) => { console.log(m); process.exit(1) }

if (!username || !password) die('사용법: node backend/scripts/create-user.js <아이디> <비밀번호> [admin|manager|viewer]')
if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) die('아이디는 영문·숫자·._- 조합 3~32자로 입력하세요.')
if (!ROLES.includes(role)) die(`권한은 ${ROLES.join(' · ')} 중 하나여야 합니다.`)
const bad = passwordProblem(password)
if (bad) die(bad)

const c = await users()
const exists = await c.findOne({ username })
await c.updateOne(
  { username },
  {
    $set: { username, name: exists?.name || username, role, password: hashPassword(password), updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
)
console.log(exists ? `${username} 계정을 갱신했습니다. (권한: ${role})` : `${username} 계정을 만들었습니다. (권한: ${role})`)
await (await getClient()).close()
