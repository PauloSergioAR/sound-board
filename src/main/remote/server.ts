import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { RemoteInfo, RemoteState } from '../../shared/types'
import pageHtml from './page.html?raw'

/**
 * Lets a phone on the same network trigger pads: a tiny HTTP server with one page, a
 * Server-Sent Events stream with the app's state, and one endpoint for actions. Every request
 * must carry the secret token from the QR code, so other people on the Wi-Fi can't use it.
 */

/** Only these actions exist: the global hotkeys' ones plus stopping one pad and the voice effects. */
const ACTION =
  /^((pad|stopPad):[\w-]{1,64}|stopAll|toggleMic|toggleFx|toggleMonitor|deckToggle|deckNext|fx:[a-z]{1,16}|fxSet:(pitch|echo|reverb):-?\d{1,3}(\.\d{1,3})?)$/

export const newRemoteToken = (): string => randomBytes(18).toString('base64url')

/** LAN IPv4 addresses, real adapters first (VPNs, WSL and VM adapters last). */
function lanAddresses(): string[] {
  const virtual = /vethernet|virtual|vmware|vbox|wsl|hyper-v|loopback|tailscale|zerotier|hamachi/i
  const found: { address: string; score: number }[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      const privateRange = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)
      found.push({ address: net.address, score: (virtual.test(name) ? 0 : 2) + (privateRange ? 1 : 0) })
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.address)
}

export class RemoteServer {
  private server: Server | null = null
  private port = 0
  private token = ''
  private error: string | undefined
  private state: RemoteState | null = null
  private readonly clients = new Set<ServerResponse>()
  private heartbeat: NodeJS.Timeout | null = null

  constructor(
    private readonly onAction: (action: string) => void,
    private readonly onClientsChange: () => void
  ) {}

  async start(port: number, token: string, host = '0.0.0.0'): Promise<void> {
    await this.stop()
    this.token = token
    this.error = undefined
    const server = createServer((req, res) => this.handle(req, res))
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => resolve())
      })
    } catch (err) {
      this.error =
        (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? `A porta ${port} já está em uso por outro programa.`
          : `Não consegui abrir o controle remoto: ${(err as Error).message}`
      return
    }
    this.server = server
    this.port = port
    this.heartbeat = setInterval(() => this.clients.forEach((c) => c.write(': ping\n\n')), 15000)
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.clients.forEach((c) => c.end())
    this.clients.clear()
    const server = this.server
    this.server = null
    if (server) await new Promise((resolve) => server.close(resolve))
    this.onClientsChange()
  }

  setState(state: RemoteState): void {
    this.state = state
    const message = `event: state\ndata: ${JSON.stringify(state)}\n\n`
    this.clients.forEach((c) => c.write(message))
  }

  info(): RemoteInfo {
    return {
      running: !!this.server,
      port: this.port,
      urls: lanAddresses().map((ip) => `http://${ip}:${this.port}/?t=${this.token}`),
      clients: this.clients.size,
      error: this.error
    }
  }

  private authorized(url: URL): boolean {
    const given = Buffer.from(url.searchParams.get('t') ?? '')
    const expected = Buffer.from(this.token)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://remote')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    // Without the token, nothing reveals that this server exists.
    if (!this.authorized(url)) {
      res.writeHead(404).end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/') {
      const nonce = randomBytes(16).toString('base64')
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      })
      res.end(pageHtml.replaceAll('__NONCE__', nonce))
      return
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
      res.write('retry: 2000\n\n')
      if (this.state) res.write(`event: state\ndata: ${JSON.stringify(this.state)}\n\n`)
      this.clients.add(res)
      this.onClientsChange()
      req.on('close', () => {
        this.clients.delete(res)
        this.onClientsChange()
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/action') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => {
        body += chunk
        if (body.length > 1024) req.destroy()
      })
      req.on('end', () => {
        let action: unknown
        try {
          action = JSON.parse(body).action
        } catch {
          action = null
        }
        if (typeof action !== 'string' || !ACTION.test(action)) {
          res.writeHead(400).end()
          return
        }
        this.onAction(action)
        res.writeHead(204).end()
      })
      return
    }

    res.writeHead(404).end()
  }
}
