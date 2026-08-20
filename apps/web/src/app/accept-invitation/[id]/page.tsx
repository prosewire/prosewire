import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { acceptInvitation } from "@/server/actions";
import { loadInvitation } from "@/server/workspace-entrypoints";

export const metadata = { title: "Accept invitation" };

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, details } = await loadInvitation(id);
  if (!details) notFound();
  const returnTo = `/accept-invitation/${id}`;
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5">
        <div className="card w-full max-w-[480px] p-7">
          <Logo className="text-lg" />
          <p className="mt-9 text-sm font-semibold text-[#ef6848]">Workspace invitation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">Sign in to continue</h1>
          <p className="mt-3 text-sm leading-6 text-[#69757a]">Use {details.invitation.email} so Prosewire can match this invitation.</p>
          <div className="mt-7 grid gap-3">
            <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} className="grid h-12 place-items-center rounded-xl bg-[#172329] text-sm font-bold text-white">Sign in</Link>
            <Link href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`} className="grid h-12 place-items-center rounded-xl border border-[#d9dbd5] bg-white text-sm font-bold">Create an account</Link>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5">
      <div className="card w-full max-w-[480px] p-7">
        <Logo className="text-lg" />
        <p className="mt-9 text-sm font-semibold text-[#ef6848]">Workspace invitation</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">Join {details.workspace.name}</h1>
        <p className="mt-3 text-sm leading-6 text-[#69757a]">You were invited as <span className="font-semibold capitalize">{details.invitation.role}</span>. This role applies to all publications in the workspace.</p>
        <form action={acceptInvitation} className="mt-7">
          <input type="hidden" name="invitationId" value={id} />
          <button className="h-12 w-full rounded-xl bg-[#172329] text-sm font-bold text-white">Accept invitation</button>
        </form>
      </div>
    </main>
  );
}
