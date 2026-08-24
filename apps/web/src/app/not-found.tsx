import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f3ed] px-6 text-[#172329]">
      <ThemeToggle className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6" />
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold text-[#ef6848]">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">
          That page does not exist.
        </h1>
        <Link className="mt-6 inline-block text-sm font-semibold" href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
