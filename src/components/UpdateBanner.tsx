import type { CSSProperties } from 'react'
import type { UpdateStatus, UpdateActions } from '../hooks/useUpdater'
import { restartApp } from '../hooks/useUpdater'

interface UpdateBannerProps {
  status: UpdateStatus
  actions: UpdateActions
}

const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 12px',
  background: 'var(--accent-blue)',
  fontSize: 13,
  color: 'var(--text-inverse)',
  flexShrink: 0,
} satisfies CSSProperties

const iconStyle = { color: 'var(--text-inverse)', flexShrink: 0, display: 'flex' } satisfies CSSProperties

const primaryActionStyle = {
  marginLeft: 'auto',
  padding: '3px 10px',
  background: 'var(--text-inverse)',
  color: 'var(--accent-blue)',
  fontSize: 12,
  fontWeight: 500,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
} satisfies CSSProperties

const ghostBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-inverse)',
  display: 'flex',
  padding: 2,
  cursor: 'pointer',
  borderRadius: 4,
} satisfies CSSProperties

const progressTrackStyle = {
  flex: 1,
  maxWidth: 200,
  height: 4,
  background: 'color-mix(in srgb, var(--text-inverse) 30%, transparent)',
  borderRadius: 2,
  overflow: 'hidden',
} satisfies CSSProperties

const progressTextStyle = {
  fontSize: 11,
  color: 'color-mix(in srgb, var(--text-inverse) 85%, transparent)',
} satisfies CSSProperties

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconRefreshCw({ spin }: { spin?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={spin ? { animation: 'spin 1s linear infinite' } : undefined}
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function UpdateBanner({ status, actions }: UpdateBannerProps) {
  if (status.state === 'idle' || status.state === 'error') return null

  return (
    <div data-testid="update-banner" style={bannerStyle}>
      {status.state === 'available' && (
        <>
          <span style={iconStyle}><IconDownload /></span>
          <span><strong>Mizu {status.version}</strong> is available</span>
          <button
            type="button"
            data-testid="update-now-btn"
            onClick={actions.startDownload}
            style={{ ...primaryActionStyle, marginLeft: 'auto' }}
          >
            Update Now
          </button>
          <button
            type="button"
            data-testid="update-dismiss"
            onClick={actions.dismiss}
            style={ghostBtnStyle}
            aria-label="Dismiss"
          >
            <IconX />
          </button>
        </>
      )}

      {status.state === 'downloading' && (
        <>
          <span style={iconStyle}><IconRefreshCw spin /></span>
          <span>Downloading Mizu {status.version}...</span>
          <div style={progressTrackStyle}>
            <div
              data-testid="update-progress"
              style={{
                width: `${Math.round(status.progress * 100)}%`,
                height: '100%',
                background: 'var(--text-inverse)',
                borderRadius: 2,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <span style={progressTextStyle}>{Math.round(status.progress * 100)}%</span>
        </>
      )}

      {status.state === 'ready' && (
        <>
          <span style={{ ...iconStyle, color: 'var(--accent-green)' }}><IconRefreshCw /></span>
          <span><strong>Mizu {status.version}</strong> is ready — restart to apply</span>
          <button
            type="button"
            data-testid="update-restart-btn"
            onClick={restartApp}
            style={{
              ...primaryActionStyle,
              background: 'var(--accent-green)',
              color: 'var(--text-inverse)',
            }}
          >
            Restart Now
          </button>
        </>
      )}
    </div>
  )
}
