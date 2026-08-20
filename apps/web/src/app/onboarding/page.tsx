import { hasPermission } from "@prosewire/core";
import { Logo } from "@/components/logo";
import { createPublication, createWorkspace } from "@/server/actions";
import { loadOnboarding } from "@/server/workspace-entrypoints";

export const metadata = { title: "Set up Prosewire" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ newWorkspace?: string }>;
}) {
  const { newWorkspace } = await searchParams;
  const { workspace, role } = await loadOnboarding();
  const creatingWorkspace = !workspace || newWorkspace === "1";
  const canCreatePublication =
    role !== undefined && hasPermission(role, "publications:create");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5 py-16">
      <div className="w-full max-w-[620px]">
        <Logo className="text-lg" />
        <p className="mt-10 text-sm font-semibold text-[#ef6848]">Workspace setup</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">
          {creatingWorkspace ? "Create your publishing workspace" : "Create a publication"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#69757a]">
          {creatingWorkspace
            ? "A workspace holds your team and roles. Each publication keeps its own content, API keys, reader, and analytics."
            : `Add a publication to ${workspace.name}.`}
        </p>
        {!creatingWorkspace && workspace && canCreatePublication ? (
          <form action={createPublication} className="card mt-8 space-y-5 p-6">
            <input type="hidden" name="organizationId" value={workspace.id} />
            <label className="block text-sm font-medium">
              Publication name
              <input name="name" required placeholder="Company journal" className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]" />
            </label>
            <label className="block text-sm font-medium">
              Public slug
              <input name="slug" placeholder="company-journal" className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]" />
            </label>
            <button className="h-12 w-full rounded-xl bg-[#172329] text-sm font-bold text-white">Create publication</button>
          </form>
        ) : !creatingWorkspace && workspace ? (
          <div className="card mt-8 p-6">
            <p className="text-sm font-semibold">This workspace has no publications yet.</p>
            <p className="mt-2 text-sm leading-6 text-[#69757a]">Ask a workspace owner or admin to create the first publication. Your <span className="font-semibold capitalize">{role}</span> role does not include publication management.</p>
          </div>
        ) : (
          <form action={createWorkspace} className="card mt-8 grid gap-5 p-6 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Workspace name
              <input name="workspaceName" required placeholder="Acme" className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]" />
            </label>
            <label className="block text-sm font-medium">
              Workspace slug
              <input name="workspaceSlug" placeholder="acme" className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]" />
            </label>
            <label className="block text-sm font-medium">
              Publication name
              <input name="publicationName" required placeholder="Acme journal" className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]" />
            </label>
            <label className="block text-sm font-medium">
              Public slug
              <input name="publicationSlug" placeholder="acme-journal" className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]" />
            </label>
            <button className="h-12 rounded-xl bg-[#172329] text-sm font-bold text-white sm:col-span-2">Create workspace</button>
          </form>
        )}
      </div>
    </main>
  );
}
