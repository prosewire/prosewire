"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      data-theme-toggle
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] shadow-sm transition hover:-translate-y-px hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        className,
      )}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="theme-icon-light size-4" aria-hidden />
      <Moon className="theme-icon-dark size-4" aria-hidden />
    </button>
  );
}
