import { redirect } from "next/navigation";
import { loadAuthenticationState } from "@/server/workspace-entrypoints";

export const instant = false;

export default async function HomePage() {
  const { session } = await loadAuthenticationState();
  redirect(session ? "/dashboard" : "/sign-in");
}
