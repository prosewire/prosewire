export function DashboardShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-[#dedfd9] bg-[#f8f7f2] p-5 lg:block">
        <div className="h-6 w-28 animate-pulse rounded bg-[#dedfd9]" />
        <div className="mt-8 h-24 animate-pulse rounded-xl bg-[#ebeae4]" />
        <div className="mt-7 space-y-3">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-xl bg-[#ebeae4]" />
          ))}
        </div>
      </aside>
      <div className="lg:pl-[248px]">
        <DashboardPageSkeleton />
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <main aria-label="Loading page" className="mx-auto max-w-[1200px] animate-pulse px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <div className="h-3 w-20 rounded bg-[#dedfd9]" />
      <div className="mt-3 h-9 w-52 rounded bg-[#dedfd9]" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-[#e5e4de]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-32 rounded-2xl border border-[#dedfd9] bg-white" />
        ))}
      </div>
      <div className="mt-4 h-72 rounded-2xl border border-[#dedfd9] bg-white" />
    </main>
  );
}

export function CenteredCardSkeleton() {
  return (
    <main aria-label="Loading page" className="flex min-h-screen items-center justify-center bg-[#f4f3ed] px-5">
      <div className="w-full max-w-[480px] animate-pulse rounded-2xl border border-[#dedfd9] bg-white p-7">
        <div className="h-6 w-28 rounded bg-[#dedfd9]" />
        <div className="mt-10 h-4 w-32 rounded bg-[#e5e4de]" />
        <div className="mt-3 h-9 w-72 max-w-full rounded bg-[#dedfd9]" />
        <div className="mt-4 h-4 w-full rounded bg-[#e5e4de]" />
        <div className="mt-8 h-12 rounded-xl bg-[#ebeae4]" />
        <div className="mt-4 h-12 rounded-xl bg-[#ebeae4]" />
      </div>
    </main>
  );
}

export function ReaderPageSkeleton() {
  return (
    <main aria-label="Loading publication" className="min-h-screen animate-pulse bg-[#f8f7f2] text-[#172329]">
      <header className="border-b border-black/10 px-5 py-5">
        <div className="mx-auto h-6 max-w-6xl rounded bg-[#dedfd9]" />
      </header>
      <section className="border-b border-black/10 bg-[#efeee7]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="h-3 w-36 rounded bg-[#d5d4ce]" />
          <div className="mt-5 h-14 w-[34rem] max-w-full rounded bg-[#d5d4ce]" />
          <div className="mt-6 h-5 w-[28rem] max-w-full rounded bg-[#deddd7]" />
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-12 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-64 rounded-2xl border border-black/10 bg-white" />
        ))}
      </section>
    </main>
  );
}
