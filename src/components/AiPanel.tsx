import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
import { useMcpBridge } from '../hooks/useMcpBridge'

interface AiPanelProps {
  onClose: () => void
  courseId?: string
  initialPrompt?: string | null
  initialPromptNonce?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  course?: string
}

export default function AiPanel({ onClose, courseId, initialPrompt, initialPromptNonce }: AiPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { connected, aiQuery } = useMcpBridge()
  const lastPromptNonceRef = useRef<number | undefined>(undefined)

  const handleSend = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Call the AI via MCP - the MCP server will handle routing to Claude/Codex
      await aiQuery(userMessage.content, courseId)
      
      // For now, show a placeholder response
      // TODO: Actually connect to Claude/Codex for real responses
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Received: "${userMessage.content}"\n\nThis would connect to Claude or Codex for AI assistance about your courses.`,
        course: courseId,
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      console.error('AI query failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, courseId, aiQuery])

  const handleChip = useCallback((prompt: string) => {
    setInput(prompt)
  }, [])

  useEffect(() => {
    if (initialPromptNonce == null) return
    if (initialPromptNonce === lastPromptNonceRef.current) return
    lastPromptNonceRef.current = initialPromptNonce
    if (initialPrompt?.trim()) {
      setInput(initialPrompt.trim())
    }
  }, [initialPrompt, initialPromptNonce])

  return (
    <section className="ai">
      <div className="ai-header">
        <span className="ai-title">
          Ask{' '}
          <span style={{ fontFamily: "'Yu Mincho', 'Hiragino Mincho ProN', serif", color: "#155DFF" }}>水</span>
        </span>
        <button className="ai-close" onClick={onClose} title="Close">×</button>
      </div>
      <div className="ai-scroll">
        {!connected && (
          <div className="ai-status ai-status-disconnected">
            MCP not connected
          </div>
        )}
        <div className="ai-suggest">
          <div className="ai-suggest-label">Try asking</div>
          <button className="ai-chip" onClick={() => handleChip('Quiz me on this lecture')}>
            Quiz me on this lecture
          </button>
          <button className="ai-chip" onClick={() => handleChip('Summarize lectures 11–14')}>
            Summarize lectures 11–14
          </button>
          <button className="ai-chip" onClick={() => handleChip('Explain like Prof. Hodgson')}>
            Explain like Prof. Hodgson
          </button>
        </div>
        
        {messages.map(msg => (
          <div key={msg.id} className={`ai-msg ai-msg-${msg.role}`}>
            <div className={`ai-bubble ai-bubble-${msg.role}`}>
              {msg.role === 'assistant' && msg.course && (
                <span className="ai-cite">{msg.course}</span>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="ai-msg ai-msg-assist">
            <div className="ai-typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      
      <form className="ai-input-wrap" onSubmit={handleSend}>
        <textarea
          className="ai-input"
          placeholder="Ask anything from your courses..."
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={2}
          disabled={isLoading}
        />
        <div className="ai-input-foot">
          <span className="ai-model">claude · haiku</span>
          <button type="submit" className="ai-send" disabled={isLoading || !input.trim()}>
            Send ↵
          </button>
        </div>
      </form>
    </section>
  )
}