import { app, type BrowserWindow, ipcMain, net, session, webContents } from 'electron'
import type { BrowserMediaCommand, BrowserMediaInfo } from '../shared/types'
import { basename, extname } from 'node:path'
import { disguiseSession, disguiseWebContents } from './disguise'
import { isAudioFile, newSoundFile, soundPath } from './library'

/**
 * The page's main player: the one playing, else the first one that has loaded something.
 * Muted media is ignored: autoplaying video ads always play muted and are not "what's playing".
 */
const FIND_MEDIA = `() => {
  const audible = [...document.querySelectorAll('video, audio')].filter((m) => !m.muted && m.volume > 0)
  return audible.find((m) => !m.paused && !m.ended) || audible.find((m) => m.duration > 0) || null
}`

/** Title/artist/thumbnail from the Media Session API (YouTube, SoundCloud… fill it in) plus position. */
const MEDIA_INFO_SCRIPT = `(() => {
  const m = (${FIND_MEDIA})()
  if (!m) return null
  const meta = navigator.mediaSession && navigator.mediaSession.metadata
  const art = meta && meta.artwork && meta.artwork.length ? meta.artwork[meta.artwork.length - 1].src : null
  return {
    title: (meta && meta.title) || document.title,
    artist: (meta && meta.artist) || location.hostname.replace(/^www\\./, ''),
    artwork: art,
    playing: !m.paused && !m.ended,
    time: m.currentTime || 0,
    duration: Number.isFinite(m.duration) ? m.duration : 0
  }
})()`

const artworkCache = new Map<string, string | null>()

/**
 * Thumbnails come from the web (i.ytimg.com…); the app's page only allows local images, so the
 * main process fetches them once and hands over a data: URL.
 */
