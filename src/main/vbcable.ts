import { app, net } from 'electron'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { VbCableStep } from '../shared/types'

/**
 * Installs the VB-Audio Virtual Cable driver from the official download.
 * VB-Cable is donationware and its bundle licence is separate, so it is never shipped inside our
 * installer: the pack is fetched from vb-audio.com, its Authenticode signature is checked, and only
 * then is its setup run elevated (one UAC prompt, plus Windows' own driver confirmation).
 */

export const VBCABLE_PAGE = 'https://vb-audio.com/Cable/'
const PACK_URL = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'

/** Runs a PowerShell script and resolves with its stdout; rejects with its stderr. */
function powershell(script: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolvePromise(stdout.trim()))
    )
  })
}

/** A path as a single-quoted PowerShell literal. */
const psPath = (path: string): string => `'${path.replace(/'/g, "''")}'`

/** Downloads the official pack, extracts it and checks that the setup is really signed by VB-Audio. */
export async function fetchVerifiedSetup(workDir: string, onStep: (step: VbCableStep) => void): Promise<string> {
  onStep('download')
  const response = await net.fetch(PACK_URL)
  if (!response.ok) throw new Error(`Não consegui baixar o VB-Cable (HTTP ${response.status}).`)
  const zip = join(workDir, 'VBCABLE_Driver_Pack.zip')
  await writeFile(zip, Buffer.from(await response.arrayBuffer()))
  const extracted = join(workDir, 'pack')
  await powershell(`Expand-Archive -LiteralPath ${psPath(zip)} -DestinationPath ${psPath(extracted)} -Force`)

  onStep('verify')
  // The x64 setup also covers ARM64 Windows; the pack has no separate one.
  const setup = join(extracted, 'VBCABLE_Setup_x64.exe')
  const signature = await powershell(
    `$s = Get-AuthenticodeSignature -LiteralPath ${psPath(setup)}; "$($s.Status)|$($s.SignerCertificate.Subject)"`
  )
  const [status, subject = ''] = signature.split('|')
  // VB-Audio signs with Vincent Burel's certificate ("CN=BUREL VINCENT Entrepreneur individuel, ...").
  if (status !== 'Valid' || !/^CN=BUREL VINCENT\b/i.test(subject)) {
    throw new Error('A assinatura digital do instalador do VB-Cable não confere. Instalação cancelada por segurança.')
  }
  return setup
}

export async function installVbCable(onStep: (step: VbCableStep) => void): Promise<void> {
  const workDir = await mkdtemp(join(app.getPath('temp'), 'soundboard-vbcable-'))
  try {
    const setup = await fetchVerifiedSetup(workDir, onStep)
    onStep('install')
    try {
      // -i installs, -h hides VB-Audio's own window. Windows still asks to confirm the driver.
      await powershell(`Start-Process -FilePath ${psPath(setup)} -ArgumentList '-i','-h' -Verb RunAs -Wait`)
    } catch (err) {
      if (/cancel/i.test((err as Error).message)) throw new Error('Instalação cancelada na permissão do Windows.')
      throw err
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
