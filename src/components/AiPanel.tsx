import { useState, useCallback, useEffect, useRef, type FormEvent, type KeyboardEvent, Fragment } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openPath } from '@tauri-apps/plugin-opener'
import { type AiSettings } from '../hooks/useAiSettings'
import { aiProvidersApi } from '../lib/aiProviders'
import { getNotesRoot, notesApi, type ApiNoteSummary } from '../lib/notesApi'
import AiSettingsDrawer from './AiSettingsDrawer'

interface AiPanelProps {
  onClose: () => void
  courseId?: string
  noteContent?: string
  noteTitle?: string
  initialPrompt?: string | null
  initialPromptNonce?: number
  focusNonce?: number
  aiSettings: AiSettings
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface AiAgentStreamEvent {
  kind: 'Init' | 'TextDelta' | 'ThinkingDelta' | 'ToolStart' | 'ToolDone' | 'Error' | 'Done'
  text?: string
  message?: string
}

const CHIPS = [
  'Summarize this note',
  'Quiz me on this topic',
  'Explain the key concepts',
  'What are the main takeaways?',
]

type NoteRef = Pick<ApiNoteSummary, 'id' | 'courseId' | 'title'>

export default function AiPanel({
  onClose,
  courseId,
  noteContent,
  noteTitle,
  initialPrompt,
  initialPromptNonce,
  focusNonce,
  aiSettings,
}: AiPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [includeCourseContext, setIncludeCourseContext] = useState(false)
  const [noteRefs, setNoteRefs] = useState<NoteRef[]>([])
  const [contextPickerOpen, setContextPickerOpen] = useState(false)
  const [contextSearch, setContextSearch] = useState('')
  const [selectedContextKeys, setSelectedContextKeys] = useState<string[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const lastPromptNonceRef = useRef<number | undefined>(undefined)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { target, providers, guidelines } = aiSettings

  const noteRefKey = useCallback((n: NoteRef) => `${n.courseId}/${n.id}`, [])

  const resolveFilePath = useCallback((ref: string) => {
    const root = getNotesRoot().replace(/[\\/]+$/, '')
    if (!root) return null
    const normalized = ref.replace(/^\.\//, '')
    if (normalized.includes('/')) return `${root}/${normalized}`
    if (courseId) return `${root}/${courseId}/${normalized}`
    return `${root}/${normalized}`
  }, [courseId])

  const renderAssistantContent = useCallback((text: string) => {
    const tokenPattern = /\[\[([^\]]+\.md)\]\]|\b([\w.-]+(?:\/[\w.-]+)?\.md)\b/g
    const parts: Array<{ kind: 'text' | 'file'; value: string }> = []
    let last = 0
    let m: RegExpExecArray | null

    while ((m = tokenPattern.exec(text)) !== null) {
      if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) })
      parts.push({ kind: 'file', value: m[1] ?? m[2] })
      last = m.index + m[0].length
    }
    if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
    if (parts.length === 0) return text

    return parts.map((part, i) => {
      if (part.kind === 'text') return <Fragment key={i}>{part.value}</Fragment>
      return (
        <button
          key={i}
          type="button"
          className="ai-file-ref"
          onClick={() => {
            const path = resolveFilePath(part.value)
            if (!path) return
            void openPath(path)
          }}
          title={`Open ${part.value}`}
        >
          {part.value}
        </button>
      )
    })
  }, [resolveFilePath])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [])

  // Build system prompt
  const buildSystemPrompt = useCallback(async (userMessage: string) => {
    void userMessage
    let base = guidelines ? guidelines + '\n\n' : ''
    base += 'You are a helpful study assistant for a university student.'
    base += ' When referencing vault files in your answer, use [[course_id/file-name.md]] format.'
    if (courseId) base += ` The student is working on course: ${courseId}.`
    if (noteTitle) base += ` They are currently viewing a note titled: "${noteTitle}".`
    if (noteContent) {
      const preview = noteContent.slice(0, 2500)
      base += `\n\nCurrent note:\n${preview}${noteContent.length > 2500 ? '\n[truncated]' : ''}`
    }

    try {
      const picked = noteRefs.filter((n) => selectedContextKeys.includes(noteRefKey(n)))
      const autoCourse = includeCourseContext && courseId ? (await notesApi.list(courseId)).slice(0, 8).map((n) => ({ id: n.id, courseId: n.courseId, title: n.title })) : []
      const merged = [...picked, ...autoCourse].filter((n, i, arr) => arr.findIndex((x) => x.id === n.id && x.courseId === n.courseId) === i)

      if (merged.length) {
        const docs = await Promise.all(merged.map((n) => notesApi.get(n.id, n.courseId)))
        const chunks = docs.map((doc) => {
          const body = doc.content.slice(0, 1400)
          return `### [[${doc.courseId}/${doc.id}.md]] ${doc.title}\n${body}${doc.content.length > 1400 ? '\n[truncated]' : ''}`
        })
        base += `\n\nAttached notes context (${chunks.length} files):\n${chunks.join('\n\n')}`
      }
    } catch (err) {
      console.warn('[AiPanel] failed to load notes context', err)
    }

    return base
  }, [guidelines, courseId, noteTitle, noteContent, includeCourseContext, noteRefs, selectedContextKeys, noteRefKey])

  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isLoading) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: prompt.trim() }
    const streamId = `a-${Date.now()}`
    const assistantMsg: Message = { id: streamId, role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsLoading(true)
    scrollToBottom()

    let didStream = false
    let unlisten: (() => void) | null = null

    const systemPrompt = await buildSystemPrompt(prompt)

    try {
      unlisten = await listen<AiAgentStreamEvent>('ai-agent-stream', (event) => {
        const { kind, text, message } = event.payload
        if (kind === 'TextDelta' && text) {
          didStream = true
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, content: m.content + text } : m
          ))
          scrollToBottom()
        }
        if (kind === 'Error') {
          const errText = message ?? 'Stream error'
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, content: m.content ? `${m.content}\n\n⚠ ${errText}` : errText, streaming: false } : m
          ))
        }
        if (kind === 'Done') {
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, streaming: false } : m
          ))
        }
      })

      if (target.kind === 'api_model' && (target as {providerId?: string}).providerId && (target as {modelId?: string}).modelId) {
        const t = target as { kind: 'api_model'; providerId: string; modelId: string }
        const provider = providers.find((p) => p.id === t.providerId)
        if (!provider) throw new Error(`Provider ${t.providerId} not found`)

        await aiProvidersApi.stream({
          provider,
          model_id: t.modelId,
          message: prompt.trim(),
          system_prompt: systemPrompt,
        })
        didStream = true
      } else {
        // CLI agent path (claude_code, codex, pi, gemini)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentId: string = (target as any).agentId ?? 'claude_code'
        try {
          await invoke<string>('stream_ai_agent', {
            request: {
              agent: agentId,
              message: prompt.trim(),
              system_prompt: systemPrompt,
              vault_path: '.',
            },
          })
        } catch {
          // fall through to ai_query
        }
      }

      if (!didStream) {
        try {
          const response = await invoke<string>('ai_query', {
            prompt: prompt.trim(),
            courseId: courseId ?? null,
          })
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, content: response, streaming: false } : m
          ))
        } catch {
          setMessages(prev => prev.map(m =>
            m.id === streamId
              ? { ...m, content: 'Could not get a response. Configure an AI provider in settings or install Claude Code.', streaming: false }
              : m
          ))
        }
      } else {
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, streaming: false } : m
        ))
      }
    } catch (err) {
      console.error('[AiPanel] send failed:', err)
      setMessages(prev => prev.map(m =>
        m.id === streamId
          ? { ...m, content: String(err), streaming: false }
          : m
      ))
    } finally {
      if (unlisten) unlisten()
      setIsLoading(false)
      scrollToBottom()
    }
  }, [isLoading, target, providers, courseId, buildSystemPrompt, scrollToBottom])

  const insertMention = useCallback((note: NoteRef) => {
    const token = `[[${note.courseId}/${note.id}.md]]`
    setInput((prev) => prev.replace(/(^|\s)@([\w.-]*)$/, `$1${token} `))
    setMentionQuery(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const handleInputChange = useCallback((next: string) => {
    setInput(next)
    const m = next.match(/(^|\s)@([\w.-]*)$/)
    setMentionQuery(m ? (m[2] ?? '') : null)
  }, [])

  const toggleContextRef = useCallback((note: NoteRef) => {
    const key = noteRefKey(note)
    setSelectedContextKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }, [noteRefKey])

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault()
    const prompt = input.trim()
    if (!prompt) return
    setInput('')
    setMentionQuery(null)
    sendMessage(prompt)
  }, [input, sendMessage])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mentionCandidates = noteRefs.filter((n) => {
      if (mentionQuery === null) return false
      const q = mentionQuery.trim().toLowerCase()
      if (!q) return true
      return n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.courseId.toLowerCase().includes(q)
    })

    if (mentionQuery !== null && e.key === 'Enter' && mentionCandidates.length > 0) {
      e.preventDefault()
      insertMention(mentionCandidates[0])
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const prompt = input.trim()
      if (!prompt || isLoading) return
      setInput('')
      setMentionQuery(null)
      sendMessage(prompt)
    }
  }, [input, isLoading, sendMessage, mentionQuery, insertMention, noteRefs])

  useEffect(() => {
    if (initialPromptNonce == null) return
    if (initialPromptNonce === lastPromptNonceRef.current) return
    lastPromptNonceRef.current = initialPromptNonce
    if (initialPrompt?.trim()) {
      setInput(initialPrompt.trim())
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [initialPrompt, initialPromptNonce])

  useEffect(() => {
    if (focusNonce == null) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [focusNonce])

  useEffect(() => {
    const loadRefs = async () => {
      try {
        const list = courseId ? await notesApi.list(courseId) : await notesApi.listAll()
        setNoteRefs(list.map((n) => ({ id: n.id, courseId: n.courseId, title: n.title })))
      } catch (err) {
        console.warn('[AiPanel] failed to load note refs', err)
      }
    }
    void loadRefs()
  }, [courseId])

  const filteredRefs = noteRefs.filter((n) => {
    const q = (mentionQuery ?? contextSearch).trim().toLowerCase()
    if (!q) return true
    return n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.courseId.toLowerCase().includes(q)
  }).slice(0, 20)

  const selectedContextRefs = noteRefs.filter((n) => selectedContextKeys.includes(noteRefKey(n)))

  const hasNote = !!(noteTitle || noteContent)

  const CLI_AGENT_LABELS: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
    pi: 'Pi',
    gemini: 'Gemini',
  }
  // Derive label for the active target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentId: string = (target as any).agentId ?? 'claude_code'
  let targetLabel = CLI_AGENT_LABELS[agentId] ?? agentId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tAny = target as any
  if (target.kind === 'api_model' && tAny.providerId && tAny.modelId) {
    const p = providers.find((p) => p.id === tAny.providerId)
    const m = p?.models.find((m) => m.id === tAny.modelId)
    targetLabel = m?.display_name ?? tAny.modelId
  }

  if (showSettings) {
    return (
      <section className="ai">
        <AiSettingsDrawer settings={aiSettings} onClose={() => setShowSettings(false)} />
      </section>
    )
  }

  return (
    <section className="ai">
      <div className="ai-header">
        <span className="ai-title">
          Ask{' '}
          <span style={{ fontFamily: "'Yu Mincho', 'Hiragino Mincho ProN', serif", color: "#155DFF" }}>水</span>
        </span>
        {courseId && (
          <span className="ai-course-badge">{courseId}</span>
        )}
        <button className="ai-close" onClick={onClose} title="Close (⌘J)">×</button>
      </div>

      <div className="ai-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <>
            {hasNote && (
              <div className="ai-context-pill">
                <span className="ai-context-icon">◈</span>
                <span>{noteTitle ?? 'Current note'} is in context</span>
              </div>
            )}
            <div className="ai-suggest">
              <div className="ai-suggest-label">Try asking</div>
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  className="ai-chip"
                  onClick={() => { handleInputChange(chip); requestAnimationFrame(() => inputRef.current?.focus()) }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`ai-msg ai-msg-${msg.role}`}>
            {msg.role === 'assistant' ? (
              <div className="ai-bubble ai-bubble-assistant">
                {msg.content ? renderAssistantContent(msg.content) : (msg.streaming ? null : '…')}
                {msg.streaming && !msg.content && (
                  <div className="ai-typing"><span /><span /><span /></div>
                )}
                {msg.streaming && msg.content && (
                  <span className="ai-cursor" />
                )}
              </div>
            ) : (
              <div className="ai-bubble ai-bubble-user">{msg.content}</div>
            )}
          </div>
        ))}
      </div>

      <form className="ai-input-wrap" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="ai-input"
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline, @ to mention note)"
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isLoading}
          autoFocus
        />
        {mentionQuery !== null && filteredRefs.length > 0 && (
          <div className="ai-mention-menu">
            {filteredRefs.slice(0, 6).map((n) => (
              <button key={noteRefKey(n)} type="button" className="ai-mention-item" onClick={() => insertMention(n)}>
                <span className="ai-mention-title">{n.title || n.id}</span>
                <span className="ai-mention-meta">{n.courseId}/{n.id}.md</span>
              </button>
            ))}
          </div>
        )}
        <div className="ai-context-row">
          {selectedContextRefs.map((n) => (
            <span key={noteRefKey(n)} className="ai-context-chip">
              {n.title || n.id}
              <button type="button" onClick={() => toggleContextRef(n)}>×</button>
            </span>
          ))}
          <div className="ai-context-picker-wrap">
            <button type="button" className="ai-context-picker-btn" onClick={() => setContextPickerOpen((v) => !v)}>+ Add files</button>
            {contextPickerOpen && (
              <div className="ai-context-picker">
                <input
                  className="ai-context-picker-search"
                  value={contextSearch}
                  onChange={(e) => setContextSearch(e.target.value)}
                  placeholder="Search notes..."
                />
                <div className="ai-context-picker-list">
                  {filteredRefs.map((n) => {
                    const checked = selectedContextKeys.includes(noteRefKey(n))
                    return (
                      <label key={noteRefKey(n)} className="ai-context-picker-item">
                        <input type="checkbox" checked={checked} onChange={() => toggleContextRef(n)} />
                        <span>{n.title || n.id}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="ai-input-foot">
          {courseId && (
            <label className="ai-context-toggle" title="Include recent notes from this course in AI context">
              <input
                type="checkbox"
                checked={includeCourseContext}
                onChange={(e) => setIncludeCourseContext(e.target.checked)}
              />
              <span>Use course notes</span>
            </label>
          )}
          <button
            type="button"
            className="ai-model-select"
            onClick={() => setShowSettings(true)}
            title="AI settings"
          >
            <span className="ai-model-icon">{target.kind === 'api_model' ? '◈' : agentId === 'codex' ? '◎' : agentId === 'pi' ? 'π' : agentId === 'gemini' ? '✦' : '⌘'}</span>
            <span className="ai-model-label">{targetLabel}</span>
            <span className="ai-model-chevron">⌄</span>
          </button>
          <button type="submit" className="ai-send" disabled={isLoading || !input.trim()}>
            {isLoading ? '…' : 'Send ↵'}
          </button>
        </div>
      </form>
    </section>
  )
}
