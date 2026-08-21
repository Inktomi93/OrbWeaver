// Token-ramp bindings (the DESIGN.md-equivalent — live values from @orb/ui/tokens, never a prose
// mirror) + the shared alpha floor for gradient-stop trust.
import { TOKENS } from "@orb/ui/tokens";

// ── Token-ramp bindings (the DESIGN.md-equivalent — live values, never a prose mirror) ──────
export const REM_PX = 16;

/** The smallest ratified type step — `text.micro` (10.5px, the UIP-103 micro-caps voice).
 *  Text below this is off the ramp AND illegible: the `text-below-ramp` floor. */
export const TEXT_MICRO_PX = Number.parseFloat(TOKENS["text.micro"].value) * REM_PX;

/** Measurement slack so text AT the micro step never false-fires (sub-pixel rounding). */
export const RAMP_FLOOR_EPSILON_PX = 0.2;

/** Interactive text floor — deliberately ABOVE the micro step (impeccable's "being on the ramp
 *  doesn't launder legibility" clause, kept for interactive text only). */
export const INTERACTIVE_TEXT_FLOOR_PX = 11;

/** The smallest ratified leading step — `leading.label` (1.25). Below it is `tight-leading`.
 *  (Impeccable uses 1.3; ours is ramp-bound so ratified label-voice text stays legal.) */
export const LEADING_FLOOR = Number(TOKENS["leading.label"].value);

/** Rounding slack on the leading floor (#233). `getComputedStyle` hands back a TRUNCATED line-height
 *  string — at `--font-scale: 1.25` the body step measures 13.125px and Chrome reports "16.4062px" for
 *  a line-height that is exactly 16.40625px, so the ratio arrives as 1.2499657 and a ramp-legal
 *  paragraph fires `tight-leading` against a floor it actually sits on (three such findings on the
 *  home reading arm, all retracted in-report). Chrome truncates at 4 decimals, so the worst error is
 *  bounded by 1e-4 / fontSizePx — well inside this; anything genuinely tight is ≥ 0.01 below the floor. */
export const LEADING_FLOOR_EPSILON = 0.005;

const GENERIC_FONT_TOKENS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

const QUOTE_TRIM_RE = /^['"]|['"]$/g;

function stackFaces(stack: string): string[] {
  return stack
    .split(",")
    .map((f) => f.trim().replace(QUOTE_TRIM_RE, "").toLowerCase())
    .filter((f) => f.length > 0 && !GENERIC_FONT_TOKENS.has(f));
}

/** Every non-generic face the token stacks name (`font.sans` + `font.mono`) — the ONLY faces a
 *  rendered page may resolve. Anything else is `off-theme-font`. */
export const RAMP_FONT_FACES: ReadonlySet<string> = new Set([...stackFaces(TOKENS["font.sans"].value), ...stackFaces(TOKENS["font.mono"].value)]);

/** A gradient stop whose alpha is below this can't be trusted for worst-stop contrast math —
 *  what shows through underneath is unknown, so the check REFUSES (indeterminate) instead of
 *  producing a fake ratio. (The old walker's alpha-blind stop math was the documented
 *  "skips gradient backgrounds" blind spot.) */
export const OPAQUE_STOP_MIN_ALPHA = 0.9;
