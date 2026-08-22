"use client";

import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { signUp } from "@/lib/auth-client";
import { invitationRegistrationHeader } from "@/lib/auth-headers";
import { ThemeToggle } from "./theme-toggle";

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function SignUpForm({
  returnTo,
  invitedEmail,
  invitationId,
}: {
  returnTo: string;
  invitedEmail?: string;
  invitationId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5 py-16">
      <ThemeToggle className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6" />
      <div className="w-full max-w-[440px]">
        <Logo className="text-lg" />
        <p className="mt-10 text-sm font-semibold text-[#ef6848]">
          Get started
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">
          Create your account
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#69757a]">
          Your first workspace and publication come next.
        </p>
        <form
          className="mt-8 space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPending(true);
            setError(null);
            const result = await signUp.email({
              name: formText(data, "name"),
              email: formText(data, "email"),
              password: formText(data, "password"),
              ...(invitationId
                ? {
                    fetchOptions: {
                      headers: { [invitationRegistrationHeader]: invitationId },
                    },
                  }
                : {}),
            });
            setPending(false);
            if (result.error) {
              setError(result.error.message ?? "Unable to create account");
              return;
            }
            router.push(returnTo);
            router.refresh();
          }}
        >
          <label className="block text-sm font-medium">
            Name
            <input
              name="name"
              required
              className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
            />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              defaultValue={invitedEmail}
              readOnly={Boolean(invitedEmail)}
              className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none read-only:bg-[#efeee8] focus:border-[#ef6848]"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#172329] text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create account"}
            <ArrowRight className="size-4" />
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-[#687279]">
          Already have an account?{" "}
          <Link
            href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
            className="font-semibold text-[#ef6848]"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
