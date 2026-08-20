"use client";

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-screen place-items-center px-6 text-center">
          <div>
            <h1 className="text-3xl font-semibold">Prosewire could not start.</h1>
            <button onClick={reset} type="button">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
