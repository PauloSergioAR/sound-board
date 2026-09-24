import { useEffect, useRef, useState } from 'react'
import type { BrowserRoute, BrowserSettings } from '../../../shared/types'
import { engine } from '../audio'
import type { Clip } from '../audio/wav'
import { useAnimationFrame } from '../hooks'
import { AlertIcon, BackIcon, ForwardIcon, GlobeIcon, ReloadIcon, ScissorsIcon } from './Icons'

interface Props {
  visible: boolean
  settings: BrowserSettings
  onChange: (change: Partial<BrowserSettings>) => void
  onClip: (clip: Clip) => void
}

const SHORTCUTS = [
  { label: 'YouTube', url: 'https://www.youtube.com' },
  { label: 'MyInstants', url: 'https://www.myinstants.com/pt/index/br/' },
  { label: 'SoundCloud', url: 'https://soundcloud.com' }
]

const ROUTES: { id: BrowserRoute; label: string; hint: string }[] = [
  { id: 'music', label: 'Canal Música', hint: 'com ducking quando você fala' },
  { id: 'sfx', label: 'Canal Efeitos', hint: 'junto com os pads' },
  { id: 'monitor', label: 'Só no meu fone', hint: 'pré-escuta, ninguém ouve' }
]

/** Turns what was typed in the address bar into a URL; anything else becomes a YouTube search. */
function toUrl(input: string): string {
  const text = input.trim()
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return `https://${text}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`
}

