/**
 * WebSocket bridge for Mizu MCP tools.
 *
 * Exposes course operations over WebSocket so the Mizu app frontend
 * can invoke MCP tools in real-time without going through stdio.
 *
 * Port 9710: Tool bridge — Claude/AI clients call tools here.
 * Port 9711: UI bridge — Frontend listens for UI action broadcasts.
 *
 * Usage:
 *   node ws-bridge.js
 *
 * Protocol (tool bridge):
 *   Client sends:  { "id": "req-1", "tool": "search_notes", "args": { "query": "test" } }
 *   Server sends:  { "id": "req-1", "result": { ... } }
 *   On error:      { "id": "req-1", "error": "message" }
 *
 * Protocol (ui bridge):
 *   Server broadcasts: { "type": "ui_action", "action": "navigate", "view": "today" }
 */
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { searchNotes, getNote, vaultContext } from './vault.js'

const WS_PORT = parseInt(process.env.WS_PORT || '9710', 10)
const WS_UI_PORT = parseInt(process.env.WS_UI_PORT || '9711', 10)
const LOOPBACK_HOST = 'localhost'

const TRUSTED_UI_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
])

/** @type {WebSocketServer | null} */
let uiBridge = null

function broadcastUiAction(action, payload) {
  if (!uiBridge) return
  const msg = JSON.stringify({ type: 'ui_action', action, ...payload })
  for (const client of uiBridge.clients) {
    if (client.readyState === 1) client.send(msg)
  }
}

// Stub implementations — these should read from localStorage in the actual Tauri app
const TOOL_HANDLERS = {
  // UI actions
  navigate: (args) => { broadcastUiAction('navigate', args); return { ok: true } },
  search_notes: (args) => { broadcastUiAction('search_notes', args); return { results: [], message: 'Use MCP stdio for full search' } },
  get_note: (args) => { broadcastUiAction('get_note', args); return { note: null } },
  open_course_notes: (args) => { broadcastUiAction('navigate', { view: 'course_notes', course_id: args.course_id }); return { ok: true } },
  toggle_theme: (args) => { broadcastUiAction('toggle_theme', args); return { ok: true } },
  toggle_ai_panel: (args) => { broadcastUiAction('toggle_ai_panel', args); return { ok: true } },
  ai_query: (args) => { broadcastUiAction('ai_query', args); return { ok: true } },
  create_learn_card: (args) => { broadcastUiAction('create_learn_card', args); return { ok: true } },
  get_learn_cards: (args) => { broadcastUiAction('get_learn_cards', args); return { cards: [] } },
  
  // Grade operations
  get_grades: (args) => { broadcastUiAction('get_grades', args); return { assignments: [] } },
  save_grades: (args) => { broadcastUiAction('save_grades', args); return { ok: true } },
  calculate_grade: (args) => { broadcastUiAction('calculate_grade', args); return { grade: null } },
  
  // Calendar operations
  get_events: (args) => { broadcastUiAction('get_events', args); return { events: [] } },
  get_today_events: (args) => { broadcastUiAction('get_today_events', args); return { events: [] } },
  sync_calendar: (args) => { broadcastUiAction('sync_calendar', args); return { events: [] } },
  
  // Course operations  
  get_courses: (args) => { broadcastUiAction('get_courses', args); return { courses: {} } },
}

async function handleMessage(data) {
  const msg = JSON.parse(data)
  const { id, tool, args } = msg

  const handler = TOOL_HANDLERS[tool]
  if (!handler) {
    return { id, error: `Unknown tool: ${tool}` }
  }

  try {
    const result = await handler(args || {})
    return { id, result }
  } catch (err) {
    return { id, error: err.message }
  }
}

function isLoopbackAddress(remoteAddress) {
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1'
}

function isTrustedUiOrigin(origin) {
  if (!origin) return true
  if (TRUSTED_UI_ORIGINS.has(origin)) return true
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(origin)
}

function evaluateBridgeRequest({ bridgeType, origin, remoteAddress }) {
  if (!isLoopbackAddress(remoteAddress)) {
    return { ok: false, reason: 'non-local client' }
  }

  if (bridgeType === 'tool' && origin) {
    return { ok: false, reason: 'browser origins are not allowed on the tool bridge' }
  }

  if (bridgeType === 'ui' && !isTrustedUiOrigin(origin)) {
    return { ok: false, reason: 'untrusted UI origin' }
  }

  return { ok: true, reason: null }
}

function verifyBridgeRequest(bridgeType) {
  return (info, done) => {
    const verdict = evaluateBridgeRequest({
      bridgeType,
      origin: info.origin,
      remoteAddress: info.req.socket.remoteAddress,
    })

    if (!verdict.ok) {
      console.error(`[ws-bridge] Rejected ${bridgeType} bridge client: ${verdict.reason}`)
      done(false, 403, 'Forbidden')
      return
    }

    done(true)
  }
}

function startUiBridge(port = WS_UI_PORT) {
  return new Promise((resolve) => {
    const httpServer = createServer()

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[ws-bridge] UI bridge port ${port} already in use`)
      } else {
        console.error(`[ws-bridge] UI bridge error: ${err.message}`)
      }
      resolve(null)
    })

    httpServer.listen(port, LOOPBACK_HOST, () => {
      const wss = new WebSocketServer({
        server: httpServer,
        verifyClient: verifyBridgeRequest('ui'),
      })
      wss.on('connection', (ws) => {
        console.error(`[ws-bridge] UI client connected`)
        ws.on('message', (raw) => {
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === 1) client.send(raw.toString())
          }
        })
      })
      uiBridge = wss
      console.error(`[ws-bridge] UI bridge listening on ws://localhost:${port}`)
      resolve(wss)
    })
  })
}

function startToolBridge(port = WS_PORT) {
  const wss = new WebSocketServer({
    port,
    host: LOOPBACK_HOST,
    verifyClient: verifyBridgeRequest('tool'),
  })

  wss.on('connection', (ws) => {
    console.error('[ws-bridge] Client connected')

    ws.on('message', async (raw) => {
      try {
        const response = await handleMessage(raw.toString())
        ws.send(JSON.stringify(response))
      } catch (err) {
        ws.send(JSON.stringify({ error: `Parse error: ${err.message}` }))
      }
    })

    ws.on('close', () => console.error('[ws-bridge] Client disconnected'))
  })

  console.error(`[ws-bridge] Tool bridge listening on ws://${LOOPBACK_HOST}:${port}`)
  return wss
}

// Run directly if invoked as main module
const isMain = process.argv[1]?.endsWith('ws-bridge.js')
if (isMain) {
  startUiBridge().then(() => startToolBridge())
}