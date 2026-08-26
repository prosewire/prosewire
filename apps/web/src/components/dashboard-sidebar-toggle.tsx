"use client";

import { SidebarSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

const sidebarCookie = "prosewire-sidebar";
const sidebarEvent = "prosewire:sidebar-state";

function currentSidebarState(): boolean {
  const preference = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${sidebarCookie}=`))
    ?.split("=")[1];
  if (preference === "collapsed") return true;
  if (preference === "expanded") return false;

  const collapsed =
    document.getElementById("dashboard-shell")?.dataset.collapsed;
  return collapsed === "true";
}

export function DashboardSidebarToggle({
  rail = false,
}: {
  readonly rail?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = useCallback(() => {
    const shell = document.getElementById("dashboard-shell");
    if (!shell) return;

    const next = shell.dataset.collapsed !== "true";
    shell.dataset.collapsed = next ? "true" : "false";
    // biome-ignore lint/suspicious/noDocumentCookie: this local UI preference does not need a server action.
    document.cookie = `${sidebarCookie}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(
      new CustomEvent<boolean>(sidebarEvent, { detail: next }),
    );
  }, []);

  useEffect(() => {
    const shell = document.getElementById("dashboard-shell");
    const initialState = currentSidebarState();
    if (shell) shell.dataset.collapsed = initialState ? "true" : "false";

    const handleSidebarState = (event: Event) => {
      setCollapsed((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener(sidebarEvent, handleSidebarState);
    setCollapsed(initialState);
    return () => window.removeEventListener(sidebarEvent, handleSidebarState);
  }, []);

  useEffect(() => {
    if (rail) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "b" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }
      event.preventDefault();
      toggleSidebar();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rail, toggleSidebar]);

  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";

  if (rail) {
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={toggleSidebar}
        className="group absolute inset-y-0 -right-1.5 hidden w-3 cursor-ew-resize lg:block"
      >
        <span className="absolute inset-y-0 left-1/2 w-px bg-transparent transition-colors group-hover:bg-[var(--accent)]/60" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-controls="dashboard-sidebar"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      onClick={toggleSidebar}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-[#687279] outline-none transition-colors hover:bg-white hover:text-[#172329] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
    >
      <SidebarSimple className="size-4" aria-hidden />
    </button>
  );
}
