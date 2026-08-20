#!/usr/bin/env node
import { NodeRuntime, NodeStdio } from "@effect/platform-node-shared";
import { createClient } from "@prosewire/sdk";
import {
  Config,
  Effect,
  Layer,
  Logger,
  Redacted,
  Runtime,
  Schema,
} from "effect";
import { McpProtocol, McpServer } from "effect/unstable/ai";
import { createProsewireMcpServer } from "./server.ts";

const configuration = Config.all({
  baseUrl: Config.string("PROSEWIRE_API_URL").pipe(
    Config.withDefault("http://localhost:3000"),
  ),
  apiKey: Config.redacted("PROSEWIRE_API_KEY"),
});

class McpProcessError extends Schema.TaggedError<McpProcessError>()(
  "McpProcessError",
  { message: Schema.String, exitCode: Schema.Int },
) {
  override readonly [Runtime.errorExitCode] = this.exitCode;
  override readonly [Runtime.errorReported] = false;
}

const program = Effect.gen(function* () {
  const { apiKey, baseUrl } = yield* configuration;
  const toolkit = createProsewireMcpServer(
    createClient({ baseUrl, apiKey: Redacted.value(apiKey) }),
  );
  const server = toolkit.pipe(
    Layer.provide(
      McpServer.layerStdio({
        name: "prosewire",
        version: "0.1.0",
        description:
          "Manage the publication scoped to PROSEWIRE_API_KEY through typed Effect tools.",
        protocols: [
          McpProtocol.v2025_11_25,
          McpProtocol.v2025_06_18,
          McpProtocol.v2025_03_26,
          McpProtocol.v2024_11_05,
        ],
      }),
    ),
    Layer.provide(NodeStdio.layer),
    Layer.provide(Logger.layer([])),
  );
  yield* Effect.sync(() =>
    process.stderr.write(`prosewire-mcp: connected to ${baseUrl}\n`),
  );
  return yield* Layer.launch(server);
});

program.pipe(
  Effect.mapError((error) =>
    new McpProcessError({
      message: error instanceof Config.ConfigError
        ? "PROSEWIRE_API_KEY is required. Create one in Settings → Developer."
        : error instanceof Error
          ? error.message
          : "The Prosewire MCP server stopped unexpectedly.",
      exitCode: error instanceof Config.ConfigError ? 2 : 1,
    }),
  ),
  Effect.tapError((error) =>
    Effect.sync(() => process.stderr.write(`${error.message}\n`)),
  ),
  NodeRuntime.runMain,
);
