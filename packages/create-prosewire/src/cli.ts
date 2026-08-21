import { relative } from "node:path";
import type { ScaffoldOptions } from "./index.ts";

interface CliOperations {
  readonly agentPrompt: (
    options: Omit<ScaffoldOptions, "root" | "install">,
  ) => string;
  readonly resolveProjectRoot: (start: string, cwd?: string) => Promise<string>;
  readonly scaffold: (options: ScaffoldOptions) => Promise<{
    readonly framework: string;
    readonly files: ReadonlyArray<string>;
  }>;
}

function flag(args: ReadonlyArray<string>, name: string) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function runCli(
  args: ReadonlyArray<string>,
  operations: CliOperations,
) {
  const baseUrl = flag(args, "--url");
  const publication = flag(args, "--blog");
  const basePath = flag(args, "--route") ?? "/blog";
  const cwd = flag(args, "--cwd");
  const routerValue = flag(args, "--router");
  const router: "app" | "pages" | undefined =
    routerValue === "app" || routerValue === "pages" ? routerValue : undefined;
  if (!baseUrl || !publication) {
    throw new Error("--url and --blog are required");
  }
  const options = {
    baseUrl,
    publication,
    basePath,
    ...(router ? { router } : {}),
  } as const;
  if (args.includes("--agent")) {
    const target = cwd ? `\nTarget project: ${cwd}\n` : "";
    process.stdout.write(`${operations.agentPrompt(options)}${target}\n`);
    return;
  }
  const invocationRoot = process.cwd();
  const root = await operations.resolveProjectRoot(invocationRoot, cwd);
  const result = await operations.scaffold({
    root,
    ...options,
    install: !args.includes("--no-install"),
  });
  process.stdout.write(
    `Added Prosewire to ${relative(invocationRoot, root) || "."} for ${result.framework}:\n${result.files.map((file) => `- ${file}`).join("\n")}\n`,
  );
}
