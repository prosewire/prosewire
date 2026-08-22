export const socialProviderIds = ["google", "github"] as const;

export type SocialProviderId = (typeof socialProviderIds)[number];
