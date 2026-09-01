// The seed-palette INK-DUTY derivation behind `gates/seed-theme-ink-contrast.ts`. Pure + fsBacked:
// it resolves every shipped seed palette out of the GENERATED `theme.css` and pairs it with the
// `text-<token>` / `bg-<token>/<alpha>` census the shared static-class walk already produces.
//
// WHY theme.css AND NOT the DTCG sources: the light-dark() composition (base $value = the dark arm,
// themes/light.json = the light arm, everything else a [data-theme] override) is tokens.build.ts's
// decision, and re-deriving it here would be a second home for it that drifts the first time the
// build changes. The emitted stylesheet is what the BROWSER resolves, so judging it is judging the
// shipped pixel; freshness against tokens.json is separately machine-enforced (tests/ui/tokens).
//
// COLOUR MATH: `@orb/kit/safe-color` (ColorJS-backed, standards CSS parsing) for oklch -> sRGB, and
// `@orb/tooling/_shared/wcag` for the ratio. NO third converter is minted here — the house already
// paid for that lesson twice (ui-audit/lib/css-color.ts's header).
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import type { Rgb } from "../../_shared/wcag.ts";
import { contrastRatio } from "../../_shared/wcag.ts";
import type { StaticClassCandidate } from "./static-class-expression.ts";

/** One shipped seed palette: a name, its inherited color-scheme, and its resolved `--color-*` values. */
export interface SeedPalette {
  readonly name: string;
  readonly scheme: "light" | "dark";
  /** `--color-x` -> the oklch literal this palette resolves it to (light-dark() already collapsed). */
  readonly vars: ReadonlyMap<string, string>;
}

/** A token painted as TEXT somewhere in the product, with the carrier that paints it. */
export interface InkUse {
  readonly token: string; // "primary" (the `--color-` suffix)
  readonly file: string; // repo-relative carrier
  readonly line: number;
  readonly column: number;
  readonly className: string; // the `text-<token>` lexeme, for the finding's token field
  /** Percent of its OWN hue this carrier paints BEHIND the ink (`bg-<token>/8`), or null. */
  readonly selfTintPercent: number | null;
}

const LIGHT_DARK = /^light-dark\(\s*(.+?)\s*,\s*(.+?)\s*\)$/u;
const DECLARATION = /--color-([a-z0-9-]+)\s*:\s*([^;]+);/giu;
const THEME_BLOCK = /@theme\s*\{/u;
const SEED_BLOCK = /\[data-theme="([a-z0-9-]+)"\]\s*\{/giu;
/** `text-primary`, but never `text-primary-foreground` — a pair ink is judged on its own fill, not here. */
const TEXT_UTILITY = /(?:^|\s)text-([a-z][a-z0-9-]*)(?=$|\s)/giu;
const SELF_TINT_UTILITY = /(?:^|\s)bg-([a-z][a-z0-9-]*)\/(\d{1,3})(?=$|\s)/giu;

/** The `{ … }` body opened by the brace at `openIdx`, by balanced-brace scan (nested at-rules included). */
function blockBody(text: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === "{") {
      depth += 1;
    } else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIdx + 1, i);
      }
    }
  }
  return "";
}

function declarationsIn(body: string): Map<string, string> {
  const out = new Map<string, string>();
  DECLARATION.lastIndex = 0;
  for (let m = DECLARATION.exec(body); m !== null; m = DECLARATION.exec(body)) {
    const name = m[1];
    const value = m[2];
    if (name !== undefined && value !== undefined) {
      out.set(`--color-${name}`, value.trim());
    }
  }
  return out;
}

/** The arm a palette's own color-scheme selects out of a `light-dark(<light>, <dark>)` value. */
export function polarityArm(value: string, scheme: "light" | "dark"): string {
  const m = LIGHT_DARK.exec(value.trim());
  if (m === null) {
    return value.trim();
  }
  return (scheme === "light" ? m[1] : m[2]) ?? value.trim();
}

/**
 * Every shipped seed palette, resolved from the generated stylesheet: the `@theme` block is the base
 * (Hearth — `:root { color-scheme: dark }`), and each `[data-theme="…"]` block overrides it, taking its
 * scheme from its own `color-scheme` declaration. A base value that is still `light-dark(…)` collapses
 * to the arm that palette's scheme selects.
 *
 * CUSTOM user themes are deliberately OUT OF SCOPE: they are runtime `<ThemeScope>` values clamped by
 * packages/ui/src/content/theme-scope/clamp.ts and swept by its own suite. This reads what WE ship.
 */
