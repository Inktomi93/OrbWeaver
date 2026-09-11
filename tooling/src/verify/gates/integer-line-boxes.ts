// Gate: integer-line-boxes (docs/design/integer-line-boxes.md) — every line box resolves to INTEGER px at
// the 16px root; a fractional box walks baselines off the device-pixel grid under promoted layers. ARM T:
// leading.* tokens are snapped integer rem dimensions · ARM P: every class-borne text step pairs an
// in-vocabulary leading (Tailwind's unitless core leading scale is banned) · ARM C: stylesheet
// line-heights resolve only through the leading vocabulary. Comment posture: ARM P is AST-side via the
// static-class walker (comment-safe); ARM C routes stylesheet text through blankCssComments. DECLARED
// LIMITS: generated theme.css is freshness-enforced by tests/ui/tokens, not re-read here; box = font-size
// via leading-none is legal when the step is integer; the reading surface rides its typed exemption row.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankCssComments } from "../lib/comment-spans.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const MESSAGE =
  "A line box off the integer-px grid (or a leading outside the token vocabulary) — fractional boxes walk " +
  "baselines off the device-pixel grid under promoted layers, which is the measured config-panel blur. " +
  "Leadings are fixed integer line boxes emitted as round(<rem>, 1px); see docs/design/integer-line-boxes.md.";
const FIX =
  "Pair every text-<step> with a leading-<step> from packages/ui/src/tokens/tokens.json (never Tailwind's " +
  "unitless core scale), author leading tokens as snapped integer-px rem dimensions, and let stylesheets " +
  "set line-height only through var(--leading-*).";
const GATE_SELF = "tooling/src/verify/gates/integer-line-boxes.ts";
const REAL_TREE_ANCHOR = "packages/ui/src/lib/class-merge.ts";
const TOKENS_JSON_REL = "packages/ui/src/tokens/tokens.json";
const GENERATED_THEME_CSS = "packages/ui/src/styles/theme.css";
const CSS_ROOTS = ["packages/ui/src", "packages/client/src"] as const;
const ROOT_REM_PX = 16;
const INTEGER_EPSILON = 1e-6;
/** Real-tree floors for the blindness tripwire: below these the census is blind, not clean. */
const MIN_TEXT_CANDIDATES = 40;
const MIN_DISTINCT_PAIRINGS = 6;

/** Sanctioned non-vocabulary line-height declarations, keyed `<repo-relative css path>::<value>`. */
const CSS_LINE_HEIGHT_EXEMPTIONS: ExemptionTable = {
  "packages/client/src/styles/globals.css::var(--reading-line-height)": {
    why:
      "the chat reading surface is the user-owned CONTINUOUS multiplier (appearance.readingLineHeight " +
      "1.2-2.2) — the declared Law-4 residual of docs/design/integer-line-boxes.md §2; ends when the " +
      "reading rule gains its own round() belt at the consuming declaration",
  },
};

