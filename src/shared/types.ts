export type PadColor = 'orange' | 'blue' | 'violet'

/** What happens to sounds already playing when a pad is triggered. */
export type PadMode = 'overlap' | 'restart' | 'exclusive'

export type BusId = 'voice' | 'sfx' | 'master' | 'monitor'

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

export interface Settings {
  version: 1
  categories: Category[]
  pads: Pad[]
  devices: DeviceSettings
  mixer: Record<BusId, BusSettings>
  micEnabled: boolean
  /** Also send your own voice to the monitor (headphones). */
  monitorVoice: boolean
  padMode: PadMode
  hotkeys: {
    stopAll: string
    toggleMic: string
  }
}

export interface ImportedSound {
  file: string
  name: string
}

export interface HotkeyBinding {
  accelerator: string
  action: string
}
