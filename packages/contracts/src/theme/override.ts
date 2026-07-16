// The token-override WIRE schema — the boundary clamp for user/character theming. A custom-property
// value cannot select/execute/exfiltrate only if parsed + clamped at the boundary: a color must parse
// as a color, fonts allowlist, enums enumerate. A failed field degrades to `undefined` (never a
// whole-blob reject).
// Deliberate two-copy: this wire schema and the ui-local render clamp (`@orb/ui`
// `content/theme-scope/clamp.ts`) exist twice by design (the cake forbids either importing the other);
// `tests/contracts/theme/pairing.suite.test.ts` pins their structural mirror.
// The decorative background IMAGE lives as flat fields on the `appearance` settings namespace, not here
// — only the base surface COLOR (`background`) stays a token (it feeds the neutral ramp).

import { isSafeColor } from "@orb/kit/safe-color";
import { z } from "zod";

/** Fonts a user may pick — an allowlist; anything else drops. */
export const THEME_FONT_ALLOWLIST = ["Geist", "ui-sans-serif", "ui-serif", "ui-monospace", "Georgia", "Times New Roman", "Iowan Old Style"] as const;
export type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

// Painted by `@orb/client` `MESSAGE_ROW_SKINS` (`Record<ChatStyle, RowSkin>`) — a new member here fails
// tsc there until it's painted.
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
  chatStyle: z.enum(THEME_CHAT_STYLES).optional().catch(undefined),
  density: z.enum(THEME_DENSITIES).optional().catch(undefined),
});
export type ThemeOverride = z.infer<typeof themeOverrideSchema>;
