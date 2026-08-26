import { redirect } from "next/navigation";
import { SelfHostedHome } from "@/components/self-hosted-home";
import { loadAuthenticationState } from "@/server/workspace-entrypoints";

export const instant = false;

export default async function HomePage() {
  const { cloudDeployment, openRegistration, session } =
    await loadAuthenticationState();
  if (session?.user.mustChangePassword) redirect("/change-password");
  if (session) redirect("/dashboard");
  if (cloudDeployment) redirect("/sign-in");
  return <SelfHostedHome allowSignUp={openRegistration} />;
}
