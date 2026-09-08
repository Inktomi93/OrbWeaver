// Gate: no-blanket-suppression — a FILE-WIDE lint/type suppression is structurally unavailable in authored
// code AND tests (#962): `biome-ignore-all` in every spelling and position, `@ts-nocheck`, an UNCLOSED
// `biome-ignore-start` / `eslint-disable` block (biome 2.5.1 extends an unclosed range to EOF and only WARNS,
// which `--diagnostic-level=error` hides; eslint disables to EOF silently), and a closed range that encloses
// the file's every statement (a blanket in disguise). THREE ARMS over ONE directive reader
// (`suppressions.ts` `readDirectiveComment`): A the harness fileset (working tree, TS/TSX) · B every other
// file biome lints — js/jsx/mjs/cjs/mts/cts/json/jsonc/css from the TRACKED corpus (`git ls-files`, never an
// FS walk) minus biome.json's own top-level ignores (derived, declared as a skip) · C THE INDEX — `git grep
// --cached` candidates re-judged from their STAGED blobs, so a stale staged blob cannot commit merely
// because the working file removed it (the #954 shape); arm C reports only what the working tree does NOT
// carry, arm A/B report the rest. NO allowlist, NO baseline, `markerImmune`: the two sanctioned escapes —
// narrow to a line/range (counted by `suppressions`) or move the whole-file decision to a `biome.json`
// override (stale-armed by `biome-grant-liveness`) — are each governed elsewhere, so a marker here would be
// an ungoverned third door (docs/design/962-blanket-suppression-control-plane.md §2.4). COMMENT POSTURE:
// comments-INTENDED — the directive IS a comment; a spelling inside a string or mid-sentence is inert.
// DECLARED LIMITS (each a mustPass row): arms B+C need a git work tree, so they run only on a root carrying
// this module (the §4.5 anchor) — a conformance mini-project proves arm A, the pin proves B, C and the real
// tree; a `// eslint-disable` LINE comment is not a block directive (eslint ignores it) and is not judged.
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { SourceFile } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { commentSpansInText, parseScratch } from "../lib/comment-spans.ts";
import { globMatcher, memberSources } from "../lib/grant-liveness.ts";
import { repoRel } from "../lib/pass.ts";
import type { SuppressionSite } from "./suppressions.ts";
import { readDirectiveComment, suppressionSites } from "./suppressions.ts";

const GATE_SELF = "tooling/src/verify/gates/no-blanket-suppression.ts";
const CONFIG_REL = "biome.json";
const DESIGN = "docs/design/962-blanket-suppression-control-plane.md";
const NEGATION_PREFIX = "!";
const NEWLINE = 10;
/** `git grep -l` lists paths and `git show :<path>` yields one blob — 16 MiB is orders above either; a blob
 *  past it is a KILLED child (status null), which reads as a refusal, never as a clean zero. */
const GIT_MAX_BUFFER_BYTES = 16_777_216;

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
const GOVERNED_PATHSPECS: readonly string[] = Object.keys(READER_BY_EXT).map((ext) => `*${ext}`);

/** The index CANDIDATE FENCE (an ERE for `git grep -E`): a blob without any of these openers cannot carry a
 *  blanket, so the fence only ever skips work — the reader decides. Unanchored on purpose: a directive can
 *  trail code on its line. The eslint half admits only the BLOCK form (`/* eslint-disable` + space or `*`),
 *  never `-next-line`/`-line`. */
const INDEX_FENCE = String.raw`(//|/\*+|\{/\*+)[[:space:]]*(biome-ignore-all|biome-ignore-start|@ts-nocheck)|/\*[[:space:]]*eslint-disable([[:space:]]|\*)`;

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

const MSG_CONFIG_MISSING =
  `${CONFIG_REL} is not at the repo root — the tracked-corpus arm cannot derive biome's ignore set, so its verdict is ` +
  `unknowable and a ✓ would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). See ${GATE_SELF}.`;

const MSG_CONFIG_UNPARSEABLE =
  `${CONFIG_REL} did not parse as STRICT JSON — fail LOUD, never fall back to a default (a silently-defaulted lint config ` +
  `lints nothing this repo asked for). Fix the JSON. See ${GATE_SELF}.`;

const MSG_CORPUS_BLIND =
  "the tracked-file corpus came back EMPTY on a real tree — `git ls-files` failed or this is not a work tree, so the " +
  `non-harness arm judged nothing and a ✓ would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). See ${GATE_SELF}.`;

