export type RuntimeLifecycleEvent = "beforeExit" | "SIGINT" | "SIGTERM";

export interface RuntimeLifecycleSource {
  readonly once: (event: RuntimeLifecycleEvent, listener: () => void) => unknown;
  readonly off: (event: RuntimeLifecycleEvent, listener: () => void) => unknown;
  readonly exit: (code: number) => unknown;
}

export function installRuntimeCleanup(
  source: RuntimeLifecycleSource,
  dispose: () => Promise<void>,
  report: (message: string, error: unknown) => void,
): () => void {
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    cleanupPromise ??= dispose();
    return cleanupPromise;
  };
  const beforeExit = () => {
    cleanup().catch((error: unknown) => {
      report("Failed to dispose the web runtime", error);
      source.exit(1);
    });
  };
  const shutdown = (signal: "SIGINT" | "SIGTERM") => {
    cleanup().then(
      () => source.exit(0),
      (error: unknown) => {
        report(`Failed to dispose the web runtime after ${signal}`, error);
        source.exit(1);
      },
    );
  };
  const sigint = () => shutdown("SIGINT");
  const sigterm = () => shutdown("SIGTERM");

  source.once("beforeExit", beforeExit);
  source.once("SIGINT", sigint);
  source.once("SIGTERM", sigterm);

  return () => {
    source.off("beforeExit", beforeExit);
    source.off("SIGINT", sigint);
    source.off("SIGTERM", sigterm);
  };
}
