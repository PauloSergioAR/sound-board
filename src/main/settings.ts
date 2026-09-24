import { app } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withDefaults } from '../shared/defaults'
import type { Settings } from '../shared/types'

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

export async function loadSettings(): Promise<Settings> {
  try {
    return withDefaults(JSON.parse(await readFile(settingsPath(), 'utf8')))
  } catch {
    return withDefaults(null)
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  // Write to a temp file first so a crash mid-write never leaves a truncated settings file.
  const target = settingsPath()
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(settings, null, 2), 'utf8')
  await rename(tmp, target)
}
