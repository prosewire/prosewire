import { WarningCircle } from "@phosphor-icons/react/ssr";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { changeRequiredPassword } from "@/server/actions";
import { loadAuthenticationState } from "@/server/workspace-entrypoints";

export const metadata = { title: "Change temporary password" };
export const instant = false;

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  const safeReturnTo =
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/dashboard";
  const { session } = await loadAuthenticationState();
  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnTo)}`);
  }
  if (!session.user.mustChangePassword) redirect(safeReturnTo);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5 py-16">
      <ThemeToggle className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6" />
      <div className="w-full max-w-[480px]">
        <Logo className="text-lg" />
        <p className="mt-10 text-sm font-semibold text-[#ef6848]">
          Account security
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">
          Replace the temporary password
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#69757a]">
          This administrator came from the self-hosted bootstrap settings.
          Choose a private password before setting up the first publication.
        </p>
        {error ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <WarningCircle className="size-4 shrink-0" />
            {error}
          </div>
        ) : null}
        <form
          action={changeRequiredPassword}
          className="card mt-8 space-y-5 p-6"
        >
          <input type="hidden" name="returnTo" value={safeReturnTo} />
          <label className="block text-sm font-medium">
            Temporary password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
            />
          </label>
          <label className="block text-sm font-medium">
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
            />
            <span className="mt-1.5 block text-xs text-[#7b8589]">
              Use 12 to 128 characters.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
            />
          </label>
          <button className="h-12 w-full rounded-xl bg-[#172329] text-sm font-bold text-white">
            Change password
          </button>
        </form>
        <p className="mt-4 text-center text-xs leading-5 text-[#7b8589]">
          Prosewire will sign out every session after the change. Sign in again
          with the new password to continue.
        </p>
      </div>
    </main>
  );
}
