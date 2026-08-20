import { describe, expect, it } from "vitest";
import {
  type AdvisoryLockClient,
  withDatabaseAdvisoryLock,
} from "./migrate.ts";

function testClient(events: Array<string>): AdvisoryLockClient {
  return {
    connect: () => {
      events.push("connect");
      return Promise.resolve();
    },
    query: (text) => {
      events.push(text.includes("unlock") ? "unlock" : "lock");
      return Promise.resolve();
    },
    end: () => {
      events.push("end");
      return Promise.resolve();
    },
  };
}

describe("withDatabaseAdvisoryLock", () => {
  it("holds one session lock for the entire bootstrap operation", async () => {
    const events: Array<string> = [];
    const client = testClient(events);

    const result = await withDatabaseAdvisoryLock(
      "postgres://test",
      () => {
        events.push("bootstrap");
        return Promise.resolve("ready");
      },
      () => client,
    );

    expect(result).toBe("ready");
    expect(events).toEqual(["connect", "lock", "bootstrap", "unlock", "end"]);
  });

  it("unlocks and closes the connection when bootstrap fails", async () => {
    const events: Array<string> = [];
    const client = testClient(events);
    const failure = new Error("migration failed");

    await expect(
      withDatabaseAdvisoryLock(
        "postgres://test",
        () => {
          events.push("bootstrap");
          return Promise.reject(failure);
        },
        () => client,
      ),
    ).rejects.toBe(failure);

    expect(events).toEqual(["connect", "lock", "bootstrap", "unlock", "end"]);
  });

  it("closes the client when connecting fails", async () => {
    const events: Array<string> = [];
    const failure = new Error("connection failed");
    const client: AdvisoryLockClient = {
      connect: () => {
        events.push("connect");
        return Promise.reject(failure);
      },
      query: () => {
        events.push("query");
        return Promise.resolve();
      },
      end: () => {
        events.push("end");
        return Promise.resolve();
      },
    };

    await expect(
      withDatabaseAdvisoryLock(
        "postgres://test",
        () => Promise.resolve("unreachable"),
        () => client,
      ),
    ).rejects.toBe(failure);

    expect(events).toEqual(["connect", "end"]);
  });
});
