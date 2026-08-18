import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@prosewire/contract", "@prosewire/core", "@prosewire/db"],
  experimental: { optimizePackageImports: ["lucide-react"] },
};

export default nextConfig;
