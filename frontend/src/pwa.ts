import { reactive } from 'vue'

/**
 * Installable, offline-capable app.
 *
 * The service worker only runs in a secure context: https (Caddy's local certificate on :8443)
 * or localhost. Over plain http the app still works while the tab stays open; it just cannot
 * reopen without the network.
 */
export const pwa = reactive({
  /** True when this page is controlled by the service worker, so it will open offline. */
  ready: false,
  /** A newer version was downloaded; it waits until the user chooses to reload. */
  updateReady: false,
  secure: typeof window !== 'undefined' && window.isSecureContext
})

let waiting: ServiceWorker | null = null

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
  pwa.ready = !!navigator.serviceWorker.controller
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
    const track = (sw: ServiceWorker | null) => {
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          waiting = sw
          pwa.updateReady = true
        }
      })
    }
    if (reg.waiting && navigator.serviceWorker.controller) {
      waiting = reg.waiting
      pwa.updateReady = true
    }
    reg.addEventListener('updatefound', () => track(reg.installing))
    void navigator.serviceWorker.ready.then(() => { pwa.ready = true })
  }).catch(() => { /* untrusted certificate or blocked; the app keeps working online */ })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pwa.ready = true
    if (pwa.updateReady && !reloading) {
      reloading = true
      location.reload()
    }
  })
}

/** Switch to the downloaded version. Scores and drafts are in localStorage, so nothing is lost. */
export function applyUpdate() {
  waiting?.postMessage({ type: 'SKIP_WAITING' })
}
