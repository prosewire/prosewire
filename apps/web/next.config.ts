import type { NextConfig } from "next";

const deploymentId = process.env["PROSEWIRE_DEPLOYMENT_ID"];
const allowedDevOrigins = process.env["PROSEWIRE_ALLOWED_DEV_ORIGINS"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(deploymentId ? { deploymentId } : {}),
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  transpilePackages: ["@prosewire/contract", "@prosewire/core", "@prosewire/db"],
  experimental: {
    authInterrupts: true,
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
