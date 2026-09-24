import { useLevelRef } from '../hooks'
import { LogoIcon } from './Icons'

export type View = 'pads' | 'setup'

interface Props {
  view: View
  onView: (view: View) => void
  /** Label of the device the mix goes to, or null when none is chosen. */
  outputLabel: string | null
  outputIsCable: boolean
}

const TABS: { id: View; label: string }[] = [
  { id: 'pads', label: 'Pads' },
  { id: 'setup', label: 'Dispositivos' }
]

export function Header({ view, onView, outputLabel, outputIsCable }: Props): React.JSX.Element {
  const meter = useLevelRef<HTMLDivElement>('master')

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">
          <LogoIcon />
        </span>
        <span className="brand-name">SoundBoard</span>
      </div>
      <nav className="tabs" aria-label="Seções">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="tab"
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => onView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="spacer" />
      {outputLabel ? (
        <button type="button" className={outputIsCable ? 'on-air' : 'on-air warn'} onClick={() => onView('setup')}>
          <span className="dot" />
          {outputIsCable ? 'No ar' : 'Saída'} · {outputLabel}
        </button>
      ) : (
        <button type="button" className="on-air off" onClick={() => onView('setup')}>
          <span className="dot" />
          Escolha a saída
        </button>
      )}
      <div className="header-meter">
        <span>Saída</span>
        <div className="meter wide">
          <div ref={meter} className="meter-fill" />
        </div>
      </div>
    </header>
  )
}
