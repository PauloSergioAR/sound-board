import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { HotkeyBinding, ImportedSound, Settings } from '../shared/types'

const api = {
  loadSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke('settings:save', settings),

  pickSounds: (): Promise<ImportedSound[]> => ipcRenderer.invoke('sounds:pick'),
  importSounds: (paths: string[]): Promise<ImportedSound[]> => ipcRenderer.invoke('sounds:import', paths),
  readSound: (file: string): Promise<Uint8Array> => ipcRenderer.invoke('sounds:read', file),
  deleteSound: (file: string): Promise<void> => ipcRenderer.invoke('sounds:delete', file),
  /** Full path of a file dropped onto the window. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  /** Returns the accelerators that failed to register. */
  setHotkeys: (bindings: HotkeyBinding[]): Promise<string[]> => ipcRenderer.invoke('hotkeys:set', bindings),
  onHotkey: (callback: (action: string) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, action: string): void => callback(action)
    ipcRenderer.on('hotkey', listener)
    return () => ipcRenderer.removeListener('hotkey', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
