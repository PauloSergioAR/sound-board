import type { Session, WebContents } from 'electron'

/**
 * Makes the embedded browser look like a regular Google Chrome on Windows, so sites that refuse
 * embedded browsers (Google sign-in) accept it. Every signal has to agree: the User-Agent header,
 * the Sec-CH-UA client-hint headers, navigator.userAgent/userAgentData/languages and window.chrome.
 */

const FULL_VERSION = process.versions.chrome
const MAJOR = FULL_VERSION.split('.')[0]

/** Chrome sends a "reduced" UA: only the major version, the rest zeroed. */
export const CHROME_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36`

// Chromium derives the fake ("GREASE") brand and the brand order from the major version. Electron
// already reports the right GREASE brand; this reuses it and adds "Google Chrome" in Chrome's order.
const GREASE = { brand: 'Not?A_Brand', version: '24' }
const BRAND_ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]

function brandList(full: boolean): { brand: string; version: string }[] {
  const version = full ? FULL_VERSION : MAJOR
  const [greaseAt, chromiumAt, chromeAt] = BRAND_ORDERS[Number(MAJOR) % 6]
  const list: { brand: string; version: string }[] = []
  list[greaseAt] = full ? { ...GREASE, version: `${GREASE.version}.0.0.0` } : GREASE
  list[chromiumAt] = { brand: 'Chromium', version }
  list[chromeAt] = { brand: 'Google Chrome', version }
  return list
}

const SEC_CH_UA = brandList(false)
  .map((b) => `"${b.brand}";v="${b.version}"`)
  .join(', ')

// Plain ordered list: Chromium adds the q-weights to the Accept-Language header itself.
const ACCEPT_LANGUAGE = 'pt-BR,pt,en-US,en'

/** What real Chrome has on window.chrome for a normal web page; Electron leaves it empty. */
const WINDOW_CHROME_SCRIPT = `(() => {
  const chrome = window.chrome || {};
  if (!window.chrome) Object.defineProperty(window, 'chrome', { value: chrome, writable: true, configurable: true });
  if (!chrome.app) chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails() { return null; },
    getIsInstalled() { return false; },
    runningState() { return 'cannot_run'; }
  };
  if (!chrome.csi) chrome.csi = function csi() {
    const t = performance.timing;
    return { onloadT: t.loadEventEnd, startE: t.navigationStart, pageT: performance.now(), tran: 15 };
  };
  if (!chrome.loadTimes) chrome.loadTimes = function loadTimes() {
    const t = performance.timing;
    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      requestTime: t.navigationStart / 1000, startLoadTime: t.navigationStart / 1000,
      commitLoadTime: t.responseStart / 1000, finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000,
      finishLoadTime: t.loadEventEnd / 1000, firstPaintTime: t.responseStart / 1000, firstPaintAfterLoadTime: 0,
      navigationType: 'Other', wasFetchedViaSpdy: nav.nextHopProtocol === 'h2', wasNpnNegotiated: true,
      npnNegotiatedProtocol: nav.nextHopProtocol || 'h2', wasAlternateProtocolAvailable: false,
      connectionInfo: nav.nextHopProtocol || 'h2'
    };
  };
})();`

/** Headers and default UA for everything the browser session sends, including workers. */
export function disguiseSession(ses: Session): void {
  ses.setUserAgent(CHROME_USER_AGENT, ACCEPT_LANGUAGE)
  // Electron sends no client hints at all; Chrome sends these three on every secure request.
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://*/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders }
    headers['sec-ch-ua'] = SEC_CH_UA
    headers['sec-ch-ua-mobile'] = '?0'
    headers['sec-ch-ua-platform'] = '"Windows"'
    callback({ requestHeaders: headers })
  })
}

/** The JavaScript-visible side, through the DevTools protocol (the same override DevTools' device emulation uses). */
export async function disguiseWebContents(contents: WebContents): Promise<void> {
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
    await contents.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent: CHROME_USER_AGENT,
      acceptLanguage: ACCEPT_LANGUAGE,
      platform: 'Win32',
      userAgentMetadata: {
        brands: brandList(false),
        fullVersionList: brandList(true),
        fullVersion: FULL_VERSION,
        platform: 'Windows',
        platformVersion: '19.0.0',
        architecture: 'x86',
        model: '',
        mobile: false,
        bitness: '64',
        wow64: false
      }
    })
    await contents.debugger.sendCommand('Page.enable')
    await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: WINDOW_CHROME_SCRIPT })
  } catch (err) {
    console.error('Could not disguise the embedded browser', err)
  }
}