interface TypeScale {
  /** text step name → resolved px at the 16px root. */
  readonly textPx: ReadonlyMap<string, number>;
  /** leading name → box px at the 16px root; leading `none` maps to NaN (box = the paired font-size). */
  readonly leadingPx: ReadonlyMap<string, number>;
  readonly problems: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dimensionPx(value: unknown): number | undefined {
  if (!isRecord(value) || typeof value["value"] !== "number") {
    return;
  }
  if (value["unit"] === "rem") {
    return value["value"] * ROOT_REM_PX;
  }
  return value["unit"] === "px" ? value["value"] : undefined;
}

function outputKind(node: Record<string, unknown>): string | undefined {
  const extensions = node["$extensions"];
  const output = isRecord(extensions) ? extensions["orb.output"] : undefined;
  const kind = isRecord(output) ? output["kind"] : undefined;
  return typeof kind === "string" ? kind : undefined;
}

function readLeadingToken(name: string, node: Record<string, unknown>, out: { leading: Map<string, number>; problems: string[] }): void {
  if (name === "none") {
    if (node["$type"] !== "number" || node["$value"] !== 1) {
      out.problems.push("leading.none must stay the number 1 (box = the paired font-size)");
      return;
    }
    out.leading.set(name, Number.NaN);
    return;
  }
  if (node["$type"] !== "dimension") {
    out.problems.push(`leading.${name} is not a dimension — unitless leading ratios are banned (a ratio times a fractional voice size is a fractional box)`);
    return;
  }
  if (outputKind(node) !== "snapped") {
    out.problems.push(
      `leading.${name} lacks $extensions orb.output kind "snapped" — without the round(<rem>, 1px) belt the continuous --font-scale slider un-grids the box`,
    );
    return;
  }
  const px = dimensionPx(node["$value"]);
  if (px === undefined) {
    out.problems.push(`leading.${name} has an unreadable dimension value`);
    return;
  }
  if (Math.abs(px - Math.round(px)) > INTEGER_EPSILON) {
    out.problems.push(`leading.${name} resolves ${px}px at the 16px root — fractional line box; author an integer`);
    return;
  }
  out.leading.set(name, px);
}

/** Parse the text/leading groups of tokens.json; undefined when the file is absent (mini-projects). */
function readTypeScale(root: string): TypeScale | undefined {
  const path = join(root, TOKENS_JSON_REL);
  if (!existsSync(path)) {
    return;
  }
  const problems: string[] = [];
  let raw: unknown;
  // @orb-waive caught-failure-ownership(catch): an unparseable tokens.json becomes this gate's own RED finding ("tokens.json is unparseable") through the returned problems array — the loudest owner a structural gate has. Ends if the problems array stops being reported in `run`.
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { textPx: new Map(), leadingPx: new Map(), problems: ["tokens.json is unparseable — the type-scale arithmetic cannot be judged"] };
  }
  const textPx = new Map<string, number>();
  const leading = new Map<string, number>();
  const source = isRecord(raw) ? raw : {};
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

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function cssFiles(root: string): string[] {
  const files: string[] = [];
  for (const cssRoot of CSS_ROOTS) {
    const dir = join(root, cssRoot);
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
      const rel = `${cssRoot}/${entry.replaceAll("\\", "/")}`;
      if (rel.endsWith(".css") && rel !== GENERATED_THEME_CSS) {
        files.push(rel);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const LINE_HEIGHT_DECL_RE = /line-height\s*:\s*([^;}]+)/gu;
const LEADING_VAR_RE = /^var\(--leading-([a-z-]+)\)$/u;
const TIER_LEADING_VAR_RE = /^var\(--orb-tier-[a-z-]+-leading\)$/u;
const LEADING_DEF_RE = /--leading-[a-z-]+\s*:/gu;
const TIER_LEADING_DEF_RE = /--orb-tier-[a-z-]+-leading\s*:\s*([^;}]+)/gu;

interface CssScan {
  readonly ctx: GateRunCtx;
  readonly rel: string;
  readonly text: string;
  readonly scale: TypeScale;
}

function checkCssLineHeights(scan: CssScan, seenExemptions: Set<string>): void {
  let decl = LINE_HEIGHT_DECL_RE.exec(scan.text);
  while (decl !== null) {
    const value = (decl[1] ?? "").trim();
    const leadingName = LEADING_VAR_RE.exec(value)?.[1];
    const inVocabulary = leadingName !== undefined && scan.scale.leadingPx.has(leadingName);
    const exemptionKey = `${scan.rel}::${value}`;
    if (!(inVocabulary || TIER_LEADING_VAR_RE.test(value))) {
      if (exemptionKey in CSS_LINE_HEIGHT_EXEMPTIONS) {
        seenExemptions.add(exemptionKey);
      } else {
        // @finding-overload-ok: a stylesheet line-scan verdict — CSS is outside the ts-morph project, so there is no node to anchor; suppression stays line-adjacent in the stylesheet (#828).
        scan.ctx.report({ file: scan.rel, line: lineOf(scan.text, decl.index), column: 1, token: value });
      }
    }
    decl = LINE_HEIGHT_DECL_RE.exec(scan.text);
  }
}

function checkCssDefinitions(scan: CssScan): void {
  let def = LEADING_DEF_RE.exec(scan.text);
  while (def !== null) {
    // @finding-overload-ok: a stylesheet line-scan verdict — CSS is outside the ts-morph project, so there is no node to anchor; suppression stays line-adjacent in the stylesheet (#828).
    scan.ctx.report({ file: scan.rel, line: lineOf(scan.text, def.index), column: 1, token: def[0].replace(/\s*:$/u, "") });
    def = LEADING_DEF_RE.exec(scan.text);
  }
  let tierDef = TIER_LEADING_DEF_RE.exec(scan.text);
  while (tierDef !== null) {
    const value = (tierDef[1] ?? "").trim();
    const leadingName = LEADING_VAR_RE.exec(value)?.[1];
    if (leadingName === undefined || !scan.scale.leadingPx.has(leadingName)) {
      // @finding-overload-ok: a stylesheet line-scan verdict — CSS is outside the ts-morph project, so there is no node to anchor; suppression stays line-adjacent in the stylesheet (#828).
      scan.ctx.report({ file: scan.rel, line: lineOf(scan.text, tierDef.index), column: 1, token: value });
    }
    tierDef = TIER_LEADING_DEF_RE.exec(scan.text);
  }
}

interface PairingCensus {
  textCandidates: number;
  readonly distinctPairs: Set<string>;
}

interface CandidateScan {
  readonly ctx: GateRunCtx;
  readonly scale: TypeScale;
  readonly census: PairingCensus;
  readonly segments: readonly StaticClassSegment[];
}

function reportAnchored(scan: CandidateScan, offset: number, token: string): void {
  const anchored = sourceToken(scan.segments, offset, token);
  if (anchored !== undefined) {
    scan.ctx.report(anchored.node, { token: anchored.token, offset: anchored.offset });
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
        reportAnchored(scan, leading.offset, leading.base);
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
      reportAnchored(scan, token.offset, token.base);
    }
  }
  const first = textSteps[0];
  if (first === undefined) {
    return;
  }
  scan.census.textCandidates += 1;
  if (leadings.length === 0) {
    reportAnchored(scan, first.offset, first.base);
    return;
  }
  judgePairs(scan, textSteps, leadings);
}

interface BlindnessInputs {
  readonly roots: number;
  readonly scale: TypeScale | undefined;
  readonly census: PairingCensus;
  readonly stylesheetCount: number;
}

function reportBlindness(ctx: GateRunCtx, inputs: BlindnessInputs): void {
  const blind: string[] = [];
  if (inputs.scale === undefined) {
    blind.push(`tokens.json missing at ${TOKENS_JSON_REL}`);
  }
  if (inputs.roots === 0) {
    blind.push("static class-expression derivation returned zero carrier roots");
  }
  if (inputs.census.textCandidates < MIN_TEXT_CANDIDATES || inputs.census.distinctPairs.size < MIN_DISTINCT_PAIRINGS) {
    blind.push(
      `pairing census below the real-tree floor (${inputs.census.textCandidates} text candidates, ${inputs.census.distinctPairs.size} distinct pairings)`,
    );
  }
  if (inputs.stylesheetCount === 0) {
    blind.push("zero stylesheets read");
  }
  for (const reason of blind) {
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `${reason} — the integer-line-box census is blind, not clean (tooling/src/verify/gates/integer-line-boxes.ts)`,
    });
  }
}

