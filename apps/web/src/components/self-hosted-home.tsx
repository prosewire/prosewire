import { ArrowRight } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import Link from "next/link";
import prosewireMark from "@/assets/prosewire-mark-on-light.svg";

const destinations = [
  {
    index: "01",
    title: "Prosewire",
    url: "prosewire.com",
    href: "https://prosewire.com",
    foreground: "#f4f3ed",
    className:
      "bg-[#172329] hover:bg-[#213139] focus-visible:outline-[#f4f3ed]",
  },
  {
    index: "02",
    title: "Documentation",
    url: "prosewire.com/docs",
    href: "https://prosewire.com/docs",
    foreground: "#172329",
    className:
      "bg-[#ef6848] hover:bg-[#f27658] focus-visible:outline-[#172329]",
  },
  {
    index: "03",
    title: "Prosewire Cloud",
    url: "cloud.prosewire.com",
    href: "https://cloud.prosewire.com",
    foreground: "#10181c",
    className:
      "bg-[#789780] hover:bg-[#83a38b] focus-visible:outline-[#10181c]",
  },
] as const;

export function SelfHostedHome({ allowSignUp }: { allowSignUp: boolean }) {
  return (
    <main className="min-h-screen bg-[#f4f3ed] text-[#172329] lg:grid lg:grid-cols-[35.2%_64.8%]">
      <section className="flex min-h-[40rem] flex-col justify-between border-b border-[#172329]/15 px-7 py-10 sm:px-12 sm:py-12 lg:min-h-screen lg:border-r lg:border-b-0 lg:px-[clamp(3.25rem,5vw,5rem)] lg:py-[clamp(3.25rem,6vh,5.5rem)]">
        <div>
          <Image
            src={prosewireMark}
            alt=""
            priority
            className="h-auto w-[clamp(7.5rem,13vw,11.5rem)]"
          />
          <h1 className="mt-8 text-[clamp(3.2rem,5vw,5rem)] font-semibold leading-none tracking-[-0.065em]">
            Prosewire
          </h1>
          <p className="mt-7 text-sm font-bold uppercase tracking-[0.14em] text-[#ef6848]">
            Self-hosted
          </p>
          <p className="mt-3 max-w-md text-base leading-7 sm:text-lg">
            This is a self-hosted Prosewire instance.
          </p>
        </div>

        <nav aria-label="Instance access" className="mt-14">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#657077]">
            Access this instance
          </p>
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
            <Link
              href="/sign-in"
              className="group inline-flex items-center gap-2 text-sm font-semibold underline decoration-[#172329]/25 underline-offset-4 transition hover:decoration-[#172329] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ef6848]"
            >
              Sign in
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            {allowSignUp ? (
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-2 text-sm font-semibold underline decoration-[#172329]/25 underline-offset-4 transition hover:decoration-[#172329] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ef6848]"
              >
                Create account
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : null}
          </div>
        </nav>
      </section>

      <nav
        aria-label="Prosewire resources"
        className="grid min-h-[48rem] grid-rows-3 lg:min-h-screen"
      >
        {destinations.map((destination) => (
          <a
            key={destination.href}
            href={destination.href}
            target="_blank"
            rel="noreferrer"
            style={{ color: destination.foreground }}
            className={`group grid min-h-64 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-[#10181c]/15 px-7 py-9 transition-colors last:border-b-0 focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-[-7px] sm:px-12 lg:min-h-0 lg:px-[clamp(3rem,4vw,5rem)] ${destination.className}`}
          >
            <div className="min-w-0">
              <h2 className="text-[clamp(3rem,6.2vw,6.7rem)] font-medium leading-[0.9] tracking-[-0.07em]">
                {destination.title}
              </h2>
              <p className="mt-6 text-lg tracking-[-0.025em] sm:text-2xl lg:mt-8 lg:text-[clamp(1.15rem,1.8vw,2rem)]">
                {destination.url}
              </p>
            </div>
            <div className="flex h-full flex-col items-end justify-between py-1">
              <span className="text-4xl font-light tracking-[-0.05em] sm:text-5xl lg:text-[clamp(2.7rem,4.4vw,5rem)]">
                {destination.index}
              </span>
              <ArrowRight className="size-9 stroke-[1.25] transition-transform duration-200 group-hover:translate-x-2 sm:size-11 lg:size-14" />
            </div>
          </a>
        ))}
      </nav>
    </main>
  );
}
