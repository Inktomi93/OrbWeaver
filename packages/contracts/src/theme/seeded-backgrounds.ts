// The bundled placeholder background catalog (id/label/url) — SHARED home (BG-F): the CLIENT reads it (the
// app-shell background layer + the settings/background pickers) AND the SERVER reads it (the `/autobg` arm's
// candidate set, alongside the author's owned library). Homed in `@orb/contracts/theme` beside
// `BACKGROUND_IMAGE_KINDS` / `ThemeBackground` (the one-home background-source vocabulary) so neither the
// client feature nor the server compose forks a copy. The `url` is a static `public/` path served by the
// client — a plain string here, never a bundler import.
// TEMPORARY ART: swap for CC0/original images before ship.

export interface SeededBackground {
  readonly id: string;
  readonly label: string;
  /** The vite `public/` URL — the background layer uses this directly; never assume `.jpg` elsewhere. */
  readonly url: string;
}

const SEEDED_BACKGROUNDS: readonly SeededBackground[] = [
  { id: "misty-highlands", label: "Misty highlands", url: "/backgrounds/misty-highlands.jpg" },
  { id: "granite-valley", label: "Granite valley", url: "/backgrounds/granite-valley.jpg" },
  { id: "forest-falls", label: "Forest falls", url: "/backgrounds/forest-falls.jpg" },
  { id: "blue-fjord", label: "Blue fjord", url: "/backgrounds/blue-fjord.jpg" },
];

/** The full seeded-background catalog (id/label/url) — the picker source + the `/autobg` seeded candidates. */
export function listSeededBackgrounds(): readonly SeededBackground[] {
  return SEEDED_BACKGROUNDS;
}

/** Resolve one seeded id to its URL (the background layer's render-time lookup). `undefined` ⇒ a
 *  stale/unknown id (a since-removed seed) — the caller degrades to "no image" rather than a 404. */
export function resolveSeededBackgroundUrl(id: string): string | undefined {
  return SEEDED_BACKGROUNDS.find((b) => b.id === id)?.url;
}
