import { ShieldCheck, UserPlus, UsersThree } from "@phosphor-icons/react/ssr";
import { hasPermission } from "@prosewire/core";
import { Select } from "@/components/select";
import {
  cancelInvitation,
  inviteMember,
  removeMember,
  updateMemberRole,
} from "@/server/actions";
import { loadDashboardTeam } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Authors & team" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const [query, result] = await Promise.all([
    searchParams,
    loadDashboardTeam(),
  ]);
  const { authors, members, invitations, context } = dashboardData(result);
  const canManage = hasPermission(context.role, "members:manage");
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <header>
        <p className="text-xs font-semibold text-[#ef6848]">People</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">
          Authors & team
        </h1>
        <p className="mt-2 text-sm text-[#6e787d]">
          Workspace roles apply consistently across every publication.
        </p>
      </header>
      {query.invited === "1" ? (
        <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          Invitation sent.
        </p>
      ) : null}
      {canManage ? (
        <form
          action={inviteMember}
          className="card mt-7 grid gap-3 p-5 sm:grid-cols-[1fr_160px_auto] sm:items-end"
        >
          <input
            type="hidden"
            name="organizationId"
            value={context.workspace.id}
          />
          <label className="text-xs font-semibold">
            Email
            <input
              name="email"
              type="email"
              required
              className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] px-3 text-sm font-normal"
            />
          </label>
          <div className="text-xs font-semibold">
            <Select
              id="invitation-role"
              name="role"
              label="Role"
              labelClassName="cursor-default"
              defaultValue="viewer"
              options={[
                { value: "admin", label: "Admin" },
                { value: "editor", label: "Editor" },
                { value: "author", label: "Author" },
                { value: "viewer", label: "Viewer" },
              ]}
              className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] bg-white px-3 text-sm font-normal"
            />
          </div>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#172329] px-4 text-sm font-semibold text-white">
            <UserPlus className="size-3.5" />
            Invite
          </button>
        </form>
      ) : null}
      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e2e3de] px-5 py-4">
          <div className="flex items-center gap-2">
            <UsersThree className="size-4 text-[#ef6848]" />
            <h2 className="text-sm font-semibold">Workspace members</h2>
          </div>
          <span className="text-xs text-[#8a9397]">{members.length}</span>
        </div>
        <div className="divide-y divide-[#ecece8]">
          {members.map((member) => (
            <div
              key={member.id}
              className="grid items-center gap-3 bg-white px-5 py-4 sm:grid-cols-[1fr_auto]"
            >
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-[#20343a] text-xs font-semibold text-white">
                  {member.name.slice(0, 1)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{member.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#8a9397]">
                    {member.email}
                  </p>
                </div>
              </div>
              {canManage &&
              member.role !== "owner" &&
              member.id !== context.memberId ? (
                <div className="flex gap-2">
                  <form action={updateMemberRole} className="flex gap-2">
                    <input
                      type="hidden"
                      name="organizationId"
                      value={context.workspace.id}
                    />
                    <input type="hidden" name="memberId" value={member.id} />
                    <Select
                      name="role"
                      defaultValue={member.role}
                      aria-label={`Role for ${member.name}`}
                      options={[
                        { value: "admin", label: "Admin" },
                        { value: "editor", label: "Editor" },
                        { value: "author", label: "Author" },
                        { value: "viewer", label: "Viewer" },
                      ]}
                      size="small"
                      className="h-9 w-28 rounded-lg border border-[#d9dbd5] bg-white px-2 text-xs"
                    />
                    <button className="rounded-lg border border-[#d9dbd5] px-2 text-xs font-semibold">
                      Save
                    </button>
                  </form>
                  <form action={removeMember}>
                    <input
                      type="hidden"
                      name="organizationId"
                      value={context.workspace.id}
                    />
                    <input type="hidden" name="memberId" value={member.id} />
                    <button className="h-9 rounded-lg border border-red-200 px-2 text-xs font-semibold text-red-700">
                      Remove
                    </button>
                  </form>
                </div>
              ) : (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#dce8e2] bg-[#f0f8f3] px-2.5 py-1 text-[10px] font-semibold capitalize text-[#1f6e52]">
                  <ShieldCheck className="size-3" />
                  {member.role}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
      {invitations.length ? (
        <section className="card mt-4 overflow-hidden">
          <div className="border-b border-[#e2e3de] px-5 py-4">
            <h2 className="text-sm font-semibold">Pending invitations</h2>
          </div>
          <div className="divide-y divide-[#ecece8]">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between bg-white px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold">{invitation.email}</p>
                  <p className="mt-1 text-[11px] capitalize text-[#8a9397]">
                    {invitation.role} · expires{" "}
                    {invitation.expiresAt.toLocaleDateString()}
                  </p>
                </div>
                {canManage ? (
                  <form action={cancelInvitation}>
                    <input
                      type="hidden"
                      name="organizationId"
                      value={context.workspace.id}
                    />
                    <input
                      type="hidden"
                      name="invitationId"
                      value={invitation.id}
                    />
                    <button className="text-xs font-semibold text-red-700">
                      Cancel
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e2e3de] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Public authors</h2>
            <p className="mt-1 text-[11px] text-[#8a9397]">
              Profiles strengthen attribution and E-E-A-T signals.
            </p>
          </div>
          <span className="text-xs text-[#8a9397]">{authors.length}</span>
        </div>
        <div className="grid gap-px bg-[#ecece8] sm:grid-cols-2">
          {authors.map((author) => (
            <article key={author.id} className="bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-[#fee9df] text-sm font-bold text-[#bd452c]">
                  {author.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{author.name}</h3>
                  <p className="mt-0.5 text-[11px] text-[#ef6848]">
                    {author.jobTitle}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-[#6d787d]">
                {author.bio}
              </p>
              <p className="mt-3 text-[10px] font-medium text-[#8a9397]">
                {author.credentials}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
