import { app, type BrowserWindow, ipcMain, session, webContents } from 'electron'
import { basename, extname } from 'node:path'
import { disguiseSession, disguiseWebContents } from './disguise'
import { isAudioFile, newSoundFile, soundPath } from './library'

/** Cookies and logins of the embedded browser live here, apart from the app's own session. */
export const BROWSER_PARTITION = 'persist:browser'

/**
 * Locks down the embedded <webview> and connects it to the app:
 * - only our partition, never node or a preload inside web pages;
 * - popups open in the same view instead of new windows;
 * - audio files downloaded in it (e.g. from MyInstants) go straight into the sound library;
 * - hands the renderer a capture id so the page's audio can be routed through the mixer.
 */
export function setupBrowser(getWindow: () => BrowserWindow | null): void {
  const ses = session.fromPartition(BROWSER_PARTITION)
  // Google sign-in refuses embedded browsers; present the webview as a regular Chrome (disguise.ts).
  disguiseSession(ses)
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write'])
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)))
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))

  ses.on('will-download', (_event, item) => {
    const original = item.getFilename()
    // Anything that is not audio gets the normal "save as" dialog.
    if (!isAudioFile(original)) return
    const name = basename(original, extname(original))
    const file = newSoundFile(name, extname(original))
    item.setSavePath(soundPath(file))
    item.once('done', (_e, state) => {
      if (state === 'completed') getWindow()?.webContents.send('sounds:downloaded', { file, name })
    })
  })

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event, prefs, params) => {
      delete prefs.preload
      prefs.nodeIntegration = false
      prefs.contextIsolation = true
      prefs.sandbox = true
      if (params.partition !== BROWSER_PARTITION) event.preventDefault()
    })
    if (contents.getType() === 'webview') {
      disguiseWebContents(contents)
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) contents.loadURL(url)
        return { action: 'deny' }
      })
    }
  })

  // The app window asks for getDisplayMedia() right after naming the webview to capture;
  // the answer is that page's audio (plus its video, which getDisplayMedia always requires).
  let captureTarget: Electron.WebContents | null = null
  ipcMain.handle('browser:prepare-capture', (e, guestId: number) => {
    const guest = webContents.fromId(guestId)
    const ok = !!guest && guest.getType() === 'webview' && guest.hostWebContents === e.sender
    captureTarget = ok ? guest : null
    return ok
  })
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const target = captureTarget
    captureTarget = null
    const win = getWindow()
    if (!target || target.isDestroyed() || !win || request.frame?.top !== win.webContents.mainFrame) {
      callback({})
      return
    }
    callback({ video: target.mainFrame, audio: target.mainFrame })
  })
}