export const gate: GateDescriptor = {
  name: "integer-line-boxes",
  docRow: "client-architecture-lockdown.md §4 (docs/design/integer-line-boxes.md)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  fsBacked: true,
  scanRoot: (path) => path.startsWith("packages/ui/src/") || path.startsWith("packages/client/src/"),
  run: (ctx) => {
    const scale = readTypeScale(ctx.root);
    for (const problem of scale?.problems ?? []) {
      ctx.report({ file: TOKENS_JSON_REL, line: 0, column: 0, message: `${problem} (docs/design/integer-line-boxes.md)` });
    }
    const files = ctx.files.filter((source) => {
      const path = repoRel(ctx.root, source.getFilePath());
      return path.startsWith("packages/ui/src/") || path.startsWith("packages/client/src/");
    });
    const walked = walkStaticClassExpressions(files);
    const census: PairingCensus = { textCandidates: 0, distinctPairs: new Set() };
    if (scale !== undefined) {
      for (const candidate of walked.candidates) {
        judgeCandidate({ ctx, scale, census, segments: candidate.segments }, candidate.value);
      }
      for (const unresolved of walked.unresolved) {
        ctx.report(unresolved.node, { token: `unresolved:${unresolved.reason}`, offset: 0 });
      }
    }
    const stylesheets = cssFiles(ctx.root);
    const seenExemptions = new Set<string>();
    if (scale !== undefined) {
      for (const rel of stylesheets) {
        const text = blankCssComments(readFileSync(join(ctx.root, rel), "utf8"));
        const scan: CssScan = { ctx, rel, text, scale };
        checkCssLineHeights(scan, seenExemptions);
        checkCssDefinitions(scan);
      }
    }
    ctx.scan({
      unit: "line-box carrier",
      candidates: walked.candidates.length + walked.unresolved.length + walked.opaque.length + stylesheets.length,
      scanned: walked.candidates.length + stylesheets.length,
      skipped: { unresolved: walked.unresolved.length, "opaque-runtime": walked.opaque.length },
    });
    const realTree = ctx.scope.kind === "project" && fileLoaded(ctx, REAL_TREE_ANCHOR);
    if (!realTree) {
      return;
    }
    for (const key of Object.keys(CSS_LINE_HEIGHT_EXEMPTIONS)) {
      if (!seenExemptions.has(key)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `CSS_LINE_HEIGHT_EXEMPTIONS row matching no live declaration — delete the stale row in tooling/src/verify/gates/integer-line-boxes.ts: ${key}`,
        });
      }
    }
    reportBlindness(ctx, { roots: walked.roots, scale, census, stylesheetCount: stylesheets.length });
  },
  mustFlag: [
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1.015_625, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
      },
      expect: { messageIncludes: "fractional line box" },
      why: "the founding defect: leading.label at 16.25px was the measured config-panel blur — a fractional authored box must be unshippable",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({ text: {}, leading: { label: { $type: "number", $value: 1.25 } } }),
      },
      expect: { messageIncludes: "unitless" },
      why: "a unitless leading ratio times a fractional voice size is fractional by construction — the old scale's exact shape",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({ text: {}, leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" } } } }),
      },
      expect: { messageIncludes: "snapped" },
      why: "an unsnapped dimension is integer only at quarter-scale roots — the belt is part of the contract, not an option",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { micro: { $type: "dimension", $value: { value: 0.656_25, unit: "rem" } } },
          leading: { micro: { $type: "dimension", $value: { value: 0.8125, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-micro leading-tight" />;\n',
      },
      expect: { token: "leading-tight" },
      why: "Tailwind's unitless core leading scale re-opens the fractional-box hole the token re-authoring closed",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="p-4 text-label" />;\n',
      },
      expect: { token: "text-label" },
      why: "an unpaired text step inherits the ancestor RATIO (preflight 1.5), which re-computes fractional per font-size",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { body: { $type: "dimension", $value: { value: 0.9375, unit: "rem" } } },
          leading: { micro: { $type: "dimension", $value: { value: 0.8125, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-body leading-micro" />;\n',
      },
      expect: { token: "leading-micro" },
      why: "a box below its font size clips glyphs — the mispairing guard fixed boxes make possible",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { micro: { $type: "dimension", $value: { value: 0.656_25, unit: "rem" } } },
          leading: { none: { $type: "number", $value: 1 } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-micro leading-none" />;\n',
      },
      expect: { token: "leading-none" },
      why: "leading-none makes the box the font-size — legal only when that size is integer, and 10.5px is not",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/tv.ts": 'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "px-2 text-label" } });\n',
      },
      expect: { token: "text-label" },
      why: "tv slot strings are class carriers — the pairing law must reach composed variants, not only JSX",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: {},
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/styles/extra.css": ".x {\n  line-height: 1.4;\n}\n",
      },
      expect: { token: "1.4" },
      why: "a literal stylesheet line-height bypasses the vocabulary — the exact shape the six-CSS-homes law exists to fence",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: {},
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/styles/extra.css": ":root {\n  --leading-custom: 1.2;\n}\n",
      },
      expect: { token: "--leading-custom" },
      why: "a hand-defined --leading-* shadows the generated scale — theme.css is the one emitter",
    },
  ],
  mustPass: [
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-label" />;\n',
      },
      why: "the sanctioned pairing: a fractional voice size under an integer fixed box is exactly the design",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { title: { $type: "dimension", $value: { value: 1, unit: "rem" } } },
          leading: { none: { $type: "number", $value: 1 } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="text-title leading-none" />;\n',
      },
      why: "declared limit: box = font-size via leading-none is legal when the step is integer (16px)",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/x.ts": 'export const copy = "set text-label somewhere";\n',
      },
      why: "a plain string never consumed by a class carrier is prose, not a candidate — no false positive",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: {},
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/styles/extra.css":
          ".a {\n  line-height: var(--leading-label);\n}\n[data-surface-tier] .b {\n  --orb-tier-row-title-leading: var(--leading-label);\n  line-height: var(--orb-tier-row-title-leading);\n}\n",
      },
      why: "the vocabulary forms: a direct leading var and the tiers.css alias indirection are the two sanctioned spellings",
    },
    {
      files: {
        [TOKENS_JSON_REL]: JSON.stringify({
          text: { label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } } },
          leading: { label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
        }),
        "packages/ui/src/x.tsx": 'export const G = <div className="p-4 leading-label" />;\n',
      },
      why: "a leading-only string (a variant arm raising the box over a base slot) carries no text step and passes",
    },
  ],
};
