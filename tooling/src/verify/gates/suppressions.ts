// Gate: suppressions — a both-ways per-file ratchet over authored typed source in package source,
// tooling, scripts AND tests (#962: `tests/**` joined 2026-09-02 — a test suppression is budgeted, two-sided,
// exactly like a source one). Detection accepts exact comment directives, including biome start/end
// ranges, eslint block enable/disable and `@ts-nocheck`; prose and strings do not count. TWO ratification
// tables, one per governed SCOPE (RATIFIED_RULES for source, RATIFIED_TEST_RULES for tests — the WHY differs
// by scope, so one table with a flag would ratify a test marker under a source reason that is false for it);
// unlisted rules remain debt. Regenerate only through `verify baseline suppressions`; ordinary changes may only shrink rows.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { ts } from "ts-morph";
import type { RatchetRow } from "../../_shared/ratchet-rows.ts";
import { admissionFor, classNote, readBudgetRows } from "../../_shared/ratchet-rows.ts";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import type { GovernedScope } from "../contract/suppressions.ts";
import { GOVERNED_SCOPES } from "../contract/suppressions.ts";
import { forEachTriviaCarrier } from "../lib/comment-spans.ts";

export const BASELINE_REL = "tooling/src/verify/gates/suppressions.baseline.json";
const PACKAGE_SOURCE_RE = /^packages\/[^/]+\/src\/.*\.tsx?$/u;
const TOOLING_SOURCE_RE = /^tooling\/src\/.*\.tsx?$/u;
const SCRIPT_SOURCE_RE = /^scripts\/.*\.tsx?$/u;
const TEST_SOURCE_RE = /^tests\/.*\.tsx?$/u;
const CAPTURED_RUNTIME_PREFIX = "scripts/probes/st-goldens/sillytavern-runtime/";
const COMMENT_OPEN = String.raw`(?:\/\/|\/\*+|\{\/\*+)`;
const DIRECTIVE_TOKEN = String.raw`(?:biome-ignore(?:-all|-start|-end)?|eslint-(?:disable(?:-next-line|-line)?|enable)|@ts-expect-error|@ts-ignore|@ts-nocheck)`;
const SUPPRESSION_RE = new RegExp(String.raw`^\s*${COMMENT_OPEN}\s*(${DIRECTIVE_TOKEN})\b`, "u");
/** The RULE a marker names — the classification key. `biome-ignore[-all|-start|-end] <rule>:`, an
 *  `eslint-disable*` rule id, or the bare TypeScript directive (which names no rule and is its own key). */
const RULE_RE = new RegExp(
  String.raw`^\s*${COMMENT_OPEN}\s*(?:biome-ignore(?:-all|-start|-end)?\s+(\S+?):|eslint-(?:disable(?:-next-line|-line)?|enable)\s+([^\s:,*]+)|(@ts-expect-error|@ts-ignore|@ts-nocheck)\b)`,
  "u",
);

/** Why one RULE's markers are permanent: `ruling` = the code is deliberately this way and a stated
 *  invariant says so; `tool-fp` = the analyzer is WRONG about this code (a documented false positive). */
interface RatifiedRule {
  readonly kind: "ruling" | "tool-fp";
  readonly why: string;
}

/** Ratification is derived by rule class PER SCOPE; absent classes remain debt. The per-file exceed arm still
 *  rejects every new marker, while a class matching zero live sites in its scope is stale and rejected.
 *  This is the SOURCE table (packages/tooling/scripts); tests have their own below. */
