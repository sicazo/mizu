/**
 * Hook for receiving UI actions from the MCP server.
 *
 * Listens on the UI WebSocket bridge (port 9711) for UI action events
 * like navigate, toggle_theme, ai_query, etc.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_UI_URL = 'ws://localhost:9711'
const RECONNECT_DELAY_MS = 3000

export interface UiState {
  activeView: string
  activeCourseId: string | null
  theme: 'light' | 'dark'
  showAiPanel: boolean
  aiQuery: string | null
}

export interface LearnCardCreate {
  note_id: string
  course_id: string
  front: string
  back: string
}

const initialState: UiState = {
  activeView: 'today',
  activeCourseId: null,
  theme: 'light',
  showAiPanel: true,
  aiQuery: null,
}

/**
 * Listens on the UI WebSocket bridge for UI action broadcasts.
 */
export function useUiActions(): UiState & { connect: () => void } {
  const [uiState, setUiState] = useState<UiState>(initialState)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    
    try {
      wsRef.current = new WebSocket(WS_UI_URL)
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type !== 'ui_action') return

          switch (data.action) {
            case 'navigate':
              setUiState(prev => ({
                ...prev,
                activeView: data.view || prev.activeView,
                activeCourseId: data.course_id || prev.activeCourseId,
              }))
              break

            case 'toggle_theme':
              setUiState(prev => ({
                ...prev,
                theme: data.theme || prev.theme,
              }))
              break

            case 'toggle_ai_panel':
              setUiState(prev => ({
                ...prev,
                showAiPanel: data.show ?? prev.showAiPanel,
              }))
              break

            case 'ai_query':
              setUiState(prev => ({
                ...prev,
                aiQuery: data.prompt || prev.aiQuery,
                showAiPanel: true,
              }))
              break
          }
        } catch {
          // Ignore parse errors
        }
      }
      wsRef.current.onclose = () => {
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }
      wsRef.current.onerror = () => { /* Silent */ }
    } catch {
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      wsRef.current?.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [connect])

  return { ...uiState, connect }
}