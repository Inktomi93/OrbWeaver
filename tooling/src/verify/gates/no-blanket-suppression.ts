// Policy: no-blanket-suppression — a file-wide lint/type suppression is structurally unavailable in
// authored code and tests (#962). One shared directive reader feeds three preserved arms: compiler source
// files, tracked non-project text, and candidate-index blobs that differ from the working tree.
//
// FINAL RESOURCE PORT (#1930/#1584). The former conversion refusal was specific to staged bytes. The
// tracked-files ResourceHost family now exposes `candidateIndexDelta(paths)`: exact staged text only for
// declared tracked paths whose index blob differs from the worktree. The request contributes no new path
// population and no new resource kind; the binding checks every demanded path against this policy's
// effective tracked population. The provider honors a hook's ambient `GIT_INDEX_FILE` only at the real
// invocation root and strips Git routing variables for isolated proof roots. Arm C therefore keeps #954's
// commit-time defense without a policy-owned subprocess or an arbitrary path callback.
//
// POPULATION PORT. Legacy arm A admitted the harness TS/TSX files under every authored root, including
// showcase and scripts, minus the captured SillyTavern runtime. The final population spells that same set
// as `@authored` with the same exclusion; shipped package roots are members of that composite. Arms B/C are resource populations: `tracked-files`
// provides candidate-index membership, `authored-text` provides working bytes, `json:biome` provides the
// strict config and its top-level ignores, and candidateIndexDelta provides only staged/worktree divergence.
// Missing or unreadable resources withhold the owner instead of producing a clean zero.
//
// AUTHORITY remains hard/error. There is no ordinary waiver or reviewed-grant door: a file-wide switch is
// replaced by a bounded line/range directive or by a governed biome override. All legacy proof rows are
// carried as resource proofs, while the real-Git suite preserves the staged-only, working-only, duplicate,
// ignored-path, blindness, and real-tree controls.
import { extname } from "node:path";
import type { SourceFile } from "ts-morph";
import type { GatePolicyContext, GatePolicyProof } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import type { AuthoredTextCorpus } from "../contract/resource-text.ts";
import { commentSpansInText, parseScratch } from "../lib/comment-spans.ts";
import { globMatcher } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { SuppressionSite } from "../lib/suppression-directive.ts";
import { readDirectiveComment, suppressionSites } from "../lib/suppression-directive.ts";

const CONFIG_REL = "biome.json";
const DESIGN = "docs/design/962-blanket-suppression-control-plane.md";
const NEGATION_PREFIX = "!";
const NEWLINE = 10;

// ── the language table ────────────────────────────────────────────────────────────────────────────────
/** How a NON-harness tracked file is read. TS/TSX ride the harness walk (arm A) — but a staged TS blob (arm
 *  C) has no SourceFile, so the `script` reader covers them there. The set is biome's language set by
 *  extension; a file outside it cannot carry a live biome directive. */
type Reader = "script" | "text-line" | "text-block";
const READER_BY_EXT: Readonly<Record<string, Reader>> = {
  ".ts": "script",
  ".tsx": "script",
  ".mts": "script",
  ".cts": "script",
  ".js": "script",
  ".mjs": "script",
  ".cjs": "script",
  ".jsx": "script",
  ".json": "text-line",
  ".jsonc": "text-line",
  ".css": "text-block",
};
// ── messages ──────────────────────────────────────────────────────────────────────────────────────────
const MESSAGE =
  "a FILE-WIDE lint/type suppression — `biome-ignore-all` (any spelling, any position), `@ts-nocheck`, an UNCLOSED " +
  "`biome-ignore-start`/`eslint-disable` block, or a closed range enclosing every statement — is structurally " +
  "unavailable in authored code and tests (#962). A whole-file decision has ONE home: a `biome.json` override " +
  "row, which `biome-grant-liveness` stale-arms; inside a file a suppression is bounded by a line or a closed " +
  "range and counted by the `suppressions` ledger. The finding token is the directive. " +
  "See tooling/src/verify/gates/no-blanket-suppression.ts and docs/design/962-blanket-suppression-control-plane.md.";

const FIX =
  "narrow it: `biome-ignore <rule>: <why>` on the line, or `biome-ignore-start <rule>: <why>` … `biome-ignore-end " +
  "<rule>: <why>` around the block it is about (both counted by tooling/src/verify/gates/suppressions.ts). If the " +
  "whole file genuinely is the subject (a codec, a wire-format fixture, the env reader's own test), add an EXACT " +
  "path to the narrowest `biome.json` override that keeps the rule on (the `useNamingConvention` `conventions` " +
  "override; an exact-path `off` only for a rule with no narrower option). A directive that suppresses nothing " +
  "is deleted, never narrowed.";