const RATIFIED_RULES: Readonly<Record<string, RatifiedRule>> = {
  "lint/style/useNamingConvention": {
    kind: "ruling",
    why: "wire vocabulary — the snake_case key IS the protocol/format (ST cards, OpenAI-compatible bodies, the mode literals); renaming forks the wire",
  },
  "lint/suspicious/noArrayIndexKey": { kind: "ruling", why: "positional identity — the index IS the row's identity in a snapshot nothing reorders mid-list" },
  "lint/suspicious/noUnnecessaryConditions": {
    kind: "tool-fp",
    why: "biome's type service cannot see through the cross-package zod-union inference, so a live runtime branch reads as unreachable",
  },
  "lint/style/useErrorCause": {
    kind: "tool-fp",
    why: "the cause IS forwarded — biome inspects only the 2nd constructor argument and misses a 3rd-arg ErrorOptions passed to super()",
  },
  "lint/suspicious/noDeprecatedImports": {
    kind: "ruling",
    why: "the vendor deprecates an overload we do not use; the supported form is what the call site spells",
  },
  "lint/style/noMagicNumbers": {
    kind: "ruling",
    why: "spec constants (the PNG file signature, the WCAG sRGB linearization threshold) — a named alias would obscure the standard it quotes",
  },
  "lint/a11y/useSemanticElements": {
    kind: "ruling",
    why: "a hand-rolled ARIA mechanism no native element can render (the D58 segmented SVG magnitude family, ui-package-design §10.4)",
  },
  "lint/nursery/useNullishCoalescing": {
    kind: "tool-fp",
    why: "a real boolean OR on defaulted `boolean` operands — `??` only falls through on null/undefined and would silently ignore an explicit false",
  },
  "lint/suspicious/noBitwiseOperators": { kind: "ruling", why: "byte codecs (PNG/CRC) are DEFINED in bitwise terms — the operators are the specification" },
  "@typescript-eslint/no-unnecessary-condition": {
    kind: "tool-fp",
    why: "the lib type is wider than the runtime value (JSON.stringify(undefined) is `undefined` despite a `string` signature)",
  },
  "lint/nursery/noComponentHookFactories": {
    kind: "tool-fp",
    why: "the factories run at MODULE scope, so the returned hook has a stable identity — the re-mount hazard the rule guards cannot occur",
  },
  "lint/suspicious/noExplicitAny": {
    kind: "ruling",
    why: "type-extraction-only instantiation of a vendor's own generic escape hatch — never a runtime value, never reaches app logic",
  },
  "jsx-a11y/no-autofocus": { kind: "ruling", why: "deliberate focus placement on a surface the user just opened for that field" },
  "jsx-a11y/control-has-associated-label": { kind: "tool-fp", why: "the label is supplied by a nested/sibling control the rule's traversal does not reach" },
  "lint/style/useShorthandFunctionType": {
    kind: "ruling",
    why: "the shorthand `export type X = (…) => …` trips the house `no-inline-types` gate outside a contract home — two house rules collide and the gate wins",
  },
  "lint/correctness/useExhaustiveDependencies": {
    kind: "tool-fp",
    why: "value-keyed deps — inline array literals are fresh refs each render and would re-arm every render (the measured keystroke regression)",
  },
  "lint/style/noNonNullAssertion": { kind: "ruling", why: "the index is bound-proved one line above; the assertion states what the loop guarantees" },
  "lint/a11y/noNoninteractiveElementInteractions": {
    kind: "tool-fp",
    why: "the handler is a load-status callback (onError), not a user interaction — the standard React fallback pattern",
  },
  "lint/a11y/noLabelWithoutControl": { kind: "tool-fp", why: "the control is nested INSIDE the label, which the rule's traversal misses" },
  "react-hooks/exhaustive-deps": { kind: "tool-fp", why: "the eslint twin of the value-keyed deps ruling above — same site, same reason" },
  "lint/complexity/noExcessiveCognitiveComplexity": {
    kind: "ruling",
    why:
      "flat ENUMERATIONS, not tangled control flow (#596): every increment is one independent column or step of a one-home inventory " +
      "at real nesting depth 0 — a DB column list's `?? null` per column (canon-write `variantEconomics`, 20), the rebuild fold's signed " +
      "mirror per column (stats-delta `canonMessageDelta`, 28), and the ordered boot/teardown protocol (entry/lifecycle, 45 + 20). " +
      "Biome scores the enumeration's LENGTH and then DOUBLES every increment for a closure — nine null-guarded stops at depth 0 score 20 — " +
      "so the number is not measuring what the rule is for. Splitting scatters the one-home shape the enumeration exists to show (the " +
      "column list, the drift-gate mirror, the boot ordering). Each site states its own ruling at the marker; the EXCEED arm still REDs a " +
      "NEW marker past the file's budget, so this ratifies the decided set and not the next one written.",
  },
  "lint/complexity/useMaxParams": {
    kind: "ruling",
    why: "the signature MIRRORS an injected cross-feature contract (a positional delegate); narrowing it forks the contract",
  },
  "react-you-might-not-need-an-effect/no-external-store-subscription": {
    kind: "ruling",
    why: "the subscription drives an IMPERATIVE flush (jump the reveal cursor), not a state mirror",
  },
  "react-you-might-not-need-an-effect/no-derived-state": {
    kind: "ruling",
    why: "not derivable in render — it runs only once the bus echo CONFIRMS the row is gone from the roster",
  },
  "lint/nursery/useExplicitReturnType": {
    kind: "ruling",
    why: "inference-carried by design (the form factory's whole point is that its result type is derived, not spelled)",
  },
  "lint/performance/noNamespaceImport": {
    kind: "ruling",
    why: "drizzle needs the whole schema module both as a value and as `typeof schema` — the canonical vendor pattern",
  },
  "lint/a11y/noStaticElementInteractions": {
    kind: "ruling",
    why: "an APG pattern whose interactive semantics live on the children (roving tabindex), stated at the site",
  },
  "lint/a11y/noNoninteractiveTabindex": {
    kind: "ruling",
    why: "WCAG 2.1.1 keyboard-scrollable overflow region — tabIndex=0 is what makes arrow/Page scrolling reachable without a mouse",
  },
  "jsx-a11y/no-noninteractive-tabindex": { kind: "ruling", why: "the eslint twin of the scrollable-region ruling on the same element" },
  "jsx-a11y/interactive-supports-focus": { kind: "ruling", why: "the APG grid pattern — focus lives on the gridcell children, never the row" },
  "lint/a11y/useFocusableInteractive": {
    kind: "ruling",
    why: "rows are structural groupings in the APG grid pattern; a focusable row would create a second tab stop",
  },
  "lint/style/useNumericSeparators": { kind: "ruling", why: "a standard constant quoted verbatim — separators would obscure the value the spec names" },
  format: { kind: "ruling", why: "a byte blob kept on ONE line on purpose — the formatter's wrap would make it unreadable and diff-noisy" },
  "lint/complexity/noUselessConstructor": { kind: "ruling", why: "the narrowing constructor IS the point — it pins the error subclass's argument type" },
  "lint/correctness/useYield": { kind: "ruling", why: "an empty async generator IS the held-open no-turn prompt (the agent-sdk catalog's designed shape)" },
  "lint/suspicious/noControlCharactersInRegex": { kind: "ruling", why: "the regex exists to STRIP control characters — naming them is the function" },
  "@ts-expect-error": {
    kind: "ruling",
    why: "probe-only compatibility seams intentionally import untyped JS or browser-virtual modules whose runtime shape is asserted immediately after the directive",
  },
  "lint/complexity/noUselessReturn": {
    kind: "tool-fp",
    why: "the explicit fallthrough return satisfies TypeScript noImplicitReturns because sibling branches return values",
  },
  "lint/complexity/noUselessUndefined": {
    kind: "tool-fp",
    why: "the explicit undefined fallthrough satisfies TypeScript noImplicitReturns because sibling branches return values",
  },
  "lint/nursery/noConditionalExpect": {
    kind: "tool-fp",
    why: "the call is the codemod kit's guard-clause assert helper, not a test-runner expectation",
  },
  "lint/nursery/noPlaywrightNetworkidle": {
    kind: "ruling",
    why: "an explicit probe/golden-harness observation mode asks for bounded network quiet; it is not a test readiness guess",
  },
  "lint/nursery/noPlaywrightWaitForSelector": {
    kind: "ruling",
    why: "the foreign ST golden harness has no owned semantic locator contract, so its dynamic DOM selector is the integration boundary",
  },
  "lint/nursery/noPlaywrightWaitForTimeout": {
    kind: "ruling",
    why: "probe/golden harnesses deliberately observe a bounded time window; they are instruments, not polling test assertions",
  },
  "lint/style/noProcessEnv": {
    kind: "ruling",
    why: "tool and probe launch boundaries own ambient harness knobs and child-process inheritance; they are outside the app configuration perimeter",
  },
  "lint/suspicious/noTemplateCurlyInString": {
    kind: "tool-fp",
    why: "gate self-proof strings intentionally carry template-literal source text for the synthetic project to parse",
  },
  "lint/suspicious/useAwait": {
    kind: "ruling",
    why: "a buffered replay generator has nothing to await but must remain async to implement the AsyncIterable contract",
  },
};

