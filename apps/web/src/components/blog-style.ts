import type { CSSProperties } from "react";

interface BlogStyle extends CSSProperties {
  readonly "--blog-accent": string;
}

export function blogStyle(accentColor: string): BlogStyle {
  return { "--blog-accent": accentColor };
}
