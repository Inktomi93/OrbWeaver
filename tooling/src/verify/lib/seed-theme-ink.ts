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
// style-rule selector list); the ENCLOSING blocks come from the two shared ancestry readers
// (`css-rules.ts#rulesContaining` / `#atRulesContaining`), because an owner names only the INNERMOST
// block.
//
// THE FIRST FOLD CLAIMED "three deltas, all widening" AND THAT WAS FALSE (#2293 leg 2, caught in source
// review). Reading only the owner NARROWED the reader: a `--color-*` nested one level inside `@theme` or
// inside a seed belongs to the inner block, so it silently left the palette. The live `theme.css` has no
// such nesting, which is exactly why a real-sheet parity twin could not see it — a parity receipt over a
// subject that never exercises the changed code path is not a measurement of the change. The four deltas,
// each measured against the frozen pre-fold reader and each pinned in
// tests/tooling/verify/gates/seed-theme-ink-family.test.ts:
//   WIDER   a final declaration with no `;` before its `}` is now READ (the old regex required it);
//   WIDER   every `@theme` block merges rather than only the first;
//   CHANGED a `--color-*` under a nested CONDITIONAL at-rule becomes its own ARM (`<palette> @ <prelude>`)
//           instead of being merged last-wins into the palette — both arms are judged, where the old scan
//           REPLACED the unconditional value and hid the base arm;
//   NARROWER a `--color-*` under a nested PLAIN SELECTOR is EXCLUDED — its subject is a descendant
//           element, never the seed root, and the old scan counting it was a defect of the balanced-body
//           read rather than a capability.
// Parity receipt on the real `packages/ui/src/styles/theme.css` (which exercises none of the four): three
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
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { atRulesContaining, rulesContaining } from "./css-rules.ts";
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
  /** `undefined` until the block DECLARES its own `color-scheme`, which is what lets a conditional arm
   *  INHERIT its palette's polarity instead of silently reverting to the base's. */
  scheme: "light" | "dark" | undefined;
  readonly vars: Map<string, string>;
}

/** ONE enclosing block of a declaration, as the shared ancestry readers hand it back. `start` is what
 *  orders the chain: proper nesting means ascending start is outermost-first. */
type Block =
  | { readonly start: number; readonly kind: "style-rule"; readonly selectorList: string }
  | { readonly start: number; readonly kind: "at-rule"; readonly prelude: string };

/** WHERE a declaration sits, in palette terms. `root` is the palette it belongs to (`hearth` for the
 *  `@theme` base, else the seed name); `condition` is the joined preludes of the at-rules between the root
 *  and the declaration — empty for an unconditional declaration. `undefined` means "no palette owns it". */
interface Placement {
  readonly root: string;
  readonly condition: string;
}

/** One CONDITIONAL ARM under construction: the palette it modifies, the joined at-rule preludes that gate
 *  it, and the declarations authored inside. */
interface Arm {
  readonly root: string;
  readonly condition: string;
  readonly draft: SeedDraft;
}

const HEARTH = "hearth";
const CONDITION_JOIN = " · ";

/** Every block containing `offset`, outermost first — BOTH halves of the ancestry, through the two shared
 *  readers. The innermost entry is the declaration's own `owner`; everything before it is a true ancestor,
 *  which is the half `CssDeclarationFact.owner` structurally cannot express. */
function blockChain(file: AuthoredCssFile, offset: number): readonly Block[] {
  const rules: Block[] = rulesContaining(file.rules, offset).map((rule) => ({ start: rule.braceStart, kind: "style-rule", selectorList: rule.selectorList }));
  const atRules: Block[] = atRulesContaining(file.atRules, offset).map((atRule) => ({ start: atRule.offset, kind: "at-rule", prelude: atRule.prelude }));
  return [...rules, ...atRules].toSorted((left, right) => left.start - right.start);
}

