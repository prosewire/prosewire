"use client";

import SiGithub from "@icons-pack/react-simple-icons/icons/SiGithub";
import SiGoogle from "@icons-pack/react-simple-icons/icons/SiGoogle";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import prosewireIconDark from "@/assets/prosewire-mark-on-dark.svg";
import prosewireIcon from "@/assets/prosewire-mark-on-light.svg";
import { signIn } from "@/lib/auth-client";
import type { SocialProviderId } from "@/lib/auth-providers";
import { ThemeToggle } from "./theme-toggle";

const providerDetails = {
  google: { label: "Google", Icon: SiGoogle },
  github: { label: "GitHub", Icon: SiGithub },
} satisfies Record<SocialProviderId, { label: string; Icon: typeof SiGoogle }>;

export function SignInForm({
  allowSignUp,
  returnTo,
  showDevelopmentCredentials,
  socialProviders,
}: {
  allowSignUp: boolean;
  returnTo: string;
  showDevelopmentCredentials: boolean;
  socialProviders: ReadonlyArray<SocialProviderId>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(
    showDevelopmentCredentials ? "admin@prosewire.local" : "",
  );
  const [password, setPassword] = useState(
    showDevelopmentCredentials ? "prosewire-local-dev" : "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<SocialProviderId | null>(null);
  const pending = pendingEmail || pendingProvider !== null;

  useEffect(() => setHydrated(true), []);

  async function signInWithProvider(provider: SocialProviderId) {
    setPendingProvider(provider);
    setError(null);
    try {
      const result = await signIn.social({ provider, callbackURL: returnTo });
      if (!result.error) return;
      setError(
        result.error.message ??
          `Could not continue with ${providerDetails[provider].label}`,
      );
      setPendingProvider(null);
    } catch {
      setError(`Could not continue with ${providerDetails[provider].label}`);
      setPendingProvider(null);
    }
  }

  return (
    <main className="noise grid min-h-svh place-items-center overflow-hidden bg-[#f4f3ed] px-5 py-10 sm:py-14">
      <ThemeToggle className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6" />
      <section
        className="relative z-10 w-full max-w-[436px]"
        aria-label="Sign in to Prosewire"
      >
        <div className="flex items-center gap-3.5 sm:gap-4">
          <span className="relative size-[60px] shrink-0 sm:size-[100px]">
            <Image
              src={prosewireIcon}
              alt=""
              priority
              className="theme-logo-light size-full"
            />
            <Image
              src={prosewireIconDark}
              alt=""
              className="theme-logo-dark absolute inset-0 size-full"
            />
          </span>
          <span className="display-font text-[2.7rem] leading-none tracking-[-.045em] sm:text-[4.75rem]">
            Prosewire
          </span>
        </div>

        {socialProviders.length > 0 ? (
          <>
            <div className="mt-8 grid gap-3">
              {socialProviders.map((provider) => {
                const { Icon, label } = providerDetails[provider];
                return (
                  <button
                    key={provider}
                    type="button"
                    disabled={!hydrated || pending}
                    onClick={() => void signInWithProvider(provider)}
                    className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[10px] border border-[#c8cbc5] bg-white/55 px-4 text-sm font-semibold text-[#25343a] transition hover:border-[#aeb4ad] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef6848] disabled:cursor-wait disabled:opacity-55 sm:h-[52px]"
                  >
                    <Icon size={17} aria-hidden />
                    {pendingProvider === provider
                      ? "Connecting…"
                      : `Continue with ${label}`}
                  </button>
                );
              })}
            </div>
            <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[.12em] text-[#899195]">
              <span className="h-px flex-1 bg-[#d4d7d0]" />
              <span>or continue with email</span>
              <span className="h-px flex-1 bg-[#d4d7d0]" />
            </div>
          </>
        ) : null}

        <form
          data-hydrated={hydrated}
          className={
            socialProviders.length > 0 ? "space-y-4" : "mt-7 space-y-4"
          }
          onSubmit={async (event) => {
            event.preventDefault();
            setPendingEmail(true);
            setError(null);
            const result = await signIn.email({ email, password });
            setPendingEmail(false);
            if (result.error) {
              setError(result.error.message ?? "Sign in failed");
              return;
            }
            router.push(returnTo);
            router.refresh();
          }}
        >
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              aria-label="Email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              disabled={!hydrated || pending}
              onChange={(event) => setEmail(event.target.value)}
              className="h-[52px] w-full rounded-[10px] border border-[#9ca39f] bg-white/45 px-4 text-base outline-none transition placeholder:text-[#788287] hover:bg-white/60 focus:border-[#ef6848] focus:bg-white focus:ring-3 focus:ring-[#ef6848]/10 sm:h-[60px]"
              required
            />
          </label>
          <label className="relative block">
            <span className="sr-only">Password</span>
            <input
              aria-label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              disabled={!hydrated || pending}
              onChange={(event) => setPassword(event.target.value)}
              className="h-[52px] w-full rounded-[10px] border border-[#9ca39f] bg-white/45 px-4 pr-12 text-base outline-none transition placeholder:text-[#788287] hover:bg-white/60 focus:border-[#ef6848] focus:bg-white focus:ring-3 focus:ring-[#ef6848]/10 sm:h-[60px]"
              required
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={!hydrated || pending}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#7a8589] transition hover:text-[#172329] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#ef6848]"
            >
              {showPassword ? (
                <EyeSlash className="size-[18px]" />
              ) : (
                <Eye className="size-[18px]" />
              )}
            </button>
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-[9px] bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!hydrated || pending}
            className="inline-flex h-[52px] w-full items-center justify-center rounded-[10px] bg-[#172329] px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-[#25353c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef6848] disabled:cursor-wait disabled:opacity-60 sm:h-[60px]"
          >
            {pendingEmail ? "Signing in…" : "Continue"}
          </button>
        </form>

        {allowSignUp ? (
          <p className="mt-5 text-center text-sm text-[#687279]">
            New to Prosewire?{" "}
            <Link
              href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-semibold text-[#ef6848] underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
        ) : null}
        {showDevelopmentCredentials ? (
          <p className="mt-6 rounded-[10px] border border-[#d4d7d0] bg-white/45 p-3 text-xs leading-5 text-[#687279]">
            Local seed: <code>admin@prosewire.local</code> /{" "}
            <code>prosewire-local-dev</code>.
          </p>
        ) : null}
      </section>
    </main>
  );
}
