import { forbidden, redirect } from "next/navigation";
import type { DashboardPageResult } from "@/server/page-entrypoints";

export function dashboardData<A>(result: DashboardPageResult<A>): A {
  if (result._tag === "Unauthorized") redirect("/sign-in");
  if (result._tag === "NeedsOnboarding") redirect("/onboarding");
  if (result._tag === "Forbidden") forbidden();
  return result.value;
}
