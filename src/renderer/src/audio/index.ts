import { AudioEngine } from './engine'

/** One engine for the lifetime of the window. */
export const engine = new AudioEngine((file) => window.api.readSound(file))

// Reachable from DevTools while developing (`__engine.getLevel('master')`); never in a build.
if (import.meta.env.DEV) Object.assign(window, { __engine: engine })