export function BrowserView({ visible, settings, onChange, onClip }: Props): React.JSX.Element {
  const webview = useRef<Electron.WebviewTag>(null)
  const initialUrl = useRef(settings.lastUrl)
  const [address, setAddress] = useState(settings.lastUrl)
  const [nav, setNav] = useState({ back: false, forward: false, loading: false })
  const [playing, setPlaying] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [clipping, setClipping] = useState(false)
  const meter = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const retryCapture = useRef<(() => Promise<void>) | null>(null)

  useAnimationFrame(visible, () => {
    if (meter.current) meter.current.style.width = `${Math.round(engine.browserLevel() * 100)}%`
  })

  useEffect(() => {
    const view = webview.current
    if (!view) return
    let captured = false

    const updateNav = (): void =>
      setNav((n) => ({ ...n, back: view.canGoBack(), forward: view.canGoForward() }))
    const onNavigate = (e: Electron.DidNavigateEvent | Electron.DidNavigateInPageEvent): void => {
      if ('isMainFrame' in e && !e.isMainFrame) return
      setAddress(e.url)
      onChangeRef.current({ lastUrl: e.url })
      updateNav()
    }
    // Route the page's audio into the mixer as soon as the guest exists. The capture diverts the
    // audio (suppressLocalAudioPlayback): it stops going to the speakers directly and only reaches
    // them through our monitor.
    const onReady = async (): Promise<void> => {
      if (captured) return
      captured = true
      try {
        if (!(await window.api.prepareBrowserCapture(view.getWebContentsId()))) throw new Error('webview não encontrado')
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            suppressLocalAudioPlayback: true,
            // Voice processing would mangle music, same as on the microphone.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2
          } as MediaTrackConstraints,
          video: { width: 1, height: 1, frameRate: 1 }
        })
        // getDisplayMedia always includes video; only the audio is wanted.
        stream.getVideoTracks().forEach((t) => {
          t.stop()
          stream.removeTrack(t)
        })
        engine.setBrowserStream(stream)
        setCaptureError(null)
      } catch (err) {
        captured = false
        setCaptureError(`Não consegui capturar o áudio do navegador: ${(err as Error).message}`)
      }
    }
    const onStart = (): void => setNav((n) => ({ ...n, loading: true }))
    const onStop = (): void => setNav((n) => ({ ...n, loading: false }))
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)

    retryCapture.current = onReady
    view.addEventListener('dom-ready', onReady)
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate-in-page', onNavigate)
    view.addEventListener('did-start-loading', onStart)
    view.addEventListener('did-stop-loading', onStop)
    view.addEventListener('media-started-playing', onPlay)
    view.addEventListener('media-paused', onPause)
    return () => {
      view.removeEventListener('dom-ready', onReady)
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate-in-page', onNavigate)
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
      view.removeEventListener('media-started-playing', onPlay)
      view.removeEventListener('media-paused', onPause)
      engine.setBrowserStream(null)
    }
  }, [])

  // If the capture failed while the browser was behind other screens, try again once it is shown.
  useEffect(() => {
    if (visible && captureError) retryCapture.current?.()
  }, [visible, captureError])

  const go = (url: string): void => {
    webview.current?.loadURL(url).catch(() => undefined)
    setAddress(url)
  }

  const clip = async (): Promise<void> => {
    setClipping(true)
    const snapshot = await engine.snapshotBrowser()
    setClipping(false)
    if (snapshot?.left.length) onClip(snapshot)
  }

  return (
    // Tucked behind the other screens, never unmounted or made invisible: the page keeps playing and
    // stays captured while you use the pads (a hidden webview stops producing frames and the capture stalls).
    <div className={visible ? 'browser' : 'browser offstage'} aria-hidden={!visible}>
      <div className="browser-main">
        <div className="browser-toolbar">
          <button type="button" className="icon-button" aria-label="Voltar" disabled={!nav.back} onClick={() => webview.current?.goBack()}>
            <BackIcon />
          </button>
          <button type="button" className="icon-button" aria-label="Avançar" disabled={!nav.forward} onClick={() => webview.current?.goForward()}>
            <ForwardIcon />
          </button>
          <button type="button" className="icon-button" aria-label="Recarregar" onClick={() => webview.current?.reload()}>
            <ReloadIcon />
          </button>
          <form
            className="address"
            onSubmit={(e) => {
              e.preventDefault()
              go(toUrl(address))
            }}
          >
            <GlobeIcon size={15} />
            <input
              aria-label="Endereço ou busca no YouTube"
              placeholder="Endereço ou busca no YouTube"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            {nav.loading && <span className="spinner" aria-label="Carregando" />}
          </form>
        </div>
        <div className="browser-shortcuts">
          {SHORTCUTS.map((s) => (
            <button key={s.label} type="button" className="chip" onClick={() => go(s.url)}>
              {s.label}
            </button>
          ))}
          <div className="spacer" />
          <span className="muted small">Sons baixados aqui (ex.: MyInstants) viram pads na categoria atual</span>
        </div>
        <webview ref={webview} className="webview" src={initialUrl.current} partition="persist:browser" />
      </div>

      <aside className="browser-side" aria-label="Áudio desta aba">
        <span className="eyebrow">Áudio desta aba</span>
        <span className="browser-status">
          <span className={playing ? 'dot on' : 'dot'} />
          {playing ? 'Tocando' : 'Nada tocando'}
        </span>
        <div className="meter">
          <div ref={meter} className="meter-fill music" />
        </div>

        <fieldset className="field">
          <legend>Enviar para</legend>
          {ROUTES.map((r) => (
            <label key={r.id} className="route">
              <input type="radio" name="browser-route" checked={settings.route === r.id} onChange={() => onChange({ route: r.id })} />
              <span>
                {r.label}
                <span className="muted small">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span className="field-label-row">
            Volume da aba <span className="mono">{Math.round(settings.volume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
          />
        </label>

        <div className="divider" />
        <span className="eyebrow">Recortar para pad</span>
        <p className="muted small">
          O app guarda sempre os últimos 30 segundos do navegador. Ouviu algo engraçado? Recorte e salve como pad.
        </p>
        <button type="button" className="button primary" onClick={clip} disabled={clipping}>
          <ScissorsIcon size={16} />
          Recortar últimos 30 s
        </button>

        {captureError && (
          <p className="notice danger">
            <AlertIcon size={16} />
            <span>{captureError}</span>
          </p>
        )}
      </aside>
    </div>
  )
}
