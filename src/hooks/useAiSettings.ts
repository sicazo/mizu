import { useState, useCallback } from 'react'
import {
  type AiModelProvider,
  type AiTarget,
  CLAUDE_CODE_TARGET,
} from '../lib/aiProviders'

const STORAGE_KEY_PROVIDERS = 'mizu-ai-providers'
const STORAGE_KEY_TARGET = 'mizu-ai-target'
const STORAGE_KEY_GUIDELINES = 'mizu-ai-guidelines'

function loadProviders(): AiModelProvider[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function loadTarget(): AiTarget {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TARGET)
    if (!raw) return CLAUDE_CODE_TARGET
    return JSON.parse(raw)
  } catch {
    return CLAUDE_CODE_TARGET
  }
}

function loadGuidelines(): string {
  return localStorage.getItem(STORAGE_KEY_GUIDELINES) ?? ''
}

export interface AiSettings {
  providers: AiModelProvider[]
  target: AiTarget
  guidelines: string
  setProviders: (providers: AiModelProvider[]) => void
  setTarget: (target: AiTarget) => void
  setGuidelines: (guidelines: string) => void
  addProvider: (provider: AiModelProvider) => void
  removeProvider: (providerId: string) => void
  updateProvider: (provider: AiModelProvider) => void
}

export function useAiSettings(): AiSettings {
  const [providers, setProvidersState] = useState<AiModelProvider[]>(loadProviders)
  const [target, setTargetState] = useState<AiTarget>(loadTarget)
  const [guidelines, setGuidelinesState] = useState<string>(loadGuidelines)

  const setProviders = useCallback((next: AiModelProvider[]) => {
    setProvidersState(next)
    localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(next))
  }, [])

  const setTarget = useCallback((next: AiTarget) => {
    setTargetState(next)
    localStorage.setItem(STORAGE_KEY_TARGET, JSON.stringify(next))
  }, [])

  const setGuidelines = useCallback((next: string) => {
    setGuidelinesState(next)
    localStorage.setItem(STORAGE_KEY_GUIDELINES, next)
  }, [])

  const addProvider = useCallback((provider: AiModelProvider) => {
    setProviders([...providers, provider])
  }, [providers, setProviders])

  const removeProvider = useCallback((providerId: string) => {
    setProviders(providers.filter((p) => p.id !== providerId))
  }, [providers, setProviders])

  const updateProvider = useCallback((provider: AiModelProvider) => {
    setProviders(providers.map((p) => (p.id === provider.id ? provider : p)))
  }, [providers, setProviders])

  return {
    providers,
    target,
    guidelines,
    setProviders,
    setTarget,
    setGuidelines,
    addProvider,
    removeProvider,
    updateProvider,
  }
}
