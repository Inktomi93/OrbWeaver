// Token arithmetic and semantic text/leading pairing; native Stylelint owns stylesheet line heights.
// The shared static-class fact retains composed/aliased candidates and fail-closed unresolved classes.
// Whole-population root and pairing floors remain independent of the CSS lint stage.
import type { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";

const MESSAGE =
  "A line box off the integer-px grid (or a leading outside the token vocabulary) — fractional boxes walk " +
  "baselines off the device-pixel grid under promoted layers, which is the measured config-panel blur. " +
  "Leadings are fixed integer line boxes emitted as round(<rem>, 1px); see docs/law/integer-line-boxes.md.";
const FIX =
  "Pair every text-<step> with a leading-<step> from packages/ui/src/tokens/tokens.json (never Tailwind's " +
  "unitless core scale), author leading AND spacing tokens as snapped integer-px rem dimensions — including " +
  "a spacing token's orb.pointerFine override, which rides the same belt. A deliberate class exception " +
  "requires `@orb-waive integer-line-boxes(<reported utility>): <reason>` above its source carrier.";

const TOKENS_JSON_REL = "packages/ui/src/tokens/tokens.json";
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
  readonly problems: readonly TokenProblem[];
}

/** One ARM T defect, carrying the token's GROUP and NAME as well as its sentence. The name is the finding's
 *  waiver POSITION: an ordinary finding must point at a nonempty token that slices the authored text at its
 *  reported column, and a token vault's offending subject is the key, never the file. The group is what
 *  makes the position lookup unambiguous — `tight` is a key in `spacing` and could be one in `leading`. */
interface TokenProblem {
  readonly group: TokenGroup;
  readonly name: string;
  readonly message: string;
}

/** The two belted families ARM T judges. Both ride the same `round(<rem>, 1px)` output belt, so both owe
 *  the same integer-at-root-16 guarantee — see the ARM T paragraph in the header. */
type TokenGroup = "leading" | "spacing";

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

function readLeadingToken(name: string, node: { readonly [key: string]: JsonValue }, out: { leading: Map<string, number>; problems: TokenProblem[] }): void {
  if (name === "none") {
    if (node["$type"] !== "number" || node["$value"] !== 1) {
      out.problems.push({
        group: "leading",
        name,
        message: "leading.none must stay the number 1 (box = the paired font-size) — docs/law/integer-line-boxes.md",
      });
      return;
    }
    out.leading.set(name, Number.NaN);
    return;
  }
  if (node["$type"] !== "dimension") {
    out.problems.push({
      group: "leading",
      name,
      message: `leading.${name} is not a dimension — unitless leading ratios are banned (a ratio times a fractional voice size is a fractional box) (tooling/src/verify/gates/GATE-AUTHORING.md)`,
    });
    return;
  }
  if (outputKind(node) !== "snapped") {
    out.problems.push({
      group: "leading",
      name,
      message: `leading.${name} lacks $extensions orb.output kind "snapped" — without the round(<rem>, 1px) belt the continuous --font-scale slider un-grids the box (tooling/src/verify/gates/GATE-AUTHORING.md)`,
    });
    return;
  }
  const px = dimensionPx(node["$value"]);
  if (px === undefined) {
    out.problems.push({ group: "leading", name, message: `leading.${name} has an unreadable dimension value — docs/law/integer-line-boxes.md` });
    return;
  }
  if (Math.abs(px - Math.round(px)) > INTEGER_EPSILON) {
    out.problems.push({
      group: "leading",
      name,
      message: `leading.${name} resolves ${String(px)}px at the 16px root — fractional line box; author an integer (docs/law/integer-line-boxes.md)`,
    });
    return;
  }
  out.leading.set(name, px);
}

/** The `orb.pointerFine` override arm of a snapped token, when one is authored — a bare dimension VALUE
 *  (`{ value, unit }`), not a nested token node, which is why it is read with `dimensionPx` directly. */
function pointerFineValue(node: { readonly [key: string]: JsonValue }): JsonValue | undefined {
  const extensions = node["$extensions"];
  return isRecord(extensions) ? extensions["orb.pointerFine"] : undefined;
}

/** ARM T's SPACING half (#1711). Since #1640 the whole `spacing.*` family rides the same snapped belt the
 *  leadings do, and for the same reason: `round(up)` on a fractional author silently GROWS the box at the
 *  default scale, which is the one thing the belt promises not to do. Three verdicts, all the leading
 *  half's shape one family over — not a dimension, not snapped, or not an integer at the 16px root — plus
 *  the same integer demand on the `orb.pointerFine` override, which is a second authored value on the same
 *  belt and would otherwise be unjudged. */