type BlanketKind = "all" | "nocheck" | "unclosed" | "whole-file";

const KIND_MESSAGE: Readonly<Record<BlanketKind, (token: string) => string>> = {
  all: (token) =>
    `\`${token}\` is a whole-file directive in every position — at the top it suppresses the file; anywhere else (mid-file, a JSX ` +
    `container) biome REJECTS it with a warning nobody sees and it sits looking like protection. Narrow it or move it to biome.json (${DESIGN} §1).`,
  nocheck: (token) =>
    `\`${token}\` turns the type-checker off for the whole file. Use a line-adjacent \`@ts-expect-error\` with a reason, ` +
    `which tsc reds the day it stops being needed (${DESIGN} §1).`,
  unclosed: (token) =>
    `\`${token}\` is never closed in this file — biome extends an unclosed range to END OF FILE (and only warns, hidden at ` +
    `--diagnostic-level=error); eslint disables to EOF silently. Close it right after the block it is about (${DESIGN} §2.1).`,
  "whole-file": (token) =>
    `the range opened by \`${token}\` encloses EVERY statement of the file — a blanket in disguise. Close it after the block ` +
    `it is about, or move the whole-file decision to a biome.json override (${DESIGN} §1).`,
};

const INDEX_PREFIX =
  "STAGED — the INDEX carries this blanket and the WORKING TREE does not, so the next commit would ship it while every " +
  "working-tree check reads clean (the #954 shape). Re-stage the file (`git add`) after fixing it: ";

// ── the judge (one for every arm) ────────────────────────────────────────────────────────────────────
interface Blanket {
  readonly line: number;
  readonly token: string;
  readonly kind: BlanketKind;
}

/** The first and last statement lines of a file — what a "whole-file" range has to enclose. */
interface StatementBounds {
  readonly first: number;
  readonly last: number;
}

/** A closed range is a blanket when it starts at or before the first statement and ends at or after the last. */
function enclosesFile(start: number, end: number, bounds: StatementBounds | undefined): boolean {
  return bounds !== undefined && start <= bounds.first && end >= bounds.last;
}

/** Pop the innermost open range under `key`, or undefined. */
function closeRange(open: Map<string, SuppressionSite[]>, key: string): SuppressionSite | undefined {
  const stack = open.get(key);
  const site = stack?.pop();
  if (stack !== undefined && stack.length === 0) {
    open.delete(key);
  }
  return site;
}

function openRange(open: Map<string, SuppressionSite[]>, site: SuppressionSite): void {
  const key = site.rule ?? "";
  open.set(key, [...(open.get(key) ?? []), site]);
}

/** The pairing state one file's sites are folded through. */
interface RangeState {
  readonly out: Blanket[];
  readonly openBiome: Map<string, SuppressionSite[]>;
  readonly openEslint: Map<string, SuppressionSite[]>;
  readonly bounds: StatementBounds | undefined;
}

function judgePair(state: RangeState, start: SuppressionSite | undefined, end: SuppressionSite): void {
  if (start !== undefined && enclosesFile(start.line, end.line, state.bounds)) {
    state.out.push({ line: start.line, token: start.token, kind: "whole-file" });
  }
}

/** What each directive TOKEN does to the pairing state. A `Record` keyed by token, so an unlisted token
 *  (a line directive) is a no-op by construction. The eslint arms take only the BLOCK form (declared limit). */
const ON_TOKEN: Readonly<Record<string, (site: SuppressionSite, state: RangeState) => void>> = {
  "biome-ignore-all": (site, state) => state.out.push({ line: site.line, token: site.token, kind: "all" }),
  "@ts-nocheck": (site, state) => state.out.push({ line: site.line, token: site.token, kind: "nocheck" }),
  "biome-ignore-start": (site, state) => openRange(state.openBiome, site),
  "biome-ignore-end": (site, state) => judgePair(state, closeRange(state.openBiome, site.rule ?? ""), site),
  "eslint-disable": (site, state) => {
    if (site.block) {
      openRange(state.openEslint, site);
    }
  },
  "eslint-enable": (site, state) => {
    if (!site.block) {
      return;
    }
    for (const key of site.rule === null ? [...state.openEslint.keys()] : [site.rule]) {
      judgePair(state, closeRange(state.openEslint, key), site);
    }
  },
};

