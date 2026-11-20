/**
 * Shared state for the presenter and audience windows: the steps, the current step and blanking.
 * Windows on the same computer stay in step over BroadcastChannel (no network involved), and the
 * current step survives a reload of either window.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { data } from '../../store'
import { buildSteps } from '../../presentation'

interface Msg { type: 'state' | 'hello'; index?: number; blank?: boolean }

export function useDeck(eventId: () => number, role: 'presenter' | 'audience') {
  const event = computed(() => data.events.find(e => e.id === eventId()))
  const steps = computed(() => (event.value ? buildSteps(event.value, data.judges, data.scores) : []))
  const storeKey = `tab_present_${eventId()}`
  const saved = Number(localStorage.getItem(storeKey))
  const index = ref(Number.isFinite(saved) && saved > 0 ? saved : 0)
  const blank = ref(false)
  const startedAt = ref<number | null>(null)

  const ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`tab-present-${eventId()}`) : null
  let last: { index: number; blank: boolean } | null = null
  const post = () => ch?.postMessage({ type: 'state', index: index.value, blank: blank.value } satisfies Msg)

  if (ch) {
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data
      if (m.type === 'state' && typeof m.index === 'number') {
        last = { index: m.index, blank: !!m.blank }
        index.value = m.index
        blank.value = !!m.blank
      } else if (m.type === 'hello' && role === 'presenter') {
        post()
      }
    }
  }

  watch([index, blank], ([i, b]) => {
    try { localStorage.setItem(storeKey, String(i)) } catch { /* private mode */ }
    if (i > 0 && startedAt.value === null) startedAt.value = Date.now()
    if (last && last.index === i && last.blank === b) return
    last = null
    post()
  })

  const lastIndex = computed(() => Math.max(0, steps.value.length - 1))
  const next = () => {
    if (blank.value) { blank.value = false; return }
    if (index.value < lastIndex.value) index.value++
  }
  const prev = () => { if (index.value > 0) index.value-- }
  const go = (i: number) => { index.value = Math.min(Math.max(0, i), lastIndex.value) }
  const toggleBlank = () => { blank.value = !blank.value }
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': next(); break
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': prev(); break
      case 'b': case 'B': case '.': case 'w': case 'W': toggleBlank(); break
      case 'f': case 'F': fullscreen(); break
      case 'Home': go(0); break
      case 'End': go(lastIndex.value); break
      default: return
    }
    e.preventDefault()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKey)
    if (role === 'audience') ch?.postMessage({ type: 'hello' } satisfies Msg)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    ch?.close()
  })

  return { event, steps, index, blank, startedAt, next, prev, go, toggleBlank, fullscreen }
}
