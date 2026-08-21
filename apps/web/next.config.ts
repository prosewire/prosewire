import type { NextConfig } from "next";

const allowedDevOrigins = process.env["PROSEWIRE_ALLOWED_DEV_ORIGINS"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const developmentEval = process.env["NODE_ENV"] === "development"
  ? " 'unsafe-eval'"
  : "";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      `script-src 'self' 'unsafe-inline'${developmentEval}`,
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*",
    ],
  },
  headers: () =>
    Promise.resolve([
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]),
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  transpilePackages: ["@prosewire/contract", "@prosewire/core", "@prosewire/db"],
  experimental: {
    authInterrupts: true,
    exposeTestingApiInProductionBuild:
      process.env["PROSEWIRE_EXPOSE_TESTING_API"] === "1",
    optimizePackageImports: ["lucide-react"],
    runtimeServerDeploymentId: true,
    useTypeScriptCli: true,
  },
};

export default nextConfig;
