import type { NextConfig } from "next";

const allowedDevOrigins = process.env["PROSEWIRE_ALLOWED_DEV_ORIGINS"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  transpilePackages: ["@prosewire/contract", "@prosewire/core", "@prosewire/db"],
  experimental: {
    authInterrupts: true,
    optimizePackageImports: ["lucide-react"],
    runtimeServerDeploymentId: true,
  },
};

export default nextConfig;