function readSpacingToken(name: string, node: { readonly [key: string]: JsonValue }, problems: TokenProblem[]): void {
  if (node["$type"] !== "dimension") {
    problems.push({
      group: "spacing",
      name,
      message: `spacing.${name} is not a dimension — a spacing step must be a belted dimension, never a ratio or a raw number (docs/law/integer-line-boxes.md)`,
    });
    return;
  }
  if (outputKind(node) !== "snapped") {
    problems.push({
      group: "spacing",
      name,
      message: `spacing.${name} lacks $extensions orb.output kind "snapped" — without the round(<rem>, 1px) belt the continuous --font-scale slider un-grids the step (docs/law/integer-line-boxes.md)`,
    });
    return;
  }
  const px = dimensionPx(node["$value"]);
  if (px === undefined) {
    problems.push({ group: "spacing", name, message: `spacing.${name} has an unreadable dimension value (docs/law/integer-line-boxes.md)` });
    return;
  }
  if (Math.abs(px - Math.round(px)) > INTEGER_EPSILON) {
    problems.push({
      group: "spacing",
      name,
      message: `spacing.${name} resolves ${String(px)}px at the 16px root — a fractional authored step, which round(up) silently GROWS at the default scale; author an integer (docs/law/integer-line-boxes.md)`,
    });
    return;
  }
  readPointerFineArm(name, node, problems);
}

/** The fine-pointer override of a snapped spacing token — a SECOND authored value on the same belt, so it
 *  owes the same integer. Split out of `readSpacingToken` for its own sake and for the complexity ceiling. */
function readPointerFineArm(name: string, node: { readonly [key: string]: JsonValue }, problems: TokenProblem[]): void {
  const fine = pointerFineValue(node);
  if (fine === undefined) {
    return;
  }
  const finePx = dimensionPx(fine);
  if (finePx === undefined) {
    problems.push({ group: "spacing", name, message: `spacing.${name} has an unreadable orb.pointerFine dimension value (docs/law/integer-line-boxes.md)` });
    return;
  }
  if (Math.abs(finePx - Math.round(finePx)) > INTEGER_EPSILON) {
    problems.push({
      group: "spacing",
      name,
      message: `spacing.${name} resolves ${String(finePx)}px on a fine pointer at the 16px root — the override rides the same snapped belt and owes the same integer (docs/law/integer-line-boxes.md)`,
    });
  }
}

/** One token GROUP's authored members, skipping DTCG's own `$`-prefixed metadata keys. */
function groupMembers(source: { readonly [key: string]: JsonValue }, group: string): readonly (readonly [string, { readonly [key: string]: JsonValue }])[] {
  const node = isRecord(source[group]) ? source[group] : {};
  const out: (readonly [string, { readonly [key: string]: JsonValue }])[] = [];
  for (const [name, member] of Object.entries(node)) {
    if (!name.startsWith("$") && isRecord(member)) {
      out.push([name, member]);
    }
  }
  return out;
}

/** Parse the text/leading/spacing groups of the declared token vault. TOTAL: an absent, empty or
 *  unparseable vault never reaches here — that is the runtime's population-phase refusal, not this
 *  function's `undefined`. */