/** The index of the block that OWNS a palette — the `@theme` at-rule or a `[data-theme="…"]` selector —
 *  and the palette's name, or `undefined` when the chain reaches neither. */
function rootName(block: Block): string | undefined {
  if (block.kind === "style-rule") {
    return SEED_SELECTOR.exec(block.selectorList)?.[1];
  }
  return THEME_AT_RULE.test(block.prelude) ? HEARTH : undefined;
}

function rootOf(chain: readonly Block[]): { readonly index: number; readonly name: string } | undefined {
  let found: { readonly index: number; readonly name: string } | undefined;
  for (const [index, block] of chain.entries()) {
    const name = rootName(block);
    if (name !== undefined) {
      found = { index, name };
      break;
    }
  }
  return found;
}

/**
 * WHICH PALETTE, IF ANY, A DECLARATION BELONGS TO — the adjudication this reader exists to make, and the
 * three cases are decided rather than inherited (#2293 leg 2, red-first delta table in the lane report):
 *
 *  - UNCONDITIONAL, directly in `@theme` or in a seed's own block → the palette itself. Unchanged.
 *  - Under a nested at-rule (`@supports`, `@media`, `@container`) inside either → the palette's CONDITIONAL
 *    ARM. It is a value the shipped pixel really takes, so an instrument that drops it goes blind on an arm
 *    the product paints. It is NOT merged into the unconditional palette either: the retired text scan
 *    absorbed it last-wins, which REPLACED the unconditional value and hid the base arm instead. Both arms
 *    are judged, which is the only reading under which neither is invisible.
 *  - Under a nested PLAIN SELECTOR (`& .x`, `.card &`) inside a seed → NOT the palette, deliberately. Its
 *    subject is a descendant element, not the seed root, so a `text-<token>` resting on the seed never
 *    resolves against it. The retired scan counted these too — that was a defect of the balanced-body read,
 *    not a capability, and it is not restored.
 */
function placementOf(file: AuthoredCssFile, offset: number): Placement | undefined {
  const chain = blockChain(file, offset);
  const root = rootOf(chain);
  const inner = root === undefined ? [] : chain.slice(root.index + 1);
  if (root === undefined || inner.some((block) => block.kind === "style-rule")) {
    return;
  }
  const conditions = [...chain.slice(0, root.index), ...inner].flatMap((block) => (block.kind === "at-rule" ? [block.prelude] : []));
  return { root: root.name, condition: conditions.join(CONDITION_JOIN) };
}

function absorb(draft: SeedDraft, property: string, value: string): void {
  if (property === COLOR_SCHEME) {
    draft.scheme = value.startsWith("light") ? "light" : "dark";
  } else if (property.startsWith(COLOR_PREFIX)) {
    draft.vars.set(property, value);
  }
}

function draftFor(drafts: Map<string, SeedDraft>, key: string): SeedDraft {
  const existing = drafts.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created: SeedDraft = { scheme: undefined, vars: new Map<string, string>() };
  drafts.set(key, created);
  return created;
}

/**
 * Every shipped seed palette, derived from ONE SHEET'S declaration facts and the SHARED ANCESTRY READERS:
 * the `@theme` at-rule carries the base (Hearth — `:root { color-scheme: dark }`), each `[data-theme="…"]`
 * style rule overrides it taking its scheme from its own `color-scheme`, and a conditional at-rule nested
 * inside either contributes an extra ARM named `<palette> @ <prelude>`. A value that is still
 * `light-dark(…)` collapses to the arm that palette's scheme selects.
 *
 * The caller passes the sheet's `AuthoredCssFile` (for ancestry — `rulesContaining` / `atRulesContaining`)
 * and the declaration FACTS for that same file. Nothing here reads a path or parses text.
 *
 * CUSTOM user themes are deliberately OUT OF SCOPE: they are runtime `<ThemeScope>` values clamped by
 * packages/ui/src/content/theme-scope/clamp.ts and swept by its own suite. This reads what WE ship.
 */
