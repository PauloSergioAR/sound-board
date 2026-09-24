import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { AUDIO_EXTENSIONS } from '../shared/defaults'
import type { ImportedSound } from '../shared/types'

export const soundsDir = (): string => join(app.getPath('userData'), 'sounds')

/** Resolves a stored sound name to a path inside the sounds folder, rejecting anything that tries to escape it. */
export function soundPath(file: string): string {
  if (!file || basename(file) !== file) throw new Error(`Nome de som inválido: ${file}`)
  return join(soundsDir(), file)
}

export function isAudioFile(path: string): boolean {
  return AUDIO_EXTENSIONS.includes(extname(path).slice(1).toLowerCase())
}

/**
 * A fresh, collision-free file name in the sounds folder, derived from a human name.
 * Synchronous so it can be used inside Electron's `will-download` handler.
 */
export function newSoundFile(name: string, ext: string): string {
  mkdirSync(soundsDir(), { recursive: true })
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return `${slug || 'som'}-${randomBytes(3).toString('hex')}${ext.toLowerCase()}`
}

/** Copies audio files into the app's library so pads keep working if the originals move. */
export async function importSounds(paths: string[]): Promise<ImportedSound[]> {
  const imported: ImportedSound[] = []
  for (const source of paths.filter(isAudioFile)) {
    const name = basename(source, extname(source))
    const file = newSoundFile(name, extname(source))
    await copyFile(source, soundPath(file))
    imported.push({ file, name })
  }
  return imported
}

/** Stores audio made inside the app (a clip cut from the browser) as a new sound. */
export async function saveSound(name: string, bytes: Uint8Array, ext = '.wav'): Promise<ImportedSound> {
  const file = newSoundFile(name, ext)
  await writeFile(soundPath(file), bytes)
  return { file, name }
}

export function readSound(file: string): Promise<Buffer> {
  return readFile(soundPath(file))
}

export async function deleteSound(file: string): Promise<void> {
  await rm(soundPath(file), { force: true })
}