/** The TESTS table (#962). A test suppression is permanent for a different reason than a source one: the
 *  test's SUBJECT is the boundary, the wire, or the codec the rule exists to keep out of product code. Every
 *  test marker under a rule NOT listed here is DEBT — visible in the ledger and burnable (`pnpm debt`). */
const RATIFIED_TEST_RULES: Readonly<Record<string, RatifiedRule>> = {
  "lint/style/useNamingConvention": {
    kind: "ruling",
    why: "the fixture mirrors a FOREIGN wire (ST cards/chats/settings, OpenAI-compatible bodies, OIDC claims, SDK frames, env keys) — the snake_case/CONSTANT key IS the format under test; renaming forks the fixture from the wire",
  },
  "lint/style/noProcessEnv": {
    kind: "ruling",
    why: "the test's SUBJECT is the env boundary — it crafts `process.env` to drive the sole env reader, or reads ONE opt-in gate flag for a hardware-gated suite; there is no other seam to drive",
  },
  "lint/correctness/noProcessGlobal": {
    kind: "ruling",
    why: "a `vi.hoisted` setup body runs before the file's own `node:process` import binds, so the global is the only handle the hoisted setup has",
  },
  "lint/suspicious/noBitwiseOperators": {
    kind: "ruling",
    why: "an INDEPENDENT reference codec (a textbook CRC-32, hand-crafted zip/PNG bytes) written in the operators that define it — the test proves the shipped codec against a second implementation",
  },
  "lint/suspicious/noExplicitAny": {
    kind: "ruling",
    why: "deliberately off-schema / hostile input pushed PAST the wire type to prove the runtime boundary refuses it — the `any` is the test's instrument, never a value the code under test owns",
  },
  "lint/style/useThrowOnlyError": {
    kind: "ruling",
    why: "a DEPENDENCY's non-Error throw is the test's SUBJECT — the arm proves the app's error path (policied 500, request id, ring entry) holds when foreign code throws a string; our own code obeys the rule and the fixture is the instrument, never a value the code under test owns",
  },
  "@ts-expect-error": {
    kind: "ruling",
    why: "a type-level NEGATIVE pin (`.test-d` and inline): the directive IS the assertion that the type refuses the shape, and tsc reds the day it stops; plus an untyped `.cjs` config import whose shape is asserted immediately after",
  },
};

