<script setup lang="ts">
// 정보변경 — 이름·비밀번호 변경. 관리자면 계정 관리 탭이 하나 더 붙는다.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { user, isAdmin, changePassword, changeName, api } = useAuth()
const tab = ref<'me' | 'users'>('me')

// ── 이름 ──
const name = ref('')
const nameMsg = ref('')
const nameBusy = ref(false)
const onName = async () => {
  if (nameBusy.value) return
  nameBusy.value = true; nameMsg.value = ''
  try {
    await changeName(name.value.trim())
    nameMsg.value = '이름을 바꿨습니다.'
  } catch (err: any) {
    nameMsg.value = apiError(err, '바꾸지 못했습니다.')
  } finally { nameBusy.value = false }
}

// ── 비밀번호 ──
const cur = ref(''); const nw = ref(''); const nw2 = ref('')
const pwMsg = ref(''); const pwOk = ref(false); const pwBusy = ref(false)
const onPw = async () => {
  if (pwBusy.value) return
  pwOk.value = false; pwMsg.value = ''
  if (nw.value !== nw2.value) { pwMsg.value = '새 비밀번호가 서로 다릅니다.'; return }
  pwBusy.value = true
  try {
    await changePassword(cur.value, nw.value)
    pwOk.value = true
    pwMsg.value = '비밀번호를 바꿨습니다. 다른 기기의 로그인은 모두 해제됐습니다.'
    cur.value = ''; nw.value = ''; nw2.value = ''
  } catch (err: any) {
    pwMsg.value = apiError(err, '바꾸지 못했습니다.')
  } finally { pwBusy.value = false }
}

// ── 계정 관리 (관리자) ──
const rows = ref<any[]>([])
const uMsg = ref('')
const loadUsers = async () => {
  try { rows.value = await $fetch<any[]>(api('/users')) } catch (err: any) { uMsg.value = apiError(err, '') }
}
const nu = ref({ username: '', name: '', password: '', role: 'editor' })
const onAdd = async () => {
  uMsg.value = ''
  try {
    await $fetch(api('/users'), { method: 'POST', body: { ...nu.value } })
    nu.value = { username: '', name: '', password: '', role: 'editor' }
    await loadUsers()
  } catch (err: any) { uMsg.value = apiError(err, '추가하지 못했습니다.') }
}
const onDel = async (u: any) => {
  if (!confirm(u.username + ' 계정을 삭제할까요?')) return
  uMsg.value = ''
  try {
    await $fetch(api('/users/' + encodeURIComponent(u.username)), { method: 'DELETE' })
    await loadUsers()
  } catch (err: any) { uMsg.value = apiError(err, '삭제하지 못했습니다.') }
}
const onReset = async (u: any) => {
  const pw = prompt(u.username + ' 의 새 비밀번호 (영문+숫자 7자 이상)')
  if (!pw) return
  uMsg.value = ''
  try {
    await $fetch(api('/users/' + encodeURIComponent(u.username) + '/password'), { method: 'POST', body: { password: pw } })
    uMsg.value = u.username + ' 비밀번호를 새로 지정했습니다. 그 계정의 기존 로그인은 해제됐습니다.'
  } catch (err: any) { uMsg.value = apiError(err, '바꾸지 못했습니다.') }
}

// 열릴 때마다 초기화 — 닫았다 다시 열면 이전 입력·메시지가 남지 않는다.
watch(() => props.open, (v) => {
  if (!v) return
  tab.value = 'me'
  name.value = user.value?.name || ''
  nameMsg.value = ''; pwMsg.value = ''; pwOk.value = false; uMsg.value = ''
  cur.value = ''; nw.value = ''; nw2.value = ''
  if (isAdmin.value) loadUsers()
})
const fmt = (d: any) => (d ? String(d).slice(0, 10) : '—')

// 권한 표시 — 서버 auth.js 의 ROLES 와 같은 목록
const ROLE_LABEL: Record<string, string> = { admin: '관리자', editor: '편집자', breakingnews: '속보 전담' }
const roleLabel = (r: string) => ROLE_LABEL[r] || r
</script>

