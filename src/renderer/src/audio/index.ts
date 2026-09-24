import { AudioEngine } from './engine'

/** One engine for the lifetime of the window. */
export const engine = new AudioEngine((file) => window.api.readSound(file))
