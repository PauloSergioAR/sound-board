import { useRef, useState, useSyncExternalStore } from 'react'
import type { DeckSettings } from '../../../shared/types'
import { engine } from '../audio'
import { useAnimationFrame } from '../hooks'
import { formatAccelerator } from '../hotkey'
import { DeckProgress } from './DeckProgress'
import { AlertIcon, ListIcon, MicIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './Icons'

interface Props {
  deck: DeckSettings
  onChange: (change: Partial<DeckSettings>) => void
  onDropFiles: (files: File[]) => void
  onOpenMusic: () => void
  toggleHotkey: string
  nextHotkey: string
}

/** Mini player, visible on every screen. Playlists and the queue live in the Música tab. */
export function DeckBar({ deck, onChange, onDropFiles, onOpenMusic, toggleHotkey, nextHotkey }: Props): React.JSX.Element {
  const state = useSyncExternalStore(engine.deck.subscribe, engine.deck.getState)
  const [dragging, setDragging] = useState(false)
  const playlist = deck.playlists.find((p) => p.id === deck.playlistId) ?? deck.playlists[0]
  const current = deck.playlists.flatMap((p) => p.tracks).find((t) => t.id === state.currentId)

  const duckRef = useRef<HTMLSpanElement>(null)
  const duckChipRef = useRef<HTMLButtonElement>(null)
  useAnimationFrame(true, () => {
    const ducked = deck.ducking.enabled && engine.duckDb < -2
    if (duckRef.current) {
      duckRef.current.textContent = `−${ducked ? Math.round(-engine.duckDb) : deck.ducking.amount} dB`
    }
    duckChipRef.current?.classList.toggle('active', ducked)
  })

  return (
    <section
      className={dragging ? 'deck dragging' : 'deck'}
      aria-label="Deck de música"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onDropFiles([...e.dataTransfer.files])
      }}
    >
      <div className="deck-art">
        <MusicIcon size={24} />
      </div>
      <div className="deck-title">
        <span className="eyebrow violet">
          {playlist.name} · {playlist.tracks.length}
        </span>
        <span className="deck-name" title={current?.path}>
          {current?.name ?? (playlist.tracks.length ? 'Pronto para tocar' : 'Arraste músicas para cá')}
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
          disabled={!playlist.tracks.length && !current}
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

      <DeckProgress disabled={!current} />

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

      <button type="button" className="button" onClick={onOpenMusic}>
        <ListIcon size={16} />
        Playlists
      </button>
    </section>
  )
}
