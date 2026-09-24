import { useLevelRef } from '../hooks'
import { HeadphonesIcon, LogoIcon, PhoneIcon } from './Icons'

export type View = 'pads' | 'music' | 'browser' | 'setup'

interface Props {
  view: View
  onView: (view: View) => void
  /** Label of the device the mix goes to, or null when none is chosen. */
  outputLabel: string | null
  outputIsCable: boolean
  /** Phones connected to the remote, or null when it is off. */
  remoteClients: number | null
  onRemote: () => void
  monitorVoice: boolean
  onMonitorVoice: (enabled: boolean) => void
}

const TABS: { id: View; label: string }[] = [
  { id: 'pads', label: 'Pads' },
  { id: 'music', label: 'Música' },
  { id: 'browser', label: 'Navegador' },
  { id: 'setup', label: 'Dispositivos' }
]

export function Header(props: Props): React.JSX.Element {
  const { view, onView, outputLabel, outputIsCable, remoteClients, onRemote, monitorVoice, onMonitorVoice } = props
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
      <button
        type="button"
        className={monitorVoice ? 'remote-button on' : 'remote-button'}
        aria-pressed={monitorVoice}
        onClick={() => onMonitorVoice(!monitorVoice)}
        title="Ouvir a própria voz (com efeito) no fone"
      >
        <HeadphonesIcon size={16} />
        {monitorVoice ? 'Me ouvindo' : 'Me ouvir'}
      </button>
      <button
        type="button"
        className={remoteClients === null ? 'remote-button' : 'remote-button on'}
        onClick={onRemote}
        title="Controlar pelo celular"
      >
        <PhoneIcon size={16} />
        {remoteClients === null ? 'Celular' : remoteClients > 0 ? `Celular · ${remoteClients}` : 'Celular · pronto'}
      </button>
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
