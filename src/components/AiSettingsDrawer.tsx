import { useState } from 'react'
import {
  type AiModelProvider,
  type AiModelProviderKind,
  type AiTarget,
  type AiModelDefinition,
  makeDefaultProvider,
  CLAUDE_CODE_TARGET,
  aiProvidersApi,
} from '../lib/aiProviders'

type CliAgentId = 'claude_code' | 'codex' | 'pi' | 'gemini'

const CLI_AGENTS: { id: CliAgentId; label: string; icon: string; installUrl: string }[] = [
  { id: 'claude_code', label: 'Claude Code', icon: '⌘', installUrl: 'https://docs.anthropic.com/en/docs/claude-code' },
  { id: 'codex', label: 'Codex', icon: '◎', installUrl: 'https://developers.openai.com/codex/cli' },
  { id: 'pi', label: 'Pi', icon: 'π', installUrl: 'https://pi.dev' },
  { id: 'gemini', label: 'Gemini', icon: '✦', installUrl: 'https://google-gemini.github.io/gemini-cli/' },
]
import { type AiSettings } from '../hooks/useAiSettings'

const KIND_LABELS: Record<AiModelProviderKind, string> = {
  anthropic: 'Anthropic',
  open_ai: 'OpenAI',
  gemini: 'Gemini',
  open_router: 'OpenRouter',
  ollama: 'Ollama',
  lm_studio: 'LM Studio',
  open_ai_compatible: 'Custom (OpenAI-compatible)',
}

const KINDS: AiModelProviderKind[] = [
  'anthropic',
  'open_ai',
  'gemini',
  'open_router',
  'ollama',
  'lm_studio',
  'open_ai_compatible',
]

const NEEDS_KEY: AiModelProviderKind[] = ['anthropic', 'open_ai', 'gemini', 'open_router', 'open_ai_compatible']

interface Props {
  settings: AiSettings
  onClose: () => void
}

