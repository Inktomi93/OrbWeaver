// The D44 §12.1 token-override WIRE schema — the boundary clamp for user/character theming
// (`UI-Theming-and-Content.md` §12.1 owns the field list + the parse-and-clamp rules; ledger D44 is
// the decision record). A custom-property VALUE cannot select/execute/exfiltrate — but only if it
// is PARSED + CLAMPED at the boundary: a color must parse as a color (the shared kit `isSafeColor`
// — reject `url()`/`expression()`/injection), fonts allowlist, enums enumerate. Anything that fails
// DEGRADES per-field (`.catch(undefined)` — the bad field drops, the inherited token shows through;
// unknown keys strip) — themes-design.md §3.1's lenient posture; never a whole-blob reject.
//
// DELIBERATE TWO-COPY (D44 §12.5 one-home note): this WIRE schema and the ui-local RENDER clamp
// (`@orb/ui` `content/theme-scope/clamp.ts`) exist twice BY DESIGN — the cake forbids either
// importing the other. The shared `isSafeColor` predicate lives ONCE in `@orb/kit/safe-color`
// (both reach kit), and the structural pairing (identical key sets, enums, font allowlist) is
// pinned by `tests/contracts/theme/pairing.suite.test.ts`, which may import both packages.

import { isSafeColor } from "@orb/kit/safe-color";
import { z } from "zod";

/** Fonts a user may pick — an allowlist (D44 §12.1 "font (allowlist)"); anything else drops. */
export const THEME_FONT_ALLOWLIST = [
  "Geist",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "Georgia",
  "Times New Roman",
  "Iowan Old Style",
] as const;
export type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

export const THEME_CHAT_STYLES = ["bubble", "flat", "document"] as const;
export type ThemeChatStyle = (typeof THEME_CHAT_STYLES)[number];

export const THEME_DENSITIES = ["comfortable", "compact"] as const;
export type ThemeDensity = (typeof THEME_DENSITIES)[number];

export const THEME_RADII = ["base", "control", "card", "full"] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

// Lenient per-field: a failed parse yields `undefined` (field drops), never a thrown blob.
const colorToken = z.string().refine(isSafeColor).optional().catch(undefined);
const bubble = z.object({ bg: colorToken, fg: colorToken }).optional().catch(undefined);

/**
 * The curated token-override subset (D44 §12.1 — sized to ST `--SmartTheme*` parity). Every field
 * optional; per-field failures degrade to undefined. NOTE: the D49 background-IMAGE token
 * (`MediaSrc` + fit) is a themes-slice addition (themes-design.md) — `background` here is the
 * background COLOR, mirroring the built `<ThemeScope>` clamp exactly (the pairing test enforces
 * the mirror; the image token lands on BOTH sides in the same change).
 */
export const themeOverrideSchema = z.object({
  accent: colorToken,
  userBubble: bubble,
  aiBubble: bubble,
  systemBubble: bubble,
  /** The speaker-NAME color (§12.1 "name color"). */
  speaker: colorToken,
  dialogueColor: colorToken,
  narrationColor: colorToken,
  bodyColor: colorToken,
  font: z.enum(THEME_FONT_ALLOWLIST).optional().catch(undefined),
  radius: z.enum(THEME_RADII).optional().catch(undefined),
  background: colorToken,
  chatStyle: z.enum(THEME_CHAT_STYLES).optional().catch(undefined),
  density: z.enum(THEME_DENSITIES).optional().catch(undefined),
});
export type ThemeOverride = z.infer<typeof themeOverrideSchema>;
