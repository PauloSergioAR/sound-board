import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { BusId, HotkeyBinding, ImportedSound, Pad, RemoteInfo, Settings, Track } from '../../shared/types'
import { engine } from './audio'
import { browserMedia } from './audio/browserMedia'
import { probeDuration } from './audio/deck'
import { PRESETS, presetDefaults, resolveParams } from './audio/presets'
import { type Clip, encodeWav } from './audio/wav'
import { BrowserView } from './components/BrowserView'
import { ClipEditor } from './components/ClipEditor'
import { type NowPlayingSource, NowPlayingBar } from './components/NowPlayingBar'
import { MusicView } from './components/MusicView'
import { Header, type View } from './components/Header'
import { Mixer } from './components/Mixer'
import { PadEditor } from './components/PadEditor'
import { PadGrid } from './components/PadGrid'
import { RemoteDialog } from './components/RemoteDialog'
import { SetupView } from './components/SetupView'
import { Sidebar } from './components/Sidebar'
import { VoicePanel } from './components/VoicePanel'
import { isAlias, isCableInput, isCableOutput, isVirtual, useDevices, usePlayingVersion, useSettings } from './hooks'
import { useHotkeyCapture } from './hotkey'

const newId = (): string => crypto.randomUUID()

/** The panic button: pads, music and whatever plays in the embedded browser. */
function stopEverything(): void {
  engine.stopAll()
  window.api.pauseBrowserMedia()
}

export function App(): React.JSX.Element {
  const [settings, update] = useSettings()
  if (!settings) return <div className="loading">Carregando…</div>
  return <Loaded settings={settings} update={update} />
}

