// Globals of the AudioWorklet scope (not part of TypeScript's DOM lib).
declare const sampleRate: number
declare function registerProcessor(name: string, processor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
