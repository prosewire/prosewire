import Image from "next/image";
import prosewireMarkDark from "@/assets/prosewire-mark-on-dark.svg";
import prosewireMark from "@/assets/prosewire-mark-on-light.svg";
import { cn } from "@/lib/cn";

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-semibold tracking-[-0.03em]",
        className,
      )}
    >
      <span className="relative size-8 shrink-0">
        <Image
          src={prosewireMark}
          alt={compact ? "Prosewire" : ""}
          className="theme-logo-light size-full"
        />
        <Image
          src={prosewireMarkDark}
          alt=""
          className="theme-logo-dark absolute inset-0 size-full"
        />
      </span>
      {compact ? null : <span>Prosewire</span>}
    </span>
  );
}
