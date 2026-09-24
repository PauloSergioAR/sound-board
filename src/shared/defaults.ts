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
      music: { volume: 0.5, muted: false },
      master: { volume: 1, muted: false },
      monitor: { volume: 0.6, muted: false }
    },
    micEnabled: true,
    monitorVoice: false,
    voiceFx: { enabled: false, preset: 'grave', pitch: -5, echo: 0, reverb: 0.1 },
    deck: {
      queue: [],
      crossfade: 3,
      ducking: { enabled: true, amount: 12, threshold: -40 }
    },
    padMode: 'overlap',
    // Electron cannot bind the Pause key, so "stop everything" defaults to F11.
    hotkeys: { stopAll: 'F11', toggleMic: 'F10', toggleFx: 'F9', deckToggle: 'F7', deckNext: 'F8' }
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
    voiceFx: { ...base.voiceFx, ...partial.voiceFx },
    deck: {
      ...base.deck,
      ...partial.deck,
      ducking: { ...base.deck.ducking, ...partial.deck?.ducking }
    },
    hotkeys: { ...base.hotkeys, ...partial.hotkeys },
    categories: partial.categories?.length ? partial.categories : base.categories,
    pads: partial.pads ?? []
  }
}
