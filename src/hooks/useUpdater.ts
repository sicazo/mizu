import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { checkForAppUpdate, downloadAndInstallAppUpdate, type AppUpdateDownloadEvent, type AppUpdateMetadata } from '../lib/appUpdater'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

interface UpdateVersionInfo {
  version: string
}

export type UpdateStatus =
  | { state: 'idle' }
  | ({ state: 'available'; notes: string | undefined } & UpdateVersionInfo)
  | ({ state: 'downloading'; progress: number } & UpdateVersionInfo)
  | ({ state: 'ready' } & UpdateVersionInfo)
  | { state: 'error' }

export interface UpdateActions {
  startDownload: () => void
  dismiss: () => void
}

function createDownloadProgressHandler(
  version: string,
  setStatus: Dispatch<SetStateAction<UpdateStatus>>,
): (event: AppUpdateDownloadEvent) => void {
  let totalBytes = 0
  let downloadedBytes = 0

  return (event) => {
    if (event.event === 'Started') {
      totalBytes = event.data.contentLength ?? 0
      return
    }
    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength
      const progress = totalBytes > 0 ? Math.min(downloadedBytes / totalBytes, 1) : 0
      setStatus({ state: 'downloading', version, progress })
      return
    }
    setStatus({ state: 'ready', version })
  }
}

export function useUpdater(): { status: UpdateStatus; actions: UpdateActions } {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const updateRef = useRef<AppUpdateMetadata | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    const timer = setTimeout(async () => {
      try {
        const update = await checkForAppUpdate()
        if (!update) return
        updateRef.current = update
        setStatus({ state: 'available', version: update.version, notes: update.body ?? undefined })
      } catch {
        // silently ignore — not critical
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const startDownload = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    setStatus({ state: 'downloading', version: update.version, progress: 0 })
    try {
      await downloadAndInstallAppUpdate(
        update.version,
        createDownloadProgressHandler(update.version, setStatus),
      )
      setStatus((prev) =>
        prev.state === 'downloading' ? { state: 'ready', version: update.version } : prev,
      )
    } catch {
      setStatus({ state: 'error' })
    }
  }, [])

  const dismiss = useCallback(() => {
    updateRef.current = null
    setStatus({ state: 'idle' })
  }, [])

  return { status, actions: { startDownload, dismiss } }
}

export async function restartApp(): Promise<void> {
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch {
    // ignore
  }
}
