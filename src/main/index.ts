import { app, BrowserWindow, dialog, globalShortcut, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { AUDIO_EXTENSIONS } from '../shared/defaults'
import type { HotkeyBinding, Settings } from '../shared/types'
import { setHotkeys } from './hotkeys'
import { setupBrowser } from './browser'
import { deleteSound, importSounds, readSound, saveSound } from './library'
import { allowMedia, handleMediaProtocol, registerMediaScheme } from './media'
import { loadSettings, saveSettings } from './settings'
import { handleSquirrelEvent } from './squirrel'
import { installVbCable, VBCABLE_PAGE } from './vbcable'

// Sounds must play from global hotkeys without a click inside the window first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
registerMediaScheme()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#131217',
    title: 'SoundBoard',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      // Audio keeps flowing to the virtual mic while a game has focus.
      backgroundThrottling: false,
      // The embedded browser tab; locked down in browser.ts.
      webviewTag: true
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function pickAudioFiles(title: string): Promise<string[]> {
  const options: Electron.OpenDialogOptions = {
    title,
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Áudio', extensions: AUDIO_EXTENSIONS }]
  }
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

function registerIpc(): void {
  ipcMain.handle('settings:load', async () => {
    const settings = await loadSettings()
    await allowMedia(settings.deck.playlists.flatMap((p) => p.tracks.map((t) => t.path)))
    return settings
  })
  ipcMain.handle('settings:save', (_e, settings: Settings) => saveSettings(settings))

  ipcMain.handle('sounds:pick', async () => importSounds(await pickAudioFiles('Importar sons')))
  ipcMain.handle('sounds:import', (_e, paths: string[]) => importSounds(paths))
  ipcMain.handle('music:pick', async () => allowMedia(await pickAudioFiles('Adicionar músicas')))
  ipcMain.handle('music:add', (_e, paths: string[]) => allowMedia(paths))
  ipcMain.handle('sounds:save', (_e, name: string, bytes: Uint8Array) => saveSound(name, bytes))
  ipcMain.handle('sounds:read', (_e, file: string) => readSound(file))
  ipcMain.handle('sounds:delete', (_e, file: string) => deleteSound(file))

  ipcMain.handle('hotkeys:set', (_e, bindings: HotkeyBinding[]) =>
    setHotkeys(bindings, (action) => mainWindow?.webContents.send('hotkey', action))
  )

  ipcMain.handle('vbcable:install', async (e) => {
    try {
      await installVbCable((step) => e.sender.send('vbcable:step', step))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  // Only VB-Audio's page (to donate or download by hand) may be opened in the system browser.
  ipcMain.handle('vbcable:open-page', () => shell.openExternal(VBCABLE_PAGE))
}

function start(): void {
  // A second copy would fight over the global shortcuts and the virtual cable: focus this one instead.
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // Only the microphone and output-device selection are ever needed.
    const allowed = new Set(['media', 'speaker-selection'])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(allowed.has(permission))
    )
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))

    handleMediaProtocol()
    setupBrowser(() => mainWindow)
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// Installer events quit on their own once the shortcuts are handled.
if (!handleSquirrelEvent()) {
  if (app.requestSingleInstanceLock()) start()
  else app.quit()
}