/** The blankets among one file's directive sites. Ranges pair by rule key in source order (a `-start` with no
 *  later `-end` under the same key is UNCLOSED; a bare `eslint-enable` closes every open eslint block); a
 *  paired range is judged against the statement bounds. */
function blanketsOf(sites: readonly SuppressionSite[], bounds: StatementBounds | undefined): readonly Blanket[] {
  const state: RangeState = { out: [], openBiome: new Map(), openEslint: new Map(), bounds };
  for (const site of sites) {
    ON_TOKEN[site.token]?.(site, state);
  }
  for (const stack of [...state.openBiome.values(), ...state.openEslint.values()]) {
    for (const site of stack) {
      state.out.push({ line: site.line, token: site.token, kind: "unclosed" });
    }
  }
  return state.out.sort((a, b) => a.line - b.line);
}

// ── readers ───────────────────────────────────────────────────────────────────────────────────────────
function statementBounds(sf: SourceFile): StatementBounds | undefined {
  const statements = sf.getStatements();
  const first = statements[0];
  const last = statements.at(-1);
  return first === undefined || last === undefined ? undefined : { first: first.getStartLineNumber(), last: last.getEndLineNumber() };
}

function judgeSourceFile(sf: SourceFile): readonly Blanket[] {
  return blanketsOf(suppressionSites(sf), statementBounds(sf));
}

function lineAt(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos; i += 1) {
    if (text.charCodeAt(i) === NEWLINE) {
      line += 1;
    }
  }
  return line;
}

/** Directive sites + statement bounds for a CSS / JSON-with-comments file: comments come from the shared
 *  quote-aware lexer; the bounds are the first and last lines carrying anything that is not a comment. */
function judgeText(text: string, lineComments: boolean): readonly Blanket[] {
  const spans = commentSpansInText(text, { lineComments });
  const sites: SuppressionSite[] = [];
  let blanked = text;
  for (const span of [...spans].sort((a, b) => b.pos - a.pos)) {
    const directive = readDirectiveComment(span.text);
    if (directive !== null) {
      sites.unshift({ line: lineAt(text, span.pos), token: directive.token, rule: directive.rule, block: !span.text.startsWith("//") });
    }
    blanked = blanked.slice(0, span.pos) + span.text.replace(/[^\n]/gu, " ") + blanked.slice(span.end);
  }
  const codeLines = blanked.split("\n").flatMap((l, i) => (l.trim() === "" ? [] : [i + 1]));
  const first = codeLines[0];
  const last = codeLines.at(-1);
  const bounds = first === undefined || last === undefined ? undefined : { first, last };
  return blanketsOf(sites, bounds);
}

function judgeBytes(rel: string, text: string): readonly Blanket[] {
  const reader = READER_BY_EXT[extname(rel)];
  if (reader === "script") {
    return judgeSourceFile(parseScratch(text));
  }
  return reader === undefined ? [] : judgeText(text, reader === "text-line");
}

// ── the corpus (arms B + C) ───────────────────────────────────────────────────────────────────────────
/** biome's top-level ignore set (`files.includes` negations), as a predicate. A file biome never lints cannot
 *  carry a live directive; the count is declared on the scan line, never silently dropped. */
function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBiomeIgnores(value: JsonValue): (rel: string) => boolean {
  if (!isJsonRecord(value)) {
    throw new Error(`${CONFIG_REL} must contain a JSON object`);
  }
  const files = value["files"];
  if (files !== undefined && !isJsonRecord(files)) {
    throw new Error(`${CONFIG_REL} files must be an object`);
  }
  const includes = files === undefined ? undefined : files["includes"];
  if (includes !== undefined && (!Array.isArray(includes) || includes.some((entry) => typeof entry !== "string"))) {
    throw new Error(`${CONFIG_REL} files.includes must be an array of strings`);
  }
  const includeEntries = (includes ?? []) as readonly string[];
  const matchers = includeEntries.flatMap((entry) => (entry.startsWith(NEGATION_PREFIX) ? [globMatcher(entry.slice(NEGATION_PREFIX.length))] : []));
  return (rel) => matchers.some((matches) => matches(rel));
}

function isGovernedExt(rel: string): boolean {
  return extname(rel) in READER_BY_EXT;
}

interface FileVerdict {
  readonly rel: string;
  readonly blankets: readonly Blanket[];
}