/** The table for one scope — the ONE dispatch, so the histogram, the ratified count and the stale sweep can
 *  never read different tables for the same file. A mapped Record: a new scope fails tsc until it has one. */
const TABLE_FOR: Readonly<Record<GovernedScope, Readonly<Record<string, RatifiedRule>>>> = {
  source: RATIFIED_RULES,
  tests: RATIFIED_TEST_RULES,
};

/** One file's markers as a per-rule histogram, sorted for a stable ledger diff. */
function ruleHistogram(sites: readonly SuppressionSite[], ratified: boolean, scope: GovernedScope): readonly string[] {
  const table = TABLE_FOR[scope];
  const byRule = new Map<string, number>();
  for (const site of sites) {
    const key = site.rule ?? "(no rule named)";
    if ((site.rule !== null && site.rule in table) === ratified) {
      byRule.set(key, (byRule.get(key) ?? 0) + 1);
    }
  }
  return [...byRule].sort(([a], [b]) => a.localeCompare(b)).map(([rule, n]) => (ratified ? `${rule}×${n} (${table[rule]?.kind ?? "ruling"})` : `${rule}×${n}`));
}

/** The WHY the generator writes into one row — BOTH halves, so the ledger reads as a classification and not
 *  as a number: which rules ratify the permanent portion, and which rules the DEBT portion is still carrying
 *  (the gray zone a burn-down claims). Null only when the file has no markers at all. */
