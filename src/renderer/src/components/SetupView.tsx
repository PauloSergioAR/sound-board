import { useRef, useState } from 'react'
import type { DuckingSettings, Settings, VbCableStep } from '../../../shared/types'
import { engine } from '../audio'
import { type AudioDevices, isAlias, isCableInput, isHandsFree, isVirtual, useAnimationFrame, useLevelRef } from '../hooks'
import { HotkeyInput } from './HotkeyInput'
import { AlertIcon, CheckIcon } from './Icons'

interface Props {
  settings: Settings
  devices: AudioDevices
  failedHotkeys: string[]
  onDevices: (devices: Partial<Settings['devices']>) => void
  onHotkeys: (hotkeys: Partial<Settings['hotkeys']>) => void
  onDucking: (ducking: DuckingSettings) => void
}

const VBCABLE_STEPS: Record<VbCableStep, string> = {
  download: 'Baixando do site da VB-Audio…',
  verify: 'Conferindo a assinatura digital…',
  install: 'Instalando: confirme as janelas do Windows…'
}

/** First-run helper: installs the virtual cable the whole app depends on. */
function VbCableCard({ onInstalled }: { onInstalled: () => void }): React.JSX.Element {
  const [state, setState] = useState<{ step: VbCableStep | 'idle' | 'done'; error?: string }>({ step: 'idle' })
  const busy = state.step !== 'idle' && state.step !== 'done'

  const install = async (): Promise<void> => {
    setState({ step: 'download' })
    const result = await window.api.installVbCable((step) => setState({ step }))
    if (result.ok) {
      setState({ step: 'done' })
      onInstalled()
    } else {
      setState({ step: 'idle', error: result.error })
    }
  }

  return (
    <section className="card vbcable" aria-label="Instalar VB-Cable">
      <div className="card-head">
        <h2>Falta o microfone virtual</h2>
        <span className="status bad">
          <AlertIcon size={14} />
          VB-Cable não encontrado
        </span>
      </div>
      <p className="muted small">
        O SoundBoard entrega o áudio no <strong>VB-Cable</strong>, um driver gratuito (doação) da VB-Audio. O app baixa o
        instalador oficial de vb-audio.com, confere a assinatura e instala. O Windows vai pedir permissão e confirmar a
        instalação do driver.
      </p>
      {state.step === 'done' ? (
        <p className="notice ok">
          <CheckIcon size={16} />
          <span>
            VB-Cable instalado. Se o "CABLE Input" não aparecer na lista em alguns segundos, reinicie o PC.
          </span>
        </p>
      ) : (
        <div className="vbcable-actions">
          <button type="button" className="button primary" onClick={install} disabled={busy}>
            {busy ? <span className="spinner dark" aria-hidden="true" /> : null}
            {busy ? VBCABLE_STEPS[state.step as VbCableStep] : 'Instalar VB-Cable'}
          </button>
          <button type="button" className="button ghost" onClick={() => window.api.openVbCablePage()}>
            Site da VB-Audio / doar
          </button>
        </div>
      )}
      {state.error && (
        <p className="notice danger">
          <AlertIcon size={16} />
          <span>{state.error}</span>
        </p>
      )}
    </section>
  )
}

const CALIBRATION_FLOOR = -70
const CALIBRATION_CEIL = -10
const toPercent = (db: number): number =>
  Math.min(100, Math.max(0, ((db - CALIBRATION_FLOOR) / (CALIBRATION_CEIL - CALIBRATION_FLOOR)) * 100))

