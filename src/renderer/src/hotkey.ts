import { useSyncExternalStore } from 'react'

let capturing = false
const captureListeners = new Set<() => void>()

/** Marks that a hotkey field is waiting for a key press. */
export function setHotkeyCapture(active: boolean): void {
  capturing = active
  captureListeners.forEach((l) => l())
}

export function useHotkeyCapture(): boolean {
  return useSyncExternalStore(
    (cb) => {
      captureListeners.add(cb)
      return () => captureListeners.delete(cb)
    },
    () => capturing
  )
}

const NAMED_KEYS: Record<string, string> = {
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaStop: 'MediaStop'
}

/**
 * Turns a key press into an Electron accelerator ("Ctrl+Shift+F1").
 * Returns null for keys Electron cannot bind or for a lone modifier.
 * Uses the physical key (`code`) so the result does not depend on the keyboard layout.
 */
export function acceleratorFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const { code } = e
  let key: string | undefined
  if (/^F\d{1,2}$/.test(code)) key = code
  else if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else if (/^Numpad\d$/.test(code)) key = `num${code.slice(6)}`
  else key = NAMED_KEYS[code]
  if (!key) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  return [...parts, key].join('+')
}

/** Friendlier label for an accelerator. */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => (/^num\d$/.test(part) ? `Num ${part.slice(3)}` : part))
    .join('+')
}
