import { useEffect, useState } from 'react'
import type { Category, Pad, PadColor } from '../../../shared/types'
import { engine } from '../audio'
import { HotkeyInput } from './HotkeyInput'
import { CloseIcon, PlayIcon } from './Icons'

interface Props {
  pad: Pad
  categories: Category[]
  /** Hotkeys already used elsewhere (other pads and app shortcuts). */
  takenHotkeys: string[]
  onSave: (pad: Pad) => void
  onDelete: (pad: Pad) => void
  onClose: () => void
}

const COLORS: { id: PadColor; label: string }[] = [
  { id: 'orange', label: 'Laranja' },
  { id: 'blue', label: 'Azul' },
  { id: 'violet', label: 'Lilás' }
]

export function PadEditor({ pad, categories, takenHotkeys, onSave, onDelete, onClose }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(pad)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof Pad>(key: K, value: Pad[K]): void => setDraft((d) => ({ ...d, [key]: value }))
  const hotkeyTaken = !!draft.hotkey && takenHotkeys.includes(draft.hotkey)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pad-editor-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (!hotkeyTaken) onSave({ ...draft, name: draft.name.trim() || pad.name })
        }}
      >
        <div className="dialog-head">
          <h2 id="pad-editor-title">Editar pad</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <label className="field">
          Nome
          <input className="text-input" autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>

        <div className="field-row">
          <div className="field">
            <label htmlFor="pad-hotkey">Atalho global</label>
            <HotkeyInput id="pad-hotkey" value={draft.hotkey} onChange={(h) => set('hotkey', h)} failed={hotkeyTaken} />
            {hotkeyTaken && <span className="field-error">Esse atalho já está em uso</span>}
          </div>
          <label className="field">
            Categoria
            <select className="select" value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label-row">
            Volume <span className="mono">{Math.round(draft.volume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={150}
            value={Math.round(draft.volume * 100)}
            onChange={(e) => set('volume', Number(e.target.value) / 100)}
          />
        </label>

        <fieldset className="field">
          <legend>Cor</legend>
          <div className="color-options">
            {COLORS.map((c) => (
              <label key={c.id} className={`color-option pad-${c.id}`}>
                <input type="radio" name="color" checked={draft.color === c.id} onChange={() => set('color', c.id)} />
                <span className="pad-dot" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="dialog-actions">
          {confirmDelete ? (
            <button type="button" className="button danger" onClick={() => onDelete(pad)}>
              Confirmar exclusão
            </button>
          ) : (
            <button type="button" className="button ghost-danger" onClick={() => setConfirmDelete(true)}>
              Excluir pad
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="button" onClick={() => engine.play(draft, 'restart')}>
            <PlayIcon size={14} />
            Ouvir
          </button>
          <button type="submit" className="button primary" disabled={hotkeyTaken}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
