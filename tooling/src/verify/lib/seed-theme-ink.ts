// The seed-palette INK-DUTY derivation behind `gates/seed-theme-ink-contrast.ts`. PURE, and it reads
// NOTHING: every input arrives as a fact — the `product-css` declaration facts its one consumer already
// declares, and the `text-<token>` / `bg-<token>/<alpha>` candidates the shared static-class walk
// produces. What is left here is the policy's own ALGORITHM (which grounds an ink rests on, how a
// self-tint composites, which utility spellings are inks), which §12.3 explicitly permits in `verify/lib`.
//
// THE PRIVATE CSS PARSER IS GONE (#2293, §5b.7 / §12.3). This module used to carry `DECLARATION` /
// `THEME_BLOCK` / `SEED_BLOCK` regexes plus a hand-rolled balanced-brace `blockBody` scan over `theme.css`
// TEXT — repository CSS reading behind `defineGate`, in a one-importer `lib/` file, answering a question
// the consumer's own declared `product-css` resource already answers. `CssDeclarationFact` carries the
// property, the collapsed value and the OWNER (`@theme` as an at-rule prelude, `[data-theme="x"]` as a
// style-rule selector list), which is the whole input the derivation needed. Three deltas, all in the
// widening direction and none reachable by the shipped sheet: a final declaration with no `;` before its
// `}` is now READ (the old regex required the semicolon); every `@theme` block merges rather than only the
// first; and a declaration nested inside an at-rule WITHIN `@theme` is attributed to that inner at-rule
// instead of to the theme block. Parity receipt on the real `packages/ui/src/styles/theme.css`: three
// palettes (hearth/dark, light/light, mocha/dark), 81 `--color-*` each, byte-identical values.
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
import type { CssDeclarationFact } from "../contract/resource-css.ts";
import type { StaticClassCandidate } from "./static-class-expression.ts";