<template>
  <div class="acc" :class="{ open }" @keydown.esc="emit('close')">
    <div class="acc-ov" @click="emit('close')" />
    <div class="acc-box" role="dialog" aria-modal="true" aria-label="정보변경">
      <header class="acc-head">
        <h2>정보변경</h2>
        <button class="acc-x" type="button" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div v-if="isAdmin" class="acc-tabs">
        <button type="button" class="acc-tab" :class="{ on: tab === 'me' }" @click="tab = 'me'">내 정보</button>
        <button type="button" class="acc-tab" :class="{ on: tab === 'users' }" @click="tab = 'users'">계정 관리</button>
      </div>

      <div class="acc-body">
        <template v-if="tab === 'me'">
          <p class="acc-who">
            <b>{{ user?.username }}</b>
            <span class="acc-role">{{ roleLabel(user?.role) }}</span>
          </p>

          <section class="acc-sec">
            <h3>이름</h3>
            <div class="acc-row">
              <input v-model="name" class="acc-input" type="text" placeholder="화면에 표시할 이름">
              <button class="btn btn-ghost" type="button" :disabled="nameBusy" @click="onName">변경</button>
            </div>
            <p v-if="nameMsg" class="acc-msg">{{ nameMsg }}</p>
          </section>

          <section class="acc-sec">
            <h3>비밀번호 변경</h3>
            <form class="acc-form" @submit.prevent="onPw">
              <input v-model="cur" class="acc-input" type="password" autocomplete="current-password" placeholder="현재 비밀번호">
              <input v-model="nw" class="acc-input" type="password" autocomplete="new-password" placeholder="새 비밀번호 (영문+숫자 7자 이상)">
              <input v-model="nw2" class="acc-input" type="password" autocomplete="new-password" placeholder="새 비밀번호 확인">
              <p v-if="pwMsg" class="acc-msg" :class="{ ok: pwOk }">{{ pwMsg }}</p>
              <button class="btn btn-primary" type="submit" :disabled="pwBusy">{{ pwBusy ? '바꾸는 중…' : '비밀번호 변경' }}</button>
            </form>
          </section>
        </template>

        <template v-else>
          <section class="acc-sec">
            <h3>계정 추가</h3>
            <div class="acc-grid">
              <input v-model="nu.username" class="acc-input" type="text" placeholder="아이디 (영문·숫자)">
              <input v-model="nu.name" class="acc-input" type="text" placeholder="이름">
              <input v-model="nu.password" class="acc-input" type="password" placeholder="비밀번호 (영문+숫자 7자 이상)">
              <select v-model="nu.role" class="acc-input">
                <option value="editor">편집자 — 전체</option>
                <option value="breakingnews">속보 전담 — 속보만</option>
                <option value="admin">관리자 — 전체 + 계정</option>
              </select>
            </div>
            <button class="btn btn-ghost acc-add" type="button" @click="onAdd">추가</button>
          </section>

          <section class="acc-sec">
            <h3>계정 목록</h3>
            <table class="acc-table">
              <thead><tr><th>아이디</th><th>이름</th><th>권한</th><th>최근 로그인</th><th /></tr></thead>
              <tbody>
                <tr v-for="u in rows" :key="u.username">
                  <td class="strong">{{ u.username }}</td>
                  <td>{{ u.name }}</td>
                  <td>{{ roleLabel(u.role) }}</td>
                  <td class="mute">{{ fmt(u.lastLoginAt) }}</td>
                  <td class="acc-act">
                    <button class="lnk" type="button" @click="onReset(u)">비번 초기화</button>
                    <button class="lnk bad" type="button" @click="onDel(u)">삭제</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
          <p v-if="uMsg" class="acc-msg">{{ uMsg }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acc { position: fixed; inset: 0; z-index: 1200; display: none; }
.acc.open { display: block; }
.acc-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .38); }
.acc-box {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(560px, 94vw); max-height: 86vh; background: var(--paper);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 24px 60px rgba(26, 26, 26, .22);
  display: flex; flex-direction: column; overflow: hidden;
}
.acc-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--line); }
.acc-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); }
.acc-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.acc-x:hover { color: var(--ink); }

.acc-tabs { display: flex; gap: 2px; padding: 0 20px; border-bottom: 1px solid var(--line-soft); }
.acc-tab { border: none; background: none; cursor: pointer; font-family: var(--sans); font-size: 12.5px; color: var(--ink-mute); padding: 10px 10px; border-bottom: 2px solid transparent; }
.acc-tab.on { color: var(--ink); font-weight: 700; border-bottom-color: var(--orange); }

.acc-body { padding: 18px 20px 22px; overflow-y: auto; }
.acc-who { margin: 0 0 16px; font-size: 13px; color: var(--ink); }
.acc-role { margin-left: 8px; font-size: 11px; color: var(--orange); background: var(--orange-bg); border-radius: 4px; padding: 2px 7px; }

.acc-sec { margin-bottom: 22px; }
.acc-sec:last-child { margin-bottom: 0; }
.acc-sec h3 { font-size: 12px; font-weight: 700; color: var(--ink-light); letter-spacing: .04em; margin-bottom: 8px; }
.acc-row { display: flex; gap: 8px; }
.acc-row .acc-input { flex: 1; min-width: 0; }
.acc-form { display: flex; flex-direction: column; gap: 8px; }
.acc-form .btn { align-self: flex-start; }
.acc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.acc-add { margin-top: 8px; }
.acc-input {
  font-family: var(--sans); font-size: 13px; color: var(--ink); background: var(--paper);
  border: 1px solid var(--line); border-radius: 6px; padding: 9px 11px; width: 100%;
}
.acc-input:focus { outline: none; border-color: var(--orange); }
.acc-msg { margin: 8px 0 0; font-size: 12.5px; color: var(--bad); }
.acc-msg.ok { color: var(--good); }

.acc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.acc-table th, .acc-table td { padding: 7px 6px; text-align: left; border-bottom: 1px solid var(--line-soft); }
.acc-table th { font-size: 11px; font-weight: 600; color: var(--ink-light); }
.acc-table td.strong { font-weight: 700; }
.acc-table td.mute { color: var(--ink-light); font-variant-numeric: tabular-nums; }
.acc-act { text-align: right; white-space: nowrap; }
.lnk { border: none; background: none; cursor: pointer; font-family: var(--sans); font-size: 12px; color: var(--ink-mute); padding: 2px 4px; }
.lnk:hover { color: var(--ink); text-decoration: underline; }
.lnk.bad { color: var(--bad); }
</style>
