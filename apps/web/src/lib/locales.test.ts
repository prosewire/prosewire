import { describe, expect, it } from "vitest";
import {
  canonicalLocale,
  localeName,
  normalizeLanguageSettings,
} from "./locales.ts";

describe("publication locales", () => {
  it("canonicalizes valid locale tags", () => {
    expect(canonicalLocale(" pt-br ")).toBe("pt-BR");
    expect(canonicalLocale("not_a_locale")).toBeUndefined();
  });

  it("deduplicates locales and requires the default locale", () => {
    expect(normalizeLanguageSettings("fr", ["en", "fr", "FR"])).toEqual({
      locale: "fr",
      locales: ["en", "fr"],
    });
    expect(normalizeLanguageSettings("fr", ["en"])).toBeNull();
    expect(normalizeLanguageSettings("en", [])).toBeNull();
  });

  it("formats a readable language name", () => {
    expect(localeName("pt-BR")).toMatch(/Portuguese/i);
  });
});
