// Token-ramp bindings (the DESIGN.md-equivalent — live values from @orb/ui/tokens, never a prose
// mirror) + the shared alpha floor for gradient-stop trust.
import { SNAPPED_LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";

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

/** The smallest ratified leading step — the `leading.label` BOX (16px) over the voice it is authored
 *  for (`text.label`, 13px) = 1.2308. Below it is `tight-leading`. (Impeccable uses 1.3; ours is
 *  ramp-bound so ratified label-voice text stays legal — that clause is why this is a re-derivation
 *  rather than a constant.)
 *
 *  READ THE MAP, NEVER THE SERIALIZATION (docs/law/integer-line-boxes.md §3b/§6). `leading.*` are
 *  px-resolving dimensions emitted as `round(up, 1rem, 1px)`, so `TOKENS["leading.label"].value` is a CSS
 *  string; `SNAPPED_LENGTH_BASE_PX` is the numeric companion generated for exactly this consumer.
 *  The previous spelling was `Number(TOKENS["leading.label"].value)` and the snapped emission turned it
 *  into NaN — MEASURED on this tree the moment the tokens were generated. Its direction is worth pinning
 *  because §6 predicted the opposite: NaN does not silence the rule, it FLOODS. `checkTightLeading`
 *  bails when `ratio >= LEADING_FLOOR - EPSILON`, every comparison against NaN is false, so the bail
 *  never fires and every qualifying paragraph is filed as `tight-leading` against a floor printed as
 *  "NaN". tests/tooling/ui-audit/lib/ramp.test.ts is the tripwire that caught it and keeps it caught. */
export const LEADING_FLOOR = SNAPPED_LENGTH_BASE_PX["leading.label"] / (Number.parseFloat(TOKENS["text.label"].value) * REM_PX);

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

/** Every non-generic face the token stacks name (`font.sans` + `font.mono`) — the ONLY faces a rendered
 *  page may resolve. A face outside this set is `off-theme-font`, and so is a face INSIDE it that the
 *  environment measurably cannot paint: membership here is a claim about the token vocabulary, never
 *  evidence that the face exists. checks-typography.ts owns both arms and why only one of them withholds. */
export const RAMP_FONT_FACES: ReadonlySet<string> = new Set([...stackFaces(TOKENS["font.sans"].value), ...stackFaces(TOKENS["font.mono"].value)]);

/** A gradient stop whose alpha is below this can't be trusted for worst-stop contrast math —
 *  what shows through underneath is unknown, so the check REFUSES (indeterminate) instead of
 *  producing a fake ratio. (The old walker's alpha-blind stop math was the documented
 *  "skips gradient backgrounds" blind spot.) */
export const OPAQUE_STOP_MIN_ALPHA = 0.9;
