// The READER behind the `over-art-plate-arm` gate (UI-Theming-and-Content.md §12.1 / D144) — split out of
// the descriptor for the tooling 450-line cap. It classifies every `background(-color)` under an
// `html[data-blur-*]` gate, pairs each PLATELESS base with the `[data-has-bg-image]` rule that gives its
// (subject, tint) a `light-dark()` plate arm, and judges the two-sided `@over-art-plate-ok` marker. It is
// deliberately CONSERVATIVE: what it cannot PROVE is in the population is a counted skip, never a finding.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CssRule } from "./css-rules.ts";
import { callArguments, parseCssRules, selectorSubject } from "./css-rules.ts";

const PLATE_VAR = "var(--color-reading-plate)";
export const WALLPAPER_GATE = "[data-has-bg-image]";
export const GLASS_GATE = "[data-blur-";
export const TRANSPARENT = "transparent";
const MARKER = "@over-art-plate-ok";
const MARKER_GRAMMAR = `${MARKER}(<selector subject>)?: <reason>`;
/** `@over-art-plate-ok(<subject>)?: <reason>` — the position is optional, the reason never is (§4 rule 3). */
const MARKER_RE = /@over-art-plate-ok(?<pos>\([^)]*\))?(?<colon>\s*:)?(?<reason>[^*\n]*)/gu;
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
const CSS_GLOBS = ["packages/client/src/**/*.css", "packages/ui/src/**/*.css"] as const;
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
  readonly line: number;
  readonly subject: string;
  readonly tint: string;
  readonly reading: Reading;
  readonly wallpaperGated: boolean;
}

/** The ratchet subject and the pairing key: one FILE's one SUBJECT at one TINT. Line-independent, so a rule
 *  that simply moves does not churn the ledger. */
function subjectKey(site: Site): string {
  return `${site.rel}::${site.subject}::${site.tint}`;
}

/** Every glass `background(-color)` declaration of one rule — one Site per SELECTOR, because a two-selector
 *  rule styles two subjects and each owes its own plate arm. */
function sitesOf(rel: string, rule: CssRule): Site[] {
  const out: Site[] = [];
  if (!rule.selectorList.includes(GLASS_GATE)) {
    return out;
  }
  for (const decl of rule.declarations.filter((d) => BACKGROUND_PROPS.has(d.prop))) {
    const reading = readBackground(decl.value);
    const tint = reading.kind === "plateless" || reading.kind === "provider" ? reading.tint : "";
    for (const selector of rule.selectors) {
      out.push({ rel, line: decl.line, subject: selectorSubject(selector), tint, reading, wallpaperGated: selector.includes(WALLPAPER_GATE) });
    }
  }
  return out;
}

interface Marker {
  readonly position: string | null;
  readonly malformed: boolean;
}

/** The `@over-art-plate-ok` markers attached to one rule — read from the RAW bytes between the previous
 *  block and this rule's `{`, so they are BLOCK-SCOPED by construction (§4 rule 3b: a marker can never leak
 *  onto the next rule). Comments-INTENDED: the marker IS a comment, which is why this reads raw text while
 *  the value scan reads the blanked text at the same offsets. */
function markersFor(rawText: string, rule: CssRule): readonly Marker[] {
  const region = rawText.slice(rule.preludeStart, rule.braceStart);
  const out: Marker[] = [];
  MARKER_RE.lastIndex = 0;
  for (const match of region.matchAll(MARKER_RE)) {
    const groups = match.groups ?? {};
    const pos = groups["pos"];
    const position = pos === undefined ? null : pos.slice(1, -1).trim();
    out.push({ position, malformed: groups["colon"] === undefined || (groups["reason"] ?? "").trim() === "" || position === "" });
  }
  return out;
}

/** A file-level finding — exactly the `Finding` fields a stylesheet can carry (no node, so column 0).
 *  @public knip type-face false positive — a structural field of the exported `Judgement` shape (its
 *  `findings` field), never referenced by its own name outside this file. */
