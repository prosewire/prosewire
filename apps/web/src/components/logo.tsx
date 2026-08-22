import { BookOpenText } from "@phosphor-icons/react/ssr";
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
      <span className="grid size-8 place-items-center rounded-[10px] bg-[#172329] text-white shadow-sm">
        <BookOpenText className="size-4" weight="bold" />
      </span>
      {compact ? null : <span>Prosewire</span>}
    </span>
  );
}
