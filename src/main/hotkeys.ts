import { globalShortcut } from 'electron'
import type { HotkeyBinding } from '../shared/types'

/**
 * Replaces every global shortcut with `bindings`.
 * Returns the accelerators that could not be registered (invalid, or taken by another app).
 */
export function setHotkeys(bindings: HotkeyBinding[], onTrigger: (action: string) => void): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  for (const { accelerator, action } of bindings) {
    try {
      if (!globalShortcut.register(accelerator, () => onTrigger(action))) failed.push(accelerator)
    } catch {
      failed.push(accelerator)
    }
  }
  return failed
}
