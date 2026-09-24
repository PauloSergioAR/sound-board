import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BusId, HotkeyBinding, ImportedSound, Pad, Settings } from '../../shared/types'
import { engine } from './audio'
import { Header, type View } from './components/Header'
import { Mixer } from './components/Mixer'
import { PadEditor } from './components/PadEditor'
import { PadGrid } from './components/PadGrid'
import { SetupView } from './components/SetupView'
import { Sidebar } from './components/Sidebar'
import { VoicePanel } from './components/VoicePanel'
import { isAlias, isCableInput, isCableOutput, isVirtual, useDevices, useSettings } from './hooks'
import { useHotkeyCapture } from './hotkey'

const newId = (): string => crypto.randomUUID()

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
  useEffect(() => pads.forEach((p) => engine.preload(p.file)), [pads])

  // ── Hotkeys ────────────────────────────────────────────

  const bindings = useMemo<HotkeyBinding[]>(
    () => [
      { accelerator: settings.hotkeys.stopAll, action: 'stopAll' },
      { accelerator: settings.hotkeys.toggleMic, action: 'toggleMic' },
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
        if (action === 'stopAll') engine.stopAll()
        else if (action === 'toggleMic') update((x) => ({ ...x, micEnabled: !x.micEnabled }))
        else if (action.startsWith('pad:')) {
          const pad = s.pads.find((p) => `pad:${p.id}` === action)
          if (pad) engine.play(pad, s.padMode)
        }
      }),
    [update]
  )

  // ── Library ────────────────────────────────────────────

  const addSounds = useCallback(
    (sounds: ImportedSound[]) => {
      if (!sounds.length) return
      const added: Pad[] = sounds.map((s) => ({
        id: newId(),
        name: s.name,
        file: s.file,
        categoryId,
        volume: 1,
        color: 'orange'
      }))
      update((s) => ({ ...s, pads: [...s.pads, ...added] }))
    },
    [categoryId, update]
  )

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
      />

      {view === 'pads' ? (
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
            onMonitorVoice={(monitorVoice) => update((s) => ({ ...s, monitorVoice }))}
            toggleMicHotkey={settings.hotkeys.toggleMic}
            micError={micError}
            inputIsCable={!!input && isCableOutput(input)}
          />
        </div>
      ) : (
        <SetupView
          settings={settings}
          devices={devices}
          failedHotkeys={failedHotkeys}
          onDevices={(d) => update((s) => ({ ...s, devices: { ...s.devices, ...d } }))}
          onHotkeys={(h) => update((s) => ({ ...s, hotkeys: { ...s.hotkeys, ...h } }))}
        />
      )}

      <Mixer
        mixer={mixer}
        onChange={(bus, value) => update((s) => ({ ...s, mixer: { ...s.mixer, [bus]: value } }))}
        onStopAll={() => engine.stopAll()}
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
    </div>
  )
}
