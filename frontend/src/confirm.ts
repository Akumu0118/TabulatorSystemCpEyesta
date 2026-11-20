import { reactive } from 'vue'

/**
 * In-app replacement for window.confirm(). Embedded browsers and some installed phone apps
 * suppress native dialogs (confirm() then returns false at once), which silently blocked actions.
 */
export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export const confirmState = reactive({
  open: false,
  options: { title: '' } as ConfirmOptions,
  resolve: null as ((ok: boolean) => void) | null
})

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  confirmState.resolve?.(false) // a newer question replaces an unanswered one
  return new Promise(resolve => {
    confirmState.options = options
    confirmState.resolve = resolve
    confirmState.open = true
  })
}

export function answerConfirm(ok: boolean) {
  const resolve = confirmState.resolve
  confirmState.open = false
  confirmState.resolve = null
  resolve?.(ok)
}
