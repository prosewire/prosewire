"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SelectProps {
  readonly id?: string;
  readonly name: string;
  readonly options: ReadonlyArray<SelectOption>;
  readonly defaultValue?: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly size?: "small" | "medium";
  readonly label?: string;
  readonly labelClassName?: string;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
}

export function Select({
  id,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder = "Choose an option",
  disabled,
  required,
  size = "medium",
  label,
  labelClassName,
  className,
  contentClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      id={id}
      name={name}
      items={options}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(value === undefined ? {} : { value })}
      {...(onValueChange === undefined
        ? {}
        : {
            onValueChange: (nextValue: string | null) => {
              if (nextValue !== null) onValueChange(nextValue);
            },
          })}
      disabled={disabled ?? false}
      required={required ?? false}
    >
      {label ? (
        <SelectPrimitive.Label className={labelClassName}>
          {label}
        </SelectPrimitive.Label>
      ) : null}
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "group inline-flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-left text-sm text-[var(--ink)] shadow-sm outline-none transition",
          "hover:border-[#c8cbc5] hover:bg-[var(--paper)] focus-visible:border-[#ef6848] focus-visible:ring-2 focus-visible:ring-[#ef6848]/20",
          "disabled:pointer-events-none disabled:opacity-50 data-[placeholder]:text-[var(--muted)]",
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder={placeholder}
          className="min-w-0 truncate data-placeholder:text-[var(--muted)]"
        />
        <SelectPrimitive.Icon>
          <CaretDown className="size-3.5 shrink-0 text-[var(--muted)] transition-transform duration-150 data-[popup-open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <SelectPrimitive.Popup
            className={cn(
              "max-w-[calc(100vw-1.5rem)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-xl outline-none",
              "transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
              contentClassName,
            )}
          >
            <SelectPrimitive.ScrollUpArrow className="flex h-7 items-center justify-center bg-[var(--surface)] text-[var(--muted)]">
              <CaretUp className="size-3.5" />
            </SelectPrimitive.ScrollUpArrow>
            <SelectPrimitive.List className="max-h-[var(--available-height)] overflow-y-auto overscroll-contain p-1.5 outline-none">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled ?? false}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-lg pl-8 pr-3 outline-none",
                    "data-[highlighted]:bg-[var(--paper)] data-[highlighted]:text-[var(--ink)] data-[selected]:font-semibold",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                    size === "small"
                      ? "min-h-8 py-1.5 text-xs"
                      : "min-h-9 py-2 text-sm",
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-2.5 inline-flex items-center text-[#ef6848]">
                    <Check className="size-3.5" weight="bold" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText className="truncate">
                    {option.label}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
            <SelectPrimitive.ScrollDownArrow className="flex h-7 items-center justify-center bg-[var(--surface)] text-[var(--muted)]">
              <CaretDown className="size-3.5" />
            </SelectPrimitive.ScrollDownArrow>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
