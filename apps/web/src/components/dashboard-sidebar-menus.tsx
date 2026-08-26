"use client";

import { Menu } from "@base-ui/react/menu";
import {
  Buildings,
  CaretUpDown,
  Check,
  GearSix,
  Newspaper,
  Plus,
  SignOut,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import type { NamedSelection } from "./dashboard-shell-types";

type MenuPlacement = "desktop" | "mobile";

const menuItemClass =
  "relative flex min-h-9 w-full cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--ink)] outline-none data-[highlighted]:bg-[var(--paper)] data-[disabled]:pointer-events-none data-[disabled]:opacity-45";

function MenuPopup({
  align,
  children,
  placement,
}: {
  readonly align: "start" | "end";
  readonly children: React.ReactNode;
  readonly placement: MenuPlacement;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        side={placement === "mobile" ? "bottom" : "right"}
        sideOffset={8}
        collisionPadding={12}
        className="z-50 outline-none"
      >
        <Menu.Popup
          className={cn(
            "w-60 max-w-[calc(100vw-1.5rem)] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-xl outline-none",
            "transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          )}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DashboardSelectionMenu({
  action,
  canCreate,
  collapsed = false,
  createHref,
  current,
  items,
  kind,
  label,
  name,
  placement = "desktop",
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly canCreate: boolean;
  readonly collapsed?: boolean;
  readonly createHref: string;
  readonly current: NamedSelection;
  readonly items: ReadonlyArray<NamedSelection>;
  readonly kind: "publication" | "workspace";
  readonly label: string;
  readonly name: "organizationId" | "publicationId";
  readonly placement?: MenuPlacement;
}) {
  const compact = collapsed && placement === "desktop";
  const SelectionIcon = kind === "workspace" ? Buildings : Newspaper;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Switch ${label.toLowerCase()}. Current: ${current.name}`}
        title={compact ? `${label}: ${current.name}` : undefined}
        className={cn(
          "group flex h-10 min-w-0 items-center rounded-xl text-left outline-none transition-colors",
          "hover:bg-white focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 data-popup-open:bg-white",
          placement === "mobile" &&
            "w-full border border-[var(--line)] bg-[var(--surface)] px-2.5 shadow-sm",
          placement === "desktop" && !compact && "w-full gap-2.5 px-2",
          compact && "mx-auto size-10 justify-center",
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] shadow-sm">
          <SelectionIcon className="size-3.5" aria-hidden />
        </span>
        <span className={compact ? "sr-only" : "min-w-0 flex-1"}>
          <span className="block text-[10px] leading-none text-[var(--muted)]">
            {label}
          </span>
          <span className="mt-1 block truncate text-xs font-semibold leading-none text-[var(--ink)]">
            {current.name}
          </span>
        </span>
        {compact ? null : (
          <CaretUpDown
            className="size-3.5 shrink-0 text-[var(--muted)]"
            aria-hidden
          />
        )}
      </Menu.Trigger>

      <MenuPopup
        align={placement === "mobile" ? "end" : "start"}
        placement={placement}
      >
        <Menu.Group>
          <Menu.GroupLabel className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            {label}
          </Menu.GroupLabel>
          <form action={action} role="none">
            {items.map((item) => {
              const selected = item.id === current.id;
              return (
                <Menu.Item
                  key={item.id}
                  aria-current={selected ? "true" : undefined}
                  className={cn(menuItemClass, selected && "font-semibold")}
                  nativeButton
                  render={<button type="submit" name={name} value={item.id} />}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {selected ? (
                    <Check
                      className="size-3.5 shrink-0 text-[var(--accent)]"
                      weight="bold"
                      aria-hidden
                    />
                  ) : null}
                </Menu.Item>
              );
            })}
          </form>
        </Menu.Group>
        {canCreate ? (
          <>
            <Menu.Separator className="my-1 h-px bg-[var(--line)]" />
            <Menu.LinkItem
              closeOnClick
              className={menuItemClass}
              render={<Link href={createHref} />}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-[var(--line)]">
                <Plus className="size-3.5" weight="bold" aria-hidden />
              </span>
              Create new
            </Menu.LinkItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu.Root>
  );
}

export function DashboardUserMenu({
  collapsed = false,
  placement = "desktop",
  role,
  userName,
}: {
  readonly collapsed?: boolean;
  readonly placement?: MenuPlacement;
  readonly role: string;
  readonly userName: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const compact = collapsed && placement === "desktop";
  const initial = userName.slice(0, 1).toUpperCase();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/sign-in");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Open user menu for ${userName}`}
        title={compact ? userName : undefined}
        className={cn(
          "flex h-11 min-w-0 items-center rounded-xl text-left outline-none transition-colors",
          "hover:bg-white focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 data-popup-open:bg-white",
          placement === "mobile" && "w-auto max-w-full gap-2 px-2",
          placement === "desktop" && !compact && "w-full gap-2.5 px-2",
          compact && "mx-auto size-10 justify-center",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#20343a] text-xs font-semibold text-white">
          {initial}
        </span>
        <span className={compact ? "sr-only" : "min-w-0 flex-1"}>
          <span className="block truncate text-xs font-semibold">
            {userName}
          </span>
          <span className="mt-0.5 block truncate text-[10px] capitalize text-[var(--muted)]">
            {role}
          </span>
        </span>
        {compact ? null : (
          <CaretUpDown
            className="size-3.5 shrink-0 text-[var(--muted)]"
            aria-hidden
          />
        )}
      </Menu.Trigger>

      <MenuPopup align="end" placement={placement}>
        <Menu.Group>
          <Menu.GroupLabel className="flex items-center gap-2.5 px-2 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#20343a] text-xs font-semibold text-white">
              {initial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">
                {userName}
              </span>
              <span className="mt-0.5 block text-[10px] capitalize text-[var(--muted)]">
                {role}
              </span>
            </span>
          </Menu.GroupLabel>
        </Menu.Group>
        <Menu.Separator className="my-1 h-px bg-[var(--line)]" />
        <Menu.LinkItem
          closeOnClick
          className={menuItemClass}
          render={<Link href="/settings" />}
        >
          <GearSix className="size-4" aria-hidden />
          Settings
        </Menu.LinkItem>
        <Menu.Item
          disabled={signingOut}
          className={menuItemClass}
          onClick={() => void handleSignOut()}
        >
          <SignOut className="size-4" aria-hidden />
          {signingOut ? "Signing out..." : "Sign out"}
        </Menu.Item>
      </MenuPopup>
    </Menu.Root>
  );
}
