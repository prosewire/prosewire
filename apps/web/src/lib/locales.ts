export const suggestedLocales = [
  "en",
  "en-US",
  "en-GB",
  "ar",
  "bn",
  "zh-Hans",
  "zh-Hant",
  "cs",
  "da",
  "nl",
  "fi",
  "fr",
  "fr-CA",
  "de",
  "el",
  "he",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "no",
  "fa",
  "pl",
  "pt",
  "pt-BR",
  "ro",
  "ru",
  "es",
  "es-MX",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
] as const;

export function canonicalLocale(value: string): string | undefined {
  const candidate = value.trim();
  if (candidate.length < 2 || candidate.length > 35) return undefined;
  try {
    return Intl.getCanonicalLocales(candidate)[0];
  } catch {
    return undefined;
  }
}

export function normalizeLanguageSettings(
  defaultLocale: string,
  locales: ReadonlyArray<string>,
): { readonly locale: string; readonly locales: Array<string> } | null {
  const locale = canonicalLocale(defaultLocale);
  if (!locale || locales.length === 0 || locales.length > 50) return null;

  const normalized = new Set<string>();
  for (const value of locales) {
    const canonical = canonicalLocale(value);
    if (!canonical) return null;
    normalized.add(canonical);
  }
  if (!normalized.has(locale)) return null;
  return { locale, locales: [...normalized] };
}

const languageNames = new Intl.DisplayNames(["en"], {
  type: "language",
  languageDisplay: "dialect",
});

export function localeName(locale: string): string {
  try {
    return languageNames.of(locale) ?? locale;
  } catch {
    return locale;
  }
}
