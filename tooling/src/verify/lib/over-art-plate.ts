// The READER behind the `over-art-plate-arm` gate (UI-Theming-and-Content.md §12.1 / D144) — split out of
// the descriptor for the tooling 450-line cap. It classifies every `background(-color)` under an
// `html[data-blur-*]` gate and pairs each PLATELESS base with the `[data-has-bg-image]` rule that gives its
// (subject, tint) a `light-dark()` plate arm. It is deliberately CONSERVATIVE: what it cannot PROVE is in
// the population is a skip, never a finding.
//
// IT OWNS NO FILESYSTEM AND NO MARKER GRAMMAR ANY MORE (#1584 conversion). The stylesheets arrive already
// read and already parsed, as the `authored-css` resource the policy declares; and the two-sided
// `@over-art-plate-ok` vocabulary it used to judge is retired for `@orb-waive`, whose central engine owns
// malformed / stale / dead-position / over-broad reconciliation for every ordinary policy at once. What is
// left here is the one thing that is genuinely this policy's own: the plate ALGEBRA.
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import type { CssRule } from "./css-rules.ts";
import { callArguments, selectorSubject, splitSelectorListWithOffsets } from "./css-rules.ts";

const PLATE_VAR = "var(--color-reading-plate)";
export const WALLPAPER_GATE = "[data-has-bg-image]";
export const GLASS_GATE = "[data-blur-";
export const TRANSPARENT = "transparent";
const TINT_RE = /var\(\s*(--color-[a-z0-9-]+)\s*\)/u;
/** "this value is TRANSLUCENT-shaped" — the fence between an unreadable population member and an opaque
 *  value that was never the plate's business. `transparent` is NOT in it: an alpha of exactly zero is a
 *  READ value, not an unreadable one (`NO_FILL_RE` below). */
const ALPHA_SHAPE_RE = /color-mix\(|\/\s*[\d.]/u;
/** "this declaration paints NOTHING" — alpha exactly 0, by any spelling. `transparent` is the keyword,
 *  `none` is the shorthand's own way of saying it (`background: none` resets the layer AND leaves the
 *  colour at its initial `transparent`), and `rgba(…, 0)` / `rgb(… / 0)` / `oklch(… / 0)` are the numeric
 *  forms. THIS IS A DIFFERENT CLAIM FROM "unreadable" (#1171): "I paint no fill" is a measured fact the
 *  gate can act on and a marker can absolve, while "an alpha I cannot compute" is a missing measurement
 *  that must keep failing loud. Bucketing the first as the second is what made a correctly-placed
 *  `@over-art-plate-ok` marker RED a second time as STALE, with no in-CSS way to be green. */
const NO_FILL_RE = /^(?:transparent|none|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*(?:,\s*0(?:\.0+)?|\/\s*0(?:\.0+)?%?)\s*\))$/u;
const BACKGROUND_PROPS: ReadonlySet<string> = new Set(["background", "background-color"]);

/** ONE `background-color` under a glass gate, classified. NOT exported (the `no-inline-types` type-home
 *  law): it is this reader's internal vocabulary, reachable through `Site.reading` where a caller needs it. */
type Reading =
  | { readonly kind: "plateless"; readonly tint: string }
  | { readonly kind: "no-fill" }
  | { readonly kind: "provider"; readonly tint: string }
  | { readonly kind: "dark-arm-moved" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "skip"; readonly why: string };

function tintOf(mix: string): string | undefined {
  return TINT_RE.exec(mix)?.[1];
}

/** A `color-mix(…)` value → what it mixes ITS TINT over. */
function readMix(value: string): Reading {
  const args = callArguments(value, "color-mix");
  const last = args?.at(-1);
  const tint = tintOf(value);
  if (last === undefined || tint === undefined) {
    return { kind: "unreadable" };
  }
  if (last === TRANSPARENT) {
    return { kind: "plateless", tint };
  }
  if (last.includes(PLATE_VAR)) {
    return { kind: "dark-arm-moved" };
  }
  // A mix over some OTHER token: a token's alpha is not statically knowable, so this is "not proven to be
  // in the population" — a counted skip, because a false RED here blocks every lane's floor.
  return TINT_RE.test(last) ? { kind: "skip", why: "mix-partner-is-another-token" } : { kind: "unreadable" };
}

/** Classify one declaration value. A `light-dark()` is judged by its LIGHT arm — that is the arm the law
 *  governs — and its DARK arm must still be the plateless base verbatim (D144(d): the sacred dark rooms). */