/** One shipped seed palette: a name, its inherited color-scheme, and its resolved `--color-*` values. */
export interface SeedPalette {
  readonly name: string;
  readonly scheme: "light" | "dark";
  /** `--color-x` to the oklch literal this palette resolves it to (light-dark() already collapsed). */
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
/** The BASE palette's home: Tailwind's `@theme` block, read off the declaration fact's at-rule owner. */
const THEME_AT_RULE = /^@theme\b/u;
/** A shipped seed's home: `[data-theme="x"]`, read off the declaration fact's selector list. Unanchored,
 *  exactly as the retired text scan was — a seed authored under a compound selector is still that seed. */
const SEED_SELECTOR = /\[data-theme="([a-z0-9-]+)"\]/u;
const COLOR_PREFIX = "--color-";
const COLOR_SCHEME = "color-scheme";
/** `text-primary`, but never `text-primary-foreground` — a pair ink is judged on its own fill, not here. */
const TEXT_UTILITY = /^text-([a-z][a-z0-9-]*)$/u;
const SELF_TINT_UTILITY = /^bg-([a-z][a-z0-9-]*)\/(\d{1,3})$/u;
/** Tailwind v4's importance marker rides the END of a utility (`text-x!`). */
const TRAILING_IMPORTANT = /!$/u;
const WHITESPACE = /\s+/u;

/** The arm a palette's own color-scheme selects out of a `light-dark(<light>, <dark>)` value. */
function polarityArm(value: string, scheme: "light" | "dark"): string {
  const m = LIGHT_DARK.exec(value.trim());
  if (m === null) {
    return value.trim();
  }
  return (scheme === "light" ? m[1] : m[2]) ?? value.trim();
}

/** One seed under construction: its scheme is a declaration inside the same block and may be authored
 *  before or after the colours, so both are accumulated and the palette is built at the end. */
interface SeedDraft {
  scheme: "light" | "dark";
  readonly vars: Map<string, string>;
}

/**
 * Every shipped seed palette, derived from the THEME SHEET'S OWN DECLARATION FACTS: the `@theme` at-rule
 * carries the base (Hearth — `:root { color-scheme: dark }`), and each `[data-theme="…"]` style rule
 * overrides it, taking its scheme from its own `color-scheme` declaration. A base value that is still
 * `light-dark(…)` collapses to the arm that palette's scheme selects.
 *
 * The caller passes the declarations of ONE sheet (`facts.declarations.filter(d => d.file === theme)`);
 * this function never reads a path and never parses text — see the header on the parser it replaced.
 *
 * CUSTOM user themes are deliberately OUT OF SCOPE: they are runtime `<ThemeScope>` values clamped by
 * packages/ui/src/content/theme-scope/clamp.ts and swept by its own suite. This reads what WE ship.
 */
function absorbSeedDeclaration(seeds: Map<string, SeedDraft>, selectorList: string, property: string, value: string): void {
  const name = SEED_SELECTOR.exec(selectorList)?.[1];
  if (name === undefined) {
    return;
  }
  const draft = seeds.get(name) ?? { scheme: "dark", vars: new Map<string, string>() };
  seeds.set(name, draft);
  if (property === COLOR_SCHEME) {
    draft.scheme = value.startsWith("light") ? "light" : "dark";
  } else if (property.startsWith(COLOR_PREFIX)) {
    draft.vars.set(property, value);
  }
}

export function readSeedPalettes(declarations: readonly CssDeclarationFact[]): readonly SeedPalette[] {
  const base = new Map<string, string>();
  const seeds = new Map<string, SeedDraft>();
  for (const { owner, property, value } of declarations) {
    if (owner.kind === "at-rule") {
      if (THEME_AT_RULE.test(owner.prelude) && property.startsWith(COLOR_PREFIX)) {
        base.set(property, value);
      }
    } else {
      absorbSeedDeclaration(seeds, owner.selectorList, property, value);
    }
  }
  // A sheet with no `--color-*` in its `@theme` block resolves ZERO palettes, which is the consumer's
  // zero-palette blindness tripwire — the same verdict the retired "no `@theme` block at all" arm gave.
  if (base.size === 0) {
    return [];
  }
  const palettes: SeedPalette[] = [{ name: "hearth", scheme: "dark", vars: collapse(base, "dark") }];
  for (const [name, draft] of seeds) {
    palettes.push({ name, scheme: draft.scheme, vars: collapse(new Map([...base, ...draft.vars]), draft.scheme) });
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

/**
 * The UTILITY a class token names, with its variant prefixes and importance markers stripped.
 *
 * A VARIANT-PREFIXED INK IS STILL AN INK (2026-09-01, verifier F2). `hover:text-foreground`,
 * `data-invalid:text-destructive` and `group-hover:text-accolade` paint the same token on the same
 * grounds — the variant decides WHEN, never WHAT. A bare-only reader censused them nowhere, and its
 * coverage of the live tree was ACCIDENTAL: every such token happened to also appear bare, so the day
 * one is authored only behind a variant it would be judged by nothing at all.
 *
 * Prefixes are cut at the LAST bracket-depth-0 colon, so an arbitrary variant carrying its own colon
 * (`[&:hover]:text-x`, `data-[state=open]:text-x`) is not severed in the middle. Importance is stripped
 * at BOTH ends: `!text-x` and `text-x!` are both live spellings, and reading only one of them is how
 * `ui-size-via-variant` shipped a false terminal state.
 */
function utilityOf(classToken: string): string {
  let depth = 0;
  let cut = -1;
  for (let index = 0; index < classToken.length; index += 1) {
    const ch = classToken[index];
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      cut = index;
    }
  }
  const bare = classToken.slice(cut + 1);
  return (bare.startsWith("!") ? bare.slice(1) : bare).replace(TRAILING_IMPORTANT, "");
}

/** Self-tint percents by token: `bg-<token>/N` in ANY variant state (`hover:bg-primary/8` counts). */
function selfTintsIn(classTokens: readonly string[]): ReadonlyMap<string, number> {
  const tints = new Map<string, number>();
  for (const raw of classTokens) {
    const match = SELF_TINT_UTILITY.exec(utilityOf(raw));
    const token = match?.[1];
    const percent = Number(match?.[2]);
    if (token !== undefined && Number.isFinite(percent)) {
      tints.set(token, percent);
    }
  }
  return tints;
}

function inkTokensIn(classTokens: readonly string[]): readonly string[] {
  const tokens: string[] = [];
  for (const raw of classTokens) {
    // A `-foreground` token is a PAIR ink: it only ever sits on its own fill, which
    // palette-contrast.suite.test.ts already judges. Measuring it against neutral chrome would
    // manufacture failures (near-white primary-foreground on a light card) for a pair that never occurs.
    const token = TEXT_UTILITY.exec(utilityOf(raw))?.[1];
    if (token !== undefined && !token.endsWith("-foreground")) {
      tokens.push(token);
    }
  }
  return tokens;
}

/** The ink census: which colour tokens the product paints as TEXT, and with what self-tint behind them. */
export function collectInkUses(candidates: readonly StaticClassCandidate[], relativePath: (node: StaticClassCandidate) => string | null): readonly InkUse[] {
  // DEDUPED on (file, line, column, token, tint): one authored site is ONE ink, however many carrier
  // roots the static walk reaches it through. An occurrence-weighted denominator would inflate the
  // gate's own scan count without measuring anything new — a bigger number that says less.
  const seen = new Map<string, InkUse>();
  for (const candidate of candidates) {
    const file = relativePath(candidate);
    const anchor = candidate.segments[0];
    if (file === null || anchor === undefined) {
      continue;
    }
    const classTokens = candidate.value.split(WHITESPACE).filter((token) => token.length > 0);
    const tints = selfTintsIn(classTokens);
    const at = anchor.node.getSourceFile().getLineAndColumnAtPos(anchor.sourceStart);
    for (const token of inkTokensIn(classTokens)) {
      // BOTH ARMS when the carrier paints a self-tint: the ink also has to clear the ground BARE, because
      // the tint may be variant-scoped while the ink is not. A self-tint can only ever LOWER the ratio
      // (same hue, alpha-composited over the ground), so the bare arm never adds a failure the tinted arm
      // did not already have — it only closes the hole where a tint hid the rest state from the census.
      const tint = tints.get(token) ?? null;
      for (const selfTintPercent of tint === null ? [null] : [null, tint]) {
        seen.set(`${file}:${at.line}:${at.column}:${token}:${selfTintPercent ?? "bare"}`, {
          token,
          file,
          line: at.line,
          column: at.column,
          className: `text-${token}`,
          selfTintPercent,
        });
      }
    }
  }
  return [...seen.values()];
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
