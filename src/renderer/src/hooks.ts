import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { BusId, Settings } from '../../shared/types'
import { engine } from './audio'

export type UpdateSettings = (change: (s: Settings) => Settings) => void

/** Settings loaded from disk, saved back shortly after every change. */
export function useSettings(): [Settings | null, UpdateSettings] {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.api.loadSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (!settings) return
    const timer = setTimeout(() => window.api.saveSettings(settings), 400)
    return () => clearTimeout(timer)
  }, [settings])

  const update = useCallback<UpdateSettings>((change) => setSettings((s) => (s ? change(s) : s)), [])
  return [settings, update]
}

export interface AudioDevices {
  inputs: MediaDeviceInfo[]
  outputs: MediaDeviceInfo[]
  refresh: () => void
}

export function useDevices(): AudioDevices {
  const [devices, setDevices] = useState<Omit<AudioDevices, 'refresh'>>({ inputs: [], outputs: [] })

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices()
    // Chrome adds a "communications" alias for the Windows communications device; it only adds confusion here.
    const usable = all.filter((d) => d.deviceId !== 'communications')
    setDevices({
      inputs: usable.filter((d) => d.kind === 'audioinput'),
      outputs: usable.filter((d) => d.kind === 'audiooutput')
    })
  }, [])

  useEffect(() => {
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [refresh])

  return { ...devices, refresh }
}

export const isCableInput = (d: MediaDeviceInfo): boolean => /CABLE Input/i.test(d.label)
export const isCableOutput = (d: MediaDeviceInfo): boolean => /CABLE Output/i.test(d.label)
/** Any VB-Audio device (CABLE Input, CABLE Output, CABLE In 16ch…). */
export const isVirtual = (d: MediaDeviceInfo): boolean => /VB-Audio/i.test(d.label)
/** Chrome's "default" entry mirrors whatever Windows has as default; the real device is listed separately. */
export const isAlias = (d: MediaDeviceInfo): boolean => d.deviceId === 'default'
export const isHandsFree = (d: MediaDeviceInfo): boolean => /hands-free/i.test(d.label)

let playingVersion = 0
engine.subscribe(() => playingVersion++)
const subscribePlaying = (cb: () => void): (() => void) => engine.subscribe(cb)

/** Re-renders whenever a pad starts or stops. */
export function usePlayingVersion(): number {
  return useSyncExternalStore(subscribePlaying, () => playingVersion)
}

/** Runs `frame` on every animation frame while `active` is true. */
export function useAnimationFrame(active: boolean, frame: () => void): void {
  const frameRef = useRef(frame)
  frameRef.current = frame
  useEffect(() => {
    if (!active) return
    let id = requestAnimationFrame(function loop() {
      frameRef.current()
      id = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(id)
  }, [active])
}

/** Ref for an element whose width tracks a bus level, updated without re-rendering. */
export function useLevelRef<T extends HTMLElement>(bus: BusId): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  useAnimationFrame(true, () => {
    if (ref.current) ref.current.style.width = `${Math.round(engine.getLevel(bus) * 100)}%`
  })
  return ref
}
