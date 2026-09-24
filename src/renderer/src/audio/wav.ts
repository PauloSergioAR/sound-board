export interface Clip {
  left: Float32Array
  right: Float32Array
  sampleRate: number
}

/** 16-bit stereo PCM WAV of `clip` between `start` and `end` seconds, with 5 ms fades against clicks. */
export function encodeWav(clip: Clip, start: number, end: number): Uint8Array {
  const from = Math.max(0, Math.floor(start * clip.sampleRate))
  const to = Math.min(clip.left.length, Math.ceil(end * clip.sampleRate))
  const frames = Math.max(0, to - from)
  const fade = Math.min(Math.round(0.005 * clip.sampleRate), Math.floor(frames / 2))

  const buffer = new ArrayBuffer(44 + frames * 4)
  const view = new DataView(buffer)
  const text = (offset: number, s: string): void => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + frames * 4, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // stereo
  view.setUint32(24, clip.sampleRate, true)
  view.setUint32(28, clip.sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * 4, true)

  for (let i = 0; i < frames; i++) {
    const gain = fade > 0 ? Math.min(1, i / fade, (frames - 1 - i) / fade) : 1
    for (const [c, channel] of [clip.left, clip.right].entries()) {
      const s = Math.max(-1, Math.min(1, channel[from + i] * gain))
      view.setInt16(44 + i * 4 + c * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
  }
  return new Uint8Array(buffer)
}

/** Peak per bucket, for drawing a waveform `buckets` wide. */
export function peaks(clip: Clip, buckets: number): Float32Array {
  const out = new Float32Array(buckets)
  const per = clip.left.length / buckets
  for (let b = 0; b < buckets; b++) {
    let max = 0
    const end = Math.min(clip.left.length, Math.floor((b + 1) * per))
    for (let i = Math.floor(b * per); i < end; i++) max = Math.max(max, Math.abs(clip.left[i]), Math.abs(clip.right[i]))
    out[b] = max
  }
  return out
}
