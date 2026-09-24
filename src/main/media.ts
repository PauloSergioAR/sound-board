import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, normalize } from 'node:path'
import { Readable } from 'node:stream'
import { isAudioFile } from './library'

/**
 * `sb-media://track/<encoded path>` streams a music file from disk with HTTP range support, so the
 * <audio> element can seek without the whole file being read or decoded into memory.
 * Only files the user explicitly added to the deck are served.
 */
export const MEDIA_SCHEME = 'sb-media'

const allowed = new Set<string>()

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.webm': 'audio/webm'
}

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/** Marks audio files as playable; returns the ones that exist and are audio. */
export async function allowMedia(paths: string[]): Promise<string[]> {
  const accepted: string[] = []
  for (const path of paths.map((p) => normalize(p)).filter(isAudioFile)) {
    try {
      if ((await stat(path)).isFile()) {
        allowed.add(path)
        accepted.push(path)
      }
    } catch {
      // Missing file: leave it out.
    }
  }
  return accepted
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const path = normalize(decodeURIComponent(new URL(request.url).pathname.slice(1)))
    if (!allowed.has(path)) return new Response('Not allowed', { status: 403 })

    let size: number
    try {
      size = (await stat(path)).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      // The page reads the audio through Web Audio, which needs CORS for another origin.
      'Access-Control-Allow-Origin': '*'
    }

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (!range) {
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream
      return new Response(body, { headers: { ...headers, 'Content-Length': String(size) } })
    }

    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(end, size - 1)
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })

    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` }
    })
  })
}
