import { emailOutboxNotificationChannel } from "@prosewire/jobs/email-queue";
import { Duration, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";
import {
  layerWith,
  type NotificationConnection,
  type NotificationSource,
  Service,
} from "./email-outbox-notifications.ts";

class FakeConnection implements NotificationConnection {
  readonly notifications = new Set<(channel: string) => void>();
  readonly disconnects = new Set<(cause: unknown) => void>();
  closed = false;
  listenedChannel: string | undefined;
  onListen: (() => void) | undefined;

  listen(channel: string): Promise<void> {
    this.listenedChannel = channel;
    this.onListen?.();
    return Promise.resolve();
  }

  onNotification(listener: (channel: string) => void): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }

  onDisconnect(listener: (cause: unknown) => void): () => void {
    this.disconnects.add(listener);
    return () => this.disconnects.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  notify(channel: string): void {
    for (const listener of this.notifications) listener(channel);
  }

  disconnect(cause: unknown): void {
    for (const listener of this.disconnects) listener(cause);
  }
}

describe("EmailOutboxNotifications", () => {
  it("wakes for its channel and releases the listening connection", async () => {
    const connection = new FakeConnection();
    const source: NotificationSource = {
      connect: () => Promise.resolve(connection),
    };
    const runtime = ManagedRuntime.make(layerWith(source));

    try {
      const notifications = await runtime.runPromise(Service);
      const waiting = runtime.runPromise(notifications.wait);
      connection.notify("another_channel");
      connection.notify(emailOutboxNotificationChannel);
      await waiting;

      expect(connection.listenedChannel).toBe(emailOutboxNotificationChannel);
    } finally {
      await runtime.dispose();
    }

    expect(connection.closed).toBe(true);
    expect(connection.notifications.size).toBe(0);
    expect(connection.disconnects.size).toBe(0);
  });

  it("reconnects after the dedicated PostgreSQL connection ends", async () => {
    const first = new FakeConnection();
    const second = new FakeConnection();
    let connectCount = 0;
    let markSecondListening: (() => void) | undefined;
    const secondListening = new Promise<void>((resolve) => {
      markSecondListening = resolve;
    });
    second.onListen = () => markSecondListening?.();
    const source: NotificationSource = {
      connect: () => {
        connectCount += 1;
        return Promise.resolve(connectCount === 1 ? first : second);
      },
    };
    const runtime = ManagedRuntime.make(layerWith(source, Duration.millis(1)));

    try {
      const notifications = await runtime.runPromise(Service);
      first.disconnect(new Error("connection lost"));
      await secondListening;

      const waiting = runtime.runPromise(notifications.wait);
      second.notify(emailOutboxNotificationChannel);
      await waiting;

      expect(connectCount).toBe(2);
      expect(first.closed).toBe(true);
    } finally {
      await runtime.dispose();
    }

    expect(second.closed).toBe(true);
  });
});
