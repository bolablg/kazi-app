import type { CSSProperties } from "react";
// Shared by calendar events, project tags, and time-use charts. Text stays black.
export const projectColors: Record<string, { accent: string; fill: string }> = {
  olive: { accent: "#188038", fill: "#ceead6" },
  clay: { accent: "#d93025", fill: "#fad2cf" },
  blue: { accent: "#1967d2", fill: "#d2e3fc" },
  gold: { accent: "#b06000", fill: "#feefc3" },
  plum: { accent: "#8430a8", fill: "#e9d2fd" },
};
export function projectStyle(color?: string): CSSProperties {
  const palette = projectColors[color ?? ""] ?? {
    accent: "#5f6368",
    fill: "#e8eaed",
  };
  return {
    "--project-accent": palette.accent,
    "--project-fill": palette.fill,
  } as CSSProperties;
}
