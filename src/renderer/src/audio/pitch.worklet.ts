/**
 * Real-time pitch shifter (AudioWorklet), WSOLA style.
 *
 * A read head sweeps a short delay line at a speed set by the pitch ratio: reading faster than the
 * write head raises the pitch, slower lowers it. When the head drifts to the edge of its range it
 * jumps back, and the landing point is chosen by cross-correlation so the waveform lines up; a short
 * crossfade hides the seam. Aligning the seams avoids the "beating" of the simple two-head method.
 */

declare const sampleRate: number
declare function registerProcessor(name: string, processor: unknown): void
declare class AudioWorkletProcessor {}

const BUFFER_SIZE = 1 << 15 // power of two, comfortably above window + search + correlation
const WINDOW_SECONDS = 0.04 // range the read head drifts over
const SEARCH_SECONDS = 0.015 // how far to look for a matching seam (covers voices down to ~67 Hz)
const CORRELATION_SECONDS = 0.005
const FADE_SECONDS = 0.01
const MIN_DELAY = 32

class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors(): object[] {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]
  }

  private readonly buffer = new Float32Array(BUFFER_SIZE)
  private readonly window = Math.round(WINDOW_SECONDS * sampleRate)
  private readonly search = Math.round(SEARCH_SECONDS * sampleRate)
  private readonly correlation = Math.round(CORRELATION_SECONDS * sampleRate)
  private readonly fade = Math.round(FADE_SECONDS * sampleRate)
  private readonly maxDelay = MIN_DELAY + this.window
  private write = 0
  /** Delay of the active read head, in samples. */
  private delay = MIN_DELAY + this.window / 2
  /** Delay of the head being faded in, while `fading` > 0. */
  private nextDelay = 0
  private fading = 0

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0]?.[0]
    const output = outputs[0]
    if (!input) {
      output.forEach((channel) => channel.fill(0))
      return true
    }

    const ratio = parameters.ratio[0]
    const bypass = Math.abs(ratio - 1) < 1e-3
    const drift = 1 - ratio
    const out = output[0]

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.write] = input[i]

      if (bypass) {
        out[i] = input[i]
        this.delay = MIN_DELAY + this.window / 2
        this.fading = 0
      } else {
        if (!this.fading) {
          const landing = this.delay + drift * this.fade
          if (drift < 0 && landing < MIN_DELAY) this.startSplice(this.maxDelay - this.search)
          else if (drift > 0 && landing > this.maxDelay) this.startSplice(MIN_DELAY)
        }

        let y = this.read(this.delay)
        this.delay += drift
        if (this.fading) {
          const t = 1 - this.fading / this.fade
          y = y * (1 - t) + this.read(this.nextDelay) * t
          this.nextDelay += drift
          if (--this.fading === 0) this.delay = this.nextDelay
        }
        out[i] = y
      }

      this.write = (this.write + 1) & (BUFFER_SIZE - 1)
    }
    for (let c = 1; c < output.length; c++) output[c].set(out)
    return true
  }

  /** Starts a crossfade to the delay in [from, from + search] whose waveform best matches the current head. */
  private startSplice(from: number): void {
    const current = Math.round(this.delay)
    let best = from
    let bestScore = -Infinity
    for (let d = from; d <= from + this.search; d++) {
      let dot = 0
      let energy = 1e-9
      for (let j = 0; j < this.correlation; j++) {
        const b = this.at(d + j)
        dot += this.at(current + j) * b
        energy += b * b
      }
      const score = dot / Math.sqrt(energy)
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    this.nextDelay = best + (this.delay - current)
    this.fading = this.fade
  }

  /** Sample written `delay` samples ago (integer delay). */
  private at(delay: number): number {
    return this.buffer[(this.write - delay) & (BUFFER_SIZE - 1)]
  }

  /** Linearly interpolated sample `delay` samples ago. */
  private read(delay: number): number {
    let pos = this.write - delay
    if (pos < 0) pos += BUFFER_SIZE
    const i = Math.floor(pos)
    const frac = pos - i
    const a = this.buffer[i & (BUFFER_SIZE - 1)]
    const b = this.buffer[(i + 1) & (BUFFER_SIZE - 1)]
    return a + (b - a) * frac
  }
}

registerProcessor('pitch-shifter', PitchShifter)
