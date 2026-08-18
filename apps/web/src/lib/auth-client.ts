"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env["NEXT_PUBLIC_PROSEWIRE_PUBLIC_URL"] ?? "",
});

export const { signIn, signOut } = authClient;
