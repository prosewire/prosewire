"use client";

import { Check, Plus, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { canonicalLocale, localeName, suggestedLocales } from "@/lib/locales";

interface LanguageSettingsProps {
  readonly defaultLocale: string;
  readonly initialLocales: ReadonlyArray<string>;
}

function languageLabel(locale: string): string {
  return `${localeName(locale)} (${locale})`;
}

export function LanguageSettings({
  defaultLocale,
  initialLocales,
}: LanguageSettingsProps) {
  const [locales, setLocales] = useState(() => [...initialLocales]);
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState<string>();
  const suggestions = useMemo(
    () =>
      suggestedLocales
        .filter((locale) => !locales.includes(locale))
        .map((locale) => ({ locale, label: languageLabel(locale) })),
    [locales],
  );

  function addLanguage() {
    const locale = canonicalLocale(candidate);
    if (!locale) {
      setError("Enter a valid locale code, such as fr or pt-BR.");
      return;
    }
    if (locales.includes(locale)) {
      setError(`${languageLabel(locale)} is already configured.`);
      return;
    }
    setLocales((current) => [...current, locale]);
    setCandidate("");
    setError(undefined);
  }

  function removeLanguage(locale: string) {
    if (locale === selectedLocale || locales.length === 1) return;
    setLocales((current) => current.filter((value) => value !== locale));
    setError(undefined);
  }

  return (
    <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
      <div>
        <div className="flex gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold">
            Add a language
            <input
              aria-describedby={error ? "locale-error" : "locale-help"}
              autoComplete="off"
              list="suggested-locales"
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addLanguage();
              }}
              placeholder="fr or fr-CA"
              className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] px-3 text-sm font-normal outline-none focus:border-[#ef6848]"
            />
          </label>
          <button
            type="button"
            onClick={addLanguage}
            className="mt-[22px] inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#d9dbd5] bg-white px-3 text-xs font-semibold"
          >
            <Plus className="size-3.5" />
            Add
          </button>
          <datalist id="suggested-locales">
            {suggestions.map(({ locale, label }) => (
              <option key={locale} value={locale} label={label} />
            ))}
          </datalist>
        </div>
        <p id="locale-help" className="mt-2 text-xs leading-5 text-[#7b8589]">
          Search the list or enter any valid locale code. Region-specific codes
          such as en-GB and pt-BR are supported.
        </p>
        {error ? (
          <p
            id="locale-error"
            aria-live="polite"
            className="mt-2 text-xs font-medium text-red-700"
          >
            {error}
          </p>
        ) : null}
      </div>

      <label className="text-xs font-semibold">
        Default language
        <select
          name="locale"
          value={selectedLocale}
          onChange={(event) => setSelectedLocale(event.target.value)}
          className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] bg-white px-3 text-sm font-normal outline-none focus:border-[#ef6848]"
        >
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {languageLabel(locale)}
            </option>
          ))}
        </select>
        <span className="mt-2 block font-normal leading-5 text-[#7b8589]">
          New posts start in this language.
        </span>
      </label>

      <div className="sm:col-span-2">
        <p className="text-xs font-semibold">Configured languages</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {locales.map((locale) => {
            const isDefault = locale === selectedLocale;
            return (
              <div
                key={locale}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[#d9dbd5] bg-[#fafaf7] px-3 py-2"
              >
                <input type="hidden" name="locales" value={locale} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {localeName(locale)}
                  </p>
                  <p className="text-[11px] text-[#7b8589]">{locale}</p>
                </div>
                {isDefault ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    <Check className="size-3" />
                    Default
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeLanguage(locale)}
                    aria-label={`Remove ${languageLabel(locale)}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-[#7b8589] hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-5 text-[#7b8589]">
          A language used by an existing post must stay configured.
        </p>
      </div>
    </div>
  );
}
