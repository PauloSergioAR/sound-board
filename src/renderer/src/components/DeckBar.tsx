import { useRef, useState, useSyncExternalStore } from 'react'
import type { DeckSettings, Track } from '../../../shared/types'
import { engine } from '../audio'
import { useAnimationFrame } from '../hooks'
import { formatAccelerator } from '../hotkey'
import { AlertIcon, CloseIcon, ListIcon, MicIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon, PlusIcon, PrevIcon } from './Icons'

interface Props {
  deck: DeckSettings
  onChange: (change: Partial<DeckSettings>) => void
  onAddClick: () => void
  onDropFiles: (files: File[]) => void
  toggleHotkey: string
  nextHotkey: string
}

const CROSSFADES = [0, 2, 3, 5, 8]

export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function DeckBar({ deck, onChange, onAddClick, onDropFiles, toggleHotkey, nextHotkey }: Props): React.JSX.Element {
  const state = useSyncExternalStore(engine.deck.subscribe, engine.deck.getState)
  const [queueOpen, setQueueOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const current = deck.queue.find((t) => t.id === state.currentId)

  const seekRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const durationRef = useRef<HTMLSpanElement>(null)
  const duckRef = useRef<HTMLSpanElement>(null)
  const duckChipRef = useRef<HTMLButtonElement>(null)
  const seeking = useRef(false)

  useAnimationFrame(true, () => {
    const { time, duration } = engine.deck.position()
    if (seekRef.current && !seeking.current) {
      seekRef.current.max = String(duration || 1)
      seekRef.current.value = String(time)
    }
    if (timeRef.current) timeRef.current.textContent = formatTime(time)
    if (durationRef.current) durationRef.current.textContent = formatTime(duration)
    const ducked = deck.ducking.enabled && engine.duckDb < -2
    if (duckRef.current) {
      duckRef.current.textContent = `−${ducked ? Math.round(-engine.duckDb) : deck.ducking.amount} dB`
    }
    duckChipRef.current?.classList.toggle('active', ducked)
  })

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      onDropFiles([...e.dataTransfer.files])
    }
  }

  return (
    <section className={dragging ? 'deck dragging' : 'deck'} aria-label="Deck de música" {...dropProps}>
      <div className="deck-art">
        <MusicIcon size={24} />
      </div>
      <div className="deck-title">
        <span className="eyebrow violet">Deck · {deck.queue.length} na fila</span>
        <span className="deck-name" title={current?.path}>
          {current?.name ?? (deck.queue.length ? 'Pronto para tocar' : 'Arraste músicas para cá')}
        </span>
      </div>

      <div className="deck-controls">
        <button type="button" className="icon-button" aria-label="Anterior" onClick={() => engine.deck.previous()}>
          <PrevIcon />
        </button>
        <button
          type="button"
          className="deck-play"
          aria-label={`${state.playing ? 'Pausar' : 'Tocar'} (${formatAccelerator(toggleHotkey)})`}
          onClick={() => engine.deck.toggle()}
          disabled={!deck.queue.length}
        >
          {state.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Próxima (${formatAccelerator(nextHotkey)})`}
          onClick={() => engine.deck.next()}
        >
          <NextIcon />
        </button>
      </div>

      <div className="deck-progress">
        <span ref={timeRef}>0:00</span>
        <input
          ref={seekRef}
          type="range"
          aria-label="Posição da música"
          min={0}
          max={1}
          step={0.1}
          defaultValue={0}
          disabled={!current}
          onPointerDown={() => (seeking.current = true)}
          onPointerUp={() => (seeking.current = false)}
          onChange={(e) => engine.deck.seek(Number(e.target.value))}
        />
        <span ref={durationRef}>0:00</span>
      </div>

      {state.error && (
        <span className="deck-error" title={state.error}>
          <AlertIcon size={16} />
        </span>
      )}

      <button
        ref={duckChipRef}
        type="button"
        className="duck-chip"
        aria-pressed={deck.ducking.enabled}
        title="Ducking: a música abaixa enquanto você fala"
        onClick={() => onChange({ ducking: { ...deck.ducking, enabled: !deck.ducking.enabled } })}
      >
        <MicIcon size={14} />
        {deck.ducking.enabled ? (
          <>
            Ducking <span ref={duckRef} className="mono" />
          </>
        ) : (
          'Ducking desligado'
        )}
      </button>

      <label className="crossfade">
        Crossfade
        <select className="select" value={deck.crossfade} onChange={(e) => onChange({ crossfade: Number(e.target.value) })}>
          {CROSSFADES.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Corte seco' : `${s} s`}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="button" aria-expanded={queueOpen} onClick={() => setQueueOpen((o) => !o)}>
        <ListIcon size={16} />
        Fila · {deck.queue.length}
      </button>

      {queueOpen && (
        <QueuePanel
          queue={deck.queue}
          currentId={state.currentId}
          error={state.error}
          onPlay={(id) => engine.deck.play(id)}
          onRemove={(id) => onChange({ queue: deck.queue.filter((t) => t.id !== id) })}
          onClear={() => onChange({ queue: deck.queue.filter((t) => t.id === state.currentId) })}
          onAddClick={onAddClick}
          onClose={() => setQueueOpen(false)}
        />
      )}
    </section>
  )
}

interface QueueProps {
  queue: Track[]
  currentId: string | null
  error: string | null
  onPlay: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onAddClick: () => void
  onClose: () => void
}

function QueuePanel({ queue, currentId, error, onPlay, onRemove, onClear, onAddClick, onClose }: QueueProps): React.JSX.Element {
  return (
    <div className="queue-panel" role="dialog" aria-label="Fila de músicas">
      <div className="queue-head">
        <h2>Fila</h2>
        <span className="muted">{queue.length} músicas</span>
        <div className="spacer" />
        {queue.length > 1 && (
          <button type="button" className="button ghost" onClick={onClear}>
            Limpar
          </button>
        )}
        <button type="button" className="button" onClick={onAddClick}>
          <PlusIcon size={16} />
          Adicionar
        </button>
        <button type="button" className="icon-button" aria-label="Fechar fila" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {error && (
        <p className="notice danger">
          <AlertIcon size={16} />
          <span>{error}</span>
        </p>
      )}

      {queue.length === 0 ? (
        <button type="button" className="queue-empty" onClick={onAddClick}>
          Arraste arquivos de música para o deck ou clique para escolher
        </button>
      ) : (
        <ol className="queue-list">
          {queue.map((track, i) => (
            <li key={track.id} className={track.id === currentId ? 'current' : undefined}>
              <button type="button" className="queue-track" onClick={() => onPlay(track.id)} title={track.path}>
                <span className="queue-index mono">{track.id === currentId ? '▶' : i + 1}</span>
                <span className="queue-name">{track.name}</span>
                <span className="mono muted">{track.duration ? formatTime(track.duration) : ''}</span>
              </button>
              <button
                type="button"
                className="icon-button small"
                aria-label={`Remover ${track.name} da fila`}
                onClick={() => onRemove(track.id)}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
