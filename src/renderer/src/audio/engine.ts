import type { BrowserRoute, BusId, DuckingSettings, Pad, PadMode } from '../../../shared/types'
import { MusicDeck } from './deck'
import duckerWorkletUrl from './ducker.worklet.ts?worker&url'
import type { VoiceFxParams } from './presets'
import replayWorkletUrl from './replay.worklet.ts?worker&url'
import { VoiceFx } from './voiceFx'
import type { Clip } from './wav'

/**
 * The whole audio graph.
 *
 *   mic ─► micGate ─► voiceFx ─► voice ─┬──────────────► master ─► limiter ─► output device (CABLE Input)
 *   pads ─────────────────────► sfx ────┤
 *   deck ─► musicIn ─► ducker ─► music ─┤
 *                 micGate ───┘ (sidechain)
 *   browser tab ─► browserIn ─► browserGain ─► musicIn | sfx | monitor (chosen route)
 *                        └► replay buffer (last 30 s, for clipping)
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
  private readonly voiceFx = new VoiceFx(this.ctx)
  /** Resolves to false if the pitch shifter could not load (the other effects still work). */
  readonly pitchReady: Promise<boolean> = this.voiceFx.init().then(
    () => true,
    (err) => {
      console.error('Pitch shifter failed to load', err)
      return false
    }
  )
  private readonly buses: Record<BusId, GainNode> = {
    voice: this.ctx.createGain(),
    sfx: this.ctx.createGain(),
    music: this.ctx.createGain(),
    master: this.ctx.createGain(),
    monitor: this.ctx.createGain()
  }
  private readonly musicIn = this.ctx.createGain()
  readonly deck = new MusicDeck(this.ctx, this.musicIn)
  private ducker: AudioWorkletNode | null = null
  private ducking: DuckingSettings = { enabled: true, amount: 12, threshold: -40 }
  /** How far the ducker is currently pulling the music down, in dB (≤ 0). */
  duckDb = 0
  /** Resolves to false if the ducker could not load (music then plays without ducking). */
  readonly duckerReady: Promise<boolean> = this.ctx.audioWorklet.addModule(duckerWorkletUrl).then(
    () => {
      this.installDucker()
      return true
    },
    (err) => {
      console.error('Ducker failed to load', err)
      return false
    }
  )
  private readonly browserIn = this.ctx.createGain()
  private readonly browserGain = this.ctx.createGain()
  private readonly browserAnalyser = this.ctx.createAnalyser()
  private browserSource: { stream: MediaStream; node: MediaStreamAudioSourceNode } | null = null
  private browserRoute: BrowserRoute = 'music'
  private replay: AudioWorkletNode | null = null
  private preview: AudioBufferSourceNode | null = null
  private readonly monitorVoice = this.ctx.createGain()
  private readonly limiter = this.ctx.createDynamicsCompressor()
  private readonly analysers = {} as Record<BusId, AnalyserNode>
  private readonly micAnalyser = this.ctx.createAnalyser()
  private readonly levelBuffer = new Float32Array(1024)

  private mic: { stream: MediaStream; source: MediaStreamAudioSourceNode } | null = null
  private readonly buffers = new Map<string, Promise<AudioBuffer>>()
  private readonly active = new Map<string, Set<ActiveSound>>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly readFile: (file: string) => Promise<Uint8Array>) {
    const { buses } = this

    this.micGate.connect(this.voiceFx.input)
    this.voiceFx.output.connect(buses.voice)
    buses.voice.connect(buses.master)
    buses.voice.connect(this.monitorVoice).connect(buses.monitor)
    buses.sfx.connect(buses.master)
    buses.sfx.connect(buses.monitor)
    // Plays without ducking until the ducker worklet loads and takes its place.
    this.musicIn.connect(buses.music)
    buses.music.connect(buses.master)
    buses.music.connect(buses.monitor)

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
    this.micAnalyser.fftSize = this.levelBuffer.length
    this.micGate.connect(this.micAnalyser)

    this.browserAnalyser.fftSize = this.levelBuffer.length
    this.browserIn.connect(this.browserGain)
    this.browserGain.connect(this.browserAnalyser)
    this.setBrowserRoute(this.browserRoute)
    this.ctx.audioWorklet.addModule(replayWorkletUrl).then(
      () => {
        this.replay = new AudioWorkletNode(this.ctx, 'replay-buffer', { outputChannelCount: [1] })
        this.browserIn.connect(this.replay)
        // A worklet only runs while something downstream pulls it; a silent path to the output does that.
        const silent = this.ctx.createGain()
        silent.gain.value = 0
        this.replay.connect(silent).connect(this.ctx.destination)
      },
      (err) => console.error('Replay buffer failed to load', err)
    )
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

  private installDucker(): void {
    const ducker = new AudioWorkletNode(this.ctx, 'ducker', { numberOfInputs: 2, outputChannelCount: [2] })
    ducker.port.onmessage = (e: MessageEvent<number>) => (this.duckDb = e.data)
    this.musicIn.disconnect(this.buses.music)
    this.musicIn.connect(ducker, 0, 0)
    // Sidechain from the raw mic after the mute gate: a muted mic never ducks the music.
    this.micGate.connect(ducker, 0, 1)
    ducker.connect(this.buses.music)
    this.ducker = ducker
    this.setDucking(this.ducking)
  }

  setDucking(ducking: DuckingSettings): void {
    this.ducking = ducking
    if (!this.ducker) return
    const t = this.ctx.currentTime
    this.ducker.parameters.get('amount')!.setValueAtTime(ducking.enabled ? ducking.amount : 0, t)
    this.ducker.parameters.get('threshold')!.setValueAtTime(ducking.threshold, t)
  }

  /** Current mic level in dBFS, as the ducker sees it — for calibrating its threshold. */
  micDb(): number {
    return this.rmsDb(this.micAnalyser)
  }

  setVoiceFx(params: VoiceFxParams): void {
    this.voiceFx.apply(params)
  }

  setMonitorVoice(enabled: boolean): void {
    this.ramp(this.monitorVoice.gain, enabled ? 1 : 0)
  }

  setBus(id: BusId, volume: number, muted: boolean): void {
    this.ramp(this.buses[id].gain, muted ? 0 : volume)
  }

  /** Current level of a bus, 0–1 on a −60…0 dBFS scale. */
  getLevel(id: BusId): number {
    const db = this.rmsDb(this.analysers[id])
    return Math.min(1, Math.max(0, (db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB))
  }

  private rmsDb(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.levelBuffer)
    let sum = 0
    for (const v of this.levelBuffer) sum += v * v
    const rms = Math.sqrt(sum / this.levelBuffer.length)
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity
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
    if (mode === 'exclusive') this.stopPads()

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

  stopPads(): void {
    for (const padId of [...this.active.keys()]) this.stopPad(padId)
  }

  /** The panic button: silences pads and pauses the music. */
  stopAll(): void {
    this.stopPads()
    this.deck.pause()
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

  // ── Embedded browser ────────────────────────────────────

  /** Takes over the browser tab's audio (a tab-capture stream); null releases it. */
  setBrowserStream(stream: MediaStream | null): void {
    if (this.browserSource) {
      this.browserSource.node.disconnect()
      this.browserSource.stream.getTracks().forEach((t) => t.stop())
      this.browserSource = null
    }
    if (!stream) return
    const node = this.ctx.createMediaStreamSource(stream)
    node.connect(this.browserIn)
    this.browserSource = { stream, node }
  }

  setBrowserRoute(route: BrowserRoute): void {
    this.browserRoute = route
    this.browserGain.disconnect()
    this.browserGain.connect(this.browserAnalyser)
    this.browserGain.connect(route === 'music' ? this.musicIn : route === 'sfx' ? this.buses.sfx : this.buses.monitor)
  }

  setBrowserVolume(volume: number): void {
    this.ramp(this.browserGain.gain, volume)
  }

  /** Browser tab level, 0–1 on the same scale as the bus meters. */
  browserLevel(): number {
    const db = this.rmsDb(this.browserAnalyser)
    return Math.min(1, Math.max(0, (db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB))
  }

  /** The last 30 s of browser audio, oldest first. */
  snapshotBrowser(): Promise<Clip | null> {
    const replay = this.replay
    if (!replay) return Promise.resolve(null)
    return new Promise((resolve) => {
      replay.port.onmessage = (e: MessageEvent<Clip>) => resolve(e.data)
      replay.port.postMessage('snapshot')
    })
  }

  /** Plays part of a clip on your headphones only, to check a cut before saving it. */
  previewClip(clip: Clip, start: number, end: number): void {
    this.stopPreview()
    const buffer = this.ctx.createBuffer(2, clip.left.length, clip.sampleRate)
    buffer.copyToChannel(clip.left as Float32Array<ArrayBuffer>, 0)
    buffer.copyToChannel(clip.right as Float32Array<ArrayBuffer>, 1)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.buses.monitor)
    source.onended = () => {
      if (this.preview === source) this.preview = null
    }
    source.start(0, start, Math.max(0.01, end - start))
    this.preview = source
  }

  stopPreview(): void {
    this.preview?.stop()
    this.preview = null
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
