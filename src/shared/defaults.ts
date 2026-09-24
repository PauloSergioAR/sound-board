import type { DeckSettings, Settings, Track } from './types'

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
      playlists: [{ id: 'fila', name: 'Fila', tracks: [] }],
      playlistId: 'fila',
      crossfade: 3,
      repeat: false,
      ducking: { enabled: true, amount: 12, threshold: -40 }
    },
    browser: { route: 'music', volume: 0.8, lastUrl: 'https://www.youtube.com' },
    padMode: 'overlap',
    // Electron cannot bind the Pause key, so "stop everything" defaults to F11.
    hotkeys: { stopAll: 'F11', toggleMic: 'F10', toggleFx: 'F9', deckToggle: 'F7', deckNext: 'F8' }
  }
}

function withDeckDefaults(base: DeckSettings, partial?: Partial<DeckSettings> & { queue?: Track[] }): DeckSettings {
  const deck = { ...base, ...partial, ducking: { ...base.ducking, ...partial?.ducking } }
  // Before playlists existed the deck had a single `queue`; it becomes the "Fila" playlist.
  if (!partial?.playlists?.length) {
    deck.playlists = [{ ...base.playlists[0], tracks: partial?.queue ?? [] }]
  }
  if (!deck.playlists.some((p) => p.id === deck.playlistId)) deck.playlistId = deck.playlists[0].id
  delete (deck as { queue?: Track[] }).queue
  return deck
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
    deck: withDeckDefaults(base.deck, partial.deck),
    browser: { ...base.browser, ...partial.browser },
    hotkeys: { ...base.hotkeys, ...partial.hotkeys },
    categories: partial.categories?.length ? partial.categories : base.categories,
    pads: partial.pads ?? []
  }
}
