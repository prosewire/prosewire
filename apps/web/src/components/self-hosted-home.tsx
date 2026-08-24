import { MarketingHome } from "@/components/marketing-home";

export function SelfHostedHome({ allowSignUp }: { allowSignUp: boolean }) {
  return <MarketingHome allowSignUp={allowSignUp} />;
}