function Loaded({ settings, update }: { settings: Settings; update: ReturnType<typeof useSettings>[1] }): React.JSX.Element {
  const devices = useDevices()
  const [view, setView] = useState<View>(settings.devices.outputId ? 'pads' : 'setup')
  const [categoryId, setCategoryId] = useState(settings.categories[0].id)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Pad | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [failedHotkeys, setFailedHotkeys] = useState<string[]>([])
  const [pitchAvailable, setPitchAvailable] = useState(true)
  const [clip, setClip] = useState<Clip | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [remoteInfo, setRemoteInfo] = useState<RemoteInfo | null>(null)
  const { devices: dev, mixer, pads } = settings

  // ── Audio routing ──────────────────────────────────────

  useEffect(() => {
    engine
      .setInputDevice(dev.inputId)
      .then(() => {
        setMicError(null)
        // Device names are only exposed after microphone permission is granted.
        devices.refresh()
      })
      .catch((err: Error) => setMicError(`Não consegui abrir o microfone: ${err.message}`))
  }, [dev.inputId, devices.refresh])

  useEffect(() => {
    engine.setOutputDevice(dev.outputId).catch(() => undefined)
  }, [dev.outputId])

  useEffect(() => {
    engine.setMonitorDevice(dev.monitorId).catch(() => undefined)
  }, [dev.monitorId])

  // First run: send the mix to the virtual cable, and never use a virtual device as the
  // microphone or the monitor (the VB-Cable installer often makes itself the Windows default).
  useEffect(() => {
    if (!devices.outputs.some((d) => d.label)) return
    const changes: Partial<Settings['devices']> = {}
    const cable = devices.outputs.find((d) => !isAlias(d) && isCableInput(d))
    if (!dev.outputId && cable) changes.outputId = cable.deviceId

    const defaultInput = devices.inputs.find(isAlias)
    const realMic = devices.inputs.find((d) => !isAlias(d) && !isVirtual(d))
    if (!dev.inputId && defaultInput && isVirtual(defaultInput) && realMic) changes.inputId = realMic.deviceId

    const defaultOutput = devices.outputs.find(isAlias)
    const realOutput = devices.outputs.find((d) => !isAlias(d) && !isVirtual(d))
    if (!dev.monitorId && defaultOutput && isVirtual(defaultOutput) && realOutput) changes.monitorId = realOutput.deviceId

    if (Object.keys(changes).length) update((s) => ({ ...s, devices: { ...s.devices, ...changes } }))
  }, [devices.inputs, devices.outputs, dev.inputId, dev.outputId, dev.monitorId, update])

  useEffect(() => {
    for (const id of Object.keys(mixer) as BusId[]) engine.setBus(id, mixer[id].volume, mixer[id].muted)
  }, [mixer])
  useEffect(() => engine.setMicEnabled(settings.micEnabled), [settings.micEnabled])
  useEffect(() => engine.setMonitorVoice(settings.monitorVoice), [settings.monitorVoice])
  useEffect(() => engine.setVoiceFx(resolveParams(settings.voiceFx)), [settings.voiceFx])
  const { playlists, playlistId } = settings.deck
  const playingPlaylist = playlists.find((p) => p.id === playlistId) ?? playlists[0]
  useEffect(() => engine.deck.setQueue(playingPlaylist.tracks), [playingPlaylist.tracks])
  useEffect(() => engine.deck.setCrossfade(settings.deck.crossfade), [settings.deck.crossfade])
  useEffect(() => engine.deck.setRepeat(settings.deck.repeat), [settings.deck.repeat])
  useEffect(() => engine.setDucking(settings.deck.ducking), [settings.deck.ducking])
  useEffect(() => engine.setBrowserRoute(settings.browser.route), [settings.browser.route])
  useEffect(() => engine.setBrowserVolume(settings.browser.volume), [settings.browser.volume])

  // ── Phone remote ───────────────────────────────────────

  useEffect(() => {
    window.api.configureRemote(settings.remote).then(setRemoteInfo)
  }, [settings.remote])
  useEffect(() => window.api.onRemoteInfo(setRemoteInfo), [])
  // "Gerar novo link" clears the token; a fresh one comes from the main process.
  useEffect(() => {
    if (!settings.remote.token)
      window.api.newRemoteToken().then((token) => update((s) => ({ ...s, remote: { ...s.remote, token } })))
  }, [settings.remote.token, update])

  const deckState = useSyncExternalStore(engine.deck.subscribe, engine.deck.getState)
  const playingVersion = usePlayingVersion()

  // The bottom player only shows while something plays (or right after pausing it from the bar,
  // so it can be resumed). On the Música tab the deck already has its own player.
  const browserPlaying = useSyncExternalStore(browserMedia.subscribe, browserMedia.isPlaying)
  const [pausedHere, setPausedHere] = useState<NowPlayingSource | null>(null)
  useEffect(() => setPausedHere(null), [view])
  const barSource: NowPlayingSource | null = browserPlaying ? 'browser' : deckState.playing ? 'deck' : pausedHere
  const showBar = barSource !== null && !(barSource === 'deck' && view === 'music')
  useEffect(() => {
    if (!remoteInfo?.running) return
    const track = playlists.flatMap((p) => p.tracks).find((t) => t.id === deckState.currentId)
    window.api.sendRemoteState({
      categories: settings.categories,
      pads: pads.map(({ id, name, categoryId, color }) => ({ id, name, categoryId, color })),
      playing: pads.filter((p) => engine.isPlaying(p.id)).map((p) => p.id),
      micEnabled: settings.micEnabled,
      monitorVoice: settings.monitorVoice,
      voice: settings.voiceFx,
      presets: PRESETS.map(({ id, name }) => ({ id, name })),
      deck: { playing: deckState.playing, track: track?.name ?? null }
    })
  }, [
    remoteInfo?.running,
    settings.categories,
    pads,
    settings.micEnabled,
    settings.monitorVoice,
    settings.voiceFx,
    deckState,
    playingVersion,
    playlists
  ])

  // Fill in track durations in the background for the playlists.
  const probing = useRef(new Set<string>())
  useEffect(() => {
    for (const track of playlists.flatMap((p) => p.tracks)) {
      if (track.duration !== undefined || probing.current.has(track.id)) continue
      probing.current.add(track.id)
      probeDuration(track.path).then((duration) =>
        update((s) => ({
          ...s,
          deck: {
            ...s.deck,
            playlists: s.deck.playlists.map((p) => ({
              ...p,
              tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, duration: duration ?? 0 } : t))
            }))
          }
        }))
      )
    }
  }, [playlists, update])
  useEffect(() => {
    engine.pitchReady.then(setPitchAvailable)
  }, [])
  useEffect(() => pads.forEach((p) => engine.preload(p.file)), [pads])

  // ── Hotkeys ────────────────────────────────────────────

  const bindings = useMemo<HotkeyBinding[]>(
    () => [
      { accelerator: settings.hotkeys.stopAll, action: 'stopAll' },
      { accelerator: settings.hotkeys.toggleMic, action: 'toggleMic' },
      { accelerator: settings.hotkeys.toggleFx, action: 'toggleFx' },
      { accelerator: settings.hotkeys.deckToggle, action: 'deckToggle' },
      { accelerator: settings.hotkeys.deckNext, action: 'deckNext' },
      ...pads.filter((p) => p.hotkey).map((p) => ({ accelerator: p.hotkey!, action: `pad:${p.id}` }))
    ],
    [settings.hotkeys, pads]
  )
  // Global shortcuts swallow the key before the window sees it, so they are released while a hotkey field listens.
  const capturing = useHotkeyCapture()
  useEffect(() => {
    window.api.setHotkeys(capturing ? [] : bindings).then((failed) => !capturing && setFailedHotkeys(failed))
  }, [bindings, capturing])

  const latest = useRef(settings)
  latest.current = settings
  useEffect(
    () =>
      window.api.onHotkey((action) => {
        const s = latest.current
        if (action === 'stopAll') stopEverything()
        else if (action === 'toggleMic') update((x) => ({ ...x, micEnabled: !x.micEnabled }))
        else if (action === 'toggleFx') update((x) => ({ ...x, voiceFx: { ...x.voiceFx, enabled: !x.voiceFx.enabled } }))
        else if (action === 'deckToggle') engine.deck.toggle()
        else if (action === 'deckNext') engine.deck.next()
        else if (action === 'toggleMonitor') update((x) => ({ ...x, monitorVoice: !x.monitorVoice }))
        else if (action.startsWith('pad:')) {
          const pad = s.pads.find((p) => `pad:${p.id}` === action)
          if (pad) engine.play(pad, s.padMode)
        } else if (action.startsWith('stopPad:')) engine.stopPad(action.slice('stopPad:'.length))
        else if (action === 'fx:off') update((x) => ({ ...x, voiceFx: { ...x.voiceFx, enabled: false } }))
        else if (action.startsWith('fx:')) {
          const preset = PRESETS.find((p) => `fx:${p.id}` === action)
          if (preset) update((x) => ({ ...x, voiceFx: { enabled: true, preset: preset.id, ...presetDefaults(preset.id) } }))
        } else if (action.startsWith('fxSet:')) {
          // From the phone's sliders: pitch in semitones, echo/reverb in percent.
          const [, param, raw] = action.split(':')
          const value = Number(raw)
          const change =
            param === 'pitch'
              ? { pitch: Math.max(-12, Math.min(12, Math.round(value))) }
              : { [param]: Math.max(0, Math.min(100, value)) / 100 }
          update((x) => ({ ...x, voiceFx: { ...x.voiceFx, ...change } }))
        }
      }),
    [update]
  )

  // ── Library ────────────────────────────────────────────

  const addSounds = useCallback(
    (sounds: ImportedSound[], target = categoryId) => {
      if (!sounds.length) return
      const added: Pad[] = sounds.map((s) => ({
        id: newId(),
        name: s.name,
        file: s.file,
        categoryId: target,
        volume: 1,
        color: 'orange'
      }))
      update((s) => ({ ...s, pads: [...s.pads, ...added] }))
    },
    [categoryId, update]
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast((t) => (t === message ? null : t)), 3500)
  }, [])

  // Audio downloaded in the embedded browser (e.g. a MyInstants button) becomes a pad right away.
  const addSoundsRef = useRef(addSounds)
  addSoundsRef.current = addSounds
  useEffect(
    () =>
      window.api.onSoundDownloaded((sound) => {
        addSoundsRef.current([sound])
        showToast(`"${sound.name}" virou pad`)
      }),
    [showToast]
  )

  const saveClip = async (name: string, target: string, start: number, end: number): Promise<void> => {
    if (!clip) return
    const sound = await window.api.saveSound(name, encodeWav(clip, start, end))
    addSounds([sound], target)
    setClip(null)
    showToast(`"${name}" salvo em ${settings.categories.find((c) => c.id === target)?.name ?? 'pads'}`)
  }

  /** Adds files to a playlist (the one playing, if none is given). */
  const addMusic = (paths: string[], target = playlistId): void => {
    if (!paths.length) return
    const tracks: Track[] = paths.map((path) => ({
      id: newId(),
      path,
      name: path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
    }))
    update((s) => ({
      ...s,
      deck: {
        ...s.deck,
        playlists: s.deck.playlists.map((p) => (p.id === target ? { ...p, tracks: [...p.tracks, ...tracks] } : p))
      }
    }))
  }

  const updateDeck = (change: Partial<Settings['deck']>): void => update((s) => ({ ...s, deck: { ...s.deck, ...change } }))

  const playTrack = (target: string, trackId: string): void => {
    const playlist = playlists.find((p) => p.id === target)
    if (!playlist) return
    // Next/previous follow the playlist the track was started from.
    engine.deck.setQueue(playlist.tracks)
    engine.deck.play(trackId)
    if (target !== playlistId) update((s) => ({ ...s, deck: { ...s.deck, playlistId: target } }))
  }

  const deletePad = (pad: Pad): void => {
    engine.stopPad(pad.id)
    engine.forget(pad.file)
    window.api.deleteSound(pad.file)
    update((s) => ({ ...s, pads: s.pads.filter((p) => p.id !== pad.id) }))
    setEditing(null)
  }

  // ── Derived ────────────────────────────────────────────

  const category = settings.categories.find((c) => c.id === categoryId) ?? settings.categories[0]
  const q = query.trim().toLowerCase()
  const visiblePads = q ? pads.filter((p) => p.name.toLowerCase().includes(q)) : pads.filter((p) => p.categoryId === category.id)
  const output = devices.outputs.find((d) => d.deviceId === dev.outputId)
  const input = devices.inputs.find((d) => d.deviceId === (dev.inputId || 'default'))

  return (
    <div className="app">
      <Header
        view={view}
        onView={setView}
        outputLabel={output ? output.label.replace(/^Default - /, '').replace(/\s*\(.*\)$/, '') : null}
        outputIsCable={!!output && isCableInput(output)}
        remoteClients={remoteInfo?.running ? remoteInfo.clients : null}
        onRemote={() => setRemoteOpen(true)}
        monitorVoice={settings.monitorVoice}
        onMonitorVoice={(monitorVoice) => update((s) => ({ ...s, monitorVoice }))}
      />

      <div className="stage">
      {view === 'pads' && (
        <div className="body">
          <Sidebar
            categories={settings.categories}
            pads={pads}
            selectedId={category.id}
            onSelect={(id) => {
              setCategoryId(id)
              setQuery('')
            }}
            onAdd={(name) => {
              const id = newId()
              update((s) => ({ ...s, categories: [...s.categories, { id, name }] }))
              setCategoryId(id)
            }}
            onRemove={(id) => {
              update((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }))
              setCategoryId(settings.categories.find((c) => c.id !== id)!.id)
            }}
          />
          <PadGrid
            title={category.name}
            pads={visiblePads}
            query={query}
            onQuery={setQuery}
            mode={settings.padMode}
            onMode={(padMode) => update((s) => ({ ...s, padMode }))}
            failedHotkeys={failedHotkeys}
            onPlay={(pad) => engine.play(pad, settings.padMode)}
            onEdit={setEditing}
            onImportClick={() => window.api.pickSounds().then(addSounds)}
            onDropFiles={(files) => window.api.importSounds(files.map(window.api.pathForFile)).then(addSounds)}
          />
          <VoicePanel
            micEnabled={settings.micEnabled}
            onToggleMic={() => update((s) => ({ ...s, micEnabled: !s.micEnabled }))}
            monitorVoice={settings.monitorVoice}
            voiceFx={settings.voiceFx}
            onVoiceFx={(change) => update((s) => ({ ...s, voiceFx: { ...s.voiceFx, ...change } }))}
            pitchAvailable={pitchAvailable}
            toggleMicHotkey={settings.hotkeys.toggleMic}
            toggleFxHotkey={settings.hotkeys.toggleFx}
            micError={micError}
            inputIsCable={!!input && isCableOutput(input)}
          />
        </div>
      )}
      {view === 'music' && (
        <MusicView
          deck={settings.deck}
          onChange={updateDeck}
          onPlayTrack={playTrack}
          onAddClick={(target) => window.api.pickMusic().then((paths) => addMusic(paths, target))}
          onDropFiles={(files, target) =>
            window.api.addMusic(files.map(window.api.pathForFile)).then((paths) => addMusic(paths, target))
          }
          onCalibrate={() => setView('setup')}
        />
      )}
      {view === 'setup' && (
        <SetupView
          settings={settings}
          devices={devices}
          failedHotkeys={failedHotkeys}
          onDevices={(d) => update((s) => ({ ...s, devices: { ...s.devices, ...d } }))}
          onHotkeys={(h) => update((s) => ({ ...s, hotkeys: { ...s.hotkeys, ...h } }))}
          onDucking={(ducking) => update((s) => ({ ...s, deck: { ...s.deck, ducking } }))}
        />
      )}
      <BrowserView
        visible={view === 'browser'}
        settings={settings.browser}
        onChange={(change) => update((s) => ({ ...s, browser: { ...s.browser, ...change } }))}
        onClip={setClip}
      />
      </div>

      {showBar && barSource && (
        <NowPlayingBar
          source={barSource}
          deck={settings.deck}
          onDeckChange={updateDeck}
          musicVolume={mixer.music.volume}
          onMusicVolume={(volume) => update((s) => ({ ...s, mixer: { ...s.mixer, music: { ...s.mixer.music, volume } } }))}
          browserVolume={settings.browser.volume}
          onBrowserVolume={(volume) => update((s) => ({ ...s, browser: { ...s.browser, volume } }))}
          onPausedHere={setPausedHere}
          onOpen={(source) => setView(source === 'deck' ? 'music' : 'browser')}
        />
      )}

      <Mixer
        mixer={mixer}
        onChange={(bus, value) => update((s) => ({ ...s, mixer: { ...s.mixer, [bus]: value } }))}
        onStopAll={stopEverything}
        stopAllHotkey={settings.hotkeys.stopAll}
      />

      {editing && (
        <PadEditor
          pad={editing}
          categories={settings.categories}
          takenHotkeys={bindings.filter((b) => b.action !== `pad:${editing.id}`).map((b) => b.accelerator)}
          onSave={(pad) => {
            update((s) => ({ ...s, pads: s.pads.map((p) => (p.id === pad.id ? pad : p)) }))
            setEditing(null)
          }}
          onDelete={deletePad}
          onClose={() => setEditing(null)}
        />
      )}

      {clip && (
        <ClipEditor
          clip={clip}
          categories={settings.categories}
          defaultCategoryId={category.id}
          onSave={saveClip}
          onClose={() => setClip(null)}
        />
      )}

      {remoteOpen && (
        <RemoteDialog
          remote={settings.remote}
          info={remoteInfo}
          onChange={(change) => update((s) => ({ ...s, remote: { ...s.remote, ...change } }))}
          onClose={() => setRemoteOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
