import { app, BrowserWindow, dialog, globalShortcut, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { AUDIO_EXTENSIONS } from '../shared/defaults'
import type { HotkeyBinding, Settings } from '../shared/types'
import { setHotkeys } from './hotkeys'
import { deleteSound, importSounds, readSound } from './library'
import { loadSettings, saveSettings } from './settings'

// Sounds must play from global hotkeys without a click inside the window first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

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
      backgroundThrottling: false
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, settings: Settings) => saveSettings(settings))

  ipcMain.handle('sounds:pick', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Importar sons',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Áudio', extensions: AUDIO_EXTENSIONS }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : importSounds(result.filePaths)
  })
  ipcMain.handle('sounds:import', (_e, paths: string[]) => importSounds(paths))
  ipcMain.handle('sounds:read', (_e, file: string) => readSound(file))
  ipcMain.handle('sounds:delete', (_e, file: string) => deleteSound(file))

  ipcMain.handle('hotkeys:set', (_e, bindings: HotkeyBinding[]) =>
    setHotkeys(bindings, (action) => mainWindow?.webContents.send('hotkey', action))
  )
}

app.whenReady().then(() => {
  // Only the microphone and output-device selection are ever needed.
  const allowed = new Set(['media', 'speaker-selection'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(allowed.has(permission))
  )
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))

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
