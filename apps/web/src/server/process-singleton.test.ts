import { describe, expect, it } from "vitest";
import {
  deleteProcessSingleton,
  processSingleton,
} from "./process-singleton.ts";

describe("processSingleton", () => {
  it("shares one value across separately evaluated module call sites", () => {
    const key = "@prosewire/test/process-singleton";
    let created = 0;

    try {
      const first = processSingleton(key, () => ({ generation: ++created }));
      const second = processSingleton(key, () => ({ generation: ++created }));

      expect(second).toBe(first);
      expect(created).toBe(1);
    } finally {
      deleteProcessSingleton(key);
    }
  });
});
