import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#172329] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-[#26373f] disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "border-emerald-200 bg-emerald-50 text-emerald-700",
    scheduled: "border-sky-200 bg-sky-50 text-sky-700",
    draft: "border-amber-200 bg-amber-50 text-amber-700",
    archived: "border-stone-200 bg-stone-100 text-stone-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
        styles[status] ?? styles["draft"],
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function SectionHeading({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold tracking-[-0.025em]", className)}
      {...props}
    />
  );
}