function readBackground(value: string): Reading {
  const arms = callArguments(value, "light-dark");
  const light = arms?.[0];
  if (light === undefined) {
    if (value.startsWith("color-mix(")) {
      return readMix(value);
    }
    if (NO_FILL_RE.test(value)) {
      return { kind: "no-fill" };
    }
    return ALPHA_SHAPE_RE.test(value) ? { kind: "unreadable" } : { kind: "skip", why: "opaque-value" };
  }
  const lit = readMix(light);
  if (lit.kind !== "dark-arm-moved") {
    return lit;
  }
  const dark = readMix(arms?.[1] ?? "");
  const tint = tintOf(light) ?? "";
  return dark.kind === "plateless" && dark.tint === tint ? { kind: "provider", tint } : { kind: "dark-arm-moved" };
}

/** ONE glass declaration, keyed for pairing and for the ratchet.
 *  @public knip type-face false positive — a structural field of the exported `Judgement` shape (its
 *  `live` map's value), never referenced by its own name outside this file. */
export interface Site {
  readonly rel: string;
  /** 1-based line of the SUBJECT inside the rule's selector list — not of the declaration. A final ordinary
   *  policy's finding must point at a token that slices the authored text at its reported column, and the
   *  only text that spells a subject is the selector that names it. */
  readonly line: number;
  readonly column: number;
  readonly subject: string;
  readonly tint: string;
  readonly reading: Reading;
  readonly wallpaperGated: boolean;
}

/** 1-based line/column of an absolute offset. */
function positionOf(text: string, offset: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  return { line: before.split(/\r?\n/u).length, column: offset - before.lastIndexOf("\n") };
}

/** Where one selector's SUBJECT is spelled, in the raw stylesheet. The selector list's authored spans come
 *  from the parser; the subject is the last compound of one of them, so it is found inside that span. */
function subjectPosition(file: AuthoredCssFile, rule: CssRule, index: number, subject: string): { readonly line: number; readonly column: number } {
  // `preludeStart` is the offset after the PREVIOUS block, so it includes this rule's leading trivia — and a
  // waiver comment sitting there spells the very subject we are looking for. Searching the raw text from
  // there lands the finding INSIDE the marker that was meant to suppress it, which the engine rejects as
  // "points into comment trivia rather than authored code". Start at the end of the last comment instead.
  const trivia = file.text.lastIndexOf("*/", rule.braceStart);
  const selectorStart = Math.max(rule.preludeStart, trivia + "*/".length);
  const parts = splitSelectorListWithOffsets(file.text.slice(selectorStart, rule.braceStart));
  const from = selectorStart + (parts[index]?.offset ?? 0);
  const at = file.text.indexOf(subject, from);
  return positionOf(file.text, at === -1 ? from : at);
}

/** The ratchet subject and the pairing key: one FILE's one SUBJECT at one TINT. Line-independent, so a rule
 *  that simply moves does not churn the ledger. */
function subjectKey(site: Site): string {
  return `${site.rel}::${site.subject}::${site.tint}`;
}

/** Every glass `background(-color)` declaration of one rule — one Site per SELECTOR, because a two-selector
 *  rule styles two subjects and each owes its own plate arm. */
function sitesOf(file: AuthoredCssFile, rule: CssRule): Site[] {
  const out: Site[] = [];
  if (!rule.selectorList.includes(GLASS_GATE)) {
    return out;
  }
  for (const decl of rule.declarations.filter((d) => BACKGROUND_PROPS.has(d.prop))) {
    const reading = readBackground(decl.value);
    const tint = reading.kind === "plateless" || reading.kind === "provider" ? reading.tint : "";
    for (const [index, selector] of rule.selectors.entries()) {
      const subject = selectorSubject(selector);
      out.push({
        rel: file.path,
        ...subjectPosition(file, rule, index, subject),
        subject,
        tint,
        reading,
        wallpaperGated: selector.includes(WALLPAPER_GATE),
      });
    }
  }
  return out;
}

/** A report-on-sight finding, positioned on the SELECTOR SUBJECT it accuses. The position is the waiver
 *  POSITION too, which is why it is a subject and not a declaration: an ordinary finding's token must slice
 *  the authored text at its reported column.
 *  @public knip type-face false positive — a structural field of the exported `Judgement` shape (its
 *  `findings` field), never referenced by its own name outside this file. */
export interface CssFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token: string;
  readonly message: string;
}

/** The whole population, decided in one pass. `live` is the UNPAIRED, UNEXEMPTED set — the ratchet's subject. */
export interface Judgement {
  readonly findings: CssFinding[];
  readonly live: Map<string, Site>;
  glassRules: number;
}

/** The pseudo-element FILL CARRIERS this subject could have handed its paint to. A pane that paints no
 *  fill of its own because its `::before` carries the glass (#1154, `packages/client/src/styles/globals.css`)
 *  is not a plateless surface — the fill, and therefore the plate question, MOVED to the carrier, which
 *  this same reader judges on its own row. Proving that beats exempting it: the population shrinks by a
 *  measured fact rather than by a marker nobody re-checks. */
const PSEUDO_CARRIERS = ["::before", "::after"] as const;

