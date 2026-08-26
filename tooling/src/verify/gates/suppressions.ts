// Gate: suppressions (Core-Enforcement-Deferred-Dropped.md "suppressions" row; Spine-Testing.md §5
// house-suppression discipline) — counts down the four suppression-marker shapes under `packages/*/src`:
// `biome-ignore`/`biome-ignore-all`, every `eslint-disable` variant (bare/-next-line/-line), the two
// TypeScript suppression directives. Comment markers ONLY — a scan over ts-morph COMMENT RANGES (leading +
// trailing + the JSX comment-only-expression carrier, `suppressionSites`), never raw source text, so a
// string literal merely MENTIONING one of these tokens (gate/tooling fixture code) never counts. BASELINE RATCHET (the `no-test-fabrication` per-file
// shape): a committed `suppressions.baseline.json` maps repo-relative file → its budget; a file's live
// count exceeding its budget REDs the excess (newest suppressions surface first, by source order). BOTH
// WAYS: a baseline entry ABOVE the file's live count is a STALE-RED — the ratchet only tightens, it can
// never coast on a number the file no longer needs. Regenerate: `node tooling/src/verify/cli.ts baseline suppressions`
// (rewrites the whole map from a live scan — run only on a sanctioned bulk shift, day-to-day the count
// only falls). Escape: none — a suppression IS the marker; the "escape" from this gate is deleting the
// suppression or bumping the baseline via a sanctioned regenerate.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { RatchetRow } from "../../_shared/ratchet-rows.ts";
import { admissionFor, classNote, readBudgetRows } from "../../_shared/ratchet-rows.ts";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";

export const BASELINE_REL = "tooling/src/verify/gates/suppressions.baseline.json";
const SRC_RE = /^packages\/[^/]+\/src\//u;
const SUPPRESSION_RE = /biome-ignore(?:-all)?|eslint-disable(?:-next-line|-line)?|@ts-expect-error|@ts-ignore/u;
/** The RULE a marker names — the classification key. `biome-ignore[-all|-start|-end] <rule>:`, an
 *  `eslint-disable*` rule id, or the bare TypeScript directive (which names no rule and is its own key). */
const RULE_RE = /biome-ignore(?:-all|-start|-end)?\s+(\S+?):|eslint-disable(?:-next-line|-line)?\s+([^\s:,]+)|(@ts-expect-error|@ts-ignore)/u;

/** Why one RULE's markers are permanent: `ruling` = the code is deliberately this way and a stated
 *  invariant says so; `tool-fp` = the analyzer is WRONG about this code (a documented false positive). */
interface RatifiedRule {
  readonly kind: "ruling" | "tool-fp";
  readonly why: string;
}

/** THE RATIFICATION TABLE (#569, seeded from the #575 triage that read all 346 markers across 184 files:
 *  0 fix-underlying, 0 stale). A marker whose rule is here is RATIFIED — permanent, not backlog — and the
 *  per-file rows in the baseline carry that partition so `pnpm debt` and the single-pass never print a
 *  ruled suppression as burnable debt. A rule ABSENT here is DEBT by default.
 *
 *  RULING SUPERSEDED (#596). This header used to record that `noExcessiveCognitiveComplexity` was
 *  DELIBERATELY left out — "the 5 markers stay gray, owner judgment, not promoted". The owner then ruled the
 *  terminal state of the debt campaign to be ZERO burnable, every survivor carrying its ruling, which the
 *  gray-by-omission posture cannot express: an unruled marker is indistinguishable from backlog nobody has
 *  read. So the five were re-judged one at a time (#596): `entry/compose/chat.ts` DECOMPOSED (its turn bridge
 *  really did hold two mappings and a push→pull pump behind one "adapter logic" excuse — the marker is gone,
 *  and two more went with it), and the four that survived are ratified BY RULE below. The mechanism the old
 *  ruling protected is untouched: the class is still DERIVED here and never hand-declared in a baseline row.
 *
 *  TWO-SIDED (GATE-AUTHORING.md §4.4): a row matching ZERO live markers is RED — a ratification that
 *  absolves nothing is a loaded gun for the next marker written under that rule. Note what a ratification
 *  does NOT do: the EXCEED arm still REDs any marker past a file's committed budget, so ratifying a RULE
 *  absolves the decided set, never the next marker somebody writes under it. */
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
  "lint/performance/noBarrelFile": { kind: "ruling", why: "this IS the domain/package front door — one-home-per-concept requires the barrel the rule bans" },
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
  "lint/security/noSecrets": { kind: "tool-fp", why: "authored card prose (long `<START>…` example dialogue) is high-entropy text, not a credential" },
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
};

