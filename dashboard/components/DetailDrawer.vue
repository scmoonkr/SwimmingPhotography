<script setup lang="ts">
// 우측 슬라이드 드로어 — 필드(get/set) 정의로 임의의 스키마(중첩 포함)를 편집.
import { ref, watch } from 'vue'
import type { Field } from '~/composables/useMock'

const props = defineProps<{
  open: boolean
  title?: string
  fields: Field[]
  row: Record<string, any> | null
  width?: string   // 드로어 폭 (기본 min(460px, 92vw))
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'save', v: Record<string, any>): void; (e: 'delete'): void }>()

// 필드별 편집값
const form = ref<Record<string, any>>({})
watch(
  () => props.row,
  (r) => {
    const next: Record<string, any> = {}
    if (r) for (const f of props.fields) next[f.key] = f.get(r)
    form.value = next
  },
  { immediate: true, deep: true },
)

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
</script>

<template>
  <div class="drawer-root" :class="{ open }" @keydown="onKey">
    <div class="drawer-ov" @click="emit('close')" />
    <aside class="drawer" role="dialog" aria-modal="true" :aria-label="title || '편집'" :style="width ? { width } : undefined">
      <header class="drawer-head">
        <h2>{{ title || '편집' }}</h2>
        <button class="drawer-x" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div class="drawer-body">
        <slot name="body-top" />
        <label
          v-for="f in fields" :key="f.key" class="field" :class="{ half: f.half }"
          :style="f.span ? { gridColumn: `span ${f.span}` } : undefined"
        >
          <span class="field-label">{{ f.label }}</span>
          <select v-if="f.type === 'select'" v-model="form[f.key]" class="field-input">
            <option v-for="o in f.options || []" :key="o" :value="o">{{ o }}</option>
          </select>
          <textarea v-else-if="f.type === 'textarea'" v-model="form[f.key]" class="field-input field-area" :rows="f.rows || 7" />
          <!-- 체크박스 (불리언) -->
          <span v-else-if="f.type === 'checkbox'" class="field-check">
            <input type="checkbox" v-model="form[f.key]">
            <span class="field-check-on">{{ form[f.key] ? (f.options?.[0] || '켜짐') : (f.options?.[1] || '꺼짐') }}</span>
          </span>
          <!-- 표시전용: 읽기 텍스트 -->
          <div v-else-if="f.type === 'meta'" class="field-meta">{{ form[f.key] || '—' }}</div>
          <!-- 표시전용: 이미지 썸네일 줄 -->
          <div v-else-if="f.type === 'thumbs'" class="field-thumbs">
            <template v-if="(form[f.key] || []).length">
              <img v-for="(u, i) in form[f.key]" :key="i" :src="'/' + String(u).replace(/^\/?/, '')" class="thumb-img" alt="">
            </template>
            <span v-else class="field-meta">—</span>
          </div>
          <!-- 표시전용: URL -->
          <a v-else-if="f.type === 'link'" class="field-link" :href="form[f.key] || undefined" target="_blank" rel="noopener">{{ form[f.key] || '—' }}</a>
          <input v-else v-model="form[f.key]" class="field-input" type="text">
        </label>
        <slot name="body-bottom" :row="row" />
      </div>

      <footer class="drawer-foot">
        <div class="foot-left">
          <button v-if="row && row._id" class="btn btn-danger" type="button" @click="emit('delete')">삭제</button>
          <slot name="foot-actions" />
        </div>
        <div class="foot-right">
          <button class="btn btn-ghost" type="button" @click="emit('close')">취소</button>
          <button class="btn btn-primary" type="button" @click="emit('save', { ...form })">저장</button>
        </div>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.drawer-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-ov {
  position: absolute; inset: 0; background: rgba(26, 26, 26, .34);
  opacity: 0; transition: opacity .22s ease;
}
.drawer {
  position: absolute; top: 0; right: 0; height: 100%;
  width: min(920px, 96vw); background: var(--paper);
  border-left: 1px solid var(--line); box-shadow: -18px 0 50px rgba(26, 26, 26, .12);
  display: flex; flex-direction: column;
  transform: translateX(100%); transition: transform .26s cubic-bezier(.4, 0, .2, 1);
}
.drawer-root.open { pointer-events: auto; }
.drawer-root.open .drawer-ov { opacity: 1; }
.drawer-root.open .drawer { transform: translateX(0); }

.drawer-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 18px 22px; border-bottom: 1px solid var(--line);
}
.drawer-head h2 { font-size: 16px; font-weight: 700; color: var(--ink); }
.drawer-x { border: none; background: none; cursor: pointer; font-size: 22px; line-height: 1; color: var(--ink-light); padding: 0; }
.drawer-x:hover { color: var(--ink); }

/* 4열 그리드 — 기본은 한 줄 전체(span 4), half 는 반 줄(span 2). 세밀 배치는 field.span(1~4). */
.drawer-body { flex: 1; overflow-y: auto; padding: 20px 22px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-content: start; }
.field { grid-column: span 4; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field.half { grid-column: span 2; }
.field-label { font-size: 12px; font-weight: 700; color: var(--ink-mute); }
.field-input {
  font-family: var(--sans); font-size: 13.5px; color: var(--ink);
  background: var(--paper-deep); border: 1px solid transparent; border-radius: 6px;
  padding: 9px 11px; width: 100%;
}
.field-input:focus { outline: none; border-color: var(--orange); background: var(--paper); }
.field-area { resize: vertical; line-height: 1.6; }

/* 표시전용 필드 */
.field-meta { font-size: 13.5px; color: var(--ink); padding: 2px 0; }
.field-thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
.field-thumbs .thumb-img {
  width: 96px; height: 72px; object-fit: cover; border-radius: 6px;
  border: 1px solid var(--line); background: var(--paper-deep);
}
.field-link { font-size: 13px; color: var(--orange); word-break: break-all; text-decoration: none; }
.field-link:hover { text-decoration: underline; }
.field-check { display: flex; align-items: center; gap: 8px; padding: 9px 0; }
.field-check input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--orange); }
.field-check-on { font-size: 13.5px; color: var(--ink); }

.drawer-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 14px 22px; border-top: 1px solid var(--line);
}
.foot-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; }
.foot-right { display: flex; gap: 8px; flex: 0 0 auto; }
.foot-right .btn { white-space: nowrap; }
.btn-danger { background: var(--bad-bg); color: var(--bad); }
.btn-danger:hover { background: var(--bad); color: #fff; }
</style>
