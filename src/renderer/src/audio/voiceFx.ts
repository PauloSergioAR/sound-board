import { NEUTRAL, type VoiceFxParams } from './presets'
import pitchWorkletUrl from './pitch.worklet.ts?worker&url'

/**
 * Voice effect chain. Every stage stays connected; presets only move knobs, so switching is click-free.
 *
 *   in ─► pitch ─► ring mod ─► highpass ─► lowpass ─► drive ─► makeup ─┬─► dry ─────────────┐
 *                                                                       ├─► echo (feedback) ─┼─► out
 *                                                                       └─► reverb ──────────┘
 */
export class VoiceFx {
  readonly input: GainNode
  readonly output: GainNode

  private pitch: AudioWorkletNode | null = null
  private readonly afterPitch: GainNode
  private readonly ring: GainNode
  private readonly ringDepth: GainNode
  private readonly ringOsc: OscillatorNode
  private readonly highpass: BiquadFilterNode
  private readonly lowpass: BiquadFilterNode
  private readonly drive: WaveShaperNode
  private readonly driveMakeup: GainNode
  private readonly dry: GainNode
  private readonly echoDelay: DelayNode
  private readonly echoFeedback: GainNode
  private readonly echoWet: GainNode
  private readonly reverb: ConvolverNode
  private readonly reverbWet: GainNode

  private params: VoiceFxParams = NEUTRAL
  private driveAmount = -1
  private reverbSeconds = -1

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain()
    this.afterPitch = ctx.createGain()
    this.output = ctx.createGain()

    // Ring modulator: gain = base + depth·sin(ωt). Off = base 1, depth 0.
    this.ring = ctx.createGain()
    this.ringDepth = ctx.createGain()
    this.ringDepth.gain.value = 0
    this.ringOsc = ctx.createOscillator()
    this.ringOsc.connect(this.ringDepth).connect(this.ring.gain)
    this.ringOsc.start()

    this.highpass = ctx.createBiquadFilter()
    this.highpass.type = 'highpass'
    this.lowpass = ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.drive = ctx.createWaveShaper()
    this.drive.oversample = '2x'
    this.driveMakeup = ctx.createGain()

    this.dry = ctx.createGain()
    this.echoDelay = ctx.createDelay(2)
    this.echoFeedback = ctx.createGain()
    this.echoWet = ctx.createGain()
    this.reverb = ctx.createConvolver()
    this.reverbWet = ctx.createGain()

    this.input.connect(this.afterPitch)
    this.afterPitch.connect(this.ring).connect(this.highpass).connect(this.lowpass).connect(this.drive)
    const shaped = this.drive.connect(this.driveMakeup)
    shaped.connect(this.dry).connect(this.output)
    shaped.connect(this.echoDelay)
    this.echoDelay.connect(this.echoFeedback).connect(this.echoDelay)
    this.echoDelay.connect(this.echoWet).connect(this.output)
    shaped.connect(this.reverb)
    this.reverb.connect(this.reverbWet).connect(this.output)

    this.apply(NEUTRAL)
  }

  /** Loads the pitch shifter. Until (or unless) it loads, everything but pitch still works. */
  async init(): Promise<void> {
    await this.ctx.audioWorklet.addModule(pitchWorkletUrl)
    this.pitch = new AudioWorkletNode(this.ctx, 'pitch-shifter', { outputChannelCount: [1] })
    this.input.disconnect(this.afterPitch)
    this.input.connect(this.pitch).connect(this.afterPitch)
    this.apply(this.params)
  }

  apply(p: VoiceFxParams): void {
    this.params = p
    const t = this.ctx.currentTime
    const glide = (param: AudioParam, value: number): void => {
      param.setTargetAtTime(value, t, 0.02)
    }

    if (this.pitch) this.pitch.parameters.get('ratio')!.setValueAtTime(2 ** (p.pitch / 12), t)

    const robot = p.robotHz > 0
    glide(this.ring.gain, robot ? 0 : 1)
    glide(this.ringDepth.gain, robot ? 1 : 0)
    if (robot) this.ringOsc.frequency.setValueAtTime(p.robotHz, t)

    glide(this.highpass.frequency, p.highpass)
    glide(this.lowpass.frequency, p.lowpass)
    if (p.drive !== this.driveAmount) {
      this.driveAmount = p.drive
      this.drive.curve = p.drive > 0 ? driveCurve(p.drive) : null
    }

    // Distortion lifts quiet parts, so pull the level back to match the clean voice.
    glide(this.driveMakeup.gain, 1 / (1 + p.drive * 2))
    // Heavy reverb pulls the dry voice back a little so it sounds far away.
    glide(this.dry.gain, 1 - p.reverb * 0.4)
    glide(this.echoDelay.delayTime, p.echoTime)
    glide(this.echoFeedback.gain, p.echo > 0 ? p.echoFeedback : 0)
    glide(this.echoWet.gain, p.echo)
    if (p.reverb > 0 && p.reverbSeconds !== this.reverbSeconds) {
      this.reverbSeconds = p.reverbSeconds
      this.reverb.buffer = impulseResponse(this.ctx, p.reverbSeconds)
    }
    glide(this.reverbWet.gain, p.reverb)
  }
}

/** Soft-clipping curve; `amount` 0–1. Peaks stay at ±1. */
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = amount * 40
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curve
}

/** Synthetic room: decaying stereo noise. */
function impulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3)
  }
  return buffer
}