/** One file's markers as a per-rule histogram, sorted for a stable ledger diff. */
function ruleHistogram(sites: readonly SuppressionSite[], ratified: boolean): readonly string[] {
  const byRule = new Map<string, number>();
  for (const site of sites) {
    const key = site.rule ?? "(no rule named)";
    if ((site.rule !== null && site.rule in RATIFIED_RULES) === ratified) {
      byRule.set(key, (byRule.get(key) ?? 0) + 1);
    }
  }
  return [...byRule]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, n]) => (ratified ? `${rule}×${n} (${RATIFIED_RULES[rule]?.kind ?? "ruling"})` : `${rule}×${n}`));
}

/** The WHY the generator writes into one row — BOTH halves, so the ledger reads as a classification and not
 *  as a number: which rules ratify the permanent portion, and which rules the DEBT portion is still carrying
 *  (the gray zone a burn-down claims). Null only when the file has no markers at all. */
export function classWhy(sites: readonly SuppressionSite[]): string | null {
  const ratified = ruleHistogram(sites, true);
  const debt = ruleHistogram(sites, false);
  const parts: string[] = [];
  if (ratified.length > 0) {
    parts.push(`ratified by rule: ${ratified.join(", ")} — each rule's ruling/tool-FP reason lives in RATIFIED_RULES (${GATE_SELF})`);
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
}

/** True when this file is under `packages/<pkg>/src/` (bare repo-relative — scanRoot convention). */
export function isSrcFile(repoRelPath: string): boolean {
  return SRC_RE.test(repoRelPath);
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
    const match = SUPPRESSION_RE.exec(text);
    if (match === null) {
      return;
    }
    const line = sf.getLineAndColumnAtPos(pos).line;
    if (seenLines.has(line)) {
      return;
    }
    seenLines.add(line);
    const ruleMatch = RULE_RE.exec(text);
    sites.push({ line, token: match[0], rule: ruleMatch?.[1] ?? ruleMatch?.[2] ?? ruleMatch?.[3] ?? null });
  };
  // getDescendants() (not forEachDescendant) — it includes token nodes (e.g. CloseBraceToken), which is
  // where a same-block trailing suppression (an `else if` arm's last statement) actually attaches its
  // comment range; forEachDescendant's traversal misses those token-only carriers.
  for (const node of sf.getDescendants()) {
    for (const range of node.getLeadingCommentRanges()) {
      record(range.getPos(), range.getText());
    }
    for (const range of node.getTrailingCommentRanges()) {
      record(range.getPos(), range.getText());
    }
    if (Node.isJsxExpression(node) && node.getExpression() === undefined) {
      record(node.getPos(), node.getText());
    }
  }
  sites.sort((a, b) => a.line - b.line);
  return sites;
}

/** The repo-relative path of a source file, or undefined if it isn't under a package's src dir. */
export function srcRel(root: string, absPath: string): string | undefined {
  const rel = absPath.startsWith(root) ? absPath.slice(root.length + 1) : absPath;
  return isSrcFile(rel) ? rel : undefined;
}

/** The committed ledger through the ONE row reader — each row carries its DEBT/RATIFIED partition. */
function loadBaseline(root: string): ReadonlyMap<string, RatchetRow> {
  return readBudgetRows(root, BASELINE_REL);
}

/** How many of one file's live markers name a RATIFIED_RULES rule — the DERIVED half of the partition. The
 *  committed row is checked AGAINST this (below), so a hand-edited `ratified` can never out-run the tree. */
export function ratifiedSiteCount(sites: readonly SuppressionSite[]): number {
  return sites.filter((s) => s.rule !== null && s.rule in RATIFIED_RULES).length;
}

const GATE_SELF = "tooling/src/verify/gates/suppressions.ts";
const CLASS_DRIFT_MESSAGE = (rel: string, declared: number, derived: number): string =>
  `suppressions.baseline.json row "${rel}" declares ${declared} RATIFIED marker(s) but the rule table classifies ${derived} — ` +
  "the class is DERIVED from RATIFIED_RULES, never hand-declared: fix the row (or add/remove the rule's table entry, with its why). " +
  "A ratified count the tree does not earn is a permanent admission nobody granted (#569).";
const STALE_RULE_MESSAGE = (rule: string): string =>
  `stale RATIFIED_RULES entry — \`${rule}\` classifies ZERO live suppression markers under packages/*/src, so the ratification ` +
  "grants nothing while reading as live law. Delete the row (GATE-AUTHORING.md §4.4, every exemption vocabulary is two-sided).";
const STALE_MESSAGE = (rel: string, baseline: number, live: number): string =>
  `stale suppressions.baseline.json entry — "${rel}" is budgeted ${baseline} but has only ${live} live ` +
  "suppression marker(s): regenerate the baseline (`node tooling/src/verify/cli.ts baseline suppressions`) " +
  "to ratchet the floor down (Core-Enforcement-Deferred-Dropped.md, suppressions row).";
