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
//
// D49 §3 background-IMAGE addition (WS3): `backgroundImage`/`backgroundFit`/`backgroundDim` are a
// SEPARATE trio from `background` (the base surface COLOR the neutral ramp derives from, untouched) —
// conflating them would break the ramp math (an image can't feed `oklch(from X …)`). `backgroundImage`
// mirrors the `messageMediaSrcSchema` asset/external shape (D44 §12.3) plus a `seeded` arm for the
// bundled placeholder set (`packages/client/public/backgrounds/`, source-prefixed-string pattern).
// The `asset` arm is SCHEMA-COMPLETE but UI-UNREACHABLE today: no client asset-URL resolver or upload
// flow exists yet (#67, the same gap `message-media-block.tsx` flags) — fabricating one here would be
// the invention the missing-API protocol forbids. Seeded + external are fully wired.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
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

/** D49 §3 — the background-image `fit` axis. `cover` is the recommended/default (never
 *  `background-attachment:fixed`, iOS-broken); `contain` is the ST-parity alternative. */
export const THEME_BACKGROUND_FITS = ["cover", "contain"] as const;
export type ThemeBackgroundFit = (typeof THEME_BACKGROUND_FITS)[number];

// Lenient per-field: a failed parse yields `undefined` (field drops), never a thrown blob.
const colorToken = z.string().refine(isSafeColor).optional().catch(undefined);
const bubble = z.object({ bg: colorToken, fg: colorToken }).optional().catch(undefined);

/** D49 §3 background-IMAGE source (mirrors `messageMediaSrcSchema`, D44 §12.3, plus a `seeded` arm
 *  for the bundled placeholder set). `asset` is schema-complete but UI-unreachable today — no client
 *  asset-URL resolver/upload flow exists yet (#67); ships for forward-compat, never surfaced by the
 *  picker until #67 lands. */
const backgroundImageSourceSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("asset"), assetId: typeIdSchema(ID_PREFIX.asset) }),
    z.object({ kind: z.literal("external"), url: z.url() }),
    z.object({ kind: z.literal("seeded"), id: z.string().regex(/^[a-z0-9-]+$/) }),
  ])
  .optional()
  .catch(undefined);

/**
 * The curated token-override subset (D44 §12.1 — sized to ST `--SmartTheme*` parity). Every field
 * optional; per-field failures degrade to undefined. `background` is the base surface COLOR the
 * neutral ramp derives from; `backgroundImage`/`backgroundFit`/`backgroundDim` (D49 §3, WS3) are a
 * SEPARATE decorative-photo trio layered behind the app as a dedicated fixed-position root layer
 * with a mandatory scrim (`backgroundDim`) — never conflated with the surface color (an image can't
 * feed the `oklch(from background …)` ramp math). The pairing test enforces the mirror with the ui
 * `<ThemeScope>` clamp.
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
  /** D49 §3 — the decorative background photo (asset/external/seeded). Undefined ⇒ no image (the
   *  `background` color alone paints the app). */
  backgroundImage: backgroundImageSourceSchema,
  /** How the image fills the root layer (`cover` default at the client). */
  backgroundFit: z.enum(THEME_BACKGROUND_FITS).optional().catch(undefined),
  /** The mandatory scrim opacity (0–1) between the image and the content — non-negotiable per D49 §3
   *  (guarantees text legibility on any image; the client defaults ~0.45 when an image is set). */
  backgroundDim: z.number().min(0).max(1).optional().catch(undefined),
  /** An explicit UI border color (ST parity). When set it WINS; when unset, `--color-border` derives
   *  from the base `background` surface (the ThemeScope clamp does the derivation). */
  borderColor: colorToken,
  chatStyle: z.enum(THEME_CHAT_STYLES).optional().catch(undefined),
  density: z.enum(THEME_DENSITIES).optional().catch(undefined),
});
export type ThemeOverride = z.infer<typeof themeOverrideSchema>;
