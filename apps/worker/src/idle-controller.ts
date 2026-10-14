export interface Session {
  /** Run due scans and return whether durable work still needs this worker. */
  readonly cycle: () => Promise<boolean>;
  readonly close: () => Promise<void>;
}

/** One session per process, including the gap while its resources are closing. */
export function makeIdleController(
  open: () => Session,
  options: {
    readonly wait: (signal: AbortSignal) => Promise<void>;
    readonly onError: (cause: unknown) => void;
  },
) {
  let generation = 0;
  let active: Promise<void> | undefined;
  let delay: AbortController | undefined;
  let closed = false;
  let observed = 0;

  const closeSession = async (session: Session) => {
    try {
      await session.close();
    } catch (cause) {
      options.onError(cause);
    }
  };

  const run = async () => {
    let session = open();
    try {
      let empty = false;
      while (!closed) {
        observed = generation;
        let busy: boolean;
        try {
          busy = await session.cycle();
        } catch (cause) {
          // A failed scan cannot prove idleness. Keep polling until recovery.
          options.onError(cause);
          // ManagedRuntime caches failed layer acquisition. Rebuild resources
          // before retrying so a cold-start connection failure can recover.
          await closeSession(session);
          session = open();
          busy = true;
        }
        if (closed) break;
        if (!busy && empty && observed === generation) break;
        empty = !busy;
        if (observed !== generation) continue;
        delay = new AbortController();
        await options.wait(delay.signal);
        delay = undefined;
      }
    } finally {
      await closeSession(session);
    }
  };

  const start = () => {
    if (active || closed) return;
    const running = run();
    active = running;
    void running
      .catch((cause) => {
        options.onError(cause);
      })
      .finally(() => {
        active = undefined;
        // A commit can wake us during disposal. It must get a fresh runtime,
        // never run against the runtime whose finalizers are already executing.
        if (!closed && observed !== generation) start();
      });
  };

  return {
    wake: (): boolean => {
      if (closed) return false;
      generation += 1;
      delay?.abort();
      start();
      return true;
    },
    close: async () => {
      closed = true;
      delay?.abort();
      await active;
    },
  };
}
