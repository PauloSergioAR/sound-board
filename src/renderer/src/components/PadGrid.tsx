import { useRef, useState } from 'react'
import type { Pad, PadMode } from '../../../shared/types'
import { engine } from '../audio'
import { useAnimationFrame, usePlayingVersion } from '../hooks'
import { formatAccelerator } from '../hotkey'
import { SearchIcon, StopIcon, UploadIcon } from './Icons'

interface Props {
  title: string
  pads: Pad[]
  query: string
  onQuery: (query: string) => void
  mode: PadMode
  onMode: (mode: PadMode) => void
  failedHotkeys: string[]
  onPlay: (pad: Pad) => void
  onEdit: (pad: Pad) => void
  onImportClick: () => void
  onDropFiles: (files: File[]) => void
}

const MODES: { id: PadMode; label: string }[] = [
  { id: 'overlap', label: 'Sobrepor' },
  { id: 'restart', label: 'Reiniciar' },
  { id: 'exclusive', label: 'Um por vez' }
]

export function PadGrid(props: Props): React.JSX.Element {
  const { title, pads, query, onQuery, mode, onMode, onImportClick, onDropFiles } = props
  const [dragging, setDragging] = useState(false)
  usePlayingVersion()

  return (
    <main
      className={dragging ? 'pads dragging' : 'pads'}
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
      <div className="pads-toolbar">
        <h1>{query ? 'Resultados' : title}</h1>
        <span className="muted">
          {pads.length} {pads.length === 1 ? 'som' : 'sons'}
        </span>
        <div className="spacer" />
        <label className="search">
          <SearchIcon size={16} />
          <input
            type="search"
            aria-label="Buscar sons em todas as categorias"
            placeholder="Buscar sons"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        <button type="button" className="button" onClick={onImportClick}>
          <UploadIcon size={16} />
          Importar
        </button>
      </div>

      <div className="pad-grid">
        {pads.map((pad) => (
          <PadCard
            key={pad.id}
            pad={pad}
            hotkeyFailed={!!pad.hotkey && props.failedHotkeys.includes(pad.hotkey)}
            onPlay={() => props.onPlay(pad)}
            onEdit={() => props.onEdit(pad)}
          />
        ))}
        {!query && (
          <button type="button" className="pad-drop" onClick={onImportClick}>
            <UploadIcon size={22} />
            Arraste .mp3/.wav aqui
            <span className="muted">ou clique para escolher</span>
          </button>
        )}
      </div>

      <div className="pads-footer">
        <span id="mode-label">Ao tocar outro som:</span>
        <div className="segmented" role="radiogroup" aria-labelledby="mode-label">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => onMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span>Clique direito no pad para editar nome, atalho e volume</span>
      </div>
    </main>
  )
}

interface CardProps {
  pad: Pad
  hotkeyFailed: boolean
  onPlay: () => void
  onEdit: () => void
}

function PadCard({ pad, hotkeyFailed, onPlay, onEdit }: CardProps): React.JSX.Element {
  const playing = engine.isPlaying(pad.id)
  const bar = useRef<HTMLDivElement>(null)
  useAnimationFrame(playing, () => {
    const p = engine.progress(pad.id)
    if (bar.current) bar.current.style.width = `${(p ?? 0) * 100}%`
  })

  return (
    <div className={`pad pad-${pad.color}${playing ? ' playing' : ''}`}>
      <button
        type="button"
        className="pad-trigger"
        onClick={onPlay}
        onContextMenu={(e) => {
          e.preventDefault()
          onEdit()
        }}
        aria-label={`Tocar ${pad.name}`}
      >
        <span className="pad-top">
          <span className="pad-dot" />
          {pad.hotkey && !playing && (
            <span className={hotkeyFailed ? 'kbd failed' : 'kbd'} title={hotkeyFailed ? 'Atalho em uso por outro programa' : undefined}>
              {formatAccelerator(pad.hotkey)}
            </span>
          )}
        </span>
        <span className="pad-name">{pad.name}</span>
        <span className="pad-status">{playing ? 'Tocando…' : `vol ${Math.round(pad.volume * 100)}%`}</span>
      </button>
      {playing && (
        <>
          <div ref={bar} className="pad-progress" />
          <button type="button" className="pad-stop" aria-label={`Parar ${pad.name}`} onClick={() => engine.stopPad(pad.id)}>
            <StopIcon size={11} />
            Parar
          </button>
        </>
      )}
    </div>
  )
}
