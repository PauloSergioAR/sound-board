import type { BusId, Pad, PadMode } from '../../../shared/types'

/**
 * The whole audio graph.
 *
 *   mic ─► micGate ─► voiceFx ─► voice ─┬──────────────► master ─► limiter ─► output device (CABLE Input)
 *   pads ─────────────────────► sfx ────┼──────────────►
 *                                        └► monitor ─► [bridge] ─► monitor device (your headphones)
 *   voice ─► monitorVoice (0/1) ─► monitor
 *
 * Two AudioContexts are needed because each one renders to a single device;
 * the monitor bus crosses over through a MediaStream.
 */

type SinkableContext = AudioContext & { setSinkId(id: string | { type: 'none' }): Promise<void> }

interface ActiveSound {
  source: AudioBufferSourceNode
  gain: GainNode
  startedAt: number
  duration: number
}

const LEVEL_FLOOR_DB = -60

export class AudioEngine {
  private readonly ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkableContext
  private readonly monitorCtx = new AudioContext({ latencyHint: 'interactive' }) as SinkableContext

  private readonly micGate = this.ctx.createGain()
  /** Voice effects (phase 2) are inserted between these two nodes. */
  private readonly voiceFxIn = this.ctx.createGain()
  private readonly buses: Record<BusId, GainNode> = {
    voice: this.ctx.createGain(),
    sfx: this.ctx.createGain(),
    master: this.ctx.createGain(),
    monitor: this.ctx.createGain()
  }
  private readonly monitorVoice = this.ctx.createGain()
  private readonly limiter = this.ctx.createDynamicsCompressor()
  private readonly analysers = {} as Record<BusId, AnalyserNode>
  private readonly levelBuffer = new Float32Array(1024)