async function artworkDataUrl(src: string): Promise<string | null> {
  if (artworkCache.has(src)) return artworkCache.get(src)!
  let result: string | null = null
  try {
    if (/^https:\/\//i.test(src)) {
      const response = await net.fetch(src)
      const type = response.headers.get('content-type') ?? ''
      const bytes = Buffer.from(await response.arrayBuffer())
      if (response.ok && /^image\//.test(type) && bytes.length < 2_000_000) result = `data:${type};base64,${bytes.toString('base64')}`
    }
  } catch {
    result = null
  }
  if (artworkCache.size > 50) artworkCache.clear()
  artworkCache.set(src, result)
  return result
}

const PAUSE_MEDIA_SCRIPT =`document.querySelectorAll('video, audio').forEach((m) => { if (!m.paused) m.pause() })`

const isMyInstants = (url: string): boolean => {
  try {
    return /(^|\.)myinstants\.com$/.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * Pad name for a downloaded sound. MyInstants' "Baixar MP3" names the file after its slug
 * ("psycho-scream-soundbible.mp3"), so on a sound's own page the title ("Jogo do botão - …") is used.
 */
function soundName(filename: string, source: Electron.WebContents | undefined): string {
  const fallback = basename(filename, extname(filename))
  if (!source || !isMyInstants(source.getURL()) || !source.getURL().includes('/instant/')) return fallback
  return source.getTitle().split(' - ')[0].trim() || fallback
}

/**
 * Adds a "+ Pad" button to every sound on MyInstants pages (lists and a sound's own page). It
 * triggers a normal download of that sound's MP3, named after the sound, which will-download above
 * turns into a pad. Only runs inside the app's own browser.
 */
const MYINSTANTS_SCRIPT = `(() => {
  if (window.__soundboardPads) return
  window.__soundboardPads = true
  const style = document.createElement('style')
  style.textContent = '.sb-add{display:block;margin:6px auto 0;padding:3px 10px;border:0;border-radius:999px;background:#F5A524;color:#1A1307;font:600 12px system-ui,sans-serif;cursor:pointer}.sb-add:hover{background:#FFC266}.sb-add[disabled]{background:#3A3843;color:#EEEAE3;cursor:default}'
  document.head.append(style)
  // One listener for all buttons: the site re-creates its elements after loading, which drops
  // listeners attached to the buttons themselves. Everything needed lives in data attributes.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element && event.target.closest('.sb-add')
    if (!button || button.disabled) return
    event.preventDefault()
    event.stopPropagation()
    const link = document.createElement('a')
    link.href = button.dataset.sbUrl
    link.download = button.dataset.sbName.replace(/[\\\\/:*?"<>|]/g, '') + '.mp3'
    document.body.append(link)
    link.click()
    link.remove()
    button.textContent = 'Adicionado'
    button.disabled = true
  }, true)
  const decorate = () => document.querySelectorAll('.instant').forEach((instant) => {
    if (instant.querySelector(':scope > .sb-add')) return
    const match = /play\\('([^']+\\.mp3)'/.exec(instant.querySelector('button[onclick^="play("]')?.getAttribute('onclick') || '')
    if (!match) return
    const name = (instant.querySelector('.instant-link')?.textContent || document.querySelector('h1')?.textContent || 'Som').trim()
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sb-add'
    button.textContent = '+ Pad'
    button.title = 'Adicionar "' + name + '" aos pads do SoundBoard'
    button.dataset.sbUrl = match[1]
    button.dataset.sbName = name
    instant.append(button)
  })
  decorate()
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true })
})()`

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

  const recent = new Map<string, number>()
  ses.on('will-download', (event, item, source) => {
    const original = item.getFilename()
    // Anything that is not audio gets the normal "save as" dialog.
    if (!isAudioFile(original)) return
    // Some pages fire the same download twice for one click; one pad is enough.
    const url = item.getURL()
    const now = Date.now()
    if (now - (recent.get(url) ?? 0) < 5000) {
      event.preventDefault()
      return
    }
    recent.set(url, now)
    const name = soundName(original, source)
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
      const decorate = (): void => {
        if (isMyInstants(contents.getURL())) contents.executeJavaScript(MYINSTANTS_SCRIPT).catch(() => undefined)
      }
      contents.on('dom-ready', decorate)
      contents.on('did-navigate-in-page', decorate)
      contents.setWindowOpenHandler(({ url }) => {
        // A "download" link with target=_blank also asks for a window; the download already started.
        if (/^https?:/i.test(url) && !isAudioFile(new URL(url).pathname)) contents.loadURL(url)
        return { action: 'deny' }
      })
    }
  })

  // "Stop everything" pauses whatever plays in the app's own browser (YouTube, MyInstants…), in every
  // frame, the same as pressing the player's pause button. Only webviews of this window are touched.
  ipcMain.handle('browser:pause-media', (e) => {
    for (const contents of webContents.getAllWebContents()) {
      if (contents.getType() !== 'webview' || contents.hostWebContents !== e.sender) continue
      for (const frame of contents.mainFrame.framesInSubtree) {
        frame.executeJavaScript(PAUSE_MEDIA_SCRIPT).catch(() => undefined)
      }
    }
  })

  // Now-playing info (title, channel, thumbnail, position) for the bottom player, and its controls.
  const guestOf = (host: Electron.WebContents): Electron.WebContents | undefined =>
    webContents.getAllWebContents().find((c) => c.getType() === 'webview' && c.hostWebContents === host)
  ipcMain.handle('browser:media-info', async (e): Promise<BrowserMediaInfo | null> => {
    const guest = guestOf(e.sender)
    if (!guest || guest.isDestroyed()) return null
    const info = (await guest.executeJavaScript(MEDIA_INFO_SCRIPT).catch(() => null)) as BrowserMediaInfo | null
    if (info?.artwork) info.artwork = await artworkDataUrl(info.artwork)
    return info
  })
  ipcMain.handle('browser:media-control', (e, command: BrowserMediaCommand) => {
    const guest = guestOf(e.sender)
    if (!guest || guest.isDestroyed()) return
    let body: string
    if (command === 'toggle') body = 'if (m.paused) m.play(); else m.pause()'
    else if (Number.isFinite(command.seek)) body = `m.currentTime = ${Number(command.seek)}`
    else return
    guest.executeJavaScript(`{ const m = (${FIND_MEDIA})(); if (m) { ${body} } }`).catch(() => undefined)
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
