import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

/** Animates a number from 0 (or the previous value) to `target` whenever it changes. */
export function useCountUp(target: () => number, duration = 900, ease = easeOutCubic): Ref<number> {
  const shown = ref(0)
  let raf = 0
  const run = (to: number) => {
    cancelAnimationFrame(raf)
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') { shown.value = to; return }
    const from = shown.value
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      shown.value = from + (to - from) * ease(t)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }
  watch(target, run, { immediate: true })
  onBeforeUnmount(() => cancelAnimationFrame(raf))
  return shown
}

/** A clock that ticks every `ms`, for "synced 5 s ago" style text. */
export function useNow(ms = 1000): Ref<number> {
  const now = ref(Date.now())
  let id: ReturnType<typeof setInterval> | undefined
  onMounted(() => { id = setInterval(() => { now.value = Date.now() }, ms) })
  onBeforeUnmount(() => clearInterval(id))
  return now
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, reducedMotion() ? 0 : ms))
