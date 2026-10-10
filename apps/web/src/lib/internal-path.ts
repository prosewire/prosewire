const internalOrigin = "https://prosewire.invalid";

export function internalPath(
  value: string | undefined,
  fallback = "/dashboard",
): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "\\" || code < 32 || code === 127) return fallback;
  }
  try {
    if (new URL(value, internalOrigin).origin !== internalOrigin)
      return fallback;
    // Preserve the original path: normalizing dot segments can produce a leading //.
    return value;
  } catch {
    return fallback;
  }
}
