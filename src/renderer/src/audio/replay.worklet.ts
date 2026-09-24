/**
 * Replay buffer (AudioWorklet): always keeps the last few seconds of its input, like a DVR, so a
 * funny moment can be clipped after it happened. Send 'snapshot' on the port to get a copy back,
 * oldest sample first, as { left, right, sampleRate }.
 */

const REPLAY_SECONDS = 30

class ReplayBuffer extends AudioWorkletProcessor {
  private readonly size = Math.round(REPLAY_SECONDS * sampleRate)
  private readonly left = new Float32Array(this.size)
  private readonly right = new Float32Array(this.size)
  private write = 0
  private filled = 0

  constructor() {
    super()
    this.port.onmessage = () => this.snapshot()
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input?.length) return true
    const l = input[0]
    const r = input[1] ?? input[0]
    for (let i = 0; i < l.length; i++) {
      this.left[this.write] = l[i]
      this.right[this.write] = r[i]
      this.write = (this.write + 1) % this.size
    }
    this.filled = Math.min(this.size, this.filled + l.length)
    return true
  }

  private snapshot(): void {
    const n = this.filled
    const start = (this.write - n + this.size) % this.size
    const copy = (src: Float32Array): Float32Array => {
      const out = new Float32Array(n)
      const firstPart = Math.min(n, this.size - start)
      out.set(src.subarray(start, start + firstPart))
      out.set(src.subarray(0, n - firstPart), firstPart)
      return out
    }
    const left = copy(this.left)
    const right = copy(this.right)
    this.port.postMessage({ left, right, sampleRate }, [left.buffer, right.buffer])
  }
}

registerProcessor('replay-buffer', ReplayBuffer)
