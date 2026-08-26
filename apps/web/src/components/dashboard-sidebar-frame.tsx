"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardShellProps } from "./dashboard-shell-types";
import { DashboardSidebar } from "./dashboard-sidebar";

const sidebarCookie = "prosewire-sidebar";

export function DashboardSidebarFrame({
  children,
  defaultCollapsed,
  ...sidebarProps
}: DashboardShellProps & {
  readonly children: React.ReactNode;
  readonly defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      // The next server render reads this preference before hydrating the shell.
      // biome-ignore lint/suspicious/noDocumentCookie: Next.js reads the cookie before rendering the shell.
      document.cookie = `${sidebarCookie}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  useEffect(() => {
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
  }, [toggleSidebar]);

  return (
    <>
      <DashboardSidebar
        {...sidebarProps}
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />
      <div
        className={
          collapsed
            ? "transition-[padding] duration-200 ease-linear lg:pl-[72px]"
            : "transition-[padding] duration-200 ease-linear lg:pl-[248px]"
        }
      >
        {children}
      </div>
    </>
  );
}
