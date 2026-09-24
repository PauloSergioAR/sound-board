import { useRef } from 'react'
import { engine } from '../audio'
import { useAnimationFrame } from '../hooks'

export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Seek bar plus elapsed/total time of the deck, updated every frame without re-rendering. */
export function DeckProgress({ disabled }: { disabled: boolean }): React.JSX.Element {
  const seekRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const durationRef = useRef<HTMLSpanElement>(null)
  const seeking = useRef(false)

  useAnimationFrame(true, () => {
    const { time, duration } = engine.deck.position()
    if (seekRef.current && !seeking.current) {
      seekRef.current.max = String(duration || 1)
      seekRef.current.value = String(time)
    }
    if (timeRef.current) timeRef.current.textContent = formatTime(time)
    if (durationRef.current) durationRef.current.textContent = formatTime(duration)
  })

  return (
    <div className="deck-progress">
      <span ref={timeRef}>0:00</span>
      <input
        ref={seekRef}
        type="range"
        aria-label="Posição da música"
        min={0}
        max={1}
        step={0.1}
        defaultValue={0}
        disabled={disabled}
        onPointerDown={() => (seeking.current = true)}
        onPointerUp={() => (seeking.current = false)}
        onChange={(e) => engine.deck.seek(Number(e.target.value))}
      />
      <span ref={durationRef}>0:00</span>
    </div>
  )
}
