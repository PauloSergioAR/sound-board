import type { VoiceFxSettings, VoicePresetId } from '../../../shared/types'

/** Every knob of the voice chain. Neutral values mean "no effect". */
export interface VoiceFxParams {
  /** Semitones. */
  pitch: number
  /** Ring-modulator frequency in Hz; 0 = off. */
  robotHz: number
  highpass: number
  lowpass: number
  /** Distortion, 0–1. */
  drive: number
  echo: number
  echoTime: number
  echoFeedback: number
  reverb: number
  reverbSeconds: number
}

export const NEUTRAL: VoiceFxParams = {
  pitch: 0,
  robotHz: 0,
  highpass: 20,
  lowpass: 20000,
  drive: 0,
  echo: 0,
  echoTime: 0.3,
  echoFeedback: 0.4,
  reverb: 0,
  reverbSeconds: 1.5
}

export interface VoicePreset {
  id: VoicePresetId
  name: string
  params: Partial<VoiceFxParams>
}

export const PRESETS: VoicePreset[] = [
  { id: 'grave', name: 'Grave', params: { pitch: -5, reverb: 0.1 } },
  { id: 'fina', name: 'Fina', params: { pitch: 6 } },
  // A ring modulator plus a very short metallic echo: the classic "Dalek" robot.
  { id: 'robo', name: 'Robô', params: { pitch: -2, robotHz: 45, echo: 0.2, echoTime: 0.012, echoFeedback: 0.5 } },
  { id: 'radio', name: 'Rádio', params: { highpass: 450, lowpass: 3200, drive: 0.35 } },
  { id: 'megafone', name: 'Megafone', params: { highpass: 750, lowpass: 2600, drive: 0.75, reverb: 0.15, reverbSeconds: 0.8 } },
  { id: 'caverna', name: 'Caverna', params: { pitch: -1, echo: 0.35, echoTime: 0.28, echoFeedback: 0.45, reverb: 0.6, reverbSeconds: 4 } },
  { id: 'eco', name: 'Eco longo', params: { echo: 0.5, echoTime: 0.38, echoFeedback: 0.55, reverb: 0.1 } }
]

export function presetById(id: VoicePresetId): VoicePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]
}

/** The three user-tweakable values a preset starts from. */
export function presetDefaults(id: VoicePresetId): Pick<VoiceFxSettings, 'pitch' | 'echo' | 'reverb'> {
  const p = { ...NEUTRAL, ...presetById(id).params }
  return { pitch: p.pitch, echo: p.echo, reverb: p.reverb }
}

/** Preset knobs, with the user's pitch/echo/reverb on top. */
export function resolveParams(fx: VoiceFxSettings): VoiceFxParams {
  if (!fx.enabled) return NEUTRAL
  return { ...NEUTRAL, ...presetById(fx.preset).params, pitch: fx.pitch, echo: fx.echo, reverb: fx.reverb }
}