export default function AiSettingsDrawer({ settings, onClose }: Props) {
  const { providers, target, guidelines, setTarget, setGuidelines, addProvider, removeProvider, updateProvider } = settings

  const [newKind, setNewKind] = useState<AiModelProviderKind>('anthropic')
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [guidelinesDraft, setGuidelinesDraft] = useState(guidelines)

  function handleAddProvider() {
    const provider = makeDefaultProvider(newKind)
    addProvider(provider)
  }

  async function handleSaveKey(provider: AiModelProvider) {
    const key = (apiKeyInputs[provider.id] ?? '').trim()
    if (!key) return
    setSavingKey(provider.id)
    try {
      await aiProvidersApi.saveApiKey(provider.id, key)
      setApiKeyInputs((prev) => ({ ...prev, [provider.id]: '' }))
    } catch (e) {
      console.error(e)
    } finally {
      setSavingKey(null)
    }
  }

  async function handleDeleteKey(provider: AiModelProvider) {
    try {
      await aiProvidersApi.deleteApiKey(provider.id)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleTest(provider: AiModelProvider) {
    if (provider.models.length === 0) return
    setTestingId(provider.id)
    setTestResult((prev) => ({ ...prev, [provider.id]: '' }))
    try {
      await aiProvidersApi.testProvider({
        provider,
        model_id: provider.models[0].id,
      })
      setTestResult((prev) => ({ ...prev, [provider.id]: '✓ Connected' }))
    } catch (e) {
      setTestResult((prev) => ({ ...prev, [provider.id]: `✗ ${String(e).slice(0, 80)}` }))
    } finally {
      setTestingId(null)
    }
  }

  function addModel(provider: AiModelProvider) {
    const newModel: AiModelDefinition = {
      id: '',
      capabilities: { streaming: true, tools: false, vision: false, json_mode: false, reasoning: false },
    }
    updateProvider({ ...provider, models: [...provider.models, newModel] })
  }

  function updateModelId(provider: AiModelProvider, index: number, id: string) {
    const models = provider.models.map((m, i) => (i === index ? { ...m, id } : m))
    updateProvider({ ...provider, models })
  }

  function removeModel(provider: AiModelProvider, index: number) {
    updateProvider({ ...provider, models: provider.models.filter((_, i) => i !== index) })
  }

  function updateBaseUrl(provider: AiModelProvider, url: string) {
    updateProvider({ ...provider, base_url: url })
  }

  function isTargeted(provider: AiModelProvider, modelId: string): boolean {
    return target.kind === 'api_model' && target.providerId === provider.id && target.modelId === modelId
  }

  function selectTarget(t: AiTarget) {
    setTarget(t)
  }

  function saveGuidelines() {
    setGuidelines(guidelinesDraft)
  }

  return (
    <div className="ai-drawer">
      <div className="ai-drawer-header">
        <span className="ai-drawer-title">AI Settings</span>
        <button className="ai-close" onClick={onClose}>×</button>
      </div>

      <div className="ai-drawer-body">
        {/* Default target */}
        <section className="ai-drawer-section">
          <div className="ai-drawer-section-label">DEFAULT AI</div>
          <p className="ai-drawer-hint">CLI agents run locally. API models call a provider directly.</p>

          <div className="ai-drawer-subsection-label">CLI Agents</div>
          <div className="ai-target-row">
            {CLI_AGENTS.map(({ id, label, icon }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const isActive = (target.kind === 'claude_code' && id === 'claude_code') ||
                ((target as any).agentId === id)
              return (
                <button
                  key={id}
                  className={`ai-target-btn${isActive ? ' ai-target-btn-active' : ''}`}
                  onClick={() => {
                    const t: AiTarget = id === 'claude_code'
                      ? CLAUDE_CODE_TARGET
                      : ({ kind: 'cli_agent', agentId: id } as unknown as AiTarget)
                    selectTarget(t)
                  }}
                >
                  <span className="ai-target-icon">{icon}</span>
                  {label}
                </button>
              )
            })}
          </div>

          {providers.length > 0 && (
            <>
              <div className="ai-drawer-subsection-label" style={{ marginTop: 8 }}>API Models</div>
              <div className="ai-target-row">
                {providers.map((p) =>
                  p.models.map((m) => (
                    <button
                      key={`${p.id}::${m.id}`}
                      className={`ai-target-btn${isTargeted(p, m.id) ? ' ai-target-btn-active' : ''}`}
                      onClick={() => selectTarget({ kind: 'api_model', providerId: p.id, modelId: m.id })}
                    >
                      <span className="ai-target-icon">◈</span>
                      <span className="ai-target-provider">{p.name}</span>
                      <span className="ai-target-model">{m.display_name ?? m.id}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        {/* AI Guidelines */}
        <section className="ai-drawer-section">
          <div className="ai-drawer-section-label">AI GUIDELINES</div>
          <p className="ai-drawer-hint">This text is prepended to every system prompt.</p>
          <textarea
            className="ai-guidelines-input"
            rows={4}
            placeholder="e.g. Always answer in English. Be concise. Format code with language tags."
            value={guidelinesDraft}
            onChange={(e) => setGuidelinesDraft(e.target.value)}
            onBlur={saveGuidelines}
          />
        </section>

        {/* Providers */}
        <section className="ai-drawer-section">
          <div className="ai-drawer-section-label">PROVIDERS</div>

          {providers.length === 0 && (
            <p className="ai-drawer-hint">No providers configured. Add one below.</p>
          )}

          {providers.map((provider) => (
            <div key={provider.id} className="ai-provider-card">
              <div className="ai-provider-card-head">
                <span className="ai-provider-name">{KIND_LABELS[provider.kind] ?? provider.kind}</span>
                <button
                  className="ai-provider-remove"
                  onClick={() => removeProvider(provider.id)}
                  title="Remove provider"
                >
                  ×
                </button>
              </div>

              {/* Base URL (for custom/local) */}
              {(provider.kind === 'open_ai_compatible' || provider.kind === 'ollama' || provider.kind === 'lm_studio') && (
                <div className="ai-provider-field">
                  <label className="ai-provider-field-label">Base URL</label>
                  <input
                    className="ai-provider-input"
                    type="text"
                    value={provider.base_url ?? ''}
                    onChange={(e) => updateBaseUrl(provider, e.target.value)}
                    placeholder="http://localhost:11434/v1"
                  />
                </div>
              )}

              {/* API Key */}
              {NEEDS_KEY.includes(provider.kind) && (
                <div className="ai-provider-field">
                  <label className="ai-provider-field-label">API Key</label>
                  <div className="ai-provider-key-row">
                    <input
                      className="ai-provider-input"
                      type="password"
                      placeholder="sk-… (saved securely)"
                      value={apiKeyInputs[provider.id] ?? ''}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                      }
                    />
                    <button
                      className="ai-provider-save-btn"
                      disabled={!apiKeyInputs[provider.id]?.trim() || savingKey === provider.id}
                      onClick={() => handleSaveKey(provider)}
                    >
                      {savingKey === provider.id ? '…' : 'Save'}
                    </button>
                    <button
                      className="ai-provider-del-btn"
                      onClick={() => handleDeleteKey(provider)}
                      title="Delete saved key"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* Models */}
              <div className="ai-provider-field">
                <label className="ai-provider-field-label">Models</label>
                {provider.models.map((model, idx) => (
                  <div key={idx} className="ai-provider-model-row">
                    <input
                      className="ai-provider-input ai-provider-model-input"
                      type="text"
                      placeholder="model-id"
                      value={model.id}
                      onChange={(e) => updateModelId(provider, idx, e.target.value)}
                    />
                    <button
                      className="ai-provider-del-btn"
                      onClick={() => removeModel(provider, idx)}
                      title="Remove model"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button className="ai-provider-add-model" onClick={() => addModel(provider)}>
                  + Add model
                </button>
              </div>

              {/* Test */}
              <div className="ai-provider-test-row">
                <button
                  className="ai-provider-test-btn"
                  disabled={testingId === provider.id || provider.models.length === 0}
                  onClick={() => handleTest(provider)}
                >
                  {testingId === provider.id ? 'Testing…' : 'Test connection'}
                </button>
                {testResult[provider.id] && (
                  <span className={`ai-provider-test-result${testResult[provider.id].startsWith('✓') ? ' ai-provider-test-ok' : ' ai-provider-test-err'}`}>
                    {testResult[provider.id]}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Add provider */}
          <div className="ai-add-provider-row">
            <select
              className="ai-add-kind-select"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as AiModelProviderKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
            <button className="ai-add-provider-btn" onClick={handleAddProvider}>
              Add provider
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
