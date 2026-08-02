// The bundled placeholder background catalog (id/label/url) — SHARED home (BG-F): the CLIENT reads it (the
// app-shell background layer + the settings/background pickers) AND the SERVER reads it (the `/autobg` arm's
// candidate set, alongside the author's owned library). Homed in `@orb/contracts/theme` beside
// `BACKGROUND_IMAGE_KINDS` / `ThemeBackground` (the one-home background-source vocabulary) so neither the
// client feature nor the server compose forks a copy. The `url` is a static `public/` path served by the
// client — a plain string here, never a bundler import.
// The client-local twin (`client/src/lib/list-seeded-backgrounds.ts`) was COLLAPSED into this one home
// 2026-08-02 — `client/src/lib` re-exports these (client → contracts is the lawful direction), so a slug
// added here reaches the pickers, the app-shell layer and `/autobg` at once. The desync class is dead.
// TEMPORARY ART: the four landscape plates are placeholders (swap for CC0/original before ship); the ten
// `*-bg` character plates are original pack art.

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
  // The default-character pack's scene plates (original art). Each seeded card carries its own slug as
  // `backgroundOverride` — the id is `<character handle>-bg`, so the pack's cards and this catalog can
  // never drift apart silently (the seeder writes the slug; a missing plate degrades to "no image").
  { id: "assistant-bg", label: "Charlotte's study", url: "/backgrounds/assistant-bg.jpg" },
  { id: "jfc-coder-bg", label: "The dark office", url: "/backgrounds/jfc-coder-bg.jpg" },
  { id: "niko-bg", label: "Konbini at 1 a.m.", url: "/backgrounds/niko-bg.jpg" },
  { id: "hana-bg", label: "City park, midnight", url: "/backgrounds/hana-bg.jpg" },
  { id: "morgatha-bg", label: "The Ashen Spire", url: "/backgrounds/morgatha-bg.jpg" },
  { id: "sabine-bg", label: "Road-town tavern", url: "/backgrounds/sabine-bg.jpg" },
  { id: "birdie-bg", label: "Hobby & Repair", url: "/backgrounds/birdie-bg.jpg" },
  { id: "kohaku-bg", label: "Lamplit apartment", url: "/backgrounds/kohaku-bg.jpg" },
  { id: "calamity-bg", label: "The good windowsill", url: "/backgrounds/calamity-bg.jpg" },
  { id: "elias-bg", label: "Gullwrack lamp room", url: "/backgrounds/elias-bg.jpg" },
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
