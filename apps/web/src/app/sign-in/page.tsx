import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { loadAuthenticationState } from "@/server/workspace-entrypoints";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordChanged?: string; returnTo?: string }>;
}) {
  const { passwordChanged, returnTo } = await searchParams;
  const safeReturnTo =
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/dashboard";
  const state = await loadAuthenticationState();
  if (state.session?.user.mustChangePassword) {
    redirect(`/change-password?returnTo=${encodeURIComponent(safeReturnTo)}`);
  }
  if (state.session) redirect(safeReturnTo);
  return (
    <SignInForm
      allowSignUp={state.openRegistration}
      cloudDeployment={state.cloudDeployment}
      passwordChanged={passwordChanged === "1"}
      returnTo={safeReturnTo}
      showDevelopmentCredentials={process.env["NODE_ENV"] !== "production"}
      socialProviders={state.socialProviders}
    />
  );
}
