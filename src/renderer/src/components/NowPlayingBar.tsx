import { useRef, useSyncExternalStore } from 'react'
import type { DeckSettings } from '../../../shared/types'
import { engine } from '../audio'
import { browserMedia } from '../audio/browserMedia'
import { useAnimationFrame } from '../hooks'
import { DeckProgress, formatTime } from './DeckProgress'
import { GlobeIcon, ListIcon, MicIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon } from './Icons'

export type NowPlayingSource = 'deck' | 'browser'

interface Props {
  source: NowPlayingSource
  deck: DeckSettings
  onDeckChange: (change: Partial<DeckSettings>) => void
  musicVolume: number
  onMusicVolume: (volume: number) => void
  browserVolume: number
  onBrowserVolume: (volume: number) => void
  /** The user paused from this bar; keep it visible so they can resume. */
  onPausedHere: (source: NowPlayingSource) => void
  onOpen: (source: NowPlayingSource) => void
}

/**
 * Bottom player, shown on every screen while something plays: the deck's music, or whatever
 * plays in the embedded browser (YouTube, SoundCloud…), YouTube Music style.
 */
export function NowPlayingBar(props: Props): React.JSX.Element {
  const { source, deck } = props
  const deckState = useSyncExternalStore(engine.deck.subscribe, engine.deck.getState)
  const web = useSyncExternalStore(browserMedia.subscribe, browserMedia.get)

  const duckRef = useRef<HTMLSpanElement>(null)
  const duckChipRef = useRef<HTMLButtonElement>(null)
  useAnimationFrame(true, () => {
    const ducked = deck.ducking.enabled && engine.duckDb < -2
    if (duckRef.current) duckRef.current.textContent = `−${ducked ? Math.round(-engine.duckDb) : deck.ducking.amount} dB`
    duckChipRef.current?.classList.toggle('active', ducked)
  })

  const isDeck = source === 'deck'
  const playlist = deck.playlists.find((p) => p.id === deck.playlistId) ?? deck.playlists[0]
  const track = deck.playlists.flatMap((p) => p.tracks).find((t) => t.id === deckState.currentId)
  const playing = isDeck ? deckState.playing : !!web?.playing
  const volume = isDeck ? props.musicVolume : props.browserVolume

  const toggle = (): void => {
    if (playing) props.onPausedHere(source)
    if (isDeck) engine.deck.toggle()
    else browserMedia.toggle()
  }

  return (
    <section className="deck" aria-label="Tocando agora">
      {!isDeck && web?.artwork ? (
        <img className="deck-thumb" src={web.artwork} alt="" />
      ) : (
        <div className="deck-art">{isDeck ? <MusicIcon size={24} /> : <GlobeIcon size={22} />}</div>
      )}
      <div className="deck-title">
        <span className={isDeck ? 'eyebrow violet' : 'eyebrow orange'}>
          {isDeck ? `${playlist.name} · ${playlist.tracks.length}` : web?.artist || 'Navegador'}
        </span>
        <span className="deck-name" title={isDeck ? track?.path : web?.title}>
          {isDeck ? track?.name ?? 'Música' : web?.title ?? 'Navegador'}
        </span>
      </div>

      <div className="deck-controls">
        {isDeck && (
          <button type="button" className="icon-button" aria-label="Anterior" onClick={() => engine.deck.previous()}>
            <PrevIcon />
          </button>
        )}
        <button type="button" className="deck-play" aria-label={playing ? 'Pausar' : 'Tocar'} onClick={toggle}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        {isDeck && (
          <button type="button" className="icon-button" aria-label="Próxima" onClick={() => engine.deck.next()}>
            <NextIcon />
          </button>
        )}
      </div>

      {isDeck ? (
        <DeckProgress disabled={!track} />
      ) : (
        <div className="deck-progress">
          <span>{formatTime(web?.time ?? 0)}</span>
          <input
            type="range"
            aria-label="Posição"
            min={0}
            max={web?.duration || 1}
            step={1}
            value={web?.time ?? 0}
            disabled={!web?.duration}
            onChange={(e) => browserMedia.seek(Number(e.target.value))}
          />
          <span>{formatTime(web?.duration ?? 0)}</span>
        </div>
      )}

      <label className="deck-volume" title={isDeck ? 'Volume da música' : 'Volume do navegador'}>
        <VolumeIcon size={16} />
        <input
          type="range"
          aria-label={isDeck ? 'Volume da música' : 'Volume do navegador'}
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => (isDeck ? props.onMusicVolume : props.onBrowserVolume)(Number(e.target.value) / 100)}
        />
      </label>

      <button
        ref={duckChipRef}
        type="button"
        className="duck-chip"
        aria-pressed={deck.ducking.enabled}
        title="Ducking: a música abaixa enquanto você fala"
        onClick={() => props.onDeckChange({ ducking: { ...deck.ducking, enabled: !deck.ducking.enabled } })}
      >
        <MicIcon size={14} />
        {deck.ducking.enabled ? (
          <>
            Ducking <span ref={duckRef} className="mono" />
          </>
        ) : (
          'Ducking desligado'
        )}
      </button>

      <button type="button" className="button" onClick={() => props.onOpen(source)}>
        {isDeck ? <ListIcon size={16} /> : <GlobeIcon size={16} />}
        {isDeck ? 'Playlists' : 'Abrir'}
      </button>
    </section>
  )
}
