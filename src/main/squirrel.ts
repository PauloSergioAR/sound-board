import { app } from 'electron'
import { spawn } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'

/**
 * The Squirrel installer (the Discord-style one) starts the app with --squirrel-* flags at install,
 * update and uninstall time, expecting it to manage its shortcuts and exit quickly.
 * Returns true when this launch was one of those, and the app must not start normally.
 */
export function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32') return false
  const event = process.argv[1]
  if (!event?.startsWith('--squirrel-')) return false

  const updateExe = resolve(dirname(process.execPath), '..', 'Update.exe')
  const exeName = basename(process.execPath)
  const runUpdate = (args: string[]): void => {
    spawn(updateExe, args, { detached: true }).on('close', () => app.quit())
  }

  switch (event) {
    case '--squirrel-install':
    case '--squirrel-updated':
      runUpdate([`--createShortcut=${exeName}`, '--shortcut-locations=Desktop,StartMenu'])
      return true
    case '--squirrel-uninstall':
      // Settings and sounds in %APPDATA% stay, like Discord; VB-Cable is a separate driver and stays too.
      runUpdate([`--removeShortcut=${exeName}`])
      return true
    case '--squirrel-obsolete':
      app.quit()
      return true
    default:
      // --squirrel-firstrun: the normal first start after installing.
      return false
  }
}
