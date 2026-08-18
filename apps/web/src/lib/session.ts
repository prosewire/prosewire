import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth.ts";

export const getDashboardSession = cache(async () =>
  auth().api.getSession({ headers: await headers() }),
);

export async function requireDashboardSession() {
  const session = await getDashboardSession();
  if (!session) redirect("/sign-in");
  return session;
}
