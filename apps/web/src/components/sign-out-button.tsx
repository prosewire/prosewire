"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await signOut();
          router.push("/sign-in");
          router.refresh();
        } catch {
          // The existing session remains active; the user can retry safely.
        }
      }}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-[#687279] transition hover:bg-black/5 hover:text-[#172329]"
    >
      <LogOut className="size-3.5" />
      Sign out
    </button>
  );
}
