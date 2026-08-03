// The token-override WIRE schema — the boundary clamp for user/character theming. A custom-property
// value cannot select/execute/exfiltrate only if parsed + clamped at the boundary: a color must parse
// as a color, fonts allowlist, enums enumerate. A failed field degrades to `undefined` (never a
// whole-blob reject).
// Deliberate two-copy: this wire schema and the ui-local render clamp (`@orb/ui`
// `content/theme-scope/clamp.ts`) exist twice by design (the cake forbids either importing the other);
// `tests/contracts/theme/pairing.suite.test.ts` pins their structural mirror.
// The decorative background IMAGE lives as flat fields on the `appearance` settings namespace, not here
// — only the base surface COLOR (`background`) stays a token (it feeds the neutral ramp).
// Also home to the CARD-EMBEDDABLE partition (bottom of file): which of these keys a character card may
// carry into a room, and which stay the viewer's.

import { isSafeColor } from "@orb/kit/safe-color";
import { z } from "zod";

/** Fonts a user may pick — an allowlist; anything else drops. */
export const THEME_FONT_ALLOWLIST = ["Geist", "ui-sans-serif", "ui-serif", "ui-monospace", "Georgia", "Times New Roman", "Iowan Old Style"] as const;
export type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

// The MESSAGE-ROW SKIN vocabulary. It is NOT a theme-override axis (a card/theme cannot force a row
// anatomy on a reader — see the card-embeddable partition below); it is the `appearance.chatStyle`
// SETTING's vocabulary, homed here because `contracts/settings` imports DOWN from theme (the
// `BACKGROUND_IMAGE_KINDS` precedent) and because `@orb/ui`'s render side has no tuple of its own.
// Painted by `@orb/client` `MESSAGE_ROW_SKINS` (`Record<ThemeChatStyle, RowSkin>`) — a new member here
// fails tsc there until it's painted.
export const THEME_CHAT_STYLES = ["bubble", "flat", "document", "echo", "whisper", "hush", "ripple", "tide"] as const;
export type ThemeChatStyle = (typeof THEME_CHAT_STYLES)[number];

export const THEME_DENSITIES = ["comfortable", "compact"] as const;
export type ThemeDensity = (typeof THEME_DENSITIES)[number];

export const THEME_RADII = ["base", "control", "card", "full"] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

// Lenient per-field: a failed parse yields `undefined` (field drops), never a thrown blob.
const colorToken = z.string().refine(isSafeColor).optional().catch(undefined);
const bubble = z.object({ bg: colorToken, fg: colorToken }).optional().catch(undefined);

/** The curated token-override subset. Every field optional; per-field failures degrade to undefined.
 *  `background` is the base surface color the neutral ramp derives from — the only background field
 *  here (the decorative photo trio moved to the `appearance` namespace). */
export const themeOverrideSchema = z.object({
  accent: colorToken,
  userBubble: bubble,
  aiBubble: bubble,
  systemBubble: bubble,
  /** The speaker-name color. */
  speaker: colorToken,
  dialogueColor: colorToken,
  narrationColor: colorToken,
  bodyColor: colorToken,
  font: z.enum(THEME_FONT_ALLOWLIST).optional().catch(undefined),
  radius: z.enum(THEME_RADII).optional().catch(undefined),
  background: colorToken,
  /** An explicit UI border color (ST parity). When set it WINS; when unset, `--color-border` derives
   *  from the base `background` surface (the ThemeScope clamp does the derivation). */
  borderColor: colorToken,
  density: z.enum(THEME_DENSITIES).optional().catch(undefined),
});
export type ThemeOverride = z.infer<typeof themeOverrideSchema>;

