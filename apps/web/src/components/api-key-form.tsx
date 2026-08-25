"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ApiKeyActionState, createApiKey } from "@/server/actions";
import { CopyButton } from "./copy-button";

const initialState: ApiKeyActionState = {};

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="h-10 rounded-xl bg-[#172329] px-4 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create key"}
    </button>
  );
}

export function ApiKeyForm({ blogId }: { blogId: string }) {
  const [state, action] = useActionState(createApiKey, initialState);
  return (
    <div>
      <form
        action={action}
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <input type="hidden" name="blogId" value={blogId} />
        <label className="text-xs font-semibold">
          Key name
          <input
            name="name"
            required
            placeholder="Production website"
            className="mt-2 h-10 w-full rounded-xl border border-[#d9dbd5] px-3 text-sm font-normal outline-none focus:border-[#ef6848]"
          />
        </label>
        <label className="flex h-10 items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            name="write"
            className="size-4 accent-[#ef6848]"
          />
          Allow writes
        </label>
        <CreateButton />
      </form>
      {state.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.apiKey ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">
            Copy this key now. It will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto text-xs text-amber-950">
              {state.apiKey}
            </code>
            <CopyButton value={state.apiKey} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