function carriedByPseudo(site: Site, filled: ReadonlySet<string>): boolean {
  return PSEUDO_CARRIERS.some((pseudo) => filled.has(`${site.rel}::${site.subject}${pseudo}`));
}

const DARK_ARM_MESSAGE =
  "DARK ARM MOVED — the plate must be taken ONLY on the LIGHT arm of a `light-dark()` whose DARK arm " +
  `re-spells the plateless base verbatim. This either mixes over \`${PLATE_VAR}\` outside a light arm, or ` +
  "its dark arm is not the same tint mixed with `transparent` — either way the dark rooms move, and D144(d) " +
  "pins them.";

const UNREADABLE_MESSAGE =
  `UNREADABLE translucent background under a \`${GLASS_GATE}…]\` gate — this reader cannot prove whether it ` +
  'composites over the wallpaper, and a shape it cannot classify is "I could not measure", never clean. ' +
  "Spell it as the house recipe (see the fix). A WAIVER IS NOT THE ANSWER HERE (#1171): a marker declares a " +
  "site the reader HAS classified to be out of the population — it is not a way to silence a measurement " +
  "that failed, and a missing measurement stays loud.";

/** The two readings that are a finding on sight — a mapped Record rather than a chain, so a new `Reading`
 *  arm that belongs here is a tsc error at this table instead of a silent fall-through to nothing. */
const REPORT_ON_SIGHT: Readonly<Partial<Record<Reading["kind"], string>>> = {
  "dark-arm-moved": DARK_ARM_MESSAGE,
  unreadable: UNREADABLE_MESSAGE,
};

/** ONE site into the bucket the pairing needs. `plateless` and `no-fill` both go PENDING: they are the two
 *  shapes that owe a plate arm (a tint over `transparent`, and no fill at all), and both are settled at the
 *  end of the scan, where the whole file's subjects are known and a pseudo carrier can be proved. */
function classifyOne(judged: Judgement, site: Site, providers: Set<string>, pending: Site[]): void {
  const reading = site.reading;
  if (reading.kind === "provider") {
    if (site.wallpaperGated) {
      providers.add(subjectKey(site));
    }
    return;
  }
  if (reading.kind === "plateless" || reading.kind === "no-fill") {
    pending.push(site);
    return;
  }
  if (reading.kind === "skip") {
    return;
  }
  const message = REPORT_ON_SIGHT[reading.kind];
  if (message !== undefined) {
    judged.findings.push({ file: site.rel, line: site.line, column: site.column, token: site.subject, message });
  }
}

/** Sort one rule's sites into the buckets the pairing needs, reporting the non-pairing arms. */
function collect(judged: Judgement, sites: readonly Site[], providers: Set<string>, pending: Site[]): void {
  for (const site of sites) {
    classifyOne(judged, site, providers, pending);
  }
}

/** The unpaired, unexempted, uncarried remainder of `pending` — the ratchet's live subjects. Split out of
 *  `judgeStylesheets` so each half stays inside the complexity bound the tooling lints hold. */
function settlePending(
  judged: Judgement,
  pending: readonly Site[],
  resolved: { readonly providers: ReadonlySet<string>; readonly filled: ReadonlySet<string> },
): void {
  for (const site of pending) {
    const key = subjectKey(site);
    if (resolved.providers.has(key)) {
      continue;
    }
    if (site.reading.kind === "no-fill" && carriedByPseudo(site, resolved.filled)) {
      continue;
    }
    judged.live.set(key, site);
  }
}

/** Decide the whole authored-CSS population in one pass. The corpus arrives ALREADY READ AND PARSED — it is
 *  the `authored-css` resource the consuming policy declares, which is how this reader stopped owning a
 *  filesystem walk without losing a single stylesheet: `authored-css` is exactly every `.css` under
 *  `packages/client/src` and `packages/ui/src` (`ops/resource-tree.ts:84-107`), byte-identical to the two
 *  globs it replaced. */
export function judgeStylesheets(files: readonly AuthoredCssFile[]): Judgement {
  const judged: Judgement = { findings: [], live: new Map(), glassRules: 0 };
  const providers = new Set<string>();
  const pending: Site[] = [];
  /** Every `<file>::<subject>` that declares a background under a glass gate — the denominator the
   *  pseudo-carrier proof reads: a no-fill pane whose `::before` is in here handed its fill over. */
  const filled = new Set<string>();
  for (const file of files) {
    for (const rule of file.rules) {
      const sites = sitesOf(file, rule);
      if (sites.length === 0) {
        continue;
      }
      judged.glassRules += 1;
      for (const site of sites) {
        filled.add(`${site.rel}::${site.subject}`);
      }
      collect(judged, sites, providers, pending);
    }
  }
  settlePending(judged, pending, { providers, filled });
  return judged;
}
