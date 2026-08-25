#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node-shared";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { nodeServicesLayer } from "./node-services.ts";
import { createProgram } from "./program.ts";
import { version } from "./version.ts";

createProgram().pipe(
  Command.run({ version }),
  Effect.provide(nodeServicesLayer),
  NodeRuntime.runMain,
);
