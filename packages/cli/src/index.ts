#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { createClient, createPublicClient } from "@prosewire/sdk";

const program = new Command();
program
  .name("prosewire")
  .description("Publish and retrieve portable content from Prosewire")
  .version("0.1.0")
  .option("--url <url>", "Prosewire URL", process.env["PROSEWIRE_API_URL"] ?? "http://localhost:3000")
  .option("--key <key>", "Private API key", process.env["PROSEWIRE_API_KEY"]);

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

program
  .command("posts")
  .description("List posts")
  .option("--blog <slug>", "Blog slug", "fieldnotes")
  .option("--search <query>", "Search published content")
  .action(async (options: { blog: string; search?: string }) => {
    const root = program.opts<{ url: string }>();
    const client = createPublicClient({ baseUrl: root.url, blog: options.blog });
    output(await client.listPosts(options.search === undefined ? {} : { search: options.search }));
  });

program
  .command("get <slug>")
  .description("Get one published post")
  .option("--blog <slug>", "Blog slug", "fieldnotes")
  .action(async (slug: string, options: { blog: string }) => {
    const root = program.opts<{ url: string }>();
    const client = createPublicClient({ baseUrl: root.url, blog: options.blog });
    output(await client.getPost(slug));
  });

program
  .command("create")
  .description("Create a post from a JSON file")
  .requiredOption("--data <file>", "Path to JSON request body")
  .action(async (options: { data: string }) => {
    const root = program.opts<{ url: string; key?: string }>();
    if (!root.key) throw new Error("--key or PROSEWIRE_API_KEY is required");
    const body = JSON.parse(await readFile(options.data, "utf8")) as Parameters<ReturnType<typeof createClient>["posts"]["create"]>[0];
    output(await createClient({ baseUrl: root.url, apiKey: root.key }).posts.create(body));
  });

await program.parseAsync();
