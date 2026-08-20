import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { createClient, createPublicClient } from "@prosewire/sdk";

interface CliDependencies {
  readonly readFile: typeof readFile;
  readonly createClient: typeof createClient;
  readonly createPublicClient: typeof createPublicClient;
  readonly output: (value: unknown) => void;
  readonly env: NodeJS.ProcessEnv;
}

const defaults: CliDependencies = {
  readFile,
  createClient,
  createPublicClient,
  output: (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
  env: process.env,
};

export function createProgram(
  overrides: Partial<CliDependencies> = {},
): Command {
  const dependencies = { ...defaults, ...overrides };
  const program = new Command();

  program
    .name("prosewire")
    .description("Publish and retrieve portable content from Prosewire")
    .version("0.1.0")
    .option(
      "--url <url>",
      "Prosewire URL",
      dependencies.env["PROSEWIRE_API_URL"] ?? "http://localhost:3000",
    )
    .option(
      "--key <key>",
      "Private API key",
      dependencies.env["PROSEWIRE_API_KEY"],
    );

  program
    .command("posts")
    .description("List posts")
    .option("--blog <slug>", "Publication slug", dependencies.env["PROSEWIRE_BLOG"])
    .option("--search <query>", "Search published content")
    .action(async (options: { blog?: string; search?: string }) => {
      if (!options.blog) throw new Error("--blog or PROSEWIRE_BLOG is required");
      const root = program.opts<{ url: string }>();
      const client = dependencies.createPublicClient({
        baseUrl: root.url,
        blog: options.blog,
      });
      dependencies.output(
        await client.listPosts(
          options.search === undefined ? {} : { search: options.search },
        ),
      );
    });

  program
    .command("get <slug>")
    .description("Get one published post")
    .option("--blog <slug>", "Publication slug", dependencies.env["PROSEWIRE_BLOG"])
    .action(async (slug: string, options: { blog?: string }) => {
      if (!options.blog) throw new Error("--blog or PROSEWIRE_BLOG is required");
      const root = program.opts<{ url: string }>();
      const client = dependencies.createPublicClient({
        baseUrl: root.url,
        blog: options.blog,
      });
      dependencies.output(await client.getPost(slug));
    });

  program
    .command("create")
    .description("Create a post from a JSON file")
    .requiredOption("--data <file>", "Path to JSON request body")
    .action(async (options: { data: string }) => {
      const root = program.opts<{ url: string; key?: string }>();
      if (!root.key) throw new Error("--key or PROSEWIRE_API_KEY is required");
      const body = JSON.parse(
        await dependencies.readFile(options.data, "utf8"),
      ) as Parameters<ReturnType<typeof createClient>["posts"]["create"]>[0];
      dependencies.output(
        await dependencies
          .createClient({ baseUrl: root.url, apiKey: root.key })
          .posts.create(body),
      );
    });

  program
    .command("update <id>")
    .description("Update a post from a JSON file")
    .requiredOption("--data <file>", "Path to JSON request body")
    .action(async (id: string, options: { data: string }) => {
      const root = program.opts<{ url: string; key?: string }>();
      if (!root.key) throw new Error("--key or PROSEWIRE_API_KEY is required");
      const body = JSON.parse(
        await dependencies.readFile(options.data, "utf8"),
      ) as Parameters<ReturnType<typeof createClient>["posts"]["update"]>[0]["body"];
      dependencies.output(
        await dependencies
          .createClient({ baseUrl: root.url, apiKey: root.key })
          .posts.update({ params: { id }, body }),
      );
    });

  program
    .command("archive <id>")
    .description("Archive a post")
    .requiredOption("--yes", "Confirm the archive operation")
    .action(async (id: string) => {
      const root = program.opts<{ url: string; key?: string }>();
      if (!root.key) throw new Error("--key or PROSEWIRE_API_KEY is required");
      dependencies.output(
        await dependencies
          .createClient({ baseUrl: root.url, apiKey: root.key })
          .posts.archive({ params: { id } }),
      );
    });

  return program;
}
