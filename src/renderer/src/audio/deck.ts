import type { Track } from '../../../shared/types'

export const mediaUrl = (path: string): string => `sb-media://track/${encodeURIComponent(path)}`

interface Slot {
  el: HTMLAudioElement
  gain: GainNode
}

export interface DeckState {
  currentId: string | null
  playing: boolean
  error: string | null
}

/**
 * Music player with a queue. Two <audio> elements take turns so the next track can fade in while
 * the current one fades out. Files stream from disk; they are never fully decoded into memory.
 */
export class MusicDeck {
  private readonly slots: [Slot, Slot]
  private active = 0
  private queue: Track[] = []
  private currentId: string | null = null
  private crossfade = 3
  private advancing = false
  private error: string | null = null
  private readonly listeners = new Set<() => void>()
  private snapshot: DeckState = { currentId: null, playing: false, error: null }

  constructor(
    private readonly ctx: AudioContext,
    output: AudioNode
  ) {
    this.slots = [this.createSlot(output), this.createSlot(output)]
  }

  private createSlot(output: AudioNode): Slot {
    const el = new Audio()
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    this.ctx.createMediaElementSource(el).connect(gain).connect(output)

    el.addEventListener('timeupdate', () => {
      if (el !== this.current.el || el.paused || this.advancing || this.crossfade <= 0) return
      if (Number.isFinite(el.duration) && el.duration - el.currentTime <= this.crossfade) this.next()
    })
    el.addEventListener('ended', () => {
      if (el === this.current.el && !this.advancing) this.next()
    })
    el.addEventListener('error', () => {
      if (el !== this.current.el || !el.getAttribute('src')) return
      const track = this.queue.find((t) => t.id === this.currentId)
      this.error = `Não consegui tocar "${track?.name ?? 'a música'}". O arquivo foi movido ou apagado?`
      this.emit()
    })
    el.addEventListener('play', () => this.emit())
    el.addEventListener('pause', () => this.emit())
    return { el, gain }
  }

  private get current(): Slot {
    return this.slots[this.active]
  }

  setQueue(queue: Track[]): void {
    this.queue = queue
  }

  setCrossfade(seconds: number): void {
    this.crossfade = seconds
  }

  /** Plays a track from the queue, crossfading if something is already playing. */
  async play(trackId: string): Promise<void> {
    const track = this.queue.find((t) => t.id === trackId)
    if (!track) return
    const from = this.current
    const to = this.slots[1 - this.active]
    const fade = !from.el.paused ? this.crossfade : 0
    const t = this.ctx.currentTime

    this.advancing = true
    this.active = 1 - this.active
    this.currentId = track.id
    this.error = null
    to.el.src = mediaUrl(track.path)

    to.gain.gain.cancelScheduledValues(t)
    from.gain.gain.cancelScheduledValues(t)
    if (fade > 0) {
      to.gain.gain.setValueAtTime(0, t)
      to.gain.gain.linearRampToValueAtTime(1, t + fade)
      from.gain.gain.setValueAtTime(from.gain.gain.value, t)
      from.gain.gain.linearRampToValueAtTime(0, t + fade)
      setTimeout(() => this.current !== from && from.el.pause(), fade * 1000 + 100)
    } else {
      from.gain.gain.setValueAtTime(0, t)
      from.el.pause()
      to.gain.gain.setValueAtTime(1, t)
    }
    this.emit()

    try {
      await to.el.play()
    } catch (err) {
      // Switching tracks again before this one started aborts its play(); that is expected.
      if ((err as DOMException).name !== 'AbortError') console.error(err)
    } finally {
      if (this.current === to) this.advancing = false
    }
  }

  toggle(): void {
    const el = this.current.el
    if (!this.currentId) {
      if (this.queue[0]) this.play(this.queue[0].id)
    } else if (el.paused) {
      this.current.gain.gain.setValueAtTime(1, this.ctx.currentTime)
      el.play().catch(() => undefined)
    } else {
      this.pause()
    }
  }

  pause(): void {
    for (const slot of this.slots) slot.el.pause()
  }

  next(): void {
    const index = this.queue.findIndex((t) => t.id === this.currentId)
    const next = this.queue[index + 1]
    if (next) this.play(next.id)
  }

  /** Restarts the track, or goes to the previous one when already near the start. */
  previous(): void {
    const index = this.queue.findIndex((t) => t.id === this.currentId)
    if (this.current.el.currentTime > 3 || index <= 0) this.seek(0)
    else this.play(this.queue[index - 1].id)
  }

  seek(seconds: number): void {
    this.current.el.currentTime = seconds
  }

  position(): { time: number; duration: number } {
    const el = this.current.el
    return { time: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : 0 }
  }

  /** Stable snapshot for useSyncExternalStore. */
  getState = (): DeckState => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.snapshot = { currentId: this.currentId, playing: !this.current.el.paused, error: this.error }
    this.listeners.forEach((l) => l())
  }
}

/** Reads a file's duration without playing it. */
export function probeDuration(path: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = new Audio()
    el.preload = 'metadata'
    const done = (value: number | undefined): void => {
      el.removeAttribute('src')
      el.load()
      resolve(value)
    }
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : undefined)
    el.onerror = () => done(undefined)
    el.src = mediaUrl(path)
  })
}
