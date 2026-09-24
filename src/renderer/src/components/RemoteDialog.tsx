import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { RemoteInfo, RemoteSettings } from '../../../shared/types'
import { AlertIcon, CloseIcon, PhoneIcon } from './Icons'

interface Props {
  remote: RemoteSettings
  info: RemoteInfo | null
  onChange: (change: Partial<RemoteSettings>) => void
  onClose: () => void
}

/** Turn the phone remote on and show the QR code that opens it. */
export function RemoteDialog({ remote, info, onChange, onClose }: Props): React.JSX.Element {
  const [urlIndex, setUrlIndex] = useState(0)
  const [qr, setQr] = useState<string | null>(null)
  const url = info?.running ? info.urls[urlIndex] ?? info.urls[0] : undefined

  useEffect(() => {
    if (!url) return setQr(null)
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#131217', light: '#eeeae3' } }).then(setQr)
  }, [url])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const address = url ? url.replace(/\?t=.*/, '') : ''

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog remote" role="dialog" aria-modal="true" aria-labelledby="remote-title">
        <div className="dialog-head">
          <h2 id="remote-title">Controle pelo celular</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <label className="check">
          <input type="checkbox" checked={remote.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          Permitir controlar os pads por outro dispositivo na mesma rede
        </label>

        {remote.enabled && info?.running && url && (
          <div className="remote-body">
            <div className="qr">{qr ? <img src={qr} alt="QR code do controle remoto" width={240} height={240} /> : null}</div>
            <div className="remote-side">
              <p className="muted small">
                Aponte a câmera do celular para o código. O celular precisa estar no mesmo Wi-Fi que este PC.
              </p>
              {info.urls.length > 1 && (
                <label className="field">
                  Rede
                  <select className="select" value={urlIndex} onChange={(e) => setUrlIndex(Number(e.target.value))}>
                    {info.urls.map((u, i) => (
                      <option key={u} value={i}>
                        {u.replace(/^http:\/\//, '').replace(/\/\?t=.*/, '')}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="mono small remote-address">{address}</span>
              <span className="status ok">
                <PhoneIcon size={14} />
                {info.clients === 0 ? 'Nenhum celular conectado' : `${info.clients} ${info.clients === 1 ? 'conectado' : 'conectados'}`}
              </span>
              <button type="button" className="button ghost" onClick={() => onChange({ token: '' })}>
                Gerar novo link (desconecta os atuais)
              </button>
            </div>
          </div>
        )}

        {remote.enabled && info?.error && (
          <p className="notice danger">
            <AlertIcon size={16} />
            <span>{info.error}</span>
          </p>
        )}

        {remote.enabled && info?.running && (
          <p className="notice warn">
            <AlertIcon size={16} />
            <span>
              Se o Windows perguntar, permita o SoundBoard em <strong>redes privadas</strong>. Se o celular não abrir a
              página, confira se o Wi-Fi do PC está como rede privada.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
