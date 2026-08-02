// The near-duplicate COLOR lint for the DTCG source (runs inside tokens.build.ts's generateArtifacts,
// so `pnpm --filter @orb/ui tokens:build` AND the freshness test both RED on a violation).
//
// THE DRIFT CLASS. Two tokens shipped as two independent values that are the same colour to any eye —
// `--color-foreground` oklch(0.955 0.004 75) beside a hand-authored `--color-popover-foreground`
// oklch(0.96 0.004 75). Nobody decided the 0.005; it accreted. The symptom is invisible in review and
// visible on screen: two near-identical whites on one surface (a Select's popup value against the
// labels beside it — preset typography census, 2026-08-02). DTCG already has the fix — a `{reference}`
// makes one token one decision — so the lint's job is to make the un-referenced twin impossible.
//
// WHY BASE-RAMP ONLY (tokens.json), NOT the seed value-sets (src/tokens/themes/*.json). A value-set is
// validated to carry a bare `oklch(…)` literal for EVERY emitted path — the format has no reference
// mechanism, so "collapse to one token" is not a move that exists there. Both candidate rules for that
// plane were measured against the tree and are floods of DESIGN, not drift: (1) near-but-unequal pairs
// inside one value-set = 60+ hits, all systematic chroma tiering (every palette's popover is its
// sidebar-accent at ×0.9 chroma); (2) "a base reference-group must stay one value per theme" = 21 hits,
// all deliberate — `user-bubble` re-tinted away from `secondary` IS the D44 §12.1 ThemeScope override
// point. A per-theme re-value of a semantic token is the seed system working; the base ramp is where
// two values compete to be one decision.
//
// SCOPE = COLOUR. Colour is the value-space with an accepted perceptual difference metric (Oklab ΔE),
// which is what makes "these are the same value" decidable rather than a taste call. Dimension ramps
// step deliberately at the 2pt sub-grid, where a numeric-proximity rule would only relitigate design.

/** A raw DTCG node (pre-resolution): `$value` is still `{color.x}` for a reference. */
type RawNode = Record<string, unknown>;

/**
 * The near-duplicate threshold, in Oklab ΔE (√(ΔL² + Δa² + Δb² + Δalpha²), all channels on the same
 * 0–1 scale). Bracketed by the tree's own evidence, not by a round number:
 *   • the drift it must CATCH — the two whites above sit at ΔE 0.005, and `color.secondary` vs
 *     `color.muted` (0.007 vs 0.006 chroma, identical L and hue) at ΔE 0.001;
 *   • the design it must NOT touch — the smallest DELIBERATE step in the Hearth ramp is 0.010
 *     (`sidebar-accent` 0.235 → `popover` 0.245 → `secondary` 0.255, the elevation ladder), and the
 *     border/sidebar-border alpha step is also 0.010.
 * 0.008 is the only decade between them. Widening this past 0.010 starts calling the elevation ladder
 * a duplicate; narrowing it below 0.005 stops catching the defect that minted the lint.
 */
export const NEAR_DUPLICATE_EPSILON = 0.008;

/**
 * Sanctioned near-pairs: `"color.a|color.b"` (paths sorted) → the DESIGN reason they are two values.
 * Empty on purpose — every near-pair the tree had was drift and was collapsed. The seam exists so a
 * future intentional pair is STATED here rather than silently tolerated; an entry with a hand-wave for
 * a reason is the same defect wearing a comment.
 */
export const ALLOWED_NEAR_PAIRS: Readonly<Record<string, string>> = {};

/** oklch states hue in DEGREES; the Oklab a/b projection needs radians. */
const DEGREES_PER_RADIAN = 180;
/** ΔE decimals in the diagnostic: four is enough to distinguish 0.0010 drift from the 0.0100 elevation step. */
const DELTA_E_DECIMALS = 4;

const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/u;
const LIGHT_DARK_RE = /^light-dark\(\s*(.+?)\s*,\s*(.+)\s*\)$/u;

/** An oklch literal as an Oklab point + alpha: `[L, a, b, alpha]`, all comparable on one scale. */
function oklabPoint(value: string): readonly [number, number, number, number] | null {
  const m = OKLCH_RE.exec(value.trim());
  if (m === null) {
    return null;
  }
  const [, l, c, h, alpha] = m;
  const hueRad = (Number(h) * Math.PI) / DEGREES_PER_RADIAN;
  return [Number(l), Number(c) * Math.cos(hueRad), Number(c) * Math.sin(hueRad), alpha === undefined ? 1 : Number(alpha)];
}

