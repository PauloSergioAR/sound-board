import { useLevelRef } from '../hooks'
import { formatAccelerator } from '../hotkey'
import { AlertIcon, MicIcon, MicOffIcon } from './Icons'

interface Props {
  micEnabled: boolean
  onToggleMic: () => void
  monitorVoice: boolean
  onMonitorVoice: (enabled: boolean) => void
  toggleMicHotkey: string
  micError: string | null
  /** The input is the virtual cable itself, which would feed the mix back into itself. */
  inputIsCable: boolean
}

export function VoicePanel(props: Props): React.JSX.Element {
  const { micEnabled, micError } = props
  const meter = useLevelRef<HTMLDivElement>('voice')

  return (
    <aside className="voice-panel" aria-label="Sua voz">
      <span className="eyebrow">Sua voz</span>
      <button
        type="button"
        className={micEnabled ? 'mic-toggle on' : 'mic-toggle off'}
        aria-pressed={micEnabled}
        onClick={props.onToggleMic}
      >
        {micEnabled ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
        <span className="mic-text">
          <strong>{micEnabled ? 'Mic ligado' : 'Mic mudo'}</strong>
          <span>{micEnabled ? 'Sua voz vai junto com os sons' : 'Só sons e música saem'}</span>
        </span>
        <span className="kbd">{formatAccelerator(props.toggleMicHotkey)}</span>
      </button>
      <div className="meter">
        <div ref={meter} className="meter-fill voice" />
      </div>
      <label className="check">
        <input type="checkbox" checked={props.monitorVoice} onChange={(e) => props.onMonitorVoice(e.target.checked)} />
        Me ouvir no fone
      </label>

      {micError && (
        <p className="notice danger">
          <AlertIcon size={16} />
          <span>{micError}</span>
        </p>
      )}
      {props.inputIsCable && (
        <p className="notice danger">
          <AlertIcon size={16} />
          <span>A entrada está no CABLE Output: o som vai entrar em loop. Escolha seu microfone real em Dispositivos.</span>
        </p>
      )}
    </aside>
  )
}
