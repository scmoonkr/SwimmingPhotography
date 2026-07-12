<script setup lang="ts">
// 결과 표시 전용 모달 — 검색은 호출측(필터 바)에서 하고, rows 를 받아 목록으로 보여준다.
defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  loading?: boolean
  columns: { key: string; label: string; cls?: string }[]
  rows: any[]
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', row: any): void }>()
</script>

<template>
  <div class="picker" :class="{ open }" @keydown.esc="emit('close')">
    <div class="picker-ov" @click="emit('close')" />
    <div class="picker-box" role="dialog" aria-modal="true">
      <header class="picker-head">
        <div>
          <h2>{{ title || '검색' }}</h2>
          <p v-if="subtitle" class="picker-sub">{{ subtitle }}</p>
        </div>
        <button class="picker-x" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div class="picker-list">
        <p v-if="loading" class="picker-empty">검색 중…</p>
        <p v-else-if="!rows.length" class="picker-empty">결과가 없습니다.</p>
        <button
          v-for="(r, i) in rows" :key="i" type="button" class="picker-row"
          @click="emit('select', r)"
        >
          <span v-for="c in columns" :key="c.key" class="pr-cell" :class="c.cls">{{ r[c.key] }}</span>
        </button>
      </div>

      <footer class="picker-foot">
        <span class="picker-count">{{ rows.length }}건</span>
        <button class="btn btn-ghost" type="button" @click="emit('close')">닫기</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.picker { position: fixed; inset: 0; z-index: 1100; display: none; }
.picker.open { display: block; }
.picker-ov { position: absolute; inset: 0; background: rgba(26, 26, 26, .38); }
.picker-box {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(680px, 94vw); max-height: 84vh; background: var(--paper);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 24px 60px rgba(26, 26, 26, .22);
  display: flex; flex-direction: column; overflow: hidden;
}
.picker-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.picker-head h2 { font-size: 15px; font-weight: 700; color: var(--ink); }
.picker-sub { font-size: 12px; color: var(--ink-mute); margin-top: 3px; }
.picker-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.picker-x:hover { color: var(--ink); }

.picker-list { flex: 1; overflow-y: auto; padding: 6px 0; }
.picker-empty { text-align: center; color: var(--ink-light); font-size: 13px; padding: 32px 0; }
.picker-row {
  display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 14px;
  width: 100%; text-align: left; background: none; border: none; cursor: pointer;
  padding: 11px 20px; border-bottom: 1px solid var(--line-soft); font-family: var(--sans);
}
.picker-row:hover { background: var(--orange-bg); }
.pr-cell { font-size: 13px; color: var(--ink-soft); white-space: nowrap; }
.pr-cell.strong { color: var(--ink); font-weight: 700; white-space: normal; }
.pr-cell.mono { font-family: var(--mono); color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.pr-cell.muted { color: var(--ink-light); }

.picker-foot { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-top: 1px solid var(--line); }
.picker-count { font-size: 12.5px; color: var(--ink-mute); }
</style>
