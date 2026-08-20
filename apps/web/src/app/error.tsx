"use client";

export default function ErrorPage({ reset }: { readonly reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f3ed] px-6 text-[#172329]">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold text-[#ef6848]">Unexpected error</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">
          This page could not be loaded.
        </h1>
        <button
          className="mt-6 rounded-xl bg-[#172329] px-4 py-2.5 text-sm font-semibold text-white"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
