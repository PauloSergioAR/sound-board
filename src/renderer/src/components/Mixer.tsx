import type { BusId, BusSettings } from '../../../shared/types'
import { useLevelRef } from '../hooks'
import { formatAccelerator } from '../hotkey'
import { StopIcon } from './Icons'

interface Props {
  mixer: Record<BusId, BusSettings>
  onChange: (bus: BusId, value: BusSettings) => void
  onStopAll: () => void
  stopAllHotkey: string
}

const STRIPS: { id: BusId; label: string; hint: string }[] = [
  { id: 'voice', label: 'Voz', hint: 'Seu microfone' },
  { id: 'sfx', label: 'Efeitos', hint: 'Pads' },
  { id: 'master', label: 'Master', hint: 'O que sai no CABLE' },
  { id: 'monitor', label: 'Monitor', hint: 'Seu fone' }
]

export function Mixer({ mixer, onChange, onStopAll, stopAllHotkey }: Props): React.JSX.Element {
  return (
    <section className="mixer" aria-label="Mixer">
      <div className="strips">
        {STRIPS.map((s) => (
          <Strip key={s.id} {...s} value={mixer[s.id]} onChange={(v) => onChange(s.id, v)} />
        ))}
      </div>
      <button type="button" className="stop-all" onClick={onStopAll}>
        <span className="stop-all-label">
          <StopIcon />
          PARAR TUDO
        </span>
        <span className="mono">{formatAccelerator(stopAllHotkey)}</span>
      </button>
    </section>
  )
}

interface StripProps {
  id: BusId
  label: string
  hint: string
  value: BusSettings
  onChange: (value: BusSettings) => void
}

function Strip({ id, label, hint, value, onChange }: StripProps): React.JSX.Element {
  const meter = useLevelRef<HTMLDivElement>(id)
  return (
    <div className={`strip strip-${id}`}>
      <div className="strip-head">
        <span>
          <strong>{label}</strong> <span className="muted">{hint}</span>
        </span>
        <button
          type="button"
          className="mute"
          aria-pressed={value.muted}
          aria-label={`Silenciar ${label}`}
          onClick={() => onChange({ ...value, muted: !value.muted })}
        >
          M
        </button>
      </div>
      <div className="meter">
        <div ref={meter} className="meter-fill" />
      </div>
      <input
        type="range"
        aria-label={`Volume ${label}`}
        min={0}
        max={100}
        value={Math.round(value.volume * 100)}
        onChange={(e) => onChange({ ...value, volume: Number(e.target.value) / 100 })}
      />
    </div>
  )
}