  private mic: { stream: MediaStream; source: MediaStreamAudioSourceNode } | null = null
  private readonly buffers = new Map<string, Promise<AudioBuffer>>()
  private readonly active = new Map<string, Set<ActiveSound>>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly readFile: (file: string) => Promise<Uint8Array>) {
    const { buses } = this

    this.micGate.connect(this.voiceFxIn).connect(buses.voice)
    buses.voice.connect(buses.master)
    buses.voice.connect(this.monitorVoice).connect(buses.monitor)
    buses.sfx.connect(buses.master)
    buses.sfx.connect(buses.monitor)

    // Brick-wall-ish limiter so a loud pad plus voice never clips on the other side.
    this.limiter.threshold.value = -3
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.002
    this.limiter.release.value = 0.1
    buses.master.connect(this.limiter).connect(this.ctx.destination)

    const bridge = this.ctx.createMediaStreamDestination()
    buses.monitor.connect(bridge)
    this.monitorCtx.createMediaStreamSource(bridge.stream).connect(this.monitorCtx.destination)

    for (const id of Object.keys(buses) as BusId[]) {
      const analyser = this.ctx.createAnalyser()
      analyser.fftSize = this.levelBuffer.length
      ;(id === 'master' ? this.limiter : buses[id]).connect(analyser)
      this.analysers[id] = analyser
    }
    this.monitorVoice.gain.value = 0
  }

  /** Contexts start suspended until something resumes them. */
  async resume(): Promise<void> {
    await Promise.all([this.ctx.resume(), this.monitorCtx.resume()])
  }

  // ── Devices ─────────────────────────────────────────────

  /** Empty id = no output yet, so your own voice never leaks to the speakers before setup. */
  async setOutputDevice(deviceId: string): Promise<void> {
    await this.ctx.setSinkId(deviceId === '' ? { type: 'none' } : deviceId === 'default' ? '' : deviceId)
  }

  async setMonitorDevice(deviceId: string): Promise<void> {
    await this.monitorCtx.setSinkId(deviceId === 'default' ? '' : deviceId)
  }

  async setInputDevice(deviceId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        // Browser voice processing treats music and sound effects as noise and cuts them.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    this.releaseMic()
    const source = this.ctx.createMediaStreamSource(stream)
    source.connect(this.micGate)
    this.mic = { stream, source }
  }

  private releaseMic(): void {
    if (!this.mic) return
    this.mic.source.disconnect()
    this.mic.stream.getTracks().forEach((t) => t.stop())
    this.mic = null
  }

  // ── Mixer ───────────────────────────────────────────────

  setMicEnabled(enabled: boolean): void {
    this.ramp(this.micGate.gain, enabled ? 1 : 0)
  }

  setMonitorVoice(enabled: boolean): void {
    this.ramp(this.monitorVoice.gain, enabled ? 1 : 0)
  }

  setBus(id: BusId, volume: number, muted: boolean): void {
    this.ramp(this.buses[id].gain, muted ? 0 : volume)
  }

  /** Current level of a bus, 0–1 on a −60…0 dBFS scale. */
  getLevel(id: BusId): number {
    this.analysers[id].getFloatTimeDomainData(this.levelBuffer)
    let sum = 0
    for (const v of this.levelBuffer) sum += v * v
    const rms = Math.sqrt(sum / this.levelBuffer.length)
    const db = rms > 0 ? 20 * Math.log10(rms) : LEVEL_FLOOR_DB
    return Math.min(1, Math.max(0, (db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB))
  }

  private ramp(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.ctx.currentTime, 0.015)
  }

  // ── Pads ────────────────────────────────────────────────

  private load(file: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(file)
    if (!buffer) {
      buffer = this.readFile(file).then((bytes) =>
        // decodeAudioData takes ownership of the buffer, so hand it a copy of just these bytes.
        this.ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      )
      buffer.catch(() => this.buffers.delete(file))
      this.buffers.set(file, buffer)
    }
    return buffer
  }

  /** Decodes ahead of time so the first trigger has no delay. */
  preload(file: string): void {
    this.load(file).catch(() => undefined)
  }

  forget(file: string): void {
    this.buffers.delete(file)
  }

  async play(pad: Pick<Pad, 'id' | 'file' | 'volume'>, mode: PadMode): Promise<void> {
    await this.resume()
    const buffer = await this.load(pad.file)
    if (mode === 'restart') this.stopPad(pad.id)
    if (mode === 'exclusive') this.stopAll()

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = pad.volume
    source.connect(gain).connect(this.buses.sfx)

    const sound: ActiveSound = { source, gain, startedAt: this.ctx.currentTime, duration: buffer.duration }
    const set = this.active.get(pad.id) ?? new Set()
    set.add(sound)
    this.active.set(pad.id, set)
    source.onended = () => {
      gain.disconnect()
      set.delete(sound)
      if (set.size === 0) this.active.delete(pad.id)
      this.emit()
    }
    source.start()
    this.emit()
  }

  stopPad(padId: string): void {
    for (const sound of this.active.get(padId) ?? []) sound.source.stop()
  }

  stopAll(): void {
    for (const padId of [...this.active.keys()]) this.stopPad(padId)
  }

  isPlaying(padId: string): boolean {
    return this.active.has(padId)
  }

  /** Progress 0–1 of the most recent instance of a pad, or null if it is silent. */
  progress(padId: string): number | null {
    const set = this.active.get(padId)
    if (!set?.size) return null
    const latest = [...set].reduce((a, b) => (b.startedAt > a.startedAt ? b : a))
    return Math.min(1, (this.ctx.currentTime - latest.startedAt) / latest.duration)
  }

  /** Short 440 Hz beep to check the routing. */
  async playTestTone(): Promise<void> {
    await this.resume()
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const t = this.ctx.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
    gain.gain.setValueAtTime(0.25, t + 0.8)
    gain.gain.linearRampToValueAtTime(0, t + 0.9)
    osc.connect(gain).connect(this.buses.sfx)
    osc.onended = () => gain.disconnect()
    osc.start(t)
    osc.stop(t + 0.9)
  }

  /** Called whenever the set of playing pads changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.listeners.forEach((l) => l())
  }
}
