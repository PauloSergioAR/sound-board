/**
 * Ducker (AudioWorklet): lowers input 0 (music) while input 1 (your voice) is above a threshold,
 * like a radio host talking over a song. Runs on the audio thread, so it keeps working while the
 * window is in the background. Posts the current reduction in dB (≤ 0) about 20 times a second.
 */

const ATTACK_SECONDS = 0.04
const RELEASE_SECONDS = 0.6
/** Keeps the music down through the short gaps between words. */
const HOLD_SECONDS = 0.35
const REPORT_SECONDS = 0.05

class Ducker extends AudioWorkletProcessor {
  static get parameterDescriptors(): object[] {
    return [
      { name: 'amount', defaultValue: 12, minValue: 0, maxValue: 40, automationRate: 'k-rate' },
      { name: 'threshold', defaultValue: -40, minValue: -90, maxValue: 0, automationRate: 'k-rate' }
    ]
  }

  private gain = 1
  private hold = 0
  private sinceReport = 0
  private readonly attack = 1 - Math.exp(-1 / (ATTACK_SECONDS * sampleRate))
  private readonly release = 1 - Math.exp(-1 / (RELEASE_SECONDS * sampleRate))

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const music = inputs[0]
    const voice = inputs[1]?.[0]
    const output = outputs[0]
    const frames = output[0].length

    let talking = false
    if (voice) {
      let sum = 0
      for (let i = 0; i < voice.length; i++) sum += voice[i] * voice[i]
      const db = 10 * Math.log10(sum / voice.length + 1e-12)
      talking = db > parameters.threshold[0]
    }
    if (talking) this.hold = HOLD_SECONDS * sampleRate
    else this.hold = Math.max(0, this.hold - frames)

    const amount = parameters.amount[0]
    const target = this.hold > 0 && amount > 0 ? Math.pow(10, -amount / 20) : 1
    const coef = target < this.gain ? this.attack : this.release

    for (let c = 0; c < output.length; c++) {
      const src = music[c] ?? music[0]
      const out = output[c]
      let g = this.gain
      for (let i = 0; i < frames; i++) {
        g += (target - g) * coef
        out[i] = src ? src[i] * g : 0
      }
      if (c === output.length - 1) this.gain = g
    }

    this.sinceReport += frames
    if (this.sinceReport >= REPORT_SECONDS * sampleRate) {
      this.sinceReport = 0
      this.port.postMessage(20 * Math.log10(this.gain))
    }
    return true
  }
}

registerProcessor('ducker', Ducker)
