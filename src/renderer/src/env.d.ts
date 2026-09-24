/// <reference types="vite/client" />
import type { Api } from '../../preload'

declare global {
  interface Window {
    api: Api
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Electron's embedded browser tag. */
      webview: React.DetailedHTMLProps<React.HTMLAttributes<Electron.WebviewTag>, Electron.WebviewTag> & {
        src?: string
        partition?: string
      }
    }
  }
}
