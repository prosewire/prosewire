import { WarningCircle } from "@phosphor-icons/react/ssr";
import { hasPermission } from "@prosewire/core";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  createInitialPublication,
  createPublication,
  createWorkspace,
} from "@/server/actions";
import {
  loadAuthenticationState,
  loadOnboarding,
} from "@/server/workspace-entrypoints";

export const metadata = { title: "Set up Prosewire" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; newWorkspace?: string }>;
}) {
  const { error, newWorkspace } = await searchParams;
  const authentication = await loadAuthenticationState();
  if (authentication.session?.user.mustChangePassword) {
    redirect("/change-password?returnTo=%2Fonboarding");
  }
  const { cloudDeployment, role, selfHostedTeamExists, workspace } =
    await loadOnboarding();
  const selfHostedBootstrap = !cloudDeployment && !selfHostedTeamExists;
  const needsTeamInvitation =
    !cloudDeployment && selfHostedTeamExists && !workspace;
  const creatingWorkspace = cloudDeployment
    ? !workspace || newWorkspace === "1"
    : selfHostedBootstrap;
  const canCreatePublication =
    role !== undefined && hasPermission(role, "publications:create");
  const eyebrow = needsTeamInvitation
    ? "Team access"
    : creatingWorkspace
      ? selfHostedBootstrap
        ? "Get started"
        : "Workspace setup"
      : "Publication setup";
  const title = needsTeamInvitation
    ? "Join the existing team"
    : creatingWorkspace
      ? selfHostedBootstrap
        ? "Create your first publication"
        : "Create your publishing workspace"
      : "Create a publication";
  const description = needsTeamInvitation
    ? "This Prosewire installation has already been set up. Ask an owner for a team invitation."
    : creatingWorkspace
      ? selfHostedBootstrap
        ? "Give your blog a name and public slug. You can add more publications later."
        : "A workspace holds your team and roles. Each publication keeps its own content, API keys, reader, and analytics."
      : cloudDeployment && workspace
        ? `Add a publication to ${workspace.name}.`
        : "Add another publication to this Prosewire instance.";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5 py-16">
      <ThemeToggle className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6" />
      <div className="w-full max-w-[620px]">
        <Logo className="text-lg" />
        <p className="mt-10 text-sm font-semibold text-[#ef6848]">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#69757a]">{description}</p>
        {error ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            <WarningCircle className="size-4" />
            {error}
          </div>
        ) : null}
        {needsTeamInvitation ? (
          <div className="card mt-8 p-6">
            <p className="text-sm font-semibold">An invitation is required.</p>
            <p className="mt-2 text-sm leading-6 text-[#69757a]">
              The invitation can use this account&apos;s email address. Once you
              accept it, the team&apos;s publications will appear here.
            </p>
          </div>
        ) : selfHostedBootstrap ? (
          <form
            action={createInitialPublication}
            className="card mt-8 space-y-5 p-6"
          >
            <label className="block text-sm font-medium">
              Publication name
              <input
                name="publicationName"
                required
                placeholder="Company journal"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-sm font-medium">
              Public slug
              <input
                name="publicationSlug"
                placeholder="company-journal"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <button className="h-12 w-full rounded-xl bg-[#172329] text-sm font-bold text-white">
              Create publication
            </button>
          </form>
        ) : !creatingWorkspace && workspace && canCreatePublication ? (
          <form action={createPublication} className="card mt-8 space-y-5 p-6">
            <input type="hidden" name="organizationId" value={workspace.id} />
            <label className="block text-sm font-medium">
              Publication name
              <input
                name="name"
                required
                placeholder="Company journal"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-sm font-medium">
              Public slug
              <input
                name="slug"
                placeholder="company-journal"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <button className="h-12 w-full rounded-xl bg-[#172329] text-sm font-bold text-white">
              Create publication
            </button>
          </form>
        ) : !creatingWorkspace && workspace ? (
          <div className="card mt-8 p-6">
            <p className="text-sm font-semibold">
              This {cloudDeployment ? "workspace" : "team"} has no publications
              yet.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#69757a]">
              Ask an owner or admin to create the first publication. Your{" "}
              <span className="font-semibold capitalize">{role}</span> role does
              not include publication management.
            </p>
          </div>
        ) : cloudDeployment ? (
          <form
            action={createWorkspace}
            className="card mt-8 grid gap-5 p-6 sm:grid-cols-2"
          >
            <label className="block text-sm font-medium">
              Workspace name
              <input
                name="workspaceName"
                required
                placeholder="Acme"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-sm font-medium">
              Workspace slug
              <input
                name="workspaceSlug"
                placeholder="acme"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-sm font-medium">
              Publication name
              <input
                name="publicationName"
                required
                placeholder="Acme journal"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <label className="block text-sm font-medium">
              Public slug
              <input
                name="publicationSlug"
                placeholder="acme-journal"
                className="mt-2 h-12 w-full rounded-xl border border-[#d4d7d0] bg-white px-3.5 outline-none focus:border-[#ef6848]"
              />
            </label>
            <button className="h-12 rounded-xl bg-[#172329] text-sm font-bold text-white sm:col-span-2">
              Create workspace
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
