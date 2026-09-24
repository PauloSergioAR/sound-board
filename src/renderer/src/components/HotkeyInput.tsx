import { useEffect, useState } from 'react'
import { acceleratorFromEvent, formatAccelerator, setHotkeyCapture } from '../hotkey'

interface Props {
  value?: string
  onChange: (accelerator: string | undefined) => void
  id?: string
  failed?: boolean
}

/** Click, then press the combination. Esc cancels, Backspace alone clears. */
export function HotkeyInput({ value, onChange, id, failed }: Props): React.JSX.Element {
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    if (!capturing) return
    setHotkeyCapture(true)
    return () => setHotkeyCapture(false)
  }, [capturing])

  return (
    <button
      id={id}
      type="button"
      className={`hotkey-input${capturing ? ' capturing' : ''}${failed ? ' failed' : ''}`}
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={(e) => {
        if (!capturing) return
        e.preventDefault()
        e.stopPropagation()
        const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
        if (e.key === 'Escape' && plain) return setCapturing(false)
        if (e.key === 'Backspace' && plain) {
          onChange(undefined)
          return setCapturing(false)
        }
        const accelerator = acceleratorFromEvent(e)
        if (!accelerator) return
        onChange(accelerator)
        setCapturing(false)
      }}
    >
      {capturing ? 'Pressione as teclas…' : value ? formatAccelerator(value) : 'Sem atalho'}
    </button>
  )
}