interface Sheet {
  readonly base: Map<string, string>;
  readonly seeds: Map<string, SeedDraft>;
  readonly arms: Map<string, Arm>;
}

/** File one declaration into the base map, a seed draft, or a conditional arm — the dispatch `placementOf`
 *  has already decided. A `color-scheme` reaching the base is dropped: Hearth's polarity is the `:root`
 *  declaration outside `@theme`, and the base map holds colours only. */
function fileDeclaration(sheet: Sheet, placement: Placement, property: string, value: string): void {
  if (placement.condition !== "") {
    const key = `${placement.root}${CONDITION_JOIN}${placement.condition}`;
    absorb(sheet.arms.get(key)?.draft ?? registerArm(sheet.arms, key, placement), property, value);
  } else if (placement.root === HEARTH) {
    if (property.startsWith(COLOR_PREFIX)) {
      sheet.base.set(property, value);
    }
  } else {
    absorb(draftFor(sheet.seeds, placement.root), property, value);
  }
}

export function readSeedPalettes(file: AuthoredCssFile, declarations: readonly CssDeclarationFact[]): readonly SeedPalette[] {
  const sheet: Sheet = { base: new Map<string, string>(), seeds: new Map<string, SeedDraft>(), arms: new Map<string, Arm>() };
  const { base, seeds, arms } = sheet;
  for (const declaration of declarations) {
    const placement = placementOf(file, declaration.offset);
    if (placement !== undefined) {
      fileDeclaration(sheet, placement, declaration.property, declaration.value);
    }
  }
  // A sheet with no unconditional `--color-*` in its `@theme` block resolves ZERO palettes, which is the
  // consumer's zero-palette blindness tripwire — the verdict the retired "no `@theme` block at all" arm
  // gave. A conditional-only base is deliberately on this side of the line: there is no arm the product
  // paints unconditionally, so the honest answer is "I could not measure", not a palette built from one
  // `@supports` branch.
  if (base.size === 0) {
    return [];
  }
  const palettes: SeedPalette[] = [{ name: HEARTH, scheme: "dark", vars: collapse(base, "dark") }];
  for (const [name, draft] of seeds) {
    // A seed with no `color-scheme` of its own inherits Hearth's polarity, which is the `:root` default.
    const scheme = draft.scheme ?? "dark";
    palettes.push({ name, scheme, vars: collapse(new Map([...base, ...draft.vars]), scheme) });
  }
  for (const [, arm] of arms) {
    const parent = arm.root === HEARTH ? undefined : seeds.get(arm.root);
    // AN ARM INHERITS ITS PALETTE'S POLARITY unless the conditional block declares its own: a
    // `@media (prefers-contrast: more)` inside a LIGHT seed is still light, and taking the base default
    // there would collapse every `light-dark()` value to the wrong arm — measured, and it is why
    // `SeedDraft.scheme` is optional rather than pre-filled.
    const scheme = arm.draft.scheme ?? parent?.scheme ?? "dark";
    palettes.push({
      name: `${arm.root} @ ${arm.condition}`,
      scheme,
      // The arm is the parent palette OVERRIDDEN, never the conditional block alone: a `@media` declaring
      // one token still paints every other token the palette carries. It composes the RAW maps and
      // collapses ONCE under the arm's own scheme — re-collapsing the parent's already-collapsed values
      // would silently freeze them on the parent's polarity.
      vars: collapse(new Map([...base, ...(parent?.vars ?? []), ...arm.draft.vars]), scheme),
    });
  }
  return palettes;
}

function registerArm(arms: Map<string, Arm>, key: string, placement: Placement): SeedDraft {
  const draft: SeedDraft = { scheme: undefined, vars: new Map<string, string>() };
  arms.set(key, { root: placement.root, condition: placement.condition, draft });
  return draft;
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
