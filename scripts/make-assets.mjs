// Generates the app icon and the installer's loading animation from the logo, into build/.
// Run with `npm run assets` after changing the logo; the results are committed.
import { Resvg } from '@resvg/resvg-js'
import gifenc from 'gifenc'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const { GIFEncoder, quantize, applyPalette } = gifenc
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
mkdirSync(out, { recursive: true })

const ORANGE = '#F5A524'
const INK = '#1A1307'
const BG = '#131217'
const TEXT = '#EEEAE3'
const MUTED = '#A9A4B3'

/** Five rounded bars, heights 0–1, centred in a box of `size`. */
function bars(heights, size, color) {
  const w = size * 0.1
  const gap = size * 0.07
  const total = 5 * w + 4 * gap
  const x0 = (size - total) / 2
  return heights
    .map((h, i) => {
      const bh = Math.max(w, h * size * 0.62)
      const x = x0 + i * (w + gap)
      const y = (size - bh) / 2
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(w / 2).toFixed(2)}" fill="${color}"/>`
    })
    .join('')
}

const LOGO_HEIGHTS = [0.32, 0.64, 1, 0.56, 0.32]

function logoSvg(size) {
  const r = size * 0.22
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="${ORANGE}"/>
    ${bars(LOGO_HEIGHTS, size, INK)}
  </svg>`
}

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render()

// ── App icon ────────────────────────────────────────────────
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = sizes.map((s) => render(logoSvg(s), s).asPng())
writeFileSync(join(out, 'icon.ico'), await pngToIco(pngs))
writeFileSync(join(out, 'icon.png'), render(logoSvg(512), 512).asPng())

// ── Installer animation (Squirrel shows it while installing) ─
const W = 400
const H = 280
const FRAMES = 36
const LOGO = 96

function frameSvg(t) {
  // Each bar bounces with its own phase, like an equalizer.
  const heights = LOGO_HEIGHTS.map((base, i) => 0.25 + 0.75 * Math.abs(Math.sin(Math.PI * (t + i * 0.18))) * (0.55 + base * 0.45))
  const dots = [0, 1, 2]
    .map((i) => {
      const on = Math.floor(t * 3 * 2) % 3 === i
      return `<circle cx="${W / 2 - 14 + i * 14}" cy="${H - 34}" r="3.5" fill="${on ? ORANGE : '#3A3843'}"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <g transform="translate(${(W - LOGO) / 2}, 44)">
      <rect width="${LOGO}" height="${LOGO}" rx="${LOGO * 0.22}" fill="${ORANGE}"/>
      ${bars(heights, LOGO, INK)}
    </g>
    <text x="${W / 2}" y="${44 + LOGO + 44}" text-anchor="middle" font-family="Segoe UI" font-weight="700" font-size="26" fill="${TEXT}">SoundBoard</text>
    <text x="${W / 2}" y="${44 + LOGO + 70}" text-anchor="middle" font-family="Segoe UI" font-size="14" fill="${MUTED}">Instalando…</text>
    ${dots}
  </svg>`
}

const frames = Array.from({ length: FRAMES }, (_, i) => render(frameSvg(i / FRAMES), W).pixels)
// One shared palette keeps the colours steady between frames.
const sample = new Uint8Array(frames[0].length * 4)
for (let i = 0; i < 4; i++) sample.set(frames[Math.floor((i * FRAMES) / 4)], i * frames[0].length)
const palette = quantize(sample, 64)
const gif = GIFEncoder()
for (const rgba of frames) gif.writeFrame(applyPalette(rgba, palette), W, H, { palette, delay: 50 })
gif.finish()
writeFileSync(join(out, 'install-spinner.gif'), gif.bytes())

console.log('build/icon.ico, build/icon.png, build/install-spinner.gif')
