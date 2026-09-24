import type { Settings } from '../../../shared/types'
import { engine } from '../audio'
import { type AudioDevices, isAlias, isCableInput, isHandsFree, isVirtual, useLevelRef } from '../hooks'
import { HotkeyInput } from './HotkeyInput'
import { AlertIcon, CheckIcon } from './Icons'

interface Props {
  settings: Settings
  devices: AudioDevices
  failedHotkeys: string[]
  onDevices: (devices: Partial<Settings['devices']>) => void
  onHotkeys: (hotkeys: Partial<Settings['hotkeys']>) => void
}

const DISCORD_STEPS = [
  'Configurações de voz → Dispositivo de entrada: CABLE Output',
  'Supressão de ruído (Krisp): desligada',
  'Cancelamento de eco: desligado',
  'Controle automático de ganho: desligado',
  'Detecção de voz com sensibilidade baixa, ou ajuste manual'
]

export function SetupView({ settings, devices, failedHotkeys, onDevices, onHotkeys }: Props): React.JSX.Element {
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
              <span>Voz + pads</span>
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
