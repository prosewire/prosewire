#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@prosewire/sdk";
import { createProsewireMcpServer } from "./server.ts";

const baseUrl = process.env["PROSEWIRE_API_URL"] ?? "http://localhost:3000";
const apiKey = process.env["PROSEWIRE_API_KEY"];
if (!apiKey) {
  process.stderr.write("PROSEWIRE_API_KEY is required. Create one in Settings → Developer.\n");
  process.exit(2);
}

const server = createProsewireMcpServer(createClient({ baseUrl, apiKey }));
await server.connect(new StdioServerTransport());
process.stderr.write(`prosewire-mcp: connected to ${baseUrl}\n`);
