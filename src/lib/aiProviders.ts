import { invoke } from '@tauri-apps/api/core'
import catalog from '../shared/aiModelProviderCatalog.json'

// ── Types ────────────────────────────────────────────────────────────────────

export type AiModelProviderKind =
  | 'open_ai'
  | 'anthropic'
  | 'open_ai_compatible'
  | 'ollama'
  | 'lm_studio'
  | 'open_router'
  | 'gemini'

export type AiModelApiKeyStorage = 'none' | 'env' | 'local_file'

export interface AiModelCapabilities {
  streaming: boolean
  tools: boolean
  vision: boolean
  json_mode: boolean
  reasoning: boolean
}

export interface AiModelDefinition {
  id: string
  display_name?: string
  context_window?: number
  max_output_tokens?: number
  capabilities: AiModelCapabilities
}

export interface AiModelProvider {
  id: string
  name: string
  kind: AiModelProviderKind
  base_url?: string
  api_key_storage?: AiModelApiKeyStorage
  api_key_env_var?: string
  headers?: Record<string, string>
  models: AiModelDefinition[]
}

export interface AiModelStreamRequest {
  provider: AiModelProvider
  model_id: string
  message: string
  system_prompt?: string
  api_key_override?: string
}

export interface AiModelProviderTestRequest {
  provider: AiModelProvider
  model_id: string
  api_key_override?: string
}

// ── Catalog helpers ──────────────────────────────────────────────────────────

interface CatalogEntry {
  kind: string
  name: string
  base_url: string
  runtime_base_url: string | null
  default_model_id: string
  api_key_storage: string
  api_key_env_var: string | null
  local: boolean
}

export function getCatalogEntry(kind: AiModelProviderKind): CatalogEntry | undefined {
  return (catalog as CatalogEntry[]).find((e) => e.kind === kind)
}

// Default capabilities for user-defined models
const DEFAULT_CAPS: AiModelCapabilities = {
  streaming: true,
  tools: false,
  vision: false,
  json_mode: false,
  reasoning: false,
}

export function makeDefaultProvider(kind: AiModelProviderKind): AiModelProvider {
  const entry = getCatalogEntry(kind)
  const id = `${kind}-${Date.now()}`
  return {
    id,
    name: entry?.name ?? kind,
    kind,
    base_url: entry?.base_url ?? '',
    api_key_storage: (entry?.api_key_storage ?? 'none') as AiModelApiKeyStorage,
    api_key_env_var: entry?.api_key_env_var ?? undefined,
    models: [
      {
        id: entry?.default_model_id ?? 'gpt-4.1-mini',
        capabilities: DEFAULT_CAPS,
      },
    ],
  }
}

// ── Target (what the AI panel bottom bar sends to) ───────────────────────────

export type AiTargetKind = 'claude_code' | 'api_model'

export interface AiTarget {
  kind: AiTargetKind
  // When kind === 'api_model':
  providerId?: string
  modelId?: string
}

export const CLAUDE_CODE_TARGET: AiTarget = { kind: 'claude_code' }

// ── Tauri command wrappers ────────────────────────────────────────────────────

export const aiProvidersApi = {
  saveApiKey: (providerId: string, apiKey: string): Promise<void> =>
    invoke('save_provider_api_key', { providerId, apiKey }),

  deleteApiKey: (providerId: string): Promise<void> =>
    invoke('delete_provider_api_key', { providerId }),

  testProvider: (request: AiModelProviderTestRequest): Promise<string> =>
    invoke('test_ai_model_provider', { request }),

  stream: (request: AiModelStreamRequest): Promise<string> =>
    invoke('stream_ai_model', { request }),
}
