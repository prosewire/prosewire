import { List } from "@phosphor-icons/react/ssr";
import { hasPermission } from "@prosewire/core";
import Link from "next/link";
import { switchPublication, switchWorkspace } from "@/server/actions";
import type { DashboardShellProps } from "./dashboard-shell-types";
import { Logo } from "./logo";
import { SignOutButton } from "./sign-out-button";

const links = [
  ["/dashboard", "Overview"],
  ["/posts", "Posts"],
  ["/content", "Content library"],
  ["/analytics", "Analytics"],
  ["/team", "Authors & team"],
  ["/integrate", "Integrate"],
  ["/settings", "Settings"],
] as const;

export function MobileHeader({
  userName,
  role,
  workspace,
  workspaces,
  publication,
  publications,
}: DashboardShellProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dedfd9] bg-[#f8f7f2]/95 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
        <Logo className="text-base" />
        <span className="truncate text-xs font-semibold text-[#687279]">
          {publication.name}
        </span>
      </Link>
      <details className="group relative">
        <summary
          aria-label="Open navigation"
          className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-[#dedfd9] bg-white [&::-webkit-details-marker]:hidden"
        >
          <List className="size-4" />
        </summary>
        <div className="absolute right-0 top-11 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-[#d9dbd5] bg-[#f8f7f2] shadow-xl">
          <div className="space-y-3 border-b border-[#dedfd9] p-4">
            <form
              action={switchWorkspace}
              className="grid grid-cols-[1fr_auto] items-end gap-2"
            >
              <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9397]">
                Workspace
                <select
                  name="organizationId"
                  defaultValue={workspace.id}
                  className="mt-1.5 h-9 w-full rounded-lg border border-[#d9dbd5] bg-white px-2 text-xs font-semibold normal-case tracking-normal text-[#172329]"
                >
                  {workspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="h-9 rounded-lg border border-[#d9dbd5] bg-white px-3 text-xs font-semibold">
                Switch
              </button>
            </form>
            <form
              action={switchPublication}
              className="grid grid-cols-[1fr_auto] items-end gap-2"
            >
              <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9397]">
                Publication
                <select
                  name="publicationId"
                  defaultValue={publication.id}
                  className="mt-1.5 h-9 w-full rounded-lg border border-[#d9dbd5] bg-white px-2 text-xs font-semibold normal-case tracking-normal text-[#172329]"
                >
                  {publications.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="h-9 rounded-lg border border-[#d9dbd5] bg-white px-3 text-xs font-semibold">
                Open
              </button>
            </form>
            <Link
              href="/onboarding?newWorkspace=1"
              className="block text-center text-xs font-semibold text-[#687279]"
            >
              + New workspace
            </Link>
          </div>
          <nav className="grid grid-cols-2 gap-1 p-3">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-2.5 text-xs font-semibold text-[#59666b] hover:bg-white hover:text-[#172329]"
              >
                {label}
              </Link>
            ))}
            {hasPermission(role, "audit:read") ? (
              <Link
                href="/audit"
                className="rounded-lg px-3 py-2.5 text-xs font-semibold text-[#59666b] hover:bg-white hover:text-[#172329]"
              >
                Audit history
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center justify-between border-t border-[#dedfd9] px-3 py-2">
            <p className="min-w-0 truncate px-2 text-xs font-semibold">
              {userName}{" "}
              <span className="font-normal capitalize text-[#8a9397]">
                · {role}
              </span>
            </p>
            <div className="w-24">
              <SignOutButton />
            </div>
          </div>
        </div>
      </details>
    </header>
  );
}