interface CorpusOutcome {
  readonly verdicts: readonly FileVerdict[];
}

/** Arm B: every tracked file biome lints that the harness walk did not already carry. */
function judgeTrackedCorpus(
  tracked: readonly string[],
  text: AuthoredTextCorpus,
  walked: ReadonlySet<string>,
  ignored: (rel: string) => boolean,
): CorpusOutcome {
  const candidates = tracked.filter((rel) => isGovernedExt(rel) && !walked.has(rel));
  const byPath = new Map(text.files.map((file) => [file.path, file.text]));
  const refusals = new Map(text.refusals.map((refusal) => [refusal.path, refusal]));
  const verdicts: FileVerdict[] = [];
  for (const rel of candidates) {
    if (ignored(rel)) {
      continue;
    }
    const source = byPath.get(rel);
    const refusal = refusals.get(rel);
    if (source === undefined && (refusal?.status === "missing" || refusal?.status === "empty")) {
      continue; // tracked but deleted in the working tree — nothing to judge here; arm C still sees the index
    }
    if (source === undefined) {
      throw new Error(`authored text for ${rel} was not readable: ${refusal?.reason ?? "no resource row"}`);
    }
    verdicts.push({ rel, blankets: judgeBytes(rel, source) });
  }
  return { verdicts };
}

/** Arm C reports only the DELTA: an index blanket (by token + kind) the working tree does not also carry —
 *  the rest is arm A/B's finding, reported once. */
function indexOnly(index: readonly Blanket[], working: readonly Blanket[]): readonly Blanket[] {
  const carried = new Set(working.map((b) => `${b.token} ${b.kind}`));
  return index.filter((b) => !carried.has(`${b.token} ${b.kind}`));
}

// ── reporting ─────────────────────────────────────────────────────────────────────────────────────────
function reportBlanket(ctx: GatePolicyContext, file: string, blanket: Blanket, staged: boolean): void {
  const detail = KIND_MESSAGE[blanket.kind](blanket.token);
  ctx.report.file(file, {
    line: blanket.line,
    column: 1,
    token: blanket.token,
    message: `${staged ? INDEX_PREFIX + detail : detail} — docs/design/962-blanket-suppression-control-plane.md`,
    fix: FIX,
  });
}

/** Arm A over the harness fileset; returns every walked file's verdict so arm C can diff against it. */
function reportResourceArms(ctx: GatePolicyContext, walked: Map<string, readonly Blanket[]>): void {
  const tracked = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
  const config = readyResourceValue(ctx.resources.json("biome"));
  const ignored = readBiomeIgnores(config.value);
  const candidates = tracked.filter((rel) => isGovernedExt(rel) && !walked.has(rel));
  const text = readyResourceValue(ctx.resources.authoredText(candidates.length > 0 ? candidates : [CONFIG_REL]));
  const corpus = judgeTrackedCorpus(tracked, text, new Set(walked.keys()), ignored);
  for (const { rel, blankets } of corpus.verdicts) {
    walked.set(rel, blankets);
    for (const blanket of blankets) {
      reportBlanket(ctx, rel, blanket, false);
    }
  }
  const index = readyResourceValue(ctx.resources.candidateIndexDelta(tracked.filter(isGovernedExt)));
  for (const { path, text: stagedText } of index.files) {
    if (ignored(path)) {
      continue;
    }
    for (const blanket of indexOnly(judgeBytes(path, stagedText), walked.get(path) ?? [])) {
      reportBlanket(ctx, path, blanket, true);
    }
  }
}

// ── self-proof fixtures ──────────────────────────────────────────────────────────────────────────────
const TWO_STATEMENTS = "export const a = 1 | 2;\nexport const b = 3;\n";
const PROOF_CONFIG = '{ "files": { "includes": ["**"] } }\n';
const PROOF_ANCHOR = "packages/kit/src/__no_blanket_proof_anchor.ts";

interface CarriedProof {
  readonly files: string | Readonly<Record<string, string>>;
  readonly at?: string;
  readonly expect?: GatePolicyProof["expect"];
  readonly why: string;
}

/** Preserve the legacy proof corpus while giving each row a real Git index and the resource config the
 *  final policy declares. A string fixture's former `at` becomes its explicit file-map key. */
