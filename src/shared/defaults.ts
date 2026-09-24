import type { Settings } from './types'

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'webm']

export function defaultSettings(): Settings {
  return {
    version: 1,
    categories: [
      { id: 'memes', name: 'Memes' },
      { id: 'vinhetas', name: 'Vinhetas' },
      { id: 'wardogs', name: 'Wardogs' }
    ],
    pads: [],
    devices: { inputId: '', outputId: '', monitorId: '' },
    mixer: {
      voice: { volume: 1, muted: false },
      sfx: { volume: 0.8, muted: false },
      master: { volume: 1, muted: false },
      monitor: { volume: 0.6, muted: false }
    },
    micEnabled: true,
    monitorVoice: false,
    padMode: 'overlap',
    // Electron cannot bind the Pause key, so "stop everything" defaults to F11.
    hotkeys: { stopAll: 'F11', toggleMic: 'F10' }
  }
}

/** Fills keys missing from an older or hand-edited settings file. */
export function withDefaults(partial: Partial<Settings> | null): Settings {
  const base = defaultSettings()
  if (!partial) return base
  return {
    ...base,
    ...partial,
    devices: { ...base.devices, ...partial.devices },
    mixer: { ...base.mixer, ...partial.mixer },
    hotkeys: { ...base.hotkeys, ...partial.hotkeys },
    categories: partial.categories?.length ? partial.categories : base.categories,
    pads: partial.pads ?? []
  }
}