export interface CssFinding {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/** The whole population, decided in one pass. `live` is the UNPAIRED, UNEXEMPTED set — the ratchet's subject. */
export interface Judgement {
  readonly findings: CssFinding[];
  readonly live: Map<string, Site>;
  readonly skipped: Record<string, number>;
  glassRules: number;
}

/** The pseudo-element FILL CARRIERS this subject could have handed its paint to. A pane that paints no
 *  fill of its own because its `::before` carries the glass (#1154, `packages/client/src/styles/globals.css`)
 *  is not a plateless surface — the fill, and therefore the plate question, MOVED to the carrier, which
 *  this same reader judges on its own row. Proving that beats exempting it: the population shrinks by a
 *  measured fact rather than by a marker nobody re-checks. */
const PSEUDO_CARRIERS = ["::before", "::after"] as const;

/** The counted-skip label for a no-fill whose paint provably moved to its own pseudo carrier. */
const CARRIED_SKIP = "fill-moved-to-pseudo-carrier";

function countSkip(judged: Judgement, why: string): void {
  judged.skipped[why] = (judged.skipped[why] ?? 0) + 1;
}

function carriedByPseudo(site: Site, filled: ReadonlySet<string>): boolean {
  return PSEUDO_CARRIERS.some((pseudo) => filled.has(`${site.rel}::${site.subject}${pseudo}`));
}

function markerProblem(marker: Marker, plateless: readonly Site[]): string | null {
  if (marker.malformed) {
    return `MALFORMED \`${MARKER}\` marker — the grammar is \`${MARKER_GRAMMAR}\` and the REASON is required (GATE-AUTHORING.md §4 rule 3). A marker that exempts nothing must not sit there looking like protection.`;
  }
  if (marker.position === null && plateless.length > 1) {
    return `OVER-EXEMPTING \`${MARKER}\` marker — this rule styles ${plateless.length} subjects (${plateless.map((s) => s.subject).join(", ")}) and an unpositioned marker absolves all of them. Name the position: \`${MARKER_GRAMMAR}\` (GATE-AUTHORING.md §4 rule 3a).`;
  }
  if (!plateless.some((s) => marker.position === null || s.subject === marker.position)) {
    const named = marker.position === null ? "" : ` (no subject \`${marker.position}\` here)`;
    return `STALE \`${MARKER}\` marker — it exempts nothing on this rule${named}. A stale exemption is a loaded gun: the next violation written here inherits a permit nobody granted it. Delete it (GATE-AUTHORING.md §4 rule 4).`;
  }
  return null;
}

/** One rule's markers → the keys they exempt, plus the two-sided arms (malformed · over-exempting · stale). */
function judgeMarkers(
  out: CssFinding[],
  scope: { readonly rel: string; readonly rule: CssRule; readonly rawText: string },
  plateless: readonly Site[],
): ReadonlySet<string> {
  const exempted = new Set<string>();
  for (const marker of markersFor(scope.rawText, scope.rule)) {
    const problem = markerProblem(marker, plateless);
    if (problem === null) {
      for (const target of plateless.filter((s) => marker.position === null || s.subject === marker.position)) {
        exempted.add(subjectKey(target));
      }
    } else {
      out.push({ file: scope.rel, line: scope.rule.line, message: problem });
    }
  }
  return exempted;
}

const DARK_ARM_MESSAGE =
  "DARK ARM MOVED — the plate must be taken ONLY on the LIGHT arm of a `light-dark()` whose DARK arm " +
  `re-spells the plateless base verbatim. This either mixes over \`${PLATE_VAR}\` outside a light arm, or ` +
  "its dark arm is not the same tint mixed with `transparent` — either way the dark rooms move, and D144(d) " +
  "pins them.";

const UNREADABLE_MESSAGE =
  `UNREADABLE translucent background under a \`${GLASS_GATE}…]\` gate — this reader cannot prove whether it ` +
  'composites over the wallpaper, and a shape it cannot classify is "I could not measure", never clean. ' +
  `Spell it as the house recipe (see the fix). THE MARKER CANNOT ABSOLVE THIS (#1171): \`${MARKER}\` names a ` +
  "site the reader HAS classified and declares it out of the population — it is not a way to silence a " +
  "measurement that failed, and a missing measurement stays loud.";

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
    countSkip(judged, reading.why);
    return;
  }
  const message = REPORT_ON_SIGHT[reading.kind];
  if (message !== undefined) {
    judged.findings.push({ file: site.rel, line: site.line, message });
  }
}

/** Sort one rule's sites into the buckets the pairing needs, reporting the non-pairing arms. */
function collect(judged: Judgement, sites: readonly Site[], providers: Set<string>, pending: Site[]): void {
  for (const site of sites) {
    classifyOne(judged, site, providers, pending);
  }
}

/** Every stylesheet this reader reads — the gate's own `ctx.scan` denominator, never a workspace file count. */
export function stylesheetsOf(root: string): readonly string[] {
  return CSS_GLOBS.flatMap((glob) => globSync(glob, { cwd: root })).sort((a, b) => a.localeCompare(b));
}

/** The unpaired, unexempted, uncarried remainder of `pending` — the ratchet's live subjects. Split out of
 *  `judgeStylesheets` so each half stays inside the complexity bound the tooling lints hold. */
function settlePending(
  judged: Judgement,
  pending: readonly Site[],
  resolved: { readonly providers: ReadonlySet<string>; readonly exempted: ReadonlySet<string>; readonly filled: ReadonlySet<string> },
): void {
  for (const site of pending) {
    const key = subjectKey(site);
    if (resolved.providers.has(key) || resolved.exempted.has(key)) {
      continue;
    }
    if (site.reading.kind === "no-fill" && carriedByPseudo(site, resolved.filled)) {
      countSkip(judged, CARRIED_SKIP);
      continue;
    }
    judged.live.set(key, site);
  }
}

/** Scan every client/ui stylesheet and decide the whole population in one pass. */
export function judgeStylesheets(root: string): Judgement {
  const judged: Judgement = { findings: [], live: new Map(), skipped: {}, glassRules: 0 };
  const providers = new Set<string>();
  const pending: Site[] = [];
  const exempted = new Set<string>();
  /** Every `<file>::<subject>` that declares a background under a glass gate — the denominator the
   *  pseudo-carrier proof reads: a no-fill pane whose `::before` is in here handed its fill over. */
  const filled = new Set<string>();
  for (const rel of stylesheetsOf(root)) {
    const rawText = readFileSync(join(root, rel), "utf8");
    for (const rule of parseCssRules(rawText)) {
      const sites = sitesOf(rel, rule);
      if (sites.length === 0) {
        continue;
      }
      judged.glassRules += 1;
      // THE MARKER ABSOLVES EXACTLY WHAT THE READER CLASSIFIED AS OWING A PLATE (#1171) — the plateless
      // mixes AND the no-fill carriers. Before, `no-fill` sites were bucketed unreadable, so a marker
      // written on one exempted nothing and REDded a second time as STALE while the finding's own fix text
      // prescribed it: there was no legal way to be green.
      const exemptable = sites.filter((s) => s.reading.kind === "plateless" || s.reading.kind === "no-fill");
      for (const key of judgeMarkers(judged.findings, { rel, rule, rawText }, exemptable)) {
        exempted.add(key);
      }
      for (const site of sites) {
        filled.add(`${site.rel}::${site.subject}`);
      }
      collect(judged, sites, providers, pending);
    }
  }
  settlePending(judged, pending, { providers, exempted, filled });
  return judged;
}
