/**
 * Hook for communicating with the Mizu MCP WebSocket bridge.
 *
 * Provides typed tool invocations for Mizu operations:
 * - navigate, searchNotes, getNote, getCourses
 * - getGrades, saveGrades, calculateGrade
 * - getEvents, syncCalendar
 * - createLearnCard, getLearnCards
 *
 * Connection is lazy — only opens when first tool is called.
 */
import { useCallback, useRef, useState } from 'react'

const DEFAULT_WS_URL = 'ws://localhost:9710'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export interface Course {
  code: string
  name: string
  color: string
}

export interface Assignment {
  id: string
  name: string
  weight: number
  earned: number | null
  max_score: number
}

export interface CalEvent {
  id: string
  title: string
  start: string
  end?: string
  course_id?: string
}

export interface LearnCard {
  id: string
  note_id: string
  course_id: string
  front: string
  back: string
  created_at: string
}

export interface Note {
  id: string
  title: string
  lecture: number | null
  date: string
  preview: string
  tags: string[]
}

export function useMcpBridge(wsUrl = DEFAULT_WS_URL) {
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map())
  const idCounterRef = useRef(0)
  const [connected, setConnected] = useState(false)

  const ensureConnection = useCallback((): Promise<WebSocket> => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws)

    return new Promise((resolve, reject) => {
      const newWs = new WebSocket(wsUrl)

      newWs.onopen = () => {
        wsRef.current = newWs
        setConnected(true)
        resolve(newWs)
      }

      newWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const pending = pendingRef.current.get(msg.id)
          if (pending) {
            pendingRef.current.delete(msg.id)
            if (msg.error) {
              pending.reject(new Error(msg.error))
            } else {
              pending.resolve(msg.result)
            }
          }
        } catch {
          // ignore malformed messages
        }
      }

      newWs.onclose = () => {
        wsRef.current = null
        setConnected(false)
      }

      newWs.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }
    })
  }, [wsUrl])

  const callTool = useCallback(async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
    const ws = await ensureConnection()
    const id = `mizu-${++idCounterRef.current}`

    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve: resolve as (value: unknown) => void, reject })
      ws.send(JSON.stringify({ id, tool, args }))

      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id)
          reject(new Error('MCP tool call timed out'))
        }
      }, 30_000)
    })
  }, [ensureConnection])

  // Navigation
  const navigate = useCallback((view: string, courseId?: string) => 
    callTool<{ ok: boolean }>('navigate', { view, course_id: courseId }), [callTool])

  // Theme
  const toggleTheme = useCallback((theme: 'light' | 'dark') => 
    callTool<{ ok: boolean }>('toggle_theme', { theme }), [callTool])

  // AI Panel
  const toggleAiPanel = useCallback((show: boolean) => 
    callTool<{ ok: boolean }>('toggle_ai_panel', { show }), [callTool])

  const aiQuery = useCallback((prompt: string, courseId?: string) => 
    callTool<{ ok: boolean }>('ai_query', { prompt, course_id: courseId }), [callTool])

  // Notes
  const searchNotes = useCallback((query: string, courseId?: string, limit = 10) => 
    callTool<{ results: Note[] }>('search_notes', { query, course_id: courseId, limit }), [callTool])

  const getNote = useCallback((noteId: string, courseId: string) => 
    callTool<{ note: Note }>('get_note', { note_id: noteId, course_id: courseId }), [callTool])

  const openCourseNotes = useCallback((courseId: string) => 
    callTool<{ ok: boolean }>('open_course_notes', { course_id: courseId }), [callTool])

  // Learn Cards
  const createLearnCard = useCallback((noteId: string, courseId: string, front: string, back: string) => 
    callTool<{ ok: boolean }>('create_learn_card', { note_id: noteId, course_id: courseId, front, back }), [callTool])

  const getLearnCards = useCallback((courseId?: string) => 
    callTool<{ cards: LearnCard[] }>('get_learn_cards', { course_id: courseId }), [callTool])

  // Grades
  const getGrades = useCallback((courseId: string) => 
    callTool<{ assignments: Assignment[] }>('get_grades', { course_id: courseId }), [callTool])

  const saveGrades = useCallback((courseId: string, assignments: Assignment[]) => 
    callTool<{ ok: boolean }>('save_grades', { course_id: courseId, assignments }), [callTool])

  const calculateGrade = useCallback((courseId: string) => 
    callTool<{ grade: number | null }>('calculate_grade', { course_id: courseId }), [callTool])

  // Calendar
  const getEvents = useCallback((startDate?: string, endDate?: string, courseId?: string) => 
    callTool<{ events: CalEvent[] }>('get_events', { start_date: startDate, end_date: endDate, course_id: courseId }), [callTool])

  const getTodayEvents = useCallback((date?: string) => 
    callTool<{ events: CalEvent[] }>('get_today_events', { date }), [callTool])

  const syncCalendar = useCallback(() => 
    callTool<{ events: CalEvent[] }>('sync_calendar', {}), [callTool])

  // Courses
  const getCourses = useCallback(() => 
    callTool<{ courses: Record<string, Course> }>('get_courses', {}), [callTool])

  return {
    connected,
    // Navigation
    navigate,
    // Theme & UI
    toggleTheme,
    toggleAiPanel,
    // AI
    aiQuery,
    // Notes
    searchNotes,
    getNote,
    openCourseNotes,
    // Learn Cards
    createLearnCard,
    getLearnCards,
    // Grades
    getGrades,
    saveGrades,
    calculateGrade,
    // Calendar
    getEvents,
    getTodayEvents,
    syncCalendar,
    // Courses
    getCourses,
  }
}