export function classWhy(sites: readonly SuppressionSite[], scope: GovernedScope): string | null {
  const ratified = ruleHistogram(sites, true, scope);
  const debt = ruleHistogram(sites, false, scope);
  const parts: string[] = [];
  if (ratified.length > 0) {
    const table = scope === "tests" ? "RATIFIED_TEST_RULES" : "RATIFIED_RULES";
    parts.push(`ratified by rule: ${ratified.join(", ")} — each rule's ruling/tool-FP reason lives in ${table} (${GATE_SELF})`);
  }
  if (debt.length > 0) {
    parts.push(`burnable debt: ${debt.join(", ")} — no RATIFIED_RULES entry, so these are still a live population`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

/** ONE live suppression marker: where it is, which marker shape it wears, and the RULE it names (null when
 *  the marker names none — a bare TypeScript directive, or a spelling this reader cannot parse; either way
 *  an unclassifiable marker falls to DEBT, which is the conservative direction). */
export interface SuppressionSite {
  readonly line: number;
  readonly token: string;
  readonly rule: string | null;
  /** A `/* … *\/` (or JSX `{/* … *\/}`) comment, as opposed to a `//` line comment — eslint honours its
   *  BLOCK directives (`eslint-disable`/`eslint-enable`) only in the former (#962's blanket judge). */
  readonly block: boolean;
}

/** The one governed authored typed-source set shared by enforcement and baseline generation — the scope
 *  derivation IS the admission test, so a file cannot be governed without a scope or scoped without being
 *  governed. `undefined` = not governed (the captured foreign runtime, anything off the four roots). */
export function governedScope(repoRelPath: string): GovernedScope | undefined {
  const captured = repoRelPath.startsWith(CAPTURED_RUNTIME_PREFIX);
  if (!captured && (PACKAGE_SOURCE_RE.test(repoRelPath) || TOOLING_SOURCE_RE.test(repoRelPath) || SCRIPT_SOURCE_RE.test(repoRelPath))) {
    return "source";
  }
  return !captured && TEST_SOURCE_RE.test(repoRelPath) ? "tests" : undefined;
}

/** The one governed authored typed-source set shared by enforcement and baseline generation. */
export function isGovernedTypedSource(repoRelPath: string): boolean {
  return governedScope(repoRelPath) !== undefined;
}

/** The directive GRAMMAR as one door: a comment's text → its token + the rule it names, or null when the
 *  comment is not a directive at its OPENER (the mention fence — a quotation mid-sentence, or a spelling
 *  inside a string, is inert). Shared with `no-blanket-suppression` (#962) so "what is a directive" has
 *  one home for TS trivia, scratch-parsed JS, and the CSS/JSON comment lexer alike. */
export function readDirectiveComment(text: string): Pick<SuppressionSite, "token" | "rule"> | null {
  const match = SUPPRESSION_RE.exec(text);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec can return null; Biome narrows this constructed grammar incorrectly.
  if (match === null) {
    return null;
  }
  const ruleMatch = RULE_RE.exec(text);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RULE_RE is stricter than detection, so a matched directive can still have no parsed rule.
  return { token: match[1] ?? match[0], rule: ruleMatch?.[1] ?? ruleMatch?.[2] ?? ruleMatch?.[3] ?? null };
}

/** Every suppression-marker comment in one source file, in source order (line, matched token).
 *  Three carriers, each de-duplicated by source position so one physical comment counts once:
 *  (1) LEADING comment ranges (the common `// biome-ignore …` / `// eslint-disable …` shape);
 *  (2) TRAILING comment ranges (a suppression trailing the statement it guards, e.g. a same-block
 *  `else if` arm's closing brace swallows what would otherwise be the next node's leading comment);
 *  (3) a comment-only JSX expression container (`{/* eslint-disable-next-line … *\/}`) — ts-morph folds
 *  that into the JsxExpression's own node text rather than exposing it via comment ranges at all. */
export function suppressionSites(sf: SourceFile): SuppressionSite[] {
  const sites: SuppressionSite[] = [];
  const seenLines = new Set<number>(); // dedupe by LINE: the same physical comment surfaces through more
  // than one carrier (e.g. a JSX comment-only expression is BOTH its own node text and a token's trailing
  // range at an adjacent position) — a suppression marker is one-per-line in practice, so line identity is
  // the robust dedupe key (position identity drifts across carriers for the exact same comment).
  const record = (pos: number, text: string): void => {
    const directive = readDirectiveComment(text);
    if (directive === null) {
      return;
    }
    const line = sf.getLineAndColumnAtPos(pos).line;
    if (seenLines.has(line)) {
      return;
    }
    seenLines.add(line);
    sites.push({ line, token: directive.token, rule: directive.rule, block: !text.startsWith("//") });
  };
  // A TOKEN-carrier walk (never `forEachDescendant`): a same-block trailing suppression — an `else if`
  // arm's last statement — attaches its comment range to a token node (a CloseBraceToken), and a node-only
  // traversal misses those carriers entirely, in the permissive direction. `forEachTriviaCarrier` is that
  // walk over RAW compiler nodes: the same carrier set and the same document order as the kind-less
  // `getDescendants()` it replaced, without wrapping every token (#967).
  const fullText = sf.getFullText();
  forEachTriviaCarrier(sf, (node) => {
    for (const range of [...(ts.getLeadingCommentRanges(fullText, node.pos) ?? []), ...(ts.getTrailingCommentRanges(fullText, node.end) ?? [])]) {
      record(range.pos, fullText.slice(range.pos, range.end));
    }
    if (ts.isJsxExpression(node) && node.expression === undefined) {
      record(node.pos, fullText.slice(node.getStart(sf.compilerNode), node.end));
    }
  });
  sites.sort((a, b) => a.line - b.line);
  return sites;
}

/** The repo-relative path of governed typed source, or undefined outside the governed set. */
export function governedSourceRel(root: string, absPath: string): string | undefined {
  const rel = absPath.startsWith(root) ? absPath.slice(root.length + 1) : absPath;
  return isGovernedTypedSource(rel) ? rel : undefined;
}

/** The committed ledger through the ONE row reader — each row carries its DEBT/RATIFIED partition. */
function loadBaseline(root: string): ReadonlyMap<string, RatchetRow> {
  return readBudgetRows(root, BASELINE_REL);
}

/** How many of one file's live markers name a rule its SCOPE's table ratifies — the DERIVED half of the
 *  partition. The committed row is checked AGAINST this (below), so a hand-edited `ratified` can never
 *  out-run the tree. */
export function ratifiedSiteCount(sites: readonly SuppressionSite[], scope: GovernedScope): number {
  const table = TABLE_FOR[scope];
  return sites.filter((s) => s.rule !== null && s.rule in table).length;
}

const GATE_SELF = "tooling/src/verify/gates/suppressions.ts";
const CLASS_DRIFT_MESSAGE = (rel: string, declared: number, derived: number): string =>
  `suppressions.baseline.json row "${rel}" declares ${declared} RATIFIED marker(s) but the rule table classifies ${derived} — ` +
  "the class is DERIVED from RATIFIED_RULES, never hand-declared: fix the row (or add/remove the rule's table entry, with its why). " +
  "A ratified count the tree does not earn is a permanent admission nobody granted (#569).";
const STALE_RULE_MESSAGE = (rule: string, scope: GovernedScope): string =>
  `stale ${scope === "tests" ? "RATIFIED_TEST_RULES" : "RATIFIED_RULES"} entry — \`${rule}\` classifies ZERO live suppression markers under governed ${scope} ` +
  "typed source, so the ratification grants nothing while reading as live law. Delete the row (GATE-AUTHORING.md §4.4, every exemption vocabulary is two-sided).";
const STALE_MESSAGE = (rel: string, baseline: number, live: number): string =>
  `stale suppressions.baseline.json entry — "${rel}" is budgeted ${baseline} but has only ${live} live ` +
  "suppression marker(s): regenerate the baseline (`node tooling/src/verify/cli.ts baseline suppressions`) " +
  "to ratchet the floor down (Core-Enforcement-Active-Gates.md, suppressions row).";
const EXCEED_MESSAGE = (token: string): string =>
  `suppression marker \`${token}\` exceeds this file's committed suppressions.baseline.json budget — ` +
  "delete the suppression (fix the underlying lint/type issue) or, if genuinely warranted, regenerate the " +
  "baseline via a sanctioned bulk shift (`node tooling/src/verify/cli.ts baseline suppressions`); the ratchet " +
  "only shrinks day-to-day (Core-Enforcement-Active-Gates.md, suppressions row).";

/** The exceed-budget + stale-baseline reconciliation shared by `run` and the residual unit test (via an
 *  injected baseline — the gate-conformance runner has no baseline.json on a synthetic tree).
 *
 *  It returns the ADMITTED count beside the violations because a ratchet that reports only its violations
 *  is invisible in the single-pass's "N finding(s) admitted by ratchet baselines" line — a green run then
 *  understates the live population by this gate's entire ledger (GATE-AUTHORING.md §1; enforced by
 *  gate-modernization ARM D). Admitted = per file, the markers the committed budget absolved. */
export function reconcileSuppressions(
  root: string,
  files: readonly SourceFile[],
  baseline: ReadonlyMap<string, RatchetRow>,
): { readonly violations: Violation[]; readonly admitted: number; readonly admittedRatified: number } {
  const live = scanLive(root, files);
  const violations = [...judgeFiles(live, baseline), ...judgeRows(live, baseline), ...staleRatifiedRules(root, live.rulesByScope)];
  let admitted = 0;
  let admittedRatified = 0;
  for (const [rel, sites] of live.sites) {
    const admission = admissionFor(baseline.get(rel), sites.length);
    admitted += admission.admitted;
    admittedRatified += admission.ratified;
  }
  return { violations, admitted, admittedRatified };
}

/** What THIS RUN sees: every scanned file's markers, plus — PER SCOPE — the set of rules any of them names
 *  (each ratification table's liveness input; a rule live only in tests keeps no source row alive). */
interface LiveScan {
  readonly sites: ReadonlyMap<string, readonly SuppressionSite[]>;
  readonly rulesByScope: Readonly<Record<GovernedScope, ReadonlySet<string>>>;
}

function scanLive(root: string, files: readonly SourceFile[]): LiveScan {
  const sites = new Map<string, readonly SuppressionSite[]>();
  const rulesByScope: Record<GovernedScope, Set<string>> = { source: new Set(), tests: new Set() };
  for (const sf of files) {
    const rel = governedSourceRel(root, sf.getFilePath());
    const scope = rel === undefined ? undefined : governedScope(rel);
    if (rel === undefined || scope === undefined) {
      continue;
    }
    const found = suppressionSites(sf);
    sites.set(rel, found);
    for (const site of found) {
      if (site.rule !== null) {
        rulesByScope[scope].add(site.rule);
      }
    }
  }
  return { sites, rulesByScope };
}

/** The EXCEED arm: the markers past a file's committed budget, newest-by-source-order first. A ratified row
 *  carries its RULING into the diagnostic (#569) — the reader is being told a marker landed BEYOND a decided
 *  set, not that the decided set is a defect. */
function judgeFiles(live: LiveScan, baseline: ReadonlyMap<string, RatchetRow>): readonly Violation[] {
  const out: Violation[] = [];
  for (const [rel, sites] of live.sites) {
    const row = baseline.get(rel);
    const budget = row?.count ?? 0;
    for (const site of sites.slice(budget)) {
      out.push({ file: rel, line: site.line, message: EXCEED_MESSAGE(site.token) + (row === undefined ? "" : classNote(row)) });
    }
  }
  return out;
}

/** The two BOTH-WAYS row arms: a budget the file no longer spends (stale floor), and a `ratified` partition
 *  the rule table does not earn. THE CLASSIFICATION IS DERIVED, NOT DECLARED (#569) — checking the committed
 *  number against the live derivation is what stops a hand-edit minting permanence in either direction. */
function judgeRows(live: LiveScan, baseline: ReadonlyMap<string, RatchetRow>): readonly Violation[] {
  const out: Violation[] = [];
  for (const [rel, row] of baseline) {
    const sites = live.sites.get(rel);
    const count = sites?.length ?? 0;
    if (row.count > count) {
      out.push({ file: rel, line: 0, message: STALE_MESSAGE(rel, row.count, count) + classNote(row) });
    }
    const scope = governedScope(rel);
    if (sites === undefined || scope === undefined) {
      continue; // the file was not in this run's fileset — its class cannot be re-derived here
    }
    const derived = Math.min(ratifiedSiteCount(sites, scope), row.count);
    if (row.ratified !== derived) {
      out.push({ file: rel, line: 0, message: CLASS_DRIFT_MESSAGE(rel, row.ratified, derived) });
    }
  }
  return out;
}

/** TWO-SIDED (GATE-AUTHORING.md §4.4), PER SCOPE: a ratification row that classifies ZERO live markers in
 *  ITS scope absolves nothing while reading as live law — the loaded gun the next marker under that rule
 *  would inherit. REAL-TREE ANCHORED on the committed baseline FILE existing (§4.5, the `density-tier`
 *  idiom): a conformance mini-project and the residual unit tests both run against a scratch root with no
 *  baseline.json, so a whole-tree claim ("this rule is live NOWHERE") is never made from a two-file fileset. */
function staleRatifiedRules(root: string, liveRules: Readonly<Record<GovernedScope, ReadonlySet<string>>>): readonly Violation[] {
  if (!existsSync(join(root, BASELINE_REL))) {
    return [];
  }
  return GOVERNED_SCOPES.flatMap((scope) =>
    Object.keys(TABLE_FOR[scope])
      .filter((rule) => !liveRules[scope].has(rule))
      .map((rule) => ({ file: GATE_SELF, line: 0, message: STALE_RULE_MESSAGE(rule, scope) })),
  );
}

export const gate: GateDescriptor = {
  name: "suppressions",
  docRow: "Core-Enforcement-Active-Gates.md (suppressions row) / Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project", // the baseline budget is a per-file whole-tree count, both-ways stale needs the full set
  message: EXCEED_MESSAGE("<marker>"),
  fix: "delete the suppression (fix the underlying issue), or regenerate suppressions.baseline.json via a sanctioned bulk shift (`node tooling/src/verify/cli.ts baseline suppressions`).",
  scanRoot: (p) => isGovernedTypedSource(p),
  run: (ctx) => {
    const baseline = loadBaseline(ctx.root);
    const { violations, admitted, admittedRatified } = reconcileSuppressions(ctx.root, ctx.files, baseline);
    for (const v of violations) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    // Declared debt is not absence: report the ledger's derived ratified partition separately.
    ctx.scan({ admitted, admittedRatified });
  },
  // NOTE: the BASELINE-BUDGET ratchet arms (a file AT its baseline passes; EXCEEDING REDs only the
  // excess; a STALE baseline entry REDs) need an INJECTED baseline (no baseline.json exists on the
  // in-memory example tree, so the conformance runner sees every file at budget 0) — un-expressible as
  // gate examples (the no-test-fabrication precedent). That coverage lives in
  // tests/tooling/suppressions.residual.test.ts (the baseline arithmetic, both directions) + the live
  // `pnpm check:structure` run (the real baseline.json). Only the pure DETECTION FLAG/PASS branches
  // (budget 0, no baseline file) port as examples below.
  mustFlag: [
    {
      files: "// biome-ignore lint/foo: reason\nexport const a = 1;\n",
      at: "packages/kit/src/x.ts",
      expect: { messageIncludes: "biome-ignore" },
      why: "a `biome-ignore` comment marker under packages/*/src with no baseline budget — a suppression",
    },
    {
      files: "// eslint-disable-next-line no-unused-vars\nexport const a = 1;\n",
      at: "packages/kit/src/y.ts",
      expect: { messageIncludes: "eslint-disable" },
      why: "an `eslint-disable-next-line` marker — one of the eslint-disable variants, counted",
    },
    {
      files: '// @ts-expect-error deliberate\nexport const a: number = "x";\n',
      at: "packages/kit/src/z.ts",
      expect: { messageIncludes: "@ts-expect-error" },
      why: "a `@ts-expect-error` marker under packages/*/src with no baseline budget — a suppression",
    },
    {
      files: "// biome-ignore lint/suspicious/noExplicitAny: fixture probe\nexport const a = 1;\n",
      at: "tooling/src/x.ts",
      expect: { messageIncludes: "biome-ignore" },
      why: "tooling/src is governed typed source, so its missing-baseline marker is rejected",
    },
    {
      files: "// eslint-disable-next-line no-alert\nexport const a = 1;\n",
      at: "scripts/x.tsx",
      expect: { messageIncludes: "eslint-disable-next-line" },
      why: "scripts TSX is governed typed source, so its missing-baseline marker is rejected",
    },
    {
      files: "// biome-ignore-start lint/suspicious/noUnnecessaryConditions: live guard\nexport const a = 1;\n",
      at: "packages/kit/src/start.ts",
      expect: { messageIncludes: "biome-ignore-start" },
      why: "a biome range-start directive is an exact suppression token, not a partial biome-ignore match",
    },
    {
      files: "// biome-ignore-end lint/suspicious/noUnnecessaryConditions: end live guard\nexport const a = 1;\n",
      at: "packages/kit/src/end.ts",
      expect: { messageIncludes: "biome-ignore-end" },
      why: "a biome range-end directive is an exact suppression token, not a partial biome-ignore match",
    },
    {
      files: "// biome-ignore lint/style/useNamingConvention: upstream wire key\nexport const snake_case = 1;\n",
      at: "scripts/probes/st-goldens/generate-goldens.ts",
      expect: { messageIncludes: "biome-ignore" },
      why: "the authored st-goldens generator remains governed despite its captured runtime neighbor",
    },
    {
      files: "// biome-ignore lint/foo: reason\nexport const a = 1;\n",
      at: "tests/tooling/x.test.ts",
      expect: { messageIncludes: "biome-ignore" },
      why: "#962 — tests are GOVERNED typed source: a test-side marker with no budget is rejected exactly like a source one",
    },
    {
      files: "// @ts-nocheck\nexport const a: number = 1;\n",
      at: "packages/kit/src/nocheck.ts",
      expect: { messageIncludes: "@ts-nocheck" },
      why: "#962 — `@ts-nocheck` is the type-checker's FILE-WIDE suppression and counts as a directive token",
    },
    {
      files: "/* eslint-disable foo */\nexport const a = 1;\n/* eslint-enable foo */\n",
      at: "packages/kit/src/enable.ts",
      expect: { count: 2, messageIncludes: "eslint-" },
      why: "#962 — an eslint block range is TWO markers, the closer counted like `biome-ignore-end` is",
    },
  ],
  mustPass: [
    {
      files: 'const s = "biome-ignore lint/foo: not a real marker";\nexport const a = s;\n',
      at: "packages/kit/src/string-literal.ts",
      why: "a STRING LITERAL merely mentioning `biome-ignore` is not a comment — scans comment ranges only, passes",
    },
    {
      files: "// prose: a biome-ignore-all quotation mid-sentence is a MENTION, not a directive at the opener\nexport const t = 1;\n",
      at: "tests/support/helper.ts",
      why: "#962 — a governed test file whose only spelling of a directive is mid-sentence prose has zero markers — passes",
    },
    {
      files: '// This fixture mentions biome-ignore lint/foo: as prose.\nexport const a = "// eslint-disable-next-line no-alert";\n',
      at: "tooling/src/fixture-string.ts",
      why: "directive words in a prose comment or string fixture are not exact suppression directives",
    },
    {
      files: "// biome-ignore lint/style/useNamingConvention: captured vendor source\nexport const snake_case = 1;\n",
      at: "scripts/probes/st-goldens/sillytavern-runtime/vendor.tsx",
      why: "the generated foreign runtime capture is excluded even though authored st-goldens scripts are governed",
    },
    {
      files: "export const a = 1;\n",
      at: "packages/kit/src/clean.ts",
      why: "a file with zero suppression markers, absent from the baseline (budget 0) — passes",
    },
  ],
};
