


import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio"
import {
  CallToolRequestSchema,
  ListenToolRequestSchema
} from "@modelcontextprotocol/sdk/types"
import WebSocket from "ws"
import { searchNotes, getNote, vaultContext } from "./vault"

