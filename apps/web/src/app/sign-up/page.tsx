import { notFound, redirect } from "next/navigation";
import { SignUpForm } from "@/components/sign-up-form";
import { loadAuthenticationState } from "@/server/workspace-entrypoints";

export const metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo =
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/onboarding";
  const invitationId = safeReturnTo.match(
    /^\/accept-invitation\/([^/]+)$/,
  )?.[1];
  const state = await loadAuthenticationState(invitationId);
  if (state.session) redirect(safeReturnTo);
  if (!state.openRegistration && !state.invitation) notFound();
  return (
    <SignUpForm
      returnTo={safeReturnTo}
      {...(state.invitation && invitationId
        ? {
            invitedEmail: state.invitation.email,
            invitationId,
          }
        : {})}
    />
  );
}
