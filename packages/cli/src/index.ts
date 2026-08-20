#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node-shared";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { createProgram } from "./program.ts";
import { nodeServicesLayer } from "./node-services.ts";

createProgram().pipe(
  Command.run({ version: "0.1.0" }),
  Effect.provide(nodeServicesLayer),
  NodeRuntime.runMain,
);
