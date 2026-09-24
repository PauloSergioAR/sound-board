export type PadColor = 'orange' | 'blue' | 'violet'

/** What happens to sounds already playing when a pad is triggered. */
export type PadMode = 'overlap' | 'restart' | 'exclusive'

export type BusId = 'voice' | 'sfx' | 'music' | 'master' | 'monitor'

export interface Category {
  id: string
  name: string
}

export interface Pad {
  id: string
  name: string
  /** File name inside the app's sounds folder (never a full path). */
  file: string
  categoryId: string
  /** Electron accelerator, e.g. "F1" or "Ctrl+Shift+1". */
  hotkey?: string
  /** Linear gain, 0–1.5. */
  volume: number
  color: PadColor
}

export interface BusSettings {
  volume: number
  muted: boolean
}

export interface DeviceSettings {
  /** Real microphone. Empty string = system default. */
  inputId: string
  /** Where the mix goes — normally "CABLE Input". Empty string = not chosen yet. */
  outputId: string
  /** Where you listen. Empty string = system default. */
  monitorId: string
}

export type VoicePresetId = 'grave' | 'fina' | 'robo' | 'radio' | 'megafone' | 'caverna' | 'eco'

export interface VoiceFxSettings {
  enabled: boolean
  preset: VoicePresetId
  /** Semitones, −12…12. Starts at the preset's value and can be tweaked. */
  pitch: number
  /** Echo level, 0–1. */
  echo: number
  /** Reverb level, 0–1. */
  reverb: number
}

export interface Track {
  id: string
  /** Absolute path of the original file (music is streamed, not copied). */
  path: string
  name: string
  /** Seconds, once known. */
  duration?: number
}

export interface DuckingSettings {
  enabled: boolean
  /** How much the music drops while you talk, in dB (positive). */
  amount: number
  /** Voice level that counts as talking, in dBFS. */
  threshold: number
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
}

export interface DeckSettings {
  playlists: Playlist[]
  /** The playlist the deck plays from (next/previous stay inside it). */
  playlistId: string
  /** Crossfade between tracks, in seconds; 0 = cut. */
  crossfade: number
  /** Start the playlist over after its last track. */
  repeat: boolean
  ducking: DuckingSettings
}

/** Where the embedded browser's audio goes. */
export type BrowserRoute = 'music' | 'sfx' | 'monitor'

export interface BrowserSettings {
  route: BrowserRoute
  volume: number
  lastUrl: string
}

/** What is playing in the embedded browser, for the bottom player. */
export interface BrowserMediaInfo {
  title: string
  artist: string
  /** data: URL of the thumbnail, when the page provides one. */
  artwork: string | null
  playing: boolean
  time: number
  duration: number
}

export type BrowserMediaCommand = 'toggle' | { seek: number }

/** Control from a phone on the same network. */
export interface RemoteSettings {
  enabled: boolean
  /** Secret that must be in every request; it travels inside the QR code. */
  token: string
  port: number
}

/** What the phone page shows; pushed by the app whenever it changes. */
export interface RemoteState {
  categories: Category[]
  pads: Pick<Pad, 'id' | 'name' | 'categoryId' | 'color'>[]
  playing: string[]
  micEnabled: boolean
  monitorVoice: boolean
  voice: VoiceFxSettings
  presets: { id: VoicePresetId; name: string }[]
  deck: { playing: boolean; track: string | null }
}

export interface RemoteInfo {
  running: boolean
  port: number
  /** One address per network adapter, best guess first. */
  urls: string[]
  clients: number
  error?: string
}

export interface Settings {
  version: 1
  categories: Category[]
  pads: Pad[]
  devices: DeviceSettings
  mixer: Record<BusId, BusSettings>
  micEnabled: boolean
  /** Also send your own voice to the monitor (headphones). */
  monitorVoice: boolean
  voiceFx: VoiceFxSettings
  deck: DeckSettings
  browser: BrowserSettings
  remote: RemoteSettings
  padMode: PadMode
  hotkeys: {
    stopAll: string
    toggleMic: string
    toggleFx: string
    deckToggle: string
    deckNext: string
  }
}

/** Progress of the VB-Cable installation. */
export type VbCableStep = 'download' | 'verify' | 'install'

export interface ImportedSound {
  file: string
  name: string
}

export interface HotkeyBinding {
  accelerator: string
  action: string
}
