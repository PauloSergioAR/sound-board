import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  BrowserMediaCommand,
  BrowserMediaInfo,
  HotkeyBinding,
  ImportedSound,
  RemoteInfo,
  RemoteSettings,
  RemoteState,
  Settings,
  VbCableStep
} from '../shared/types'

const api = {
  loadSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke('settings:save', settings),

  pickSounds: (): Promise<ImportedSound[]> => ipcRenderer.invoke('sounds:pick'),
  importSounds: (paths: string[]): Promise<ImportedSound[]> => ipcRenderer.invoke('sounds:import', paths),
  readSound: (file: string): Promise<Uint8Array> => ipcRenderer.invoke('sounds:read', file),
  /** Saves audio made in the app (a browser clip) into the library. */
  saveSound: (name: string, bytes: Uint8Array): Promise<ImportedSound> => ipcRenderer.invoke('sounds:save', name, bytes),
  /** Audio files downloaded in the embedded browser land in the library; this reports each one. */
  onSoundDownloaded: (callback: (sound: ImportedSound) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, sound: ImportedSound): void => callback(sound)
    ipcRenderer.on('sounds:downloaded', listener)
    return () => ipcRenderer.removeListener('sounds:downloaded', listener)
  },
  /** Title, thumbnail and position of what plays in the embedded browser (null if nothing). */
  browserMediaInfo: (): Promise<BrowserMediaInfo | null> => ipcRenderer.invoke('browser:media-info'),
  browserMediaControl: (command: BrowserMediaCommand): Promise<void> => ipcRenderer.invoke('browser:media-control', command),
  /** Pauses every video/audio playing in the embedded browser. */
  pauseBrowserMedia: (): Promise<void> => ipcRenderer.invoke('browser:pause-media'),
  /** Names the webview whose audio the next getDisplayMedia() call captures. */
  prepareBrowserCapture: (guestWebContentsId: number): Promise<boolean> =>
    ipcRenderer.invoke('browser:prepare-capture', guestWebContentsId),
  deleteSound: (file: string): Promise<void> => ipcRenderer.invoke('sounds:delete', file),
  /** Opens a file dialog; returns the playable music paths chosen. */
  pickMusic: (): Promise<string[]> => ipcRenderer.invoke('music:pick'),
  /** Registers dropped files as playable; returns the ones accepted. */
  addMusic: (paths: string[]): Promise<string[]> => ipcRenderer.invoke('music:add', paths),
  /** Full path of a file dropped onto the window. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  /** Downloads, verifies and installs VB-Cable; `onStep` reports progress. */
  installVbCable: async (onStep: (step: VbCableStep) => void): Promise<{ ok: boolean; error?: string }> => {
    const listener = (_e: Electron.IpcRendererEvent, step: VbCableStep): void => onStep(step)
    ipcRenderer.on('vbcable:step', listener)
    try {
      return await ipcRenderer.invoke('vbcable:install')
    } finally {
      ipcRenderer.removeListener('vbcable:step', listener)
    }
  },
  openVbCablePage: (): Promise<void> => ipcRenderer.invoke('vbcable:open-page'),

  /** Starts or stops the phone remote to match the settings. */
  configureRemote: (remote: RemoteSettings): Promise<RemoteInfo> => ipcRenderer.invoke('remote:configure', remote),
  newRemoteToken: (): Promise<string> => ipcRenderer.invoke('remote:new-token'),
  /** What the phone page shows. */
  sendRemoteState: (state: RemoteState): void => ipcRenderer.send('remote:state', state),
  onRemoteInfo: (callback: (info: RemoteInfo) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: RemoteInfo): void => callback(info)
    ipcRenderer.on('remote:info', listener)
    return () => ipcRenderer.removeListener('remote:info', listener)
  },

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
