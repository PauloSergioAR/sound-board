import { useState } from 'react'
import type { Category, Pad } from '../../../shared/types'
import { CloseIcon, PlusIcon } from './Icons'

interface Props {
  categories: Category[]
  pads: Pad[]
  selectedId: string
  onSelect: (id: string) => void
  onAdd: (name: string) => void
  onRemove: (id: string) => void
}

export function Sidebar({ categories, pads, selectedId, onSelect, onAdd, onRemove }: Props): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const submit = (): void => {
    if (name.trim()) onAdd(name.trim())
    setName('')
    setAdding(false)
  }

  return (
    <nav className="sidebar" aria-label="Categorias">
      <span className="eyebrow">Categorias</span>
      {categories.map((c) => {
        const count = pads.filter((p) => p.categoryId === c.id).length
        const selected = c.id === selectedId
        return (
          <div key={c.id} className="category-row">
            <button
              type="button"
              className="category"
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(c.id)}
            >
              <span>{c.name}</span>
              <span className="count">{count}</span>
            </button>
            {selected && count === 0 && categories.length > 1 && (
              <button
                type="button"
                className="icon-button small"
                aria-label={`Remover categoria ${c.name}`}
                onClick={() => onRemove(c.id)}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        )
      })}
      {adding ? (
        <input
          className="text-input"
          autoFocus
          aria-label="Nome da categoria"
          placeholder="Nome da categoria"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') {
              setName('')
              setAdding(false)
            }
          }}
        />
      ) : (
        <button type="button" className="dashed-button" onClick={() => setAdding(true)}>
          <PlusIcon size={16} />
          Nova categoria
        </button>
      )}
    </nav>
  )
}