function resourceProof(proof: CarriedProof): GatePolicyProof {
  if (typeof proof.files === "string" && proof.at === undefined) {
    throw new Error("a string no-blanket-suppression proof must declare its file path");
  }
  const files = typeof proof.files === "string" ? { [proof.at as string]: proof.files } : proof.files;
  return {
    mode: "resource",
    files: { [CONFIG_REL]: PROOF_CONFIG, [PROOF_ANCHOR]: "export const anchor = true;\n", ...files },
    ...(proof.expect === undefined ? {} : { expect: proof.expect }),
    why: proof.why,
  };
}

export const gate = defineGate({
  id: "no-blanket-suppression",
  family: "no-blanket-suppression",
  authority: "hard",
  severity: "error",
  population: { in: ["@authored"], notUnder: ["scripts/probes/st-goldens/sillytavern-runtime/**"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "tracked-files" }, { kind: "json", id: "biome" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const walked = new Map<string, readonly Blanket[]>();
    return {
      visitFile: (sourceFile) => {
        const file = ctx.relativePath(sourceFile);
        const blankets = judgeSourceFile(sourceFile);
        walked.set(file, blankets);
        for (const blanket of blankets) {
          reportBlanket(ctx, file, blanket, false);
        }
      },
      evaluate: () => reportResourceArms(ctx, walked),
    };
  },
  mustFlag: [
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/kit/src/top.ts": `// biome-ignore-all lint/suspicious/noBitwiseOperators: fixture\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "biome-ignore-all", line: 1 },
      why: "the founding shape — a top-of-file `biome-ignore-all` suppresses the whole file",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/kit/src/block.ts": `/* biome-ignore-all lint/suspicious/noBitwiseOperators: fixture */\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "biome-ignore-all" },
      why: "the block-comment spelling is honoured by biome exactly like the line spelling",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "tests/ui/jsx.test.tsx": `{/* biome-ignore-all lint/suspicious/noBitwiseOperators: fixture */}\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "biome-ignore-all" },
      why: "a JSX comment container — biome rejects it with a hidden warning, so it sits looking like protection; still banned, and tests are governed",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/kit/src/mid.ts": "export const a = 1 | 2;\n// biome-ignore-all lint/suspicious/noBitwiseOperators: fixture\nexport const b = 3 & 4;\n",
      },
      expect: { count: 1, token: "biome-ignore-all", line: 2 },
      why: "a mid-file `-all` is dead text biome warns about invisibly — the spelling is banned in every position",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/kit/src/category.ts": `// biome-ignore-all lint: fixture\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "biome-ignore-all" },
      why: "the category-wide, rule-less spelling suppresses EVERY lint rule for the file",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/kit/src/nocheck.ts": '// @ts-nocheck\nexport const a: number = "x";\n',
      },
      expect: { count: 1, token: "@ts-nocheck" },
      why: "the type-checker's whole-file switch is the same class",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/client/src/features/x/lib/eslint-bare.ts": `/* eslint-disable */\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "eslint-disable", messageIncludes: "never closed" },
      why: "a bare eslint block disable with no `eslint-enable` disables everything to EOF, silently",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/client/src/features/x/lib/eslint-rule.ts": `/* eslint-disable jsx-a11y/no-autofocus */\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "eslint-disable", messageIncludes: "never closed" },
      why: "a rule-scoped eslint block disable is still unbounded without its `eslint-enable`",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "scripts/probes/unclosed.ts": `// biome-ignore-start lint/suspicious/noBitwiseOperators: fixture\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "biome-ignore-start", messageIncludes: "never closed" },
      why: "biome 2.5.1 extends an unclosed `-start` to end of file and only WARNS (probe 2026-09-02) — and scripts are governed",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "tooling/src/x/lib/mismatch.ts":
          "// biome-ignore-start lint/suspicious/noBitwiseOperators: fixture\nexport const a = 1 | 2;\n" +
          "// biome-ignore-end lint/style/noProcessEnv: a DIFFERENT rule\nexport const b = 3;\n",
      },
      expect: { count: 1, token: "biome-ignore-start", messageIncludes: "never closed" },
      why: "ranges pair by RULE KEY — an `-end` for another rule does not close this one; tooling is governed",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/kit/src/whole.ts":
          "// biome-ignore-start lint/suspicious/noBitwiseOperators: fixture\nexport const a = 1 | 2;\nexport const b = 3;\n// biome-ignore-end lint/suspicious/noBitwiseOperators: fixture\n",
      },
      expect: { count: 1, token: "biome-ignore-start", messageIncludes: "EVERY statement" },
      why: "a CLOSED range that encloses every statement is a blanket in disguise",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "packages/client/src/features/x/lib/eslint-whole.ts": `/* eslint-disable */\n${TWO_STATEMENTS}/* eslint-enable */\n`,
      },
      expect: { count: 1, token: "eslint-disable", messageIncludes: "EVERY statement" },
      why: "the eslint block form of the same disguise",
    },
    {
      mode: "resource" as const,
      files: {
        [CONFIG_REL]: PROOF_CONFIG,
        [PROOF_ANCHOR]: "export const anchor = true;\n",
        "tests/server/domain/x/y.test.ts": `// biome-ignore-all lint/style/useNamingConvention: fixture\n${TWO_STATEMENTS}`,
      },
      expect: { count: 1, token: "biome-ignore-all" },
      why: "#962's founding population — 58 of the 74 blankets lived under tests/, outside every ratchet",
    },
  ],
  mustPass: [
    {
      files:
        "// biome-ignore-start lint/suspicious/noBitwiseOperators: the codec\nexport const a = 1 | 2;\n" +
        "// biome-ignore-end lint/suspicious/noBitwiseOperators: the codec\nexport const b = 3;\n",
      at: "packages/kit/src/range.ts",
      why: "the sanctioned shape — a CLOSED range around a subset of the file's statements",
    },
    {
      files: "// biome-ignore lint/suspicious/noBitwiseOperators: the one site\nexport const a = 1 | 2;\n",
      at: "packages/kit/src/line.ts",
      why: "a line directive is bounded by construction",
    },
    {
      files: "// eslint-disable-next-line no-alert\nexport const a = 1;\n",
      at: "packages/client/src/features/x/lib/next-line.ts",
      why: "`eslint-disable-next-line` / `-line` are line-scoped; only the BLOCK form can be unbounded",
    },
    {
      files: "/* eslint-disable jsx-a11y/no-autofocus */\nexport const a = 1;\n/* eslint-enable jsx-a11y/no-autofocus */\nexport const b = 2;\n",
      at: "packages/client/src/features/x/lib/eslint-closed.ts",
      why: "a closed eslint block around a subset of statements",
    },
    {
      files: "/* eslint-disable a */\n/* eslint-disable b */\nexport const a = 1;\n/* eslint-enable */\nexport const b = 2;\n",
      at: "packages/client/src/features/x/lib/eslint-bare-enable.ts",
      why: "a BARE `eslint-enable` closes every open eslint block (eslint's own semantics)",
    },
    {
      files: 'const s = "// biome-ignore-all lint/foo: not a directive";\nexport const a = s;\n',
      at: "packages/kit/src/string.ts",
      why: "a spelling inside a STRING LITERAL is inert — the reader walks comment trivia only",
    },
    {
      files: "// see biome-ignore-all in the design doc — a quotation mid-sentence is a MENTION\nexport const a = 1;\n",
      at: "packages/kit/src/mention.ts",
      why: "the opener fence: a directive is matched at the comment OPENER only (suppressions.ts SUPPRESSION_RE)",
    },
    {
      files: "// eslint-disable no-alert\nexport const a = 1;\n",
      at: "packages/client/src/features/x/lib/line-form.ts",
      why: "DECLARED LIMIT — a `// eslint-disable` LINE comment is not a block directive (eslint ignores it), so it is not a blanket here; the `suppressions` ledger still counts it",
    },
    {
      files: "export const a = 1;\n// biome-ignore-end lint/suspicious/noBitwiseOperators: no start\n",
      at: "packages/kit/src/end-only.ts",
      why: "an `-end` with no `-start` closes nothing and suppresses nothing (biome warns) — not a blanket",
    },
    {
      files: "// @ts-expect-error deliberate\nexport const a: number = 'x';\n// @ts-ignore also line-scoped\nexport const b: number = 'y';\n",
      at: "packages/kit/src/ts-line.ts",
      why: "`@ts-expect-error` / `@ts-ignore` are line-scoped; only `@ts-nocheck` is the file switch",
    },
    {
      files: {
        "biome.json": '{ "files": { "includes": ["**"] } }\n',
        "packages/client/src/styles/x.css": ".a { color: red; }\n",
        "eslint.config.js": "export default [];\n",
      },
      why: "the resource proof owns a real candidate index, so this clean CSS/JS/config trio exercises the tracked-text and staged-delta arms without a private real-tree anchor",
    },
  ].map(resourceProof),
});