// ── The CARD-EMBEDDABLE partition (TD §3) ────────────────────────────────────────────────────────────
// A card may carry IDENTITY & ATMOSPHERE — what the character looks like (colours, type family, corner
// language). The VIEWER owns ERGONOMICS, ACCESSIBILITY, COST and TREATMENT — how big, how dense, how dim,
// how expensive. Tie-break for any future key: would card-forcing it change how comfortably or expensively
// the VIEWER reads, or only what the room looks like? Comfort/cost ⇒ viewer-sacred.
//
// `density` is the one axis that is live on a TIER-A THEME and sacred from a CARD: selecting a theme is
// the viewer's OWN consented act, while a card arrives with the room. The CONSENT CHAIN differs, not the
// key — so the field stays on the schema and the projection is what a card-sourced read runs through.
//
// Enforcement is a classification RECORD, not a second key list: every `ThemeOverride` key is classified
// here or tsc fails, and both tuples DERIVE from it (one home, no drift). `tests/contracts/theme/
// card-embeddable-partition.suite.test.ts` pins the derivation against the schema's own key set.

/** Which plane a `ThemeOverride` key belongs to. */
export const THEME_KEY_REACHES = ["card-embeddable", "viewer-sacred"] as const;
export type ThemeKeyReach = (typeof THEME_KEY_REACHES)[number];

const THEME_KEY_REACH = {
  accent: "card-embeddable",
  userBubble: "card-embeddable",
  aiBubble: "card-embeddable",
  systemBubble: "card-embeddable",
  speaker: "card-embeddable",
  dialogueColor: "card-embeddable",
  narrationColor: "card-embeddable",
  bodyColor: "card-embeddable",
  font: "card-embeddable",
  radius: "card-embeddable",
  background: "card-embeddable",
  borderColor: "card-embeddable",
  density: "viewer-sacred",
} as const satisfies Record<keyof ThemeOverride, ThemeKeyReach>;

type KeysWithReach<R extends ThemeKeyReach> = {
  [K in keyof typeof THEME_KEY_REACH]: (typeof THEME_KEY_REACH)[K] extends R ? K : never;
}[keyof typeof THEME_KEY_REACH];

/** A `ThemeOverride` key a character card may carry into a room. */
export type CardEmbeddableThemeKey = KeysWithReach<"card-embeddable">;
/** A `ThemeOverride` key that applies from a card NOWHERE — gate or no gate. */
export type ViewerSacredThemeKey = KeysWithReach<"viewer-sacred">;

const REACH_ENTRIES = Object.entries(THEME_KEY_REACH) as ReadonlyArray<readonly [keyof ThemeOverride, ThemeKeyReach]>;

/** The keys a card carries — the projection surface of {@link cardEmbeddableSubset}. */
export const CARD_EMBEDDABLE_THEME_KEYS: readonly CardEmbeddableThemeKey[] = REACH_ENTRIES.filter(([, reach]) => reach === "card-embeddable").map(
  ([key]) => key as CardEmbeddableThemeKey,
);
/** The keys a card may never carry (live on a theme the viewer selected; dead from a card). */
export const VIEWER_SACRED_THEME_KEYS: readonly ViewerSacredThemeKey[] = REACH_ENTRIES.filter(([, reach]) => reach === "viewer-sacred").map(
  ([key]) => key as ViewerSacredThemeKey,
);

/** The card-carriable half of a `ThemeOverride`. */
export type CardEmbeddableTheme = Pick<ThemeOverride, CardEmbeddableThemeKey>;

/**
 * Project an override down to what a CARD may carry. Run at every seam where card-sourced values reach a
 * render or a mint — the room-theme takeover, the per-speaker plane, the promote verb's write boundary,
 * and the "Start from a theme…" seeding — so a viewer-sacred key can never ride a card at any of them.
 * Absent keys stay absent (the CSS custom-property cascade does the merge).
 */
export function cardEmbeddableSubset(override: ThemeOverride): CardEmbeddableTheme {
  // One accumulator + one cast: TS cannot prove a union-keyed write into a heterogeneous `Pick`, and the
  // alternative (a per-key spread) would re-spell the key list the classification record already owns.
  const subset: Record<string, unknown> = {};
  for (const key of CARD_EMBEDDABLE_THEME_KEYS) {
    const value = override[key];
    if (value !== undefined) {
      subset[key] = value;
    }
  }
  return subset as CardEmbeddableTheme;
}
