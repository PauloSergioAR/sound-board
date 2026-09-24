// Packages the built app (out/) and wraps it in a Discord-style Squirrel installer.
// Usage: npm run dist  →  dist/installer/SoundBoardSetup.exe
import { packager } from '@electron/packager'
import { createWindowsInstaller } from 'electron-winstaller'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const build = (file) => join(root, 'build', file)

console.log('Empacotando o app…')
const [appDirectory] = await packager({
  dir: root,
  out: join(root, 'dist', 'package'),
  overwrite: true,
  platform: 'win32',
  arch: 'x64',
  asar: true,
  name: 'SoundBoard',
  executableName: 'SoundBoard',
  icon: build('icon.ico'),
  appVersion: pkg.version,
  appCopyright: `© ${new Date().getFullYear()} ${pkg.author}`,
  win32metadata: {
    CompanyName: pkg.author,
    FileDescription: 'SoundBoard',
    ProductName: 'SoundBoard',
    InternalName: 'SoundBoard',
    OriginalFilename: 'SoundBoard.exe'
  },
  // Everything the app needs is bundled into out/ by electron-vite; ship only that.
  ignore: (path) => path !== '' && path !== '/package.json' && !path.startsWith('/out'),
  prune: false
})

console.log('Gerando o instalador…')
await createWindowsInstaller({
  appDirectory,
  outputDirectory: join(root, 'dist', 'installer'),
  name: 'SoundBoard',
  title: 'SoundBoard',
  exe: 'SoundBoard.exe',
  setupExe: 'SoundBoardSetup.exe',
  authors: pkg.author,
  owners: pkg.author,
  description: pkg.description,
  version: pkg.version,
  setupIcon: build('icon.ico'),
  // Shown in "Apps instalados"; Squirrel needs a URL, so it points at the icon in the repository.
  iconUrl: 'https://raw.githubusercontent.com/PauloSergioAR/sound-board/main/build/icon.ico',
  // The animation shown while installing, like Discord's.
  loadingGif: build('install-spinner.gif'),
  noMsi: true
})

console.log('Pronto: dist/installer/SoundBoardSetup.exe')
