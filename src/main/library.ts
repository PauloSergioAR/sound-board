import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { AUDIO_EXTENSIONS } from '../shared/defaults'
import type { ImportedSound } from '../shared/types'

export const soundsDir = (): string => join(app.getPath('userData'), 'sounds')

/** Resolves a stored sound name to a path inside the sounds folder, rejecting anything that tries to escape it. */
function soundPath(file: string): string {
  if (!file || basename(file) !== file) throw new Error(`Nome de som inválido: ${file}`)
  return join(soundsDir(), file)
}

export function isAudioFile(path: string): boolean {
  return AUDIO_EXTENSIONS.includes(extname(path).slice(1).toLowerCase())
}

/** Copies audio files into the app's library so pads keep working if the originals move. */
export async function importSounds(paths: string[]): Promise<ImportedSound[]> {
  await mkdir(soundsDir(), { recursive: true })
  const imported: ImportedSound[] = []
  for (const source of paths.filter(isAudioFile)) {
    const ext = extname(source).toLowerCase()
    const name = basename(source, extname(source))
    const slug = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40)
    const file = `${slug || 'som'}-${randomBytes(3).toString('hex')}${ext}`
    await copyFile(source, soundPath(file))
    imported.push({ file, name })
  }
  return imported
}

export function readSound(file: string): Promise<Buffer> {
  return readFile(soundPath(file))
}

export async function deleteSound(file: string): Promise<void> {
  await rm(soundPath(file), { force: true })
}