const MSG_INDEX_BLIND = (detail: string): string =>
  `the INDEX arm could not read the index — ${detail}. The staged-blob control is the #954 fence; a run that cannot ` +
  `read the index is not a verdict (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). See ${GATE_SELF}.`;

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
type IgnoreRead =
  | { readonly kind: "ok"; readonly ignored: (rel: string) => boolean }
  | { readonly kind: "missing" }
  | { readonly kind: "unparseable"; readonly detail: string };

interface BiomeFiles {
  readonly files?: { readonly includes?: readonly string[] };
}

/** biome's top-level ignore set (`files.includes` negations), as a predicate. A file biome never lints cannot
 *  carry a live directive; the count is declared on the scan line, never silently dropped. */
function readBiomeIgnores(root: string): IgnoreRead {
  const abs = join(root, CONFIG_REL);
  if (!existsSync(abs)) {
    return { kind: "missing" };
  }
  try {
    const config = JSON.parse(readFileSync(abs, "utf8")) as BiomeFiles;
    const matchers = (config.files?.includes ?? []).filter((p) => p.startsWith(NEGATION_PREFIX)).map((p) => globMatcher(p.slice(NEGATION_PREFIX.length)));
    return { kind: "ok", ignored: (rel) => matchers.some((matches) => matches(rel)) };
  } catch (error) {
    // The parse failure IS the finding: its text rides into the refusal so the operator reads WHY strict JSON balked.
    return { kind: "unparseable", detail: error instanceof Error ? error.message : String(error) };
  }
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
  readonly candidates: number;
  readonly scanned: number;
  readonly ignored: number;
  readonly blind: boolean;
}

/** Arm B: every tracked file biome lints that the harness walk did not already carry. */
function judgeTrackedCorpus(root: string, walked: ReadonlySet<string>, ignored: (rel: string) => boolean): CorpusOutcome {
  const tracked = memberSources(root).repoPaths;
  if (tracked.length === 0) {
    return { verdicts: [], candidates: 0, scanned: 0, ignored: 0, blind: true };
  }
  const candidates = tracked.filter((rel) => isGovernedExt(rel) && !walked.has(rel));
  const verdicts: FileVerdict[] = [];
  let skipped = 0;
  for (const rel of candidates) {
    if (ignored(rel)) {
      skipped += 1;
      continue;
    }
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      continue; // tracked but deleted in the working tree — nothing to judge here; arm C still sees the index
    }
    verdicts.push({ rel, blankets: judgeBytes(rel, readFileSync(abs, "utf8")) });
  }
  return { verdicts, candidates: candidates.length, scanned: verdicts.length, ignored: skipped, blind: false };
}

/** Arm C's outcome is DISCRIMINATED: a run that could not read the index is not a partial verdict with a
 *  note beside it — it is no verdict (the laundering shape `caught-failure-ownership` refuses is exactly
 *  "success data with an error field beside it"). */
type IndexOutcome =
  | { readonly kind: "ok"; readonly verdicts: readonly FileVerdict[]; readonly candidates: number }
  | { readonly kind: "blind"; readonly detail: string };

