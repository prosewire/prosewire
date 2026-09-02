const localSiteOrigin = "http://localhost:4321";

export function resolveProductionSiteOrigin(env = process.env) {
  if (env.SITE_URL) return env.SITE_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return undefined;
}

export function resolveSiteOrigin(env = process.env) {
  return resolveProductionSiteOrigin(env) ?? localSiteOrigin;
}
