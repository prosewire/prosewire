"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { organizationAccess, organizationRoles } from "./permissions";

export const authClient = createAuthClient({
  baseURL: process.env["NEXT_PUBLIC_PROSEWIRE_PUBLIC_URL"] ?? "",
  plugins: [organizationClient({ ac: organizationAccess, roles: organizationRoles })],
});

export const { signIn, signOut, signUp } = authClient;