/** Arm C: the index's candidate blobs, re-judged by the same readers. `git grep` exits 1 on no match. */
function judgeIndex(root: string, ignored: (rel: string) => boolean): IndexOutcome {
  const grep = runNicedSync("git", ["grep", "--cached", "-l", "-I", "-E", INDEX_FENCE, "--", ...GOVERNED_PATHSPECS], {
    cwd: root,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (grep.status !== 0 && grep.status !== 1) {
    return { kind: "blind", detail: `git grep --cached exited ${String(grep.status)}: ${grep.stderr.trim()}` };
  }
  const candidates = grep.stdout.split("\n").filter((rel) => rel !== "" && isGovernedExt(rel) && !ignored(rel));
  const verdicts: FileVerdict[] = [];
  for (const rel of candidates) {
    // The staged BLOB, never the working file. A non-zero status (or a killed child) voids the whole index
    // verdict — a run that cannot read the index is no verdict, not a partial one.
    const shown = runNicedSync("git", ["show", `:${rel}`], { cwd: root, maxBuffer: GIT_MAX_BUFFER_BYTES });
    if (shown.status !== 0) {
      return { kind: "blind", detail: `git show :${rel} exited ${String(shown.status)}: ${shown.stderr.trim()}` };
    }
    verdicts.push({ rel, blankets: judgeBytes(rel, shown.stdout) });
  }
  return { kind: "ok", verdicts, candidates: candidates.length };
}

/** The working tree's blankets for one path, by the same readers (absent file ⇒ none). */
function workingBlankets(root: string, rel: string, walked: ReadonlyMap<string, readonly Blanket[]>): readonly Blanket[] {
  const fromWalk = walked.get(rel);
  if (fromWalk !== undefined) {
    return fromWalk;
  }
  const abs = join(root, rel);
  return existsSync(abs) ? judgeBytes(rel, readFileSync(abs, "utf8")) : [];
}

/** Arm C reports only the DELTA: an index blanket (by token + kind) the working tree does not also carry —
 *  the rest is arm A/B's finding, reported once. */
function indexOnly(index: readonly Blanket[], working: readonly Blanket[]): readonly Blanket[] {
  const carried = new Set(working.map((b) => `${b.token} ${b.kind}`));
  return index.filter((b) => !carried.has(`${b.token} ${b.kind}`));
}

// ── reporting ─────────────────────────────────────────────────────────────────────────────────────────
function reportBlanket(ctx: GateRunCtx, file: string, blanket: Blanket, staged: boolean): void {
  const detail = KIND_MESSAGE[blanket.kind](blanket.token);
  ctx.report({ file, line: blanket.line, column: 0, token: blanket.token, message: staged ? INDEX_PREFIX + detail : detail });
}

function reportFileLevel(ctx: GateRunCtx, file: string, message: string): void {
  ctx.report({ file, line: 0, column: 0, message });
}

/** Arm A over the harness fileset; returns every walked file's verdict so arm C can diff against it. */
function reportHarnessArm(ctx: GateRunCtx): Map<string, readonly Blanket[]> {
  const walked = new Map<string, readonly Blanket[]>();
  for (const sf of ctx.files) {
    const rel = repoRel(ctx.root, sf.getFilePath());
    const blankets = judgeSourceFile(sf);
    walked.set(rel, blankets);
    for (const blanket of blankets) {
      reportBlanket(ctx, rel, blanket, false);
    }
  }
  return walked;
}

function runArms(ctx: GateRunCtx): void {
  const walked = reportHarnessArm(ctx);
  if (!existsSync(join(ctx.root, GATE_SELF))) {
    return; // not a real tree (a conformance mini-project) — arms B+C are a declared limit here
  }
  const ignores = readBiomeIgnores(ctx.root);
  if (ignores.kind !== "ok") {
    reportFileLevel(ctx, CONFIG_REL, ignores.kind === "missing" ? MSG_CONFIG_MISSING : `${MSG_CONFIG_UNPARSEABLE} (${ignores.detail})`);
    return;
  }
  runGitBackedArms(ctx, walked, ignores.ignored);
}

/** Arms B + C, on a root that carries the anchor. */
function runGitBackedArms(ctx: GateRunCtx, walked: Map<string, readonly Blanket[]>, ignored: (rel: string) => boolean): void {
  const corpus = judgeTrackedCorpus(ctx.root, new Set(walked.keys()), ignored);
  if (corpus.blind) {
    reportFileLevel(ctx, GATE_SELF, MSG_CORPUS_BLIND);
  }
  for (const { rel, blankets } of corpus.verdicts) {
    walked.set(rel, blankets);
    for (const blanket of blankets) {
      reportBlanket(ctx, rel, blanket, false);
    }
  }
  const index = judgeIndex(ctx.root, ignored);
  if (index.kind === "blind") {
    reportFileLevel(ctx, GATE_SELF, MSG_INDEX_BLIND(index.detail));
  }
  const indexVerdicts = index.kind === "ok" ? index.verdicts : [];
  const indexCandidates = index.kind === "ok" ? index.candidates : 0;
  for (const { rel, blankets } of indexVerdicts) {
    for (const blanket of indexOnly(blankets, workingBlankets(ctx.root, rel, walked))) {
      reportBlanket(ctx, rel, blanket, true);
    }
  }
  ctx.scan({
    unit: "file",
    candidates: corpus.candidates + indexCandidates,
    scanned: corpus.scanned + indexVerdicts.length,
    skipped: { "biome-ignored": corpus.ignored, "index-candidates": indexCandidates },
  });
}

// ── self-proof fixtures ──────────────────────────────────────────────────────────────────────────────
const TWO_STATEMENTS = "export const a = 1 | 2;\nexport const b = 3;\n";

export const gate: GateDescriptor = {
  name: "no-blanket-suppression",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  markerImmune: true,
  message: MESSAGE,
  fix: FIX,
  // Every harness file is a candidate (arm A's denominator is the walk itself); arms B+C add their own units.
  scanRoot: () => true,
  run: runArms,
  mustFlag: [
    {
      files: `// biome-ignore-all lint/suspicious/noBitwiseOperators: fixture\n${TWO_STATEMENTS}`,
      at: "packages/kit/src/top.ts",
      expect: { count: 1, token: "biome-ignore-all", line: 1 },
      why: "the founding shape — a top-of-file `biome-ignore-all` suppresses the whole file",
    },
    {
      files: `/* biome-ignore-all lint/suspicious/noBitwiseOperators: fixture */\n${TWO_STATEMENTS}`,
      at: "packages/kit/src/block.ts",
      expect: { count: 1, token: "biome-ignore-all" },
      why: "the block-comment spelling is honoured by biome exactly like the line spelling",
    },
    {
      files: `{/* biome-ignore-all lint/suspicious/noBitwiseOperators: fixture */}\n${TWO_STATEMENTS}`,
      at: "tests/ui/jsx.test.tsx",
      expect: { count: 1, token: "biome-ignore-all" },
      why: "a JSX comment container — biome rejects it with a hidden warning, so it sits looking like protection; still banned, and tests are governed",
    },
    {
      files: "export const a = 1 | 2;\n// biome-ignore-all lint/suspicious/noBitwiseOperators: fixture\nexport const b = 3 & 4;\n",
      at: "packages/kit/src/mid.ts",
      expect: { count: 1, token: "biome-ignore-all", line: 2 },
      why: "a mid-file `-all` is dead text biome warns about invisibly — the spelling is banned in every position",
    },
    {
      files: `// biome-ignore-all lint: fixture\n${TWO_STATEMENTS}`,
      at: "packages/kit/src/category.ts",
      expect: { count: 1, token: "biome-ignore-all" },
      why: "the category-wide, rule-less spelling suppresses EVERY lint rule for the file",
    },
    {
      files: '// @ts-nocheck\nexport const a: number = "x";\n',
      at: "packages/kit/src/nocheck.ts",
      expect: { count: 1, token: "@ts-nocheck" },
      why: "the type-checker's whole-file switch is the same class",
    },
    {
      files: `/* eslint-disable */\n${TWO_STATEMENTS}`,
      at: "packages/client/src/features/x/lib/eslint-bare.ts",
      expect: { count: 1, token: "eslint-disable", messageIncludes: "never closed" },
      why: "a bare eslint block disable with no `eslint-enable` disables everything to EOF, silently",
    },
    {
      files: `/* eslint-disable jsx-a11y/no-autofocus */\n${TWO_STATEMENTS}`,
      at: "packages/client/src/features/x/lib/eslint-rule.ts",
      expect: { count: 1, token: "eslint-disable", messageIncludes: "never closed" },
      why: "a rule-scoped eslint block disable is still unbounded without its `eslint-enable`",
    },
    {
      files: `// biome-ignore-start lint/suspicious/noBitwiseOperators: fixture\n${TWO_STATEMENTS}`,
      at: "scripts/probes/unclosed.ts",
      expect: { count: 1, token: "biome-ignore-start", messageIncludes: "never closed" },
      why: "biome 2.5.1 extends an unclosed `-start` to end of file and only WARNS (probe 2026-09-02) — and scripts are governed",
    },
    {
      files:
        "// biome-ignore-start lint/suspicious/noBitwiseOperators: fixture\nexport const a = 1 | 2;\n" +
        "// biome-ignore-end lint/style/noProcessEnv: a DIFFERENT rule\nexport const b = 3;\n",
      at: "tooling/src/x/lib/mismatch.ts",
      expect: { count: 1, token: "biome-ignore-start", messageIncludes: "never closed" },
      why: "ranges pair by RULE KEY — an `-end` for another rule does not close this one; tooling is governed",
    },
    {
      files:
        "// biome-ignore-start lint/suspicious/noBitwiseOperators: fixture\nexport const a = 1 | 2;\nexport const b = 3;\n// biome-ignore-end lint/suspicious/noBitwiseOperators: fixture\n",
      at: "packages/kit/src/whole.ts",
      expect: { count: 1, token: "biome-ignore-start", messageIncludes: "EVERY statement" },
      why: "a CLOSED range that encloses every statement is a blanket in disguise",
    },
    {
      files: `/* eslint-disable */\n${TWO_STATEMENTS}/* eslint-enable */\n`,
      at: "packages/client/src/features/x/lib/eslint-whole.ts",
      expect: { count: 1, token: "eslint-disable", messageIncludes: "EVERY statement" },
      why: "the eslint block form of the same disguise",
    },
    {
      files: `// biome-ignore-all lint/style/useNamingConvention: fixture\n${TWO_STATEMENTS}`,
      at: "tests/server/domain/x/y.test.ts",
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
      why: "DECLARED LIMIT — arms B (tracked non-TS corpus) and C (the index) need a git work tree and run only on a root carrying this gate's own module (§4.5); a mini-project has neither, so a clean CSS/JS/config trio is silent here and the git-backed arms are proven by tests/tooling/verify/gates/no-blanket-suppression.repo.int.test.ts (an in-memory example is walked by arm A whatever its extension, so a blanket planted here would be arm A's finding, never a limit)",
    },
  ],
};
