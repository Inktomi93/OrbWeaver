import { TOKENS } from "@orb/ui/tokens";

/** A dark carried background and an accent that shares no ink with its solid steps: the D336 primary fallback. */
export const TONE_FALLBACK_SCOPE = { toneBackground: "oklch(0.158 0.006 60)", toneAccent: "oklch(0.3 0.1 260)" } as const;

/** A mid-dark carried background whose solved edge is louder than any ring on the inherited accent's hue: the D159 fallback. */
export const EDGE_FALLBACK_SCOPE = { edgeBackground: "oklch(0.4 0 0)", edgeAmbientAccent: TOKENS["color.primary"].value } as const;