const EXCEED_MESSAGE = (token: string): string =>
  `suppression marker \`${token}\` exceeds this file's committed suppressions.baseline.json budget — ` +
  "delete the suppression (fix the underlying lint/type issue) or, if genuinely warranted, regenerate the " +
  "baseline via a sanctioned bulk shift (`node tooling/src/verify/cli.ts baseline suppressions`); the ratchet " +
  "only shrinks day-to-day (Core-Enforcement-Deferred-Dropped.md, suppressions row).";

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
  const violations = [...judgeFiles(live, baseline), ...judgeRows(live, baseline), ...staleRatifiedRules(root, live.rules)];
  let admitted = 0;
  let admittedRatified = 0;
  for (const [rel, sites] of live.sites) {
    const admission = admissionFor(baseline.get(rel), sites.length);
    admitted += admission.admitted;
    admittedRatified += admission.ratified;
  }
  return { violations, admitted, admittedRatified };
}

/** What THIS RUN sees: every scanned file's markers, plus the set of rules any of them names (the rule
 *  table's liveness input). */
interface LiveScan {
  readonly sites: ReadonlyMap<string, readonly SuppressionSite[]>;
  readonly rules: ReadonlySet<string>;
}

function scanLive(root: string, files: readonly SourceFile[]): LiveScan {
  const sites = new Map<string, readonly SuppressionSite[]>();
  const rules = new Set<string>();
  for (const sf of files) {
    const rel = srcRel(root, sf.getFilePath());
    if (rel === undefined) {
      continue;
    }
    const found = suppressionSites(sf);
    sites.set(rel, found);
    for (const site of found) {
      if (site.rule !== null) {
        rules.add(site.rule);
      }
    }
  }
  return { sites, rules };
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
    if (sites === undefined) {
      continue; // the file was not in this run's fileset — its class cannot be re-derived here
    }
    const derived = Math.min(ratifiedSiteCount(sites), row.count);
    if (row.ratified !== derived) {
      out.push({ file: rel, line: 0, message: CLASS_DRIFT_MESSAGE(rel, row.ratified, derived) });
    }
  }
  return out;
}

/** TWO-SIDED (GATE-AUTHORING.md §4.4): a RATIFIED_RULES row that classifies ZERO live markers absolves
 *  nothing while reading as live law — the loaded gun the next marker under that rule would inherit.
 *  REAL-TREE ANCHORED on the committed baseline FILE existing (§4.5, the `density-tier` idiom): a conformance
 *  mini-project and the residual unit tests both run against a scratch root with no baseline.json, so a
 *  whole-tree claim ("this rule is live NOWHERE") is never made from a two-file fileset. */
function staleRatifiedRules(root: string, liveRules: ReadonlySet<string>): readonly Violation[] {
  if (!existsSync(join(root, BASELINE_REL))) {
    return [];
  }
  return Object.keys(RATIFIED_RULES)
    .filter((rule) => !liveRules.has(rule))
    .map((rule) => ({ file: GATE_SELF, line: 0, message: STALE_RULE_MESSAGE(rule) }));
}

export const gate: GateDescriptor = {
  name: "suppressions",
  docRow: "Core-Enforcement-Deferred-Dropped.md (suppressions row) / Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project", // the baseline budget is a per-file whole-tree count, both-ways stale needs the full set
  message: EXCEED_MESSAGE("<marker>"),
  fix: "delete the suppression (fix the underlying issue), or regenerate suppressions.baseline.json via a sanctioned bulk shift (`node tooling/src/verify/cli.ts baseline suppressions`).",
  scanRoot: (p) => isSrcFile(p),
  run: (ctx) => {
    const baseline = loadBaseline(ctx.root);
    const { violations, admitted, admittedRatified } = reconcileSuppressions(ctx.root, ctx.files, baseline);
    for (const v of violations) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    // Declared debt is not absence: without this the single-pass's admitted total omits this whole ledger.
    // SPLIT BY CLASS (#569) — 341 of the 346 live markers are ruled/tool-FP permanent, and printing them as
    // burnable backlog is exactly the misreading this classification exists to end.
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
  ],
  mustPass: [
    {
      files: 'const s = "biome-ignore lint/foo: not a real marker";\nexport const a = s;\n',
      at: "packages/kit/src/string-literal.ts",
      why: "a STRING LITERAL merely mentioning `biome-ignore` is not a comment — scans comment ranges only, passes",
    },
    {
      files: "// biome-ignore lint/foo: reason\nexport const a = 1;\n",
      at: "tests/tooling/x.test.ts",
      why: "scope: a suppression marker OUTSIDE packages/*/src is not gated here — passes",
    },
    {
      files: "export const a = 1;\n",
      at: "packages/kit/src/clean.ts",
      why: "a file with zero suppression markers, absent from the baseline (budget 0) — passes",
    },
  ],
};
