// Gate: integer-line-boxes (docs/design/integer-line-boxes.md) — every line box resolves to INTEGER px at
// the 16px root; a fractional box walks baselines off the device-pixel grid under promoted layers.
// ARM T: leading.* tokens are snapped integer rem dimensions · ARM P: every class-borne text step pairs an
// in-vocabulary leading (Tailwind's unitless core leading scale is banned) · ARM C: stylesheet line-heights
// resolve only through the leading vocabulary · ARM B: the blindness floors. Comment posture: ARM P is
// AST-side via the static-class walker (comment-safe); ARM C reads parsed CSS declarations, and the parser
// blanks comment spans before parsing, so a commented-out rule is never judged.
//
// DECLARED LIMITS: the generated theme.css is the ONE emitter of the leading scale and is freshness-enforced
// by tests/ui/tokens, so it is carved out of ARM C rather than re-judged here (the `no-raw-color-in-css`
// precedent — an authoritative home is a population carve-out, never a waiver); box = font-size via
// leading-none is legal when the step is integer; the chat reading surface rides a waiver, below.
//
// FAMILY: `static-class-expression`, after the shared reader
// `lib/static-class-expression.ts#walkStaticClassExpressions`, with `rest-transform-grid` as the second
// member. ARM P — the pairing law, and the arm that has to see a class string composed through a `tv()`
// slot or a `cn()` call — could not be written without it.
//
// POPULATION PORT (legacy `a4206c511`), three halves:
//   · the AST half was `scanRoot: (path) => path.startsWith("packages/ui/src/") || path.startsWith("packages/client/src/")`
//     plus the same predicate re-applied to `ctx.files`; `{ in: ["@client", "@ui"] }` is exactly those two
//     roots, so the double filter collapses into the declaration. BYTE-IDENTICAL.
//   · the CSS half walked `packages/ui/src` + `packages/client/src` for `*.css` MINUS the generated
//     theme.css; `authored-css` is exactly those two trees (`ops/resource-tree.ts:84-107`) and the theme
//     carve-out is kept in the policy. BYTE-IDENTICAL.
//   · the token vault was a private `existsSync` + `JSON.parse` of `packages/ui/src/tokens/tokens.json`;
//     it is now the declared `json:tokens` resource, whose path is that exact file
//     (`contract/resource-json.ts`). BYTE-IDENTICAL SUBJECT, different refusal — see below.
//
// EXEMPTION-MECHANISM MOVE (guide §6.4's EXEMPTION-MECHANISM MOVE classification). The legacy `CSS_LINE_HEIGHT_EXEMPTIONS` table held ONE
// row, `packages/client/src/styles/globals.css::var(--reading-line-height)`, plus a hand-rolled two-sided
// STALE arm that reported at the gate's own source file. Both are retired: the site carries an
// `@orb-waive integer-line-boxes(--reading-line-height)` marker, and the central engine's dead-position
// alarm IS the stale arm — louder than the finding it replaces, and it can no longer report at a path
// outside the policy's own population. Census: 1 legacy row → 1 marker → 1 live consumed waiver, verified
// on the real tree (1 raw / 1 waived / 0 effective / 0 alarms).
//
// RETIRED BY THE RUNTIME, not dropped (guide §6.4): the legacy blindness reasons "tokens.json missing" and
// "zero stylesheets read", and the `readTypeScale` branch that returned `undefined` and silenced the whole
// gate on a mini-project. A missing, empty or unparseable declared resource now makes
// `resolveResourceDeclarations` (`lib/resource-declaration.ts:182`) THROW during the POPULATION phase, the
// owner is withheld and the run reports a TOOL ERROR — "this run is not a verdict" — instead of a finding
// or a silent clean. Those refusals are pinned in the family test through `runPolicyPass`, because guide
// §4.5b says no proof row can express them. This module owns no not-ready branch: it reads both declared
// resources through `readyResourceValue`, whose throw asserts the runtime's own refusal already held.
import type { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { CssDeclarationFact, CssFacts } from "../contract/resource-css.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const MESSAGE =
  "A line box off the integer-px grid (or a leading outside the token vocabulary) — fractional boxes walk " +
  "baselines off the device-pixel grid under promoted layers, which is the measured config-panel blur. " +
  "Leadings are fixed integer line boxes emitted as round(<rem>, 1px); see docs/design/integer-line-boxes.md.";
const FIX =
  "Pair every text-<step> with a leading-<step> from packages/ui/src/tokens/tokens.json (never Tailwind's " +
  "unitless core scale), author leading tokens as snapped integer-px rem dimensions, and let stylesheets " +
  "set line-height only through var(--leading-*). A deliberate stylesheet line-height is waived with " +
  "`/* @orb-waive integer-line-boxes(<position>): <reason> */` on the line above, where <position> is the " +
  "reported token: the custom-property NAME for a `var(--x)` value (`--reading-line-height`, never the " +
  "`var(…)` call — a position containing a paren is unwaivable by the marker grammar) and the literal " +
  "itself otherwise (`1.4`).";

const TOKENS_JSON_REL = "packages/ui/src/tokens/tokens.json";
const GENERATED_THEME_CSS = "packages/ui/src/styles/theme.css";
/** Real-tree anchor for ARM B: a whole-tree blindness claim is meaningless over a proof fixture, which
 *  holds only the files its row materializes. A live `@ui` module inside this policy's own population, so
 *  it is also a LEGAL finding anchor — the legacy descriptor reported ARM B at the gate's own source file,
 *  which no final policy may do. */
const REAL_TREE_ANCHOR = "packages/ui/src/lib/class-merge.ts";
const ROOT_REM_PX = 16;
const INTEGER_EPSILON = 1e-6;
/** Real-tree floors for the blindness tripwire: below these the census is blind, not clean. */
const MIN_TEXT_CANDIDATES = 40;
const MIN_DISTINCT_PAIRINGS = 6;

interface TypeScale {
  /** text step name → resolved px at the 16px root. */
  readonly textPx: ReadonlyMap<string, number>;
  /** leading name → box px at the 16px root; leading `none` maps to NaN (box = the paired font-size). */
  readonly leadingPx: ReadonlyMap<string, number>;
  readonly problems: readonly LeadingProblem[];
}

/** One ARM T defect, carrying the leading token NAME as well as its sentence. The name is the finding's
 *  waiver POSITION: an ordinary finding must point at a nonempty token that slices the authored text at its
 *  reported column, and a token vault's offending subject is the key, never the file. */
interface LeadingProblem {
  readonly name: string;
  readonly message: string;
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dimensionPx(value: JsonValue | undefined): number | undefined {
  if (!isRecord(value) || typeof value["value"] !== "number") {
    return;
  }
  if (value["unit"] === "rem") {
    return value["value"] * ROOT_REM_PX;
  }
  return value["unit"] === "px" ? value["value"] : undefined;
}

function outputKind(node: { readonly [key: string]: JsonValue }): string | undefined {
  const extensions = node["$extensions"];
  const output = isRecord(extensions) ? extensions["orb.output"] : undefined;
  const kind = isRecord(output) ? output["kind"] : undefined;
  return typeof kind === "string" ? kind : undefined;
}

function readLeadingToken(name: string, node: { readonly [key: string]: JsonValue }, out: { leading: Map<string, number>; problems: LeadingProblem[] }): void {
  if (name === "none") {
    if (node["$type"] !== "number" || node["$value"] !== 1) {
      out.problems.push({ name, message: "leading.none must stay the number 1 (box = the paired font-size)" });
      return;
    }
    out.leading.set(name, Number.NaN);
    return;
  }
  if (node["$type"] !== "dimension") {
    out.problems.push({
      name,
      message: `leading.${name} is not a dimension — unitless leading ratios are banned (a ratio times a fractional voice size is a fractional box)`,
    });
    return;
  }
  if (outputKind(node) !== "snapped") {
    out.problems.push({
      name,
      message: `leading.${name} lacks $extensions orb.output kind "snapped" — without the round(<rem>, 1px) belt the continuous --font-scale slider un-grids the box`,
    });
    return;
  }
  const px = dimensionPx(node["$value"]);
  if (px === undefined) {
    out.problems.push({ name, message: `leading.${name} has an unreadable dimension value` });
    return;
  }
  if (Math.abs(px - Math.round(px)) > INTEGER_EPSILON) {
    out.problems.push({ name, message: `leading.${name} resolves ${String(px)}px at the 16px root — fractional line box; author an integer` });
    return;
  }
  out.leading.set(name, px);
}

/** Parse the text/leading groups of the declared token vault. TOTAL: an absent, empty or unparseable vault
 *  never reaches here — that is the runtime's population-phase refusal, not this function's `undefined`. */
function readTypeScale(tokenVault: JsonValue): TypeScale {
  const problems: LeadingProblem[] = [];
  const textPx = new Map<string, number>();
  const leading = new Map<string, number>();
  const source = isRecord(tokenVault) ? tokenVault : {};
  const textGroup = isRecord(source["text"]) ? source["text"] : {};
  for (const [name, node] of Object.entries(textGroup)) {
    if (name.startsWith("$") || !isRecord(node)) {
      continue;
    }
    const px = dimensionPx(node["$value"]);
    if (px !== undefined) {
      textPx.set(name, px);
    }
  }
  const leadingGroup = isRecord(source["leading"]) ? source["leading"] : {};
  for (const [name, node] of Object.entries(leadingGroup)) {
    if (name.startsWith("$") || !isRecord(node)) {
      continue;
    }
    readLeadingToken(name, node, { leading, problems });
  }
  return { textPx, leadingPx: leading, problems };
}

interface ParseState {
  readonly stack: string[];
  quote: string;
  escaped: boolean;
}

function consumesQuoteOrEscape(state: ParseState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote.length > 0) {
    if (char === state.quote) {
      state.quote = "";
    }
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function consumesBracket(state: ParseState, char: string): boolean {
  const closes: Readonly<Record<string, string>> = { "]": "[", ")": "(", "}": "{" };
  if (char === "[" || char === "(" || char === "{") {
    state.stack.push(char);
    return true;
  }
  const open = closes[char];
  if (open === undefined) {
    return false;
  }
  if (state.stack.at(-1) === open) {
    state.stack.pop();
  }
  return true;
}

/** The BASE utility of one class token: variant prefixes stripped at top-level colons only (colons inside
 *  arbitrary selectors/functions are data — the no-tailwind-dark-variant splitter shape), `!` trimmed. */
function baseUtility(token: string): string {
  const state: ParseState = { stack: [], quote: "", escaped: false };
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index] ?? "";
    if (consumesQuoteOrEscape(state, char) || consumesBracket(state, char)) {
      continue;
    }
    if (char === ":" && state.stack.length === 0) {
      start = index + 1;
    }
  }
  return token.slice(start).replace(/^!/u, "").replace(/!$/u, "");
}

interface ClassToken {
  readonly raw: string;
  readonly base: string;
  readonly offset: number;
}

function classTokens(value: string): ClassToken[] {
  const tokens: ClassToken[] = [];
  const wordRe = /\S+/gu;
  let match = wordRe.exec(value);
  while (match !== null) {
    tokens.push({ raw: match[0], base: baseUtility(match[0]), offset: match.index });
    match = wordRe.exec(value);
  }
  return tokens;
}

interface AnchoredToken {
  readonly node: Node;
  readonly offset: number;
  readonly token: string;
}

function sourceToken(segments: readonly StaticClassSegment[], valueOffset: number, token: string): AnchoredToken | undefined {
  const segment = segments.find((part) => valueOffset >= part.valueStart && valueOffset < part.valueEnd) ?? segments[0];
  if (segment === undefined) {
    return;
  }
  return { node: segment.node, offset: segment.sourceStart + Math.max(0, valueOffset - segment.valueStart) - segment.node.getStart(), token };
}

const LEADING_UTILITY_PREFIX = "leading-";
const TEXT_UTILITY_PREFIX = "text-";
const LEADING_VAR_RE = /^var\(--leading-([a-z-]+)\)$/u;
const TIER_LEADING_VAR_RE = /^var\(--orb-tier-[a-z-]+-leading\)$/u;
const LEADING_DEF_RE = /^--leading-[a-z-]+$/u;
const TIER_LEADING_DEF_RE = /^--orb-tier-[a-z-]+-leading$/u;
/** A value that is exactly ONE `var(--name)` reference — its waiver POSITION is the NAME, never the call:
 *  the marker grammar's position group is `[^()\r\n]+`, so a reported `var(--reading-line-height)` would be
 *  a finding with no door at all. */
const SINGLE_VAR_RE = /^var\(\s*(--[a-z0-9-]+)\s*\)$/u;

/** 1-based line/column of an absolute offset in a stylesheet. */
function positionOf(text: string, offset: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") };
}

/** WHERE a declaration's value finding anchors, and with WHAT token — the two are one decision, because an
 *  ordinary finding's token must slice the source at its reported column. A `var(--x)` value anchors on the
 *  NAME inside the call; anything else anchors on the first character of the value. */
function valueFinding(text: string, declaration: CssDeclarationFact): { readonly line: number; readonly column: number; readonly token: string } {
  const name = SINGLE_VAR_RE.exec(declaration.value)?.[1];
  const token = name ?? declaration.value;
  const colon = text.indexOf(":", declaration.offset);
  const at = text.indexOf(token, colon === -1 ? declaration.offset : colon);
  if (at === -1) {
    throw new Error(`CSS declaration value has no exact authored position: ${declaration.value}`);
  }
  return { ...positionOf(text, at), token };
}

/** WHERE an ARM T finding anchors: on the offending leading token's KEY inside the vault's `leading` group.
 *  The vault is read twice on purpose and both reads are declared — `json:tokens` for the parsed value the
 *  arithmetic judges, and `authored-text` for the bytes a POSITION needs. An ordinary finding's token must
 *  slice the authored text at its reported column, so a parsed value alone cannot produce a waivable
 *  finding, and a finding pinned at line 1 column 1 with no token ALARMS
 *  (`has no nonempty position token for waiver binding`) rather than reporting. */
function leadingKeyPosition(text: string, name: string): { readonly line: number; readonly column: number; readonly token: string } {
  const group = text.indexOf('"leading"');
  const key = text.indexOf(`"${name}"`, group === -1 ? 0 : group);
  if (key === -1) {
    throw new Error(`token vault has no authored position for leading.${name}`);
  }
  return { ...positionOf(text, key + 1), token: name };
}

interface CssScan {
  readonly ctx: GatePolicyContext;
  readonly text: string;
  readonly scale: TypeScale;
}

/** ARM C. One declaration of one authored stylesheet: a `line-height` must resolve through the leading
 *  vocabulary (directly, or through the tiers.css alias indirection); a hand-authored `--leading-*`
 *  definition shadows the generated scale and is never legal; a `--orb-tier-*-leading` alias must point at
 *  an in-vocabulary leading. */
function judgeCssDeclaration(scan: CssScan, declaration: CssDeclarationFact): void {
  const report = (): void => scan.ctx.report.file(declaration.file, valueFinding(scan.text, declaration));
  if (LEADING_DEF_RE.test(declaration.property)) {
    scan.ctx.report.file(declaration.file, { ...positionOf(scan.text, declaration.offset), token: declaration.property });
    return;
  }
  if (TIER_LEADING_DEF_RE.test(declaration.property)) {
    const aliased = LEADING_VAR_RE.exec(declaration.value)?.[1];
    if (aliased === undefined || !scan.scale.leadingPx.has(aliased)) {
      report();
    }
    return;
  }
  if (declaration.property !== "line-height") {
    return;
  }
  const leadingName = LEADING_VAR_RE.exec(declaration.value)?.[1];
  const inVocabulary = leadingName !== undefined && scan.scale.leadingPx.has(leadingName);
  if (!(inVocabulary || TIER_LEADING_VAR_RE.test(declaration.value))) {
    report();
  }
}

/** ARM C over the whole authored corpus, MINUS the generated theme — the ONE emitter of the leading scale,
 *  freshness-enforced by tests/ui/tokens, and an authoritative home is a population carve-out rather than a
 *  waiver (the `no-raw-color-in-css` precedent). */
function judgeStylesheets(ctx: GatePolicyContext, inventory: CssFacts, scale: TypeScale): void {
  const declarationsByFile = Map.groupBy(inventory.declarations, (declaration) => declaration.file);
  for (const file of inventory.files) {
    if (file.path === GENERATED_THEME_CSS) {
      continue;
    }
    for (const declaration of declarationsByFile.get(file.path) ?? []) {
      judgeCssDeclaration({ ctx, text: file.text, scale }, declaration);
    }
  }
}

interface PairingCensus {
  textCandidates: number;
  readonly distinctPairs: Set<string>;
}

interface CandidateScan {
  readonly ctx: GatePolicyContext;
  readonly scale: TypeScale;
  readonly census: PairingCensus;
  readonly segments: readonly StaticClassSegment[];
}

function reportAnchored(scan: CandidateScan, token: ClassToken): void {
  // Anchor on the BASE utility: a variant-prefixed `sm:leading-tight` has its base three characters in, and
  // a finding whose token does not slice the source at its reported offset is an `[evaluate]` TOOL ERROR.
  const baseAt = token.raw.indexOf(token.base);
  const anchored = sourceToken(scan.segments, token.offset + Math.max(0, baseAt), token.base);
  if (anchored !== undefined) {
    scan.ctx.report.node(anchored.node, { token: anchored.token, offset: anchored.offset });
  }
}

function judgePairs(scan: CandidateScan, textSteps: readonly ClassToken[], leadings: readonly ClassToken[]): void {
  for (const text of textSteps) {
    const fontPx = scan.scale.textPx.get(text.base.slice(TEXT_UTILITY_PREFIX.length)) ?? Number.NaN;
    for (const leading of leadings) {
      const leadingName = leading.base.slice(LEADING_UTILITY_PREFIX.length);
      if (!scan.scale.leadingPx.has(leadingName)) {
        continue;
      }
      const declared = scan.scale.leadingPx.get(leadingName) ?? Number.NaN;
      const boxPx = Number.isNaN(declared) ? fontPx : declared;
      scan.census.distinctPairs.add(`${text.base}|${leading.base}`);
      if (Math.abs(boxPx - Math.round(boxPx)) > INTEGER_EPSILON || boxPx + INTEGER_EPSILON < fontPx) {
        reportAnchored(scan, leading);
      }
    }
  }
}

function judgeCandidate(scan: CandidateScan, value: string): void {
  const tokens = classTokens(value);
  const textSteps = tokens.filter((token) => token.base.startsWith(TEXT_UTILITY_PREFIX) && scan.scale.textPx.has(token.base.slice(TEXT_UTILITY_PREFIX.length)));
  const leadings = tokens.filter((token) => token.base.startsWith(LEADING_UTILITY_PREFIX));
  for (const token of leadings) {
    if (!scan.scale.leadingPx.has(token.base.slice(LEADING_UTILITY_PREFIX.length))) {
      reportAnchored(scan, token);
    }
  }
  const first = textSteps[0];
  if (first === undefined) {
    return;
  }
  scan.census.textCandidates += 1;
  if (leadings.length === 0) {
    reportAnchored(scan, first);
    return;
  }
  judgePairs(scan, textSteps, leadings);
}

interface BlindnessInputs {
  readonly roots: number;
  readonly census: PairingCensus;
}

/** ARM B. Anchored on a file inside this policy's own population, and only when that file is actually
 *  loaded. The legacy "tokens.json missing" and "zero stylesheets read" reasons are gone: both are now
 *  population-phase REFUSALS of a declared resource, which outrank a finding. */
function reportBlindness(ctx: GatePolicyContext, inputs: BlindnessInputs): void {
  const blind: string[] = [];
  if (inputs.roots === 0) {
    blind.push("static class-expression derivation returned zero carrier roots");
  }
  if (inputs.census.textCandidates < MIN_TEXT_CANDIDATES || inputs.census.distinctPairs.size < MIN_DISTINCT_PAIRINGS) {
    blind.push(
      `pairing census below the real-tree floor (${String(inputs.census.textCandidates)} text candidates, ${String(inputs.census.distinctPairs.size)} distinct pairings)`,
    );
  }
  for (const reason of blind) {
    ctx.report.file(REAL_TREE_ANCHOR, {
      line: 1,
      column: 1,
      message: `${reason} — the integer-line-box census is blind, not clean (tooling/src/verify/gates/integer-line-boxes.ts)`,
    });
  }
}

/** Every proof row spreads this. `authored-css` is assembled from the `client-source` AND `ui-source` trees
 *  (`ops/resource-tree.ts:84-107`), so a row leaving either tree empty comes back a `[population]` TOOL
 *  ERROR rather than a finding and proves nothing about its arm; `json:tokens` refuses the same way when
 *  the vault is absent. Neither member carries a text step, a leading or a line-height, so neither can mask
 *  or manufacture a row's verdict. */
const SNAPPED_SCALE = JSON.stringify({
  text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
  leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
});
const CORPUS = {
  "packages/client/src/styles/keep.css": ".keep {\n  color: var(--color-foreground);\n}\n",
  "packages/ui/src/keep.tsx": "export const Keep = () => null;\n",
  [TOKENS_JSON_REL]: SNAPPED_SCALE,
} as const;

function vault(text: string): Readonly<Record<string, string>> {
  return { ...CORPUS, [TOKENS_JSON_REL]: text };
}

export const gate = defineGate({
  id: "integer-line-boxes",
  family: "static-class-expression",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-css" }, { kind: "json", id: "tokens" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const scale = readTypeScale(readyResourceValue(ctx.resources.json("tokens")).value);
      const inventory = readyResourceValue(ctx.resources.cssInventory("authored"));
      const vaultText = readyResourceValue(ctx.resources.authoredText([TOKENS_JSON_REL])).files.find(({ path }) => path === TOKENS_JSON_REL);
      if (vaultText === undefined) {
        throw new Error(`token vault text was not served for ${TOKENS_JSON_REL}`);
      }
      for (const problem of scale.problems) {
        ctx.report.file(TOKENS_JSON_REL, {
          ...leadingKeyPosition(vaultText.text, problem.name),
          message: `${problem.message} (docs/design/integer-line-boxes.md)`,
        });
      }
      const walked = walkStaticClassExpressions(ctx.files);
      const census: PairingCensus = { textCandidates: 0, distinctPairs: new Set() };
      for (const candidate of walked.candidates) {
        judgeCandidate({ ctx, scale, census, segments: candidate.segments }, candidate.value);
      }
      for (const unresolved of walked.unresolved) {
        ctx.report.node(unresolved.node, { message: `${MESSAGE} (class expression unresolved: ${unresolved.reason})` });
      }
      judgeStylesheets(ctx, inventory, scale);
      if (ctx.files.some((source) => ctx.relativePath(source) === REAL_TREE_ANCHOR)) {
        reportBlindness(ctx, { roots: walked.roots, census });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: vault(
        JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1.015_625, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
      ),
      expect: { count: 1, messageIncludes: "16.25px" },
      why: "ARM T, the founding defect: leading.label at 16.25px was the measured config-panel blur — a fractional authored box must be unshippable, and the message names the resolved px so the author does not have to redo the arithmetic",
    },
    {
      mode: "resource",
      files: vault(JSON.stringify({ text: {}, leading: { label: { $type: "number", $value: 1.25 } } })),
      expect: { count: 1, messageIncludes: "unitless" },
      why: "ARM T: a unitless leading ratio times a fractional voice size is fractional by construction — the old scale's exact shape",
    },
    {
      mode: "resource",
      files: vault(JSON.stringify({ text: {}, leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" } } } })),
      expect: { count: 1, messageIncludes: "snapped" },
      why: "ARM T: an unsnapped dimension is integer only at quarter-scale roots — the belt is part of the contract, not an option",
    },
    {
      mode: "resource",
      files: vault(JSON.stringify({ text: {}, leading: { none: { $type: "number", $value: 1.25 } } })),
      expect: { count: 1, messageIncludes: "leading.none must stay the number 1" },
      why: "ARM T's `none` arm, which is a DIFFERENT rule from the unitless ban beside it: `none` is the one leading that is legally a number, and its only legal number is 1. The `messageIncludes` is what discriminates it — under a bare count it would pass identically against the unitless arm",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-tight" />;\n',
      },
      expect: { count: 1, token: "leading-tight" },
      why: "ARM P: Tailwind's unitless core leading scale re-opens the fractional-box hole the token re-authoring closed",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="sm:leading-tight" />;\n',
      },
      expect: { count: 1, token: "leading-tight" },
      why: "ARM P, the VARIANT-PREFIX anchoring row: the finding's token must slice the source at its reported column, so a prefixed token has to anchor on its BASE three characters in. Report the whole token's offset and this row becomes an `[evaluate]` tool error rather than a finding",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="p-4 text-label" />;\n',
      },
      expect: { count: 1, token: "text-label" },
      why: "ARM P: an unpaired text step inherits the ancestor RATIO (preflight 1.5), which re-computes fractional per font-size",
    },
    {
      mode: "resource",
      files: {
        ...vault(
          JSON.stringify({
            text: { body: { $type: "dimension", $value: { value: 0.9375, unit: "rem" } } },
            leading: { micro: { $type: "dimension", $value: { value: 0.8125, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
          }),
        ),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-body leading-micro" />;\n',
      },
      expect: { count: 1, token: "leading-micro" },
      why: "ARM P: a box below its font size clips glyphs — the mispairing guard fixed boxes make possible",
    },
    {
      mode: "resource",
      files: {
        ...vault(
          JSON.stringify({
            text: { micro: { $type: "dimension", $value: { value: 0.656_25, unit: "rem" } } },
            leading: { none: { $type: "number", $value: 1 } },
          }),
        ),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-micro leading-none" />;\n',
      },
      expect: { count: 1, token: "leading-none" },
      why: "ARM P: leading-none makes the box the font-size — legal only when that size is integer, and 10.5px is not",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/tv.ts": 'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "px-2 text-label" } });\n',
      },
      expect: { count: 1, token: "text-label" },
      why: "ARM P: tv slot strings are class carriers — the pairing law must reach composed variants, not only JSX. This is the row the FAMILY rests on: nothing but `walkStaticClassExpressions` sees a class string that never appears in a className attribute",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css": ".x {\n  line-height: 1.4;\n}\n",
      },
      expect: { count: 1, line: 2, token: "1.4" },
      why: "ARM C: a literal stylesheet line-height bypasses the vocabulary — the exact shape the six-CSS-homes law exists to fence",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css": ":root {\n  --leading-custom: 1.2;\n}\n",
      },
      expect: { count: 1, line: 2, token: "--leading-custom" },
      why: "ARM C: a hand-defined --leading-* shadows the generated scale — theme.css is the one emitter",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css": "[data-surface-tier] .b {\n  --orb-tier-row-title-leading: var(--leading-nope);\n}\n",
      },
      expect: { count: 1, line: 2, token: "--leading-nope" },
      why: "ARM C's ALIAS arm: the tiers.css indirection is only as good as what it points at, so an alias naming a leading outside the vocabulary is the same defect one hop out. The token is the NAME, not the `var(…)` call, because a position containing a paren has no waiver door",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-label" />;\n',
      },
      why: "the sanctioned pairing: a fractional voice size under an integer fixed box is exactly the design",
    },
    {
      mode: "resource",
      files: {
        ...vault(
          JSON.stringify({
            text: { title: { $type: "dimension", $value: { value: 1, unit: "rem" } } },
            leading: { none: { $type: "number", $value: 1 } },
          }),
        ),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-title leading-none" />;\n',
      },
      why: "declared limit: box = font-size via leading-none is legal when the step is integer (16px)",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.ts": 'export const copy = "set text-label somewhere";\n',
      },
      why: "a plain string never consumed by a class carrier is prose, not a candidate — no false positive",
    },
    {
      mode: "resource",
      files: vault(
        JSON.stringify({
          text: { $type: "dimension", $description: "the voice sizes", label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: {
            $type: "dimension",
            $description: "the fixed line boxes",
            label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } },
          },
        }),
      ),
      why: "NARROWING ROW for the two `$`-key skips, and the reason they are not decoration: DTCG groups carry their own `$type`/`$description` beside their members, so a scan that reads every key judges `$description` as a leading token and REDs the vault for having documentation. Cut either skip and this row goes red — measured with the `isRecord` sibling cut too, because two fences guarding one subject are individually uncuttable and have to be cut together before either can be called unenforced",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css":
          ".a {\n  line-height: var(--leading-label);\n}\n[data-surface-tier] .b {\n  --orb-tier-row-title-leading: var(--leading-label);\n  line-height: var(--orb-tier-row-title-leading);\n}\n",
      },
      why: "the vocabulary forms: a direct leading var and the tiers.css alias indirection are the two sanctioned spellings",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="p-4 leading-label" />;\n',
      },
      why: "a leading-only string (a variant arm raising the box over a base slot) carries no text step and passes",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/theme.css": ":root {\n  --leading-label: round(1rem, 1px);\n  line-height: 1.5;\n}\n",
      },
      why: "NARROWING ROW for the generated-theme carve-out, which is the ONE authoritative emitter of the leading scale: the same two declarations REDden twice in any other stylesheet (`mustFlag`'s literal and `--leading-*` rows are exactly them). Cut the carve-out and this row goes red — that is what makes the carve-out a measured fence rather than a courtesy",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/commented.css": "/* .old {\n  line-height: 1.4;\n} */\n.x {\n  line-height: var(--leading-label);\n}\n",
      },
      why: "COMMENT POSTURE (issue #117): a commented-out literal line-height is prose. The parser blanks comment spans before parsing, so the declaration never enters the inventory at all",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/waived.css":
          ".reading {\n  /* @orb-waive integer-line-boxes(--reading-line-height): the chat reading surface is the user-owned CONTINUOUS multiplier. */\n  line-height: var(--reading-line-height);\n}\n",
      },
      why: "§4.2 IDENTITY, on the exact site whose legacy CSS_LINE_HEIGHT_EXEMPTIONS row this marker replaced (`packages/client/src/styles/globals.css:712`): the correct ordinary waiver at the reported position suppresses the one finding its `mustFlag` twin produces. The position is the NAME because the value is a single `var(…)` call and a paren cannot appear in a marker position",
    },
  ],
});
