import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio"
import {
  CallToolRequestSchema,
  ListenToolRequestSchema
} from "@modelcontextprotocol/sdk/types"
import WebSocket from "ws"

const WS_UI_PORT = parseInt(process.env.WS_UI_PORT || '9711', 10)
const WS_UI_URL = `ws://localhost:${WS_UI_PORT}`

let uiSocket = null

const RECONNECT_INTERVAL_MS = 3000

function connectUiBridge() {
  try {
    const ws = new WebSocket(WS_UI_URL)
    ws.on('open', () => {
      uiSocket = ws
      console.error(`[mcp] Connected to UI bridge at ${WS_UI_URL}`)
    })
    ws.on('close', () => {
      uiSocket = null
      setTimeout(connectUiBridge, RECONNECT_INTERVAL_MS)
    })
    ws.on('error', () => {})
  } catch {
    setTimeout(connectUiBridge, RECONNECT_INTERVAL_MS)
  }
}

connectUiBridge()

function broadcastUiAction(action, payload) {
  if (!uiSocket || uiSocket.readyState !== WebSocket.OPEN) return
  uiSocket.send(JSON.stringify({ type: 'ui_action', action, ...payload }))
}

const TOOLS = [
  {
    name: 'get_courses',
    description: 'Get all enrolled courses with their codes, names, and colors.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_events',
    description: 'Get calendar events for a date range or specific course.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
        course_id: { type: 'string', description: 'Optional course ID to filter events' },
      },
    },
  },
  {
    name: 'get_today_events',
    description: 'Get today\'s calendar events for all courses.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date in ISO format (YYYY-MM-DD), defaults to today' },
      },
    },
  },
  {
    name: 'get_grades',
    description: 'Get grade assignments for a specific course with scores and weights.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID (e.g., "cs101", "math200")' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'save_grades',
    description: 'Save grade assignments for a course (creates, updates, or deletes).',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID' },
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Assignment unique ID' },
              name: { type: 'string', description: 'Assignment name' },
              weight: { type: 'number', description: 'Weight as percentage (e.g., 15 for 15%)' },
              earned: { type: 'number', description: 'Points earned (null if not yet graded)' },
              max_score: { type: 'number', description: 'Max possible points' },
            },
            required: ['id', 'name', 'weight', 'max_score'],
          },
          description: 'Array of assignments to save',
        },
      },
      required: ['course_id', 'assignments'],
    },
  },
  {
    name: 'calculate_grade',
    description: 'Calculate current grade for a course based on assignments and thresholds.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'sync_calendar',
    description: 'Sync calendar from stored ICS URL. Returns synced events.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'navigate',
    description: 'Navigate to a view in Mizu: today, schedule, grades, or a specific course.',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['today', 'schedule', 'grades'], description: 'View name' },
        course_id: { type: 'string', description: 'Optional course ID if navigating to a course' },
      },
      required: ['view'],
    },
  },
  {
    name: 'open_course_notes',
    description: 'Open a course\'s notes view in the sidebar.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'search_notes',
    description: 'Search course notes by title, content, lecture number, or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keyword, lecture number, or tag)' },
        course_id: { type: 'string', description: 'Optional course ID to search within' },
        limit: { type: 'number', description: 'Maximum results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_note',
    description: 'Get a specific note by ID with full markdown content.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'Note ID (e.g., "n14")' },
        course_id: { type: 'string', description: 'Course ID' },
      },
      required: ['note_id', 'course_id'],
    },
  },
  {
    name: 'create_learn_card',
    description: 'Create a learn card (flashcard) from a note for spaced repetition.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'Note ID to convert to card' },
        course_id: { type: 'string', description: 'Course ID' },
        front: { type: 'string', description: 'Question/prompt for front of card' },
        back: { type: 'string', description: 'Answer/explanation for back of card' },
      },
      required: ['note_id', 'course_id', 'front', 'back'],
    },
  },
  {
    name: 'get_learn_cards',
    description: 'Get all learn cards for a course.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID' },
      },
    },
  },
  {
    name: 'ai_query',
    description: 'Query the AI about course material (quiz, summarize, explain).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Question or request' },
        course_id: { type: 'string', description: 'Optional course ID to scope query' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'toggle_theme',
    description: 'Toggle between light and dark theme.',
    inputSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', enum: ['light', 'dark'], description: 'Theme to set' },
      },
      required: ['theme'],
    },
  },
  {
    name: 'toggle_ai_panel',
    description: 'Show or hide the AI assistant panel.',
    inputSchema: {
      type: 'object',
      properties: {
        show: { type: 'boolean', description: 'Whether to show the AI panel' },
      },
      required: ['show'],
    },
  },
]

