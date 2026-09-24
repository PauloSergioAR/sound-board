import type { BrowserMediaInfo } from '../../../shared/types'

/**
 * What plays in the embedded browser, polled once a second from the main process. Components read
 * it through useSyncExternalStore; snapshots only change when the info does.
 */
let info: BrowserMediaInfo | null = null
let lastJson = 'null'
const listeners = new Set<() => void>()

async function poll(): Promise<void> {
  const next = await window.api.browserMediaInfo().catch(() => null)
  const json = JSON.stringify(next)
  if (json === lastJson) return
  lastJson = json
  info = next
  listeners.forEach((l) => l())
}

setInterval(poll, 1000)

export const browserMedia = {
  get: (): BrowserMediaInfo | null => info,
  isPlaying: (): boolean => info?.playing ?? false,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Play/pause, then refresh right away so the button flips without waiting for the next poll. */
  toggle: async (): Promise<void> => {
    await window.api.browserMediaControl('toggle')
    setTimeout(poll, 150)
  },
  seek: async (seconds: number): Promise<void> => {
    await window.api.browserMediaControl({ seek: seconds })
    setTimeout(poll, 150)
  }
}