export function readSeedPalettes(themeCss: string): readonly SeedPalette[] {
  const themeStart = THEME_BLOCK.exec(themeCss);
  if (themeStart === null) {
    return [];
  }
  const base = declarationsIn(blockBody(themeCss, themeStart.index + themeStart[0].length - 1));
  if (base.size === 0) {
    return [];
  }
  const palettes: SeedPalette[] = [{ name: "hearth", scheme: "dark", vars: collapse(base, "dark") }];
  SEED_BLOCK.lastIndex = 0;
  for (let m = SEED_BLOCK.exec(themeCss); m !== null; m = SEED_BLOCK.exec(themeCss)) {
    const name = m[1];
    if (name === undefined) {
      continue;
    }
    const body = blockBody(themeCss, m.index + m[0].length - 1);
    const scheme = /color-scheme\s*:\s*light/u.test(body) ? "light" : "dark";
    const merged = new Map(base);
    for (const [key, value] of declarationsIn(body)) {
      merged.set(key, value);
    }
    palettes.push({ name, scheme, vars: collapse(merged, scheme) });
  }
  return palettes;
}

function collapse(vars: ReadonlyMap<string, string>, scheme: "light" | "dark"): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of vars) {
    out.set(key, polarityArm(value, scheme));
  }
  return out;
}

function selfTintsIn(classValue: string): ReadonlyMap<string, number> {
  const tints = new Map<string, number>();
  SELF_TINT_UTILITY.lastIndex = 0;
  for (let m = SELF_TINT_UTILITY.exec(classValue); m !== null; m = SELF_TINT_UTILITY.exec(classValue)) {
    const token = m[1];
    const percent = Number(m[2]);
    if (token !== undefined && Number.isFinite(percent)) {
      tints.set(token, percent);
    }
  }
  return tints;
}

function inkTokensIn(classValue: string): readonly string[] {
  const tokens: string[] = [];
  TEXT_UTILITY.lastIndex = 0;
  for (let m = TEXT_UTILITY.exec(classValue); m !== null; m = TEXT_UTILITY.exec(classValue)) {
    // A `-foreground` token is a PAIR ink: it only ever sits on its own fill, which
    // palette-contrast.suite.test.ts already judges. Measuring it against neutral chrome would
    // manufacture failures (near-white primary-foreground on a light card) for a pair that never occurs.
    const token = m[1];
    if (token !== undefined && !token.endsWith("-foreground")) {
      tokens.push(token);
    }
  }
  return tokens;
}

/** The ink census: which colour tokens the product paints as TEXT, and with what self-tint behind them. */
export function collectInkUses(candidates: readonly StaticClassCandidate[], relativePath: (node: StaticClassCandidate) => string | null): readonly InkUse[] {
  const uses: InkUse[] = [];
  for (const candidate of candidates) {
    const file = relativePath(candidate);
    const anchor = candidate.segments[0];
    if (file === null || anchor === undefined) {
      continue;
    }
    const tints = selfTintsIn(candidate.value);
    const start = anchor.node.getSourceFile().getLineAndColumnAtPos(anchor.sourceStart);
    for (const token of inkTokensIn(candidate.value)) {
      uses.push({ token, file, line: start.line, column: start.column, className: `text-${token}`, selfTintPercent: tints.get(token) ?? null });
    }
  }
  return uses;
}

/** Source-over composite of `fg` at `alpha` over `bg` — the tint a `bg-<token>/N` paints. */
export function compositeOver(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return { r: alpha * fg.r + (1 - alpha) * bg.r, g: alpha * fg.g + (1 - alpha) * bg.g, b: alpha * fg.b + (1 - alpha) * bg.b };
}

const quantize = (c: Rgb): Rgb => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
/** The WORSE of the float and 8-bit-quantized ratio — the pixel a reader sees is the rounded one
 *  (the house rule, tests/ui/content/theme-scope/palette-contrast.suite.test.ts). */
export function worstContrast(a: Rgb, b: Rgb): number {
  return Math.min(contrastRatio(a, b), contrastRatio(quantize(a), quantize(b)));
}

/** An oklch/hex/rgb literal as sRGB 0-255, or null. A TRANSLUCENT value also returns null ON PURPOSE:
 *  compositing it needs a backdrop this function is not given, and judging it as if it were opaque is
 *  the naive-contrast lie. Callers treat null as "I could not measure" and say so, never as a pass. */
export function toRgb(value: string): Rgb | null {
  const parsed = parseCssColorToSrgb(value);
  if (parsed === null || parsed.alpha < 1) {
    return null;
  }
  return { r: parsed.r, g: parsed.g, b: parsed.b };
}
