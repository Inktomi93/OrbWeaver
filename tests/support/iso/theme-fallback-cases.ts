/** A dark carried background and an accent that shares no ink with its solid steps: the D336 primary fallback. */
export const TONE_FALLBACK_SCOPE = { toneBackground: "oklch(0.158 0.006 60)", toneAccent: "oklch(0.3 0.1 260)" } as const;

/** A mid-dark carried background and an accent with no ring on its hue above the solved edge: the D159 fallback. */
export const EDGE_FALLBACK_SCOPE = { edgeBackground: "oklch(0.4 0 60)", edgeAmbientAccent: "oklch(0.6 0.3 330)" } as const;
