import { redirect } from "next/navigation";
import { MarketingHome } from "@/components/marketing-home";
import { loadAuthenticationState } from "@/server/workspace-entrypoints";

export const instant = false;

export default async function HomePage() {
  const { cloudDeployment, session } = await loadAuthenticationState();
  if (cloudDeployment) redirect(session ? "/dashboard" : "/sign-in");
  return <MarketingHome />;
}