const toolHandlers = {
  get_courses: async () => {
    broadcastUiAction('get_courses', {})
    return { content: [{ type: 'text', text: 'Courses are loaded from localStorage on app startup. Use navigate to view courses.' }] }
  },

  get_events: async ({ start_date, end_date, course_id }) => {
    broadcastUiAction('get_events', { start_date, end_date, course_id })
    return { content: [{ type: 'text', text: JSON.stringify({ start_date, end_date, course_id }) }] }
  },

  get_today_events: async ({ date }) => {
    const today = date || new Date().toISOString().split('T')[0]
    broadcastUiAction('get_today_events', { date: today })
    return { content: [{ type: 'text', text: `Fetching events for ${today}` }] }
  },

  get_grades: async ({ course_id }) => {
    broadcastUiAction('get_grades', { course_id })
    return { content: [{ type: 'text', text: `Loading grades for ${course_id}` }] }
  },

  save_grades: async ({ course_id, assignments }) => {
    broadcastUiAction('save_grades', { course_id, assignments })
    return { content: [{ type: 'text', text: `Saving ${assignments?.length || 0} assignments for ${course_id}` }] }
  },

  calculate_grade: async ({ course_id }) => {
    broadcastUiAction('calculate_grade', { course_id })
    return { content: [{ type: 'text', text: `Calculating grade for ${course_id}` }] }
  },

  sync_calendar: async () => {
    broadcastUiAction('sync_calendar', {})
    return { content: [{ type: 'text', text: 'Syncing calendar from stored URL' }] }
  },

  navigate: async ({ view, course_id }) => {
    broadcastUiAction('navigate', { view, course_id })
    return { content: [{ type: 'text', text: `Navigating to ${course_id || view}` }] }
  },

  open_course_notes: async ({ course_id }) => {
    broadcastUiAction('navigate', { view: 'course_notes', course_id })
    return { content: [{ type: 'text', text: `Opening notes for ${course_id}` }] }
  },

  toggle_theme: async ({ theme }) => {
    broadcastUiAction('toggle_theme', { theme })
    return { content: [{ type: 'text', text: `Theme set to ${theme}` }] }
  },

  toggle_ai_panel: async ({ show }) => {
    broadcastUiAction('toggle_ai_panel', { show })
    return { content: [{ type: 'text', text: show ? 'AI panel shown' : 'AI panel hidden' }] }
  },

  search_notes: async ({ query, course_id, limit }) => {
    broadcastUiAction('search_notes', { query, course_id, limit: limit || 10 })
    return { content: [{ type: 'text', text: `Searching notes for "${query}" in ${course_id || 'all courses'}` }] }
  },

  get_note: async ({ note_id, course_id }) => {
    broadcastUiAction('get_note', { note_id, course_id })
    return { content: [{ type: 'text', text: `Loading note ${note_id}` }] }
  },

  create_learn_card: async ({ note_id, course_id, front, back }) => {
    broadcastUiAction('create_learn_card', { note_id, course_id, front, back })
    return { content: [{ type: 'text', text: `Created learn card from note ${note_id}: ${front.substring(0, 50)}...` }] }
  },

  get_learn_cards: async ({ course_id }) => {
    broadcastUiAction('get_learn_cards', { course_id })
    return { content: [{ type: 'text', text: `Loading learn cards for ${course_id || 'all courses'}` }] }
  },

  ai_query: async ({ prompt, course_id }) => {
    broadcastUiAction('ai_query', { prompt, course_id })
    return { content: [{ type: 'text', text: `Sending to AI: ${prompt}` }] }
  },
}

class MizuServer {
  constructor() {
    this.tools = TOOLS
  }

  async handleTool(toolName, args) {
    const handler = toolHandlers[toolName]
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`)
    }
    return handler(args)
  }
}

async function main() {
  const server = new Server({
    name: 'mizu',
    version: '1.0.0',
  }, {
    tools: TOOLS,
  })

  server.setRequestHandler(CallToolRequestSchema, async ({ name, arguments: args }) => {
    try {
      const result = await server.handleTool(name, args)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)