/** Threshold and depth of the ducking, with a live mic meter to find the right threshold. */
function DuckingCard({ ducking, onChange }: { ducking: DuckingSettings; onChange: (d: DuckingSettings) => void }): React.JSX.Element {
  const fill = useRef<HTMLDivElement>(null)
  useAnimationFrame(true, () => {
    const db = engine.micDb()
    if (!fill.current) return
    fill.current.style.width = `${toPercent(db)}%`
    fill.current.classList.toggle('over', db > ducking.threshold)
  })

  return (
    <section className="card" aria-label="Ducking">
      <div className="card-head">
        <h2>Ducking da música</h2>
        <label className="check">
          <input type="checkbox" checked={ducking.enabled} onChange={(e) => onChange({ ...ducking, enabled: e.target.checked })} />
          Ligado
        </label>
      </div>
      <p className="muted small">
        Quando você fala, a música abaixa sozinha e volta quando você para. Fale normalmente e ajuste a sensibilidade
        até a barra ficar laranja só quando você fala.
      </p>
      <div className="calibration" aria-hidden="true">
        <div ref={fill} className="calibration-fill" />
        <div className="calibration-mark" style={{ left: `${toPercent(ducking.threshold)}%` }} />
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field-label-row">
            Sensibilidade <span className="mono">{ducking.threshold} dB</span>
          </span>
          <input
            type="range"
            min={CALIBRATION_FLOOR}
            max={CALIBRATION_CEIL}
            value={ducking.threshold}
            onChange={(e) => onChange({ ...ducking, threshold: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field-label-row">
            Quanto abaixa <span className="mono">−{ducking.amount} dB</span>
          </span>
          <input
            type="range"
            min={3}
            max={30}
            value={ducking.amount}
            onChange={(e) => onChange({ ...ducking, amount: Number(e.target.value) })}
          />
        </label>
      </div>
    </section>
  )
}

const DISCORD_STEPS = [
  'Configurações de voz → Dispositivo de entrada: CABLE Output',
  'Supressão de ruído (Krisp): desligada',
  'Cancelamento de eco: desligado',
  'Controle automático de ganho: desligado',
  'Detecção de voz com sensibilidade baixa, ou ajuste manual'
]

export function SetupView({ settings, devices, failedHotkeys, onDevices, onHotkeys, onDucking }: Props): React.JSX.Element {
  const { inputId, outputId, monitorId } = settings.devices
  const cable = devices.outputs.find(isCableInput)
  const input = devices.inputs.find((d) => d.deviceId === (inputId || 'default'))
  const output = devices.outputs.find((d) => d.deviceId === outputId)
  const monitor = devices.outputs.find((d) => d.deviceId === (monitorId || 'default'))
  const micMeter = useLevelRef<HTMLDivElement>('voice')
  const physicalInputs = devices.inputs.filter((d) => !isVirtual(d))
  const physicalOutputs = devices.outputs.filter((d) => !isVirtual(d))
  const windowsDefaultOutput = devices.outputs.find(isAlias)

  return (
    <div className="setup">
      <div className="setup-main">
        <div>
          <h1>Dispositivos e roteamento</h1>
          <p className="muted">
            O SoundBoard mistura tudo e entrega no microfone virtual. Discord e Wardogs escutam o CABLE Output.
          </p>
        </div>

        {!cable && <VbCableCard onInstalled={devices.refresh} />}

        <section className="card" aria-label="Fluxo de áudio">
          <div className="flow">
            <div className="flow-node">
              <span className="eyebrow blue">1 · Seu microfone</span>
              <label className="field">
                Entrada
                <select className="select" value={inputId || 'default'} onChange={(e) => onDevices({ inputId: e.target.value })}>
                  {physicalInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Microfone sem nome'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="meter">
                <div ref={micMeter} className="meter-fill voice" />
              </div>
            </div>

            <div className="flow-node accent">
              <span className="eyebrow orange">2 · Mixer</span>
              <span>Voz + pads + música</span>
              <span className="muted small">Limitador no master evita estourar</span>
            </div>

            <div className="flow-node">
              <span className="eyebrow orange">3 · Saída virtual</span>
              <label className="field">
                Enviar para
                <select className="select" value={outputId} onChange={(e) => onDevices({ outputId: e.target.value })}>
                  <option value="">Nenhuma</option>
                  {devices.outputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Saída sem nome'}
                    </option>
                  ))}
                </select>
              </label>
              {cable ? (
                <span className="status ok">
                  <CheckIcon size={14} />
                  VB-Cable detectado
                </span>
              ) : (
                <span className="status bad">
                  <AlertIcon size={14} />
                  VB-Cable não encontrado
                </span>
              )}
            </div>

            <div className="flow-node">
              <span className="eyebrow violet">4 · Apps</span>
              <span>Discord e Wardogs</span>
              <span className="muted small">
                Microfone = <strong>CABLE Output</strong>
              </span>
            </div>
          </div>

          <div className="divider" />

          <div className="monitor-row">
            <label className="field grow">
              Monitor: onde você escuta
              <select className="select" value={monitorId || 'default'} onChange={(e) => onDevices({ monitorId: e.target.value })}>
                {physicalOutputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Saída sem nome'}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="button" onClick={() => engine.playTestTone()}>
              Tocar som de teste
            </button>
          </div>
        </section>

        <DuckingCard ducking={settings.deck.ducking} onChange={onDucking} />

        {windowsDefaultOutput && isVirtual(windowsDefaultOutput) && (
          <p className="notice warn">
            <AlertIcon size={18} />
            <span>
              O Windows está usando o CABLE como saída padrão: o som do PC inteiro vai para o microfone e você não ouve
              nada. Clique no ícone de som da barra de tarefas e escolha seu fone ou caixas como saída.
            </span>
          </p>
        )}
        {output && !isCableInput(output) && (
          <p className="notice warn">
            <AlertIcon size={18} />
            <span>
              A saída não é o CABLE Input: o Discord não vai receber o áudio, e você vai se ouvir em "{output.label}".
            </span>
          </p>
        )}
        {[input, monitor].some((d) => d && isHandsFree(d)) && (
          <p className="notice warn">
            <AlertIcon size={18} />
            <span>
              Dispositivo Bluetooth em modo Hands-Free: a qualidade cai para a de telefone. Prefira o dongle USB do headset
              ou o microfone Realtek.
            </span>
          </p>
        )}
      </div>

      <div className="setup-side">
        <section className="card">
          <h2>Checklist do Discord</h2>
          <ol className="steps">
            {DISCORD_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h2>Wardogs</h2>
          <p className="muted small">
            No chat de voz, escolha CABLE Output como microfone. Se o jogo não tiver essa opção, defina o CABLE Output como
            microfone padrão do Windows.
          </p>
        </section>

        <section className="card">
          <h2>Atalhos globais</h2>
          <p className="muted small">Funcionam com o jogo em foco. Atalhos de cada som ficam no próprio pad (clique direito).</p>
          <div className="hotkey-row">
            <label htmlFor="hk-stop">Parar tudo</label>
            <HotkeyInput
              id="hk-stop"
              value={settings.hotkeys.stopAll}
              failed={failedHotkeys.includes(settings.hotkeys.stopAll)}
              onChange={(h) => h && onHotkeys({ stopAll: h })}
            />
          </div>
          <div className="hotkey-row">
            <label htmlFor="hk-mic">Mutar / desmutar mic</label>
            <HotkeyInput
              id="hk-mic"
              value={settings.hotkeys.toggleMic}
              failed={failedHotkeys.includes(settings.hotkeys.toggleMic)}
              onChange={(h) => h && onHotkeys({ toggleMic: h })}
            />
          </div>
          <div className="hotkey-row">
            <label htmlFor="hk-deck">Tocar / pausar música</label>
            <HotkeyInput
              id="hk-deck"
              value={settings.hotkeys.deckToggle}
              failed={failedHotkeys.includes(settings.hotkeys.deckToggle)}
              onChange={(h) => h && onHotkeys({ deckToggle: h })}
            />
          </div>
          <div className="hotkey-row">
            <label htmlFor="hk-next">Próxima música</label>
            <HotkeyInput
              id="hk-next"
              value={settings.hotkeys.deckNext}
              failed={failedHotkeys.includes(settings.hotkeys.deckNext)}
              onChange={(h) => h && onHotkeys({ deckNext: h })}
            />
          </div>
          <div className="hotkey-row">
            <label htmlFor="hk-fx">Liga/desliga efeito de voz</label>
            <HotkeyInput
              id="hk-fx"
              value={settings.hotkeys.toggleFx}
              failed={failedHotkeys.includes(settings.hotkeys.toggleFx)}
              onChange={(h) => h && onHotkeys({ toggleFx: h })}
            />
          </div>
          {failedHotkeys.length > 0 && (
            <p className="notice warn">
              <AlertIcon size={16} />
              <span>Não consegui registrar: {failedHotkeys.join(', ')}. Outro programa pode estar usando.</span>
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
