import { Menu } from "lucide-react";
import Link from "next/link";
import { Logo } from "./logo";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dedfd9] bg-[#f8f7f2]/95 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard"><Logo className="text-base" /></Link>
      <Link href="/posts" aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg border border-[#dedfd9] bg-white"><Menu className="size-4" /></Link>
    </header>
  );
}
