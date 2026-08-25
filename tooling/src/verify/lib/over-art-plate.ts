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
 *  value that was never the plate's business. */
const ALPHA_SHAPE_RE = /transparent|color-mix\(|\/\s*[\d.]/u;
const CSS_GLOBS = ["packages/client/src/**/*.css", "packages/ui/src/**/*.css"] as const;
const BACKGROUND_PROPS: ReadonlySet<string> = new Set(["background", "background-color"]);

/** ONE `background-color` under a glass gate, classified. NOT exported (the `no-inline-types` type-home
 *  law): it is this reader's internal vocabulary, reachable through `Site.reading` where a caller needs it. */
type Reading =
  | { readonly kind: "plateless"; readonly tint: string }
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
  `Spell it as the house recipe (see the fix), or state why it is out of the population with \`${MARKER}: <reason>\`.`;

/** Sort one rule's sites into the three buckets the pairing needs, reporting the non-pairing arms. */
function collect(judged: Judgement, sites: readonly Site[], providers: Set<string>, pending: Site[]): void {
  for (const site of sites) {
    const { kind } = site.reading;
    if (kind === "provider" && site.wallpaperGated) {
      providers.add(subjectKey(site));
    } else if (kind === "plateless") {
      pending.push(site);
    } else if (site.reading.kind === "skip") {
      const { why } = site.reading;
      judged.skipped[why] = (judged.skipped[why] ?? 0) + 1;
    } else if (kind === "dark-arm-moved" || kind === "unreadable") {
      judged.findings.push({ file: site.rel, line: site.line, message: kind === "dark-arm-moved" ? DARK_ARM_MESSAGE : UNREADABLE_MESSAGE });
    }
  }
}

/** Every stylesheet this reader reads — the gate's own `ctx.scan` denominator, never a workspace file count. */
export function stylesheetsOf(root: string): readonly string[] {
  return CSS_GLOBS.flatMap((glob) => globSync(glob, { cwd: root })).sort((a, b) => a.localeCompare(b));
}

/** Scan every client/ui stylesheet and decide the whole population in one pass. */
export function judgeStylesheets(root: string): Judgement {
  const judged: Judgement = { findings: [], live: new Map(), skipped: {}, glassRules: 0 };
  const providers = new Set<string>();
  const pending: Site[] = [];
  const exempted = new Set<string>();
  for (const rel of stylesheetsOf(root)) {
    const rawText = readFileSync(join(root, rel), "utf8");
    for (const rule of parseCssRules(rawText)) {
      const sites = sitesOf(rel, rule);
      if (sites.length === 0) {
        continue;
      }
      judged.glassRules += 1;
      const plateless = sites.filter((s) => s.reading.kind === "plateless");
      for (const key of judgeMarkers(judged.findings, { rel, rule, rawText }, plateless)) {
        exempted.add(key);
      }
      collect(judged, sites, providers, pending);
    }
  }
  for (const site of pending) {
    const key = subjectKey(site);
    if (!(providers.has(key) || exempted.has(key))) {
      judged.live.set(key, site);
    }
  }
  return judged;
}
