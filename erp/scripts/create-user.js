// 업무관리 계정 만들기 / 비밀번호 바꾸기 (터미널용 — 첫 admin 을 만들 때 쓴다)
//
//   node erp/scripts/create-user.js <아이디> <비밀번호> [admin|manager|manager/order|manager/work|manager/order,work|worker|viewer]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { users, hashPassword, passwordProblem, ROLES } = await import('../src/auth.js')
const { getClient } = await import('../src/db.js')

const [username, password, roleArg = 'manager'] = process.argv.slice(2)
// 권한 인자: <role> 또는 <role>/<업무,업무>  예) manager/order,work · manager/work · worker
const [role, jobsArg = ''] = roleArg.split('/')
const jobs = jobsArg.split(',').map((x) => x.trim()).filter(Boolean)
const die = (m) => { console.log(m); process.exit(1) }

if (!username || !password) die('사용법: node erp/scripts/create-user.js <아이디> <비밀번호> [admin|manager|manager/order|manager/work|manager/order,work|worker|viewer]')
if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) die('아이디는 영문·숫자·._- 조합 3~32자로 입력하세요.')
if (jobs.some((j) => !['order', 'work'].includes(j))) die('업무는 order · work 만 가능합니다. 예: manager/order,work')
if (jobs.length && role !== 'manager') die('업무(job)는 manager 권한에만 지정할 수 있습니다.')
if (!ROLES.includes(role)) die(`권한은 ${ROLES.join(' · ')} 중 하나여야 합니다.`)
const bad = passwordProblem(password)
if (bad) die(bad)

const c = await users()
const exists = await c.findOne({ username })
await c.updateOne(
  { username },
  {
    $set: { username, name: exists?.name || username, role, jobs, password: hashPassword(password), updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
)
console.log(exists ? `${username} 계정을 갱신했습니다. (권한: ${role}${jobs.length ? '/' + jobs.join(',') : ''})` : `${username} 계정을 만들었습니다. (권한: ${role}${jobs.length ? '/' + jobs.join(',') : ''})`)
await (await getClient()).close()
