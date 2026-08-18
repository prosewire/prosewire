"use client";

import { ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@prosewire.local");
  const [password, setPassword] = useState("prosewire-local-dev");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="grid min-h-screen bg-[#f4f3ed] lg:grid-cols-[1.02fr_.98fr]">
      <section className="paper-grid hidden border-r border-[#dedfd9] p-12 lg:flex lg:flex-col">
        <Logo className="text-lg" />
        <div className="my-auto max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ef6848]">Local workspace</p>
          <h1 className="display-font mt-5 text-6xl leading-[1.02]">Publishing that stays yours.</h1>
          <p className="mt-6 text-base leading-7 text-[#657077]">A calm editorial workspace, portable content, and every integration surface included.</p>
          <div className="mt-9 space-y-3 text-sm text-[#4f5c61]">
            {['No feature tiers or post limits', 'Rendered API, SDK, CLI, and MCP', 'Full CSV and database ownership'].map((item) => <div key={item} className="flex items-center gap-2.5"><span className="grid size-5 place-items-center rounded-full bg-[#dcece4] text-[#1f6e52]"><Check className="size-3" /></span>{item}</div>)}
          </div>
        </div>
        <p className="text-xs text-[#899195]">Apache 2.0 licensed · self-hostable · local-first</p>
      </section>

      <section className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden"><Logo className="text-lg" /></div>
          <p className="text-sm font-semibold text-[#ef6848]">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">Sign in to your publication</h2>
          <p className="mt-3 text-sm leading-6 text-[#69757a]">The local development account is filled in for you.</p>
          <form
            className="mt-8 space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(null);
              const result = await signIn.email({ email, password });
              setPending(false);
              if (result.error) {
                setError(result.error.message ?? "Sign in failed");
                return;
              }
              router.push("/dashboard");
              router.refresh();
            }}
          >
            <label className="block text-sm font-medium">Email<input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none transition focus:border-[#ef6848] focus:ring-3 focus:ring-[#ef6848]/10" required /></label>
            <label className="block text-sm font-medium">Password<input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none transition focus:border-[#ef6848] focus:ring-3 focus:ring-[#ef6848]/10" required /></label>
            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#172329] px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-px disabled:opacity-60">
              {pending ? "Signing in…" : "Continue to dashboard"}<ArrowRight className="size-4" />
            </button>
          </form>
          <p className="mt-6 rounded-xl border border-[#d9dbd5] bg-white/70 p-3 text-xs leading-5 text-[#687279]">Default: <code>admin@prosewire.local</code> / <code>prosewire-local-dev</code>. Change both values in <code>.env</code> before sharing a deployment.</p>
        </div>
      </section>
    </main>
  );
}
