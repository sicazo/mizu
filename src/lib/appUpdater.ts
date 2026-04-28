import { Channel, invoke } from '@tauri-apps/api/core'

export interface AppUpdateMetadata {
  currentVersion: string
  version: string
  date?: string
  body?: string
}

export type AppUpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

export async function checkForAppUpdate(): Promise<AppUpdateMetadata | null> {
  return invoke<AppUpdateMetadata | null>('check_for_app_update')
}

export async function downloadAndInstallAppUpdate(
  expectedVersion: string,
  onEvent: (event: AppUpdateDownloadEvent) => void,
): Promise<void> {
  const channel = new Channel<AppUpdateDownloadEvent>()
  channel.onmessage = onEvent
  await invoke('download_and_install_app_update', { expectedVersion, onEvent: channel })
}
