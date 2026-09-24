import { useState, useSyncExternalStore } from 'react'
import type { DeckSettings, Playlist } from '../../../shared/types'
import { engine } from '../audio'
import { DeckProgress, formatTime } from './DeckProgress'
import {
  AlertIcon,
  CloseIcon,
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  UploadIcon
} from './Icons'

interface Props {
  deck: DeckSettings
  onChange: (change: Partial<DeckSettings>) => void
  onPlayTrack: (playlistId: string, trackId: string) => void
  onAddClick: (playlistId: string) => void
  onDropFiles: (files: File[], playlistId: string) => void
  onCalibrate: () => void
}

const CROSSFADES = [0, 2, 3, 5, 8]
const newId = (): string => crypto.randomUUID()

export function MusicView({ deck, onChange, onPlayTrack, onAddClick, onDropFiles, onCalibrate }: Props): React.JSX.Element {
  const state = useSyncExternalStore(engine.deck.subscribe, engine.deck.getState)
  const [selectedId, setSelectedId] = useState(deck.playlistId)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [fileOver, setFileOver] = useState(false)

  const selected = deck.playlists.find((p) => p.id === selectedId) ?? deck.playlists[0]
  const playing = deck.playlists.find((p) => p.id === deck.playlistId) ?? deck.playlists[0]
  const current = playing.tracks.find((t) => t.id === state.currentId) ?? deck.playlists.flatMap((p) => p.tracks).find((t) => t.id === state.currentId)
  const totalSeconds = selected.tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0)

  const setPlaylists = (playlists: Playlist[], extra: Partial<DeckSettings> = {}): void => onChange({ playlists, ...extra })
  const editSelected = (change: (p: Playlist) => Playlist): void =>
    setPlaylists(deck.playlists.map((p) => (p.id === selected.id ? change(p) : p)))

  const addPlaylist = (): void => {
    const id = newId()
    setPlaylists([...deck.playlists, { id, name: `Playlist ${deck.playlists.length + 1}`, tracks: [] }])
    setSelectedId(id)
    setRenaming(id)
  }

  const removePlaylist = (id: string): void => {
    const rest = deck.playlists.filter((p) => p.id !== id)
    setPlaylists(rest, deck.playlistId === id ? { playlistId: rest[0].id } : {})
    setSelectedId(rest[0].id)
  }

  const move = (from: number, to: number): void =>
    editSelected((p) => {
      const tracks = [...p.tracks]
      const [track] = tracks.splice(from, 1)
      tracks.splice(to > from ? to - 1 : to, 0, track)
      return { ...p, tracks }
    })

  const shuffle = (): void =>
    editSelected((p) => {
      const tracks = [...p.tracks]
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
      }
      return { ...p, tracks }
    })

  const playSelected = (): void => {
    if (selected.id === playing.id && current) engine.deck.toggle()
    else if (selected.tracks[0]) onPlayTrack(selected.id, selected.tracks[0].id)
  }
  const selectedIsPlaying = selected.id === playing.id && state.playing

  return (
    <div className="music">
      <nav className="music-lists" aria-label="Playlists">
        <span className="eyebrow">Playlists</span>
        {deck.playlists.map((p) => (
          <div key={p.id} className="category-row">
            {renaming === p.id ? (
              <input
                className="text-input"
                autoFocus
                aria-label="Nome da playlist"
                defaultValue={p.name}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name) setPlaylists(deck.playlists.map((x) => (x.id === p.id ? { ...x, name } : x)))
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="category"
                aria-current={p.id === selected.id ? 'true' : undefined}
                onClick={() => setSelectedId(p.id)}
                onDoubleClick={() => setRenaming(p.id)}
                title="Clique duplo para renomear"
              >
                <span className="playlist-name">
                  {p.id === deck.playlistId && state.playing && <MusicIcon size={14} />}
                  {p.name}
                </span>
                <span className="count">{p.tracks.length}</span>
              </button>
            )}
            {p.id === selected.id && deck.playlists.length > 1 && renaming !== p.id && (
              <button type="button" className="icon-button small" aria-label={`Apagar playlist ${p.name}`} onClick={() => removePlaylist(p.id)}>
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="dashed-button" onClick={addPlaylist}>
          <PlusIcon size={16} />
          Nova playlist
        </button>
      </nav>

      <main
        className={fileOver ? 'music-main dragging' : 'music-main'}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setFileOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setFileOver(false)
          onDropFiles([...e.dataTransfer.files], selected.id)
        }}
      >
        <div className="music-head">
          <div>
            <h1>{selected.name}</h1>
            <span className="muted">
              {selected.tracks.length} {selected.tracks.length === 1 ? 'música' : 'músicas'}
              {totalSeconds > 0 && ` · ${Math.round(totalSeconds / 60)} min`}
            </span>
          </div>
          <div className="spacer" />
          <button type="button" className="button primary" onClick={playSelected} disabled={!selected.tracks.length}>
            {selectedIsPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
            {selectedIsPlaying ? 'Pausar' : 'Tocar'}
          </button>
          <button type="button" className="button" onClick={shuffle} disabled={selected.tracks.length < 2}>
            <ShuffleIcon size={16} />
            Embaralhar
          </button>
          <button type="button" className="button" onClick={() => onAddClick(selected.id)}>
            <UploadIcon size={16} />
            Adicionar músicas
          </button>
        </div>

        {selected.tracks.length === 0 ? (
          <button type="button" className="music-empty" onClick={() => onAddClick(selected.id)}>
            <UploadIcon size={24} />
            Arraste arquivos de música para cá
            <span className="muted">ou clique para escolher. Eles tocam do lugar original, sem cópia.</span>
          </button>
        ) : (
          <ol className="track-list">
            {selected.tracks.map((track, i) => {
              const isCurrent = track.id === state.currentId
              return (
                <li
                  key={track.id}
                  className={[isCurrent && 'current', dropAt === i && 'drop-before'].filter(Boolean).join(' ') || undefined}
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/x-soundboard-track', String(i))
                  }}
                  onDragOver={(e) => {
                    if (dragFrom === null) return
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    setDropAt(e.clientY > rect.top + rect.height / 2 ? i + 1 : i)
                  }}
                  onDrop={(e) => {
                    if (dragFrom === null || dropAt === null) return
                    e.preventDefault()
                    move(dragFrom, dropAt)
                    setDragFrom(null)
                    setDropAt(null)
                  }}
                  onDragEnd={() => {
                    setDragFrom(null)
                    setDropAt(null)
                  }}
                >
                  <button type="button" className="track" onClick={() => onPlayTrack(selected.id, track.id)} title={track.path}>
                    <span className="track-index mono">{isCurrent && state.playing ? <MusicIcon size={14} /> : i + 1}</span>
                    <span className="track-name">{track.name}</span>
                    <span className="mono muted">{track.duration ? formatTime(track.duration) : ''}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button small"
                    aria-label={`Remover ${track.name}`}
                    onClick={() => editSelected((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== track.id) }))}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              )
            })}
            {dropAt === selected.tracks.length && <li className="drop-end" aria-hidden="true" />}
          </ol>
        )}
      </main>

      <aside className="now-playing" aria-label="Tocando agora">
        <span className="eyebrow violet">Tocando agora · {playing.name}</span>
        <div className="now-art">
          <MusicIcon size={48} />
        </div>
        <span className="now-title" title={current?.path}>
          {current?.name ?? 'Nada tocando'}
        </span>
        <DeckProgress disabled={!current} />
        <div className="now-controls">
          <button type="button" className="icon-button" aria-label="Anterior" onClick={() => engine.deck.previous()}>
            <PrevIcon size={20} />
          </button>
          <button
            type="button"
            className="deck-play big"
            aria-label={state.playing ? 'Pausar' : 'Tocar'}
            onClick={() => engine.deck.toggle()}
            disabled={!playing.tracks.length && !current}
          >
            {state.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button type="button" className="icon-button" aria-label="Próxima" onClick={() => engine.deck.next()}>
            <NextIcon size={20} />
          </button>
          <button
            type="button"
            className="icon-button toggle"
            aria-pressed={deck.repeat}
            aria-label="Repetir playlist"
            title="Repetir playlist"
            onClick={() => onChange({ repeat: !deck.repeat })}
          >
            <RepeatIcon size={18} />
          </button>
        </div>
        {state.error && (
          <p className="notice danger">
            <AlertIcon size={16} />
            <span>{state.error}</span>
          </p>
        )}

        <div className="divider" />
        <label className="field">
          Crossfade entre músicas
          <select className="select" value={deck.crossfade} onChange={(e) => onChange({ crossfade: Number(e.target.value) })}>
            {CROSSFADES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Corte seco' : `${s} segundos`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={deck.ducking.enabled}
            onChange={(e) => onChange({ ducking: { ...deck.ducking, enabled: e.target.checked } })}
          />
          Abaixar a música quando eu falar
        </label>
        <label className="field">
          <span className="field-label-row">
            Quanto abaixa <span className="mono">−{deck.ducking.amount} dB</span>
          </span>
          <input
            type="range"
            min={3}
            max={30}
            value={deck.ducking.amount}
            disabled={!deck.ducking.enabled}
            onChange={(e) => onChange({ ducking: { ...deck.ducking, amount: Number(e.target.value) } })}
          />
        </label>
        <button type="button" className="link-button" onClick={onCalibrate}>
          Calibrar a sensibilidade do ducking
        </button>
      </aside>
    </div>
  )
}
