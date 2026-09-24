import type { ReactNode } from 'react'

function Stroke({ size = 18, children }: { size?: number; children: ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number }

export const LogoIcon = ({ size = 20 }: IconProps): React.JSX.Element => (
  <Stroke size={size}>
    <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
  </Stroke>
)

export const MicIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Stroke>
)

export const MicOffIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3" />
  </Stroke>
)

export const PlusIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M12 5v14M5 12h14" />
  </Stroke>
)

export const SearchIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Stroke>
)

export const UploadIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Stroke>
)

export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M5 12l5 5 9-11" />
  </Stroke>
)

export const AlertIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </Stroke>
)

export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
)

export const StopIcon = ({ size = 18 }: IconProps): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
)

export const PlayIcon = ({ size = 18 }: IconProps): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4l13 8-13 8z" />
  </svg>
)

export const PauseIcon = ({ size = 18 }: IconProps): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
)

export const PrevIcon = ({ size = 18 }: IconProps): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18 5l-9 7 9 7zM5 5h2v14H5z" />
  </svg>
)

export const NextIcon = ({ size = 18 }: IconProps): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 5l9 7-9 7zM17 5h2v14h-2z" />
  </svg>
)

export const MusicIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Stroke>
)

export const ListIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Stroke>
)
