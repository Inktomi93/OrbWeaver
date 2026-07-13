// The bundled placeholder background set: static files at packages/client/public/backgrounds/, fixed at
// build time, so a hardcoded list is the right shape. Cross-cutting — both the app-shell background
// layer AND the settings theme-editor picker read it, so neither feature imports the other.
// TEMPORARY ART: swap for CC0/original images before ship.

export interface SeededBackground {
  readonly id: string;
  readonly label: string;
  /** The vite `public/` URL — `background-layer.tsx` uses this directly; never assume `.jpg` elsewhere. */
  readonly url: string;
}

const SEEDED_BACKGROUNDS: readonly SeededBackground[] = [
  { id: "misty-highlands", label: "Misty highlands", url: "/backgrounds/misty-highlands.jpg" },
  { id: "granite-valley", label: "Granite valley", url: "/backgrounds/granite-valley.jpg" },
  { id: "forest-falls", label: "Forest falls", url: "/backgrounds/forest-falls.jpg" },
  { id: "blue-fjord", label: "Blue fjord", url: "/backgrounds/blue-fjord.jpg" },
];

/** The full seeded-background catalog (id/label/url) — the theme editor's picker source. */
export function listSeededBackgrounds(): readonly SeededBackground[] {
  return SEEDED_BACKGROUNDS;
}

/** Resolve one seeded id to its URL (the background layer's render-time lookup). `undefined` ⇒ a
 *  stale/unknown id (a since-removed seed) — the caller degrades to "no image" rather than a 404. */
export function resolveSeededBackgroundUrl(id: string): string | undefined {
  return SEEDED_BACKGROUNDS.find((b) => b.id === id)?.url;
}
