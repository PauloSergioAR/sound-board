import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '../../../shared/types'
import { engine } from '../audio'
import { type Clip, peaks } from '../audio/wav'
import { CloseIcon, PlayIcon, StopIcon } from './Icons'

interface Props {
  clip: Clip
  categories: Category[]
  defaultCategoryId: string
  onSave: (name: string, categoryId: string, start: number, end: number) => void
  onClose: () => void
}

const WIDTH = 720
const HEIGHT = 120

const formatSeconds = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

/** Pick a stretch of the replay buffer by dragging over the waveform, listen, and save it as a pad. */
export function ClipEditor({ clip, categories, defaultCategoryId, onSave, onClose }: Props): React.JSX.Element {
  const duration = clip.left.length / clip.sampleRate
  // Start with the last 5 seconds: usually where the moment you just heard is.
  const [range, setRange] = useState<[number, number]>([Math.max(0, duration - 5), duration])
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategoryId)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dragFrom = useRef<number | null>(null)
  const bars = useMemo(() => peaks(clip, WIDTH), [clip])
  const [start, end] = range

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const styles = getComputedStyle(document.documentElement)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    const selFrom = (start / duration) * WIDTH
    const selTo = (end / duration) * WIDTH
    ctx.fillStyle = styles.getPropertyValue('--orange-soft')
    ctx.fillRect(selFrom, 0, selTo - selFrom, HEIGHT)
    for (let x = 0; x < WIDTH; x++) {
      const h = Math.max(1, bars[x] * (HEIGHT - 8))
      ctx.fillStyle = styles.getPropertyValue(x >= selFrom && x <= selTo ? '--orange' : '--line-strong')
      ctx.fillRect(x, (HEIGHT - h) / 2, 1, h)
    }
  }, [bars, start, end, duration])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      engine.stopPreview()
    }
  }, [onClose])

  const timeAt = (e: React.PointerEvent): number => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.min(duration, Math.max(0, ((e.clientX - rect.left) / rect.width) * duration))
  }
  const select = (a: number, b: number): void => setRange([Math.min(a, b), Math.max(a, b)])
  const tooShort = end - start < 0.1

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (!tooShort) onSave(name.trim() || `Recorte ${new Date().toLocaleTimeString('pt-BR')}`, categoryId, start, end)
        }}
      >
        <div className="dialog-head">
          <h2 id="clip-title">Recortar para pad</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <p className="muted small">Arraste sobre a onda para escolher o trecho. O começo é o mais antigo, o fim é agora.</p>

        <canvas
          ref={canvas}
          className="waveform"
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label={`Onda dos últimos ${Math.round(duration)} segundos; trecho de ${formatSeconds(start)} a ${formatSeconds(end)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            dragFrom.current = timeAt(e)
            select(dragFrom.current, dragFrom.current)
          }}
          onPointerMove={(e) => dragFrom.current !== null && select(dragFrom.current, timeAt(e))}
          onPointerUp={() => (dragFrom.current = null)}
        />

        <div className="field-row three">
          <label className="field">
            Início (s)
            <input
              className="text-input mono"
              type="number"
              step={0.1}
              min={0}
              max={duration}
              value={start.toFixed(1)}
              onChange={(e) => select(Number(e.target.value), end)}
            />
          </label>
          <label className="field">
            Fim (s)
            <input
              className="text-input mono"
              type="number"
              step={0.1}
              min={0}
              max={duration}
              value={end.toFixed(1)}
              onChange={(e) => select(start, Number(e.target.value))}
            />
          </label>
          <div className="field">
            Duração
            <span className="clip-length mono">{(end - start).toFixed(1)} s</span>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            Nome do pad
            <input className="text-input" autoFocus placeholder="Ex.: Grito épico" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Categoria
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => engine.previewClip(clip, start, end)} disabled={tooShort}>
            <PlayIcon size={14} />
            Ouvir no fone
          </button>
          <button type="button" className="button ghost" onClick={() => engine.stopPreview()}>
            <StopIcon size={14} />
            Parar
          </button>
          <div className="spacer" />
          <button type="submit" className="button primary" disabled={tooShort}>
            Salvar pad
          </button>
        </div>
      </form>
    </div>
  )
}