/**
 * A colour value as the points that must ALL be near for two tokens to be one colour: one point for a
 * plain `oklch(…)`, two for a polarity-aware `light-dark(<light>, <dark>)` (a pair is a duplicate only
 * if BOTH arms coincide). `null` = not a comparable colour (a shadow recipe, a dimension, a reference).
 * The arity doubles as the value-space key — a plain value and a light-dark value are never compared.
 */
function colorPoints(value: unknown): ReadonlyArray<readonly [number, number, number, number]> | null {
  if (typeof value !== "string") {
    return null;
  }
  const arms = LIGHT_DARK_RE.exec(value.trim());
  if (arms !== null) {
    const light = oklabPoint(arms[1] ?? "");
    const dark = oklabPoint(arms[2] ?? "");
    return light === null || dark === null ? null : [light, dark];
  }
  const plain = oklabPoint(value);
  return plain === null ? null : [plain];
}

/** Oklab ΔE between two colour values of the same arity — the WORST arm, so a light-dark pair must coincide in both polarities to count. */
function deltaE(a: ReadonlyArray<readonly [number, number, number, number]>, b: ReadonlyArray<readonly [number, number, number, number]>): number {
  let worst = 0;
  for (const [i, pa] of a.entries()) {
    const pb = b[i];
    if (pb === undefined) {
      continue;
    }
    worst = Math.max(worst, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2], pa[3] - pb[3]));
  }
  return worst;
}

/** An independently-authored colour literal: `{color.x}` references are skipped — a reference IS the one-token answer. */
interface LiteralColor {
  readonly path: string;
  readonly raw: string;
  readonly points: ReadonlyArray<readonly [number, number, number, number]>;
}

function collectLiteralColors(node: RawNode, path: readonly string[], out: LiteralColor[]): void {
  if ("$value" in node) {
    const raw = node["$value"];
    if (typeof raw === "string" && !raw.startsWith("{")) {
      const points = colorPoints(raw);
      if (points !== null) {
        out.push({ path: path.join("."), raw, points });
      }
    }
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || typeof child !== "object" || child === null) {
      continue;
    }
    collectLiteralColors(child as RawNode, [...path, key], out);
  }
}

/**
 * RED when two independently-authored colour literals in the DTCG source land within
 * NEAR_DUPLICATE_EPSILON without one referencing the other. `source` is the RAW tokens.json (references
 * un-resolved — a resolved dictionary would report every legitimate `{reference}` group as a duplicate).
 * `allowed` is injectable ONLY so the lint's own suite can exercise the sanctioned-exception path
 * without shipping a fake entry in ALLOWED_NEAR_PAIRS; the build never passes it.
 */
export function assertNoNearDuplicateColors(source: RawNode, allowed: Readonly<Record<string, string>> = ALLOWED_NEAR_PAIRS): void {
  const colors: LiteralColor[] = [];
  collectLiteralColors(source, [], colors);
  const violations: string[] = [];
  for (const [i, a] of colors.entries()) {
    for (const b of colors.slice(i + 1)) {
      if (a.points.length !== b.points.length) {
        continue;
      }
      const distance = deltaE(a.points, b.points);
      if (distance > NEAR_DUPLICATE_EPSILON) {
        continue;
      }
      const key = [a.path, b.path].sort().join("|");
      if (key in allowed) {
        continue;
      }
      violations.push(`  ${a.path} = ${a.raw}\n  ${b.path} = ${b.raw}\n  → Oklab ΔE ${distance.toFixed(DELTA_E_DECIMALS)}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `tokens.json: ${violations.length} near-duplicate colour pair(s) — two values within Oklab ΔE ${NEAR_DUPLICATE_EPSILON} that are not one token:\n\n` +
        `${violations.join("\n\n")}\n\n` +
        'Fix: point one at the other with a DTCG reference (`"$value": "{color.x}"`) so the colour is ONE decision. ' +
        "If the pair is deliberately two values, add it to ALLOWED_NEAR_PAIRS in tokens.near-duplicate.ts with the design reason.",
    );
  }
}