function readTypeScale(tokenVault: JsonValue): TypeScale {
  const problems: TokenProblem[] = [];
  const textPx = new Map<string, number>();
  const leading = new Map<string, number>();
  const source = isRecord(tokenVault) ? tokenVault : {};
  for (const [name, node] of groupMembers(source, "text")) {
    const px = dimensionPx(node["$value"]);
    if (px !== undefined) {
      textPx.set(name, px);
    }
  }
  for (const [name, node] of groupMembers(source, "leading")) {
    readLeadingToken(name, node, { leading, problems });
  }
  for (const [name, node] of groupMembers(source, "spacing")) {
    readSpacingToken(name, node, problems);
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
/** 1-based line/column of an absolute offset in authored resource text. */
function positionOf(text: string, offset: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  return { line: before.split(/\r?\n/u).length, column: offset - before.lastIndexOf("\n") };
}

/** WHERE an ARM T finding anchors: on the offending leading token's KEY inside the vault's `leading` group.
 *  The vault is read twice on purpose and both reads are declared — `json:tokens` for the parsed value the
 *  arithmetic judges, and `authored-text` for the bytes a POSITION needs. An ordinary finding's token must
 *  slice the authored text at its reported column, so a parsed value alone cannot produce a waivable
 *  finding, and a finding pinned at line 1 column 1 with no token ALARMS
 *  (`has no nonempty position token for waiver binding`) rather than reporting. */
function tokenKeyPosition(text: string, group: TokenGroup, name: string): { readonly line: number; readonly column: number; readonly token: string } {
  const groupAt = text.indexOf(`"${group}"`);
  const key = text.indexOf(`"${name}"`, groupAt === -1 ? 0 : groupAt);
  if (key === -1) {
    throw new Error(`token vault has no authored position for ${group}.${name}`);
  }
  return { ...positionOf(text, key + 1), token: name };
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

/** ARM B is meaningful only with its real-tree anchor; token acquisition refuses separately. */
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

// The token fixtures supply the actual JSON/text resources; class rows add their own carrier.
const SNAPPED_SCALE = JSON.stringify({
  text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
  leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
});
const CORPUS = {
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
  facts: [staticClassFact],
  resources: [{ kind: "json", id: "tokens" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const scale = readTypeScale(readyResourceValue(ctx.resources.json("tokens")).value);
      const vaultText = readyResourceValue(ctx.resources.authoredText([TOKENS_JSON_REL])).files.find(({ path }) => path === TOKENS_JSON_REL);
      if (vaultText === undefined) {
        throw new Error(`token vault text was not served for ${TOKENS_JSON_REL}`);
      }
      for (const problem of scale.problems) {
        ctx.report.file(TOKENS_JSON_REL, {
          ...tokenKeyPosition(vaultText.text, problem.group, problem.name),
          message: `${problem.message} (docs/law/integer-line-boxes.md)`,
        });
      }
      const walked = ctx.fact(staticClassFact);
      const census: PairingCensus = { textCandidates: 0, distinctPairs: new Set() };
      for (const candidate of walked.candidates) {
        judgeCandidate({ ctx, scale, census, segments: candidate.segments }, candidate.value);
      }
      for (const unresolved of walked.classUnresolved) {
        ctx.report.node(unresolved.node, { message: `${MESSAGE} (class expression unresolved: ${unresolved.reason})` });
      }
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
      files: vault(
        JSON.stringify({
          text: {},
          leading: {},
          spacing: { row: { $type: "dimension", $value: { value: 0.531_25, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
      ),
      expect: { count: 1, token: "row", messageIncludes: "8.5px" },
      why: "ARM T's SPACING HALF, the founding shape (#1711): a fractional authored step at the 16px root. `round(up)` GROWS it at the default scale, which is the one thing the snapped belt promises not to do, and the message names the resolved px so the author does not redo the arithmetic. The token is the vault KEY — a token vault's offending subject is never the file",
    },
    {
      mode: "resource",
      files: vault(JSON.stringify({ text: {}, leading: {}, spacing: { row: { $type: "dimension", $value: { value: 0.5, unit: "rem" } } } })),
      expect: { count: 1, token: "row", messageIncludes: "snapped" },
      why: "ARM T SPACING: an INTEGER step with no `orb.output: snapped` belt is still a defect — the value is only integer at the DEFAULT scale, and without the belt the continuous --font-scale slider un-grids it everywhere else. Cut the `outputKind` test and this row goes green while the fractional row above stays red",
    },
    {
      mode: "resource",
      files: vault(
        JSON.stringify({
          text: {},
          leading: {},
          spacing: {
            "touch-target": {
              $type: "dimension",
              $value: { value: 2.75, unit: "rem" },
              $extensions: { "orb.output": { kind: "snapped" }, "orb.pointerFine": { value: 1.781_25, unit: "rem" } },
            },
          },
        }),
      ),
      expect: { count: 1, token: "touch-target", messageIncludes: "fine pointer" },
      why: "ARM T SPACING, the `orb.pointerFine` ARM: the coarse value is a clean 44px and ONLY the fine override is fractional (28.5px). A reader that judged `$value` alone reads this vault completely clean, which is an un-gridded control at exactly the pointer class the override exists for — this is the row that dies if `readPointerFineArm` is cut",
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
      files: vault(
        JSON.stringify({
          text: {},
          leading: {},
          spacing: {
            row: { $type: "dimension", $value: { value: 0.5, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } },
            "touch-target": {
              $type: "dimension",
              $value: { value: 2.75, unit: "rem" },
              $extensions: { "orb.output": { kind: "snapped" }, "orb.pointerFine": { value: 1.75, unit: "rem" } },
            },
          },
        }),
      ),
      why: "ARM T SPACING's ACQUITTING SIDE, in the shape the live vault actually has: a plain snapped integer step (8px) and a snapped step whose fine-pointer override is ALSO an integer (44px coarse / 28px fine — `touch-target`'s real values). Without this row the spacing half would be proven only where it accuses, and a reader that flagged every `orb.pointerFine` arm outright would read identically to the correct one",
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
        "packages/ui/src/x.tsx": 'export const G = <div className="p-4 leading-label" />;\n',
      },
      why: "a leading-only string (a variant arm raising the box over a base slot) carries no text step and passes",
    },
  ],
});
