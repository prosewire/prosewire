import Image from "next/image";
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
      <Image
        src={prosewireMark}
        alt={compact ? "Prosewire" : ""}
        className="size-8 shrink-0"
      />
      {compact ? null : <span>Prosewire</span>}
    </span>
  );
}
