// ESC 로 닫기 — 드로어 안에 포커스가 없어도(표의 행을 눌러 열었을 때 포커스는 바깥에 남는다) 닫히게 window 에서 듣는다.
// 여러 개가 겹쳐 열려 있으면 가장 나중에 열린 것만 닫는다. 안쪽(입력칸 · 확대 보기)이 ESC 를 이미 처리했으면(preventDefault · stopPropagation) 건드리지 않는다.
const stack: symbol[] = []
let hooked = false
const handlers = new Map<symbol, () => void>()
const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || e.defaultPrevented || !stack.length) return
  const top = stack[stack.length - 1]
  handlers.get(top)?.()
}

export function useEscClose(isOpen: () => boolean, close: () => void) {
  const id = Symbol('esc')
  const leave = () => { const i = stack.indexOf(id); if (i >= 0) stack.splice(i, 1) }
  onMounted(() => {
    if (!hooked) { window.addEventListener('keydown', onKey); hooked = true }
    handlers.set(id, close)
  })
  watch(isOpen, (v) => { leave(); if (v) stack.push(id) }, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => { leave(); handlers.delete(id) })
}
