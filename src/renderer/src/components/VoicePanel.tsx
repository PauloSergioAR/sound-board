import type { VoiceFxSettings, VoicePresetId } from '../../../shared/types'
import { PRESETS, presetDefaults } from '../audio/presets'
import { useLevelRef } from '../hooks'
import { formatAccelerator } from '../hotkey'
import { AlertIcon, MicIcon, MicOffIcon } from './Icons'

interface Props {
  micEnabled: boolean
  onToggleMic: () => void
  monitorVoice: boolean
  onMonitorVoice: (enabled: boolean) => void
  voiceFx: VoiceFxSettings
  onVoiceFx: (change: Partial<VoiceFxSettings>) => void
  pitchAvailable: boolean
  toggleMicHotkey: string
  toggleFxHotkey: string
  micError: string | null
  /** The input is the virtual cable itself, which would feed the mix back into itself. */
  inputIsCable: boolean
}

export function VoicePanel(props: Props): React.JSX.Element {
  const { micEnabled, micError, voiceFx, onVoiceFx } = props
  const meter = useLevelRef<HTMLDivElement>('voice')
  const pickPreset = (preset: VoicePresetId): void => onVoiceFx({ enabled: true, preset, ...presetDefaults(preset) })

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

      <div className="fx-head">
        <span className="eyebrow" id="fx-label">
          Efeito de voz
        </span>
        <span className="kbd" title="Liga/desliga o efeito">
          {formatAccelerator(props.toggleFxHotkey)}
        </span>
      </div>
      <div className="fx-presets" role="radiogroup" aria-labelledby="fx-label">
        <button type="button" role="radio" aria-checked={!voiceFx.enabled} onClick={() => onVoiceFx({ enabled: false })}>
          Sem efeito
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={voiceFx.enabled && voiceFx.preset === p.id}
            onClick={() => pickPreset(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <fieldset className="fx-knobs" disabled={!voiceFx.enabled}>
        <label className="field">
          <span className="field-label-row">
            Tom
            <span className="mono">
              {voiceFx.pitch > 0 ? '+' : voiceFx.pitch < 0 ? '−' : ''}
              {Math.abs(voiceFx.pitch)} st
            </span>
          </span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={voiceFx.pitch}
            disabled={!props.pitchAvailable}
            onChange={(e) => onVoiceFx({ pitch: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field-label-row">
            Eco <span className="mono">{Math.round(voiceFx.echo * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(voiceFx.echo * 100)}
            onChange={(e) => onVoiceFx({ echo: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="field">
          <span className="field-label-row">
            Reverb <span className="mono">{Math.round(voiceFx.reverb * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(voiceFx.reverb * 100)}
            onChange={(e) => onVoiceFx({ reverb: Number(e.target.value) / 100 })}
          />
        </label>
      </fieldset>
      {!props.monitorVoice && voiceFx.enabled && (
        <span className="muted small">Ligue "Me ouvir no fone" para ouvir o efeito na sua voz.</span>
      )}

      {!props.pitchAvailable && (
        <p className="notice warn">
          <AlertIcon size={16} />
          <span>O ajuste de tom não carregou. Os outros efeitos funcionam normalmente.</span>
        </p>
      )}
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
