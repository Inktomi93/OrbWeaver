// THE PATH PREFLIGHT for every path-filtered verification invocation — the ONE home for "did the caller
// name something the runner will actually open?".
//
// WHY IT EXISTS (#1192). `pnpm test:ct <paths>` and `pnpm test:scoped <paths>` were BARE package.json
// rows that handed their operands straight to playwright/vitest, and BOTH runners treat an unmatched path
// filter as "no tests over here" rather than as misuse. On 2026-09-02 a merge floor named
// `tests/client/features/discovery/components/character-library-surface.ct.tsx` — a path that does not
// exist (the real file is under `features/character/surfaces/`) — and the run printed
// `CT SUMMARY — PASS  ·  58 passed`, exit 0, never once naming the file it had not opened. The only reason
// anyone noticed was arithmetic: the lane that WROTE that spec had reported 124 tests. A floor that can
// certify an unopened file is not a floor. `pnpm verify --file` already refused that exact class with
// exit 3, so the rule existed in ONE of the three doors — this module is where all three read it from now.
//
// TWO FAULTS THAT MUST NEVER SHARE A MESSAGE OR AN EXIT CODE:
//
//   UNRESOLVED — the operand does not exist on disk, or escapes the repo. The caller's ARGV is wrong: a
//     stale path, a rename nobody swept, a typo. Nothing about the run can be salvaged, and the operator
//     must retype. `EXIT.misuse` (3) — the same verdict `verify --file` has always given this class.
//
//   BARREN — the operand resolves to a real file, and the runner collected ZERO tests from it. The argv is
//     WELL-FORMED; what failed is the claim that running it says anything about that file (a support
//     module named as if it were a spec, a `--grep`/`--project` filter that excludes everything in it, a
//     spec whose every case is `.skip`). `EXIT.toolError` (2) — the house contract's "the run is NOT a
//     verdict" code. Calling it misuse would be a lie about whose mistake it is, and calling it
//     `violations` (1) would be a lie that the CODE UNDER TEST failed.
//
// WHAT COUNTS AS A PATH CLAIM IS THE CALLER'S DECISION, and the two doors genuinely differ.
// `verify --file` documents its positionals as paths, so every one of them is a claim. The scoped test
// runners forward their operands to runners whose positionals are REGULAR EXPRESSIONS matched against
// file paths, so a bare word (`smoke`) is a legitimate substring filter and is NOT a path claim —
// `isPathShaped` is the predicate those two doors use, and it deliberately keys on the separator rather
// than on existence, so a MISSPELLED path is still a claim (that is the whole defect) while a filter word
// is not. A regex/glob metacharacter makes an operand a PATTERN: it is exempt from the UNRESOLVED arm
// (the runner, not the filesystem, decides what it matches) but NOT from the BARREN arm, which is the
// honest question to ask of a pattern.
import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { isLegacyTestPath, LEGACY_SCOPED_FLAG, LEGACY_TEST_ROOT } from "./test-population.ts";

/** One caller-supplied operand, resolved against the repo root once so every arm reads the same facts. */
export interface ScopedOperand {
  /** Exactly as the caller typed it — every message quotes this, never the normalized form. */
  readonly raw: string;
  /** Repo-relative posix; `undefined` when the operand resolves OUTSIDE the repo. */
  readonly rel: string | undefined;
  readonly exists: boolean;
  readonly isDirectory: boolean;
  /** Carries a regex/glob metacharacter — the runner's matcher owns it, not the filesystem. */
  readonly isPattern: boolean;
}

/** Regex/glob metacharacters. `.` and `-` are excluded on purpose: every real test path carries them. */
const PATTERN_CHARS = /[*?[\]{}()|^$+\\]/u;

/** Resolve one operand against `root`. Never throws — a bad path is DATA here, not an exception. */
export function resolveOperand(root: string, raw: string): ScopedOperand {
  const abs = isAbsolute(raw) ? raw : resolve(root, raw);
  const rel = relative(root, abs);
  const escaped = rel.startsWith("..");
  const exists = !escaped && existsSync(abs);
  return {
    raw,
    rel: escaped ? undefined : rel.replaceAll("\\", "/"),
    exists,
    isDirectory: exists && statSync(abs).isDirectory(),
    isPattern: PATTERN_CHARS.test(raw),
  };
}

/** Does this argument CLAIM to be a path? A flag is not; a bare filter word is not; anything carrying a
 *  path separator or a test-file extension is. Used by the two scoped RUNNER doors, whose positionals are
 *  a mixed grammar; `verify --file` treats every positional as a claim and does not call this. */
export function isPathShaped(arg: string): boolean {
  return !arg.startsWith("-") && (arg.includes("/") || /\.[cm]?[jt]sx?$/u.test(arg));
}

/** The operands whose fault is UNRESOLVED.
 *
 *  `patterns` names WHOSE grammar the caller speaks, because the two doors disagree and neither default is
 *  safe for the other: `"claim"` — every operand is a literal path and a metacharacter does not excuse it
 *  from existing (`verify --file`, whose positionals are documented as paths); `"runner"` — a
 *  metacharacter hands the operand to the runner's own matcher, so its emptiness is a BARREN question
 *  rather than a filesystem one (the scoped test runners). */
export function unresolvedOperands(operands: readonly ScopedOperand[], patterns: "claim" | "runner"): readonly ScopedOperand[] {
  return operands.filter((o) => !(o.exists || (patterns === "runner" && o.isPattern)));
}

/** The refusal text for the UNRESOLVED arm. One sentence, every offender named — a refusal that says
 *  "some path was bad" costs the operator the same re-run the silent pass did. */
export function unresolvedRefusal(bad: readonly ScopedOperand[]): string {
  return `not under the repo or nonexistent: ${bad.map((o) => o.raw).join(", ")}`;
}

/** Normalize one runner-reported test-file path to repo-relative posix (runners report absolute paths, or
 *  paths relative to their own rootDir — the caller resolves against that root before handing them here). */
export function toRepoRelative(root: string, file: string): string {
  return relative(root, isAbsolute(file) ? file : resolve(root, file)).replaceAll("\\", "/");
}

/** Did `collected` — the test files the runner says it would actually run — feed this operand? A directory
 *  is fed by anything beneath it; a file by itself; a pattern by any collected path its regex matches
 *  (falling back to a substring test when the operand is not a valid regex, which is also how the runners
 *  degrade). */
function isFed(operand: ScopedOperand, collected: readonly string[]): boolean {
  if (operand.isPattern) {
    let re: RegExp | undefined;
    // @orb-waive caught-failure-ownership(catch): new RegExp throws only for an operand that is not a valid pattern, which is then tested as a plain substring of each collected path; an operand that matches nothing lands in barrenOperands, which preflight prints as UNFED PATH and ends as a tool error. Ends if the preflight must refuse an unparseable pattern outright.
    try {
      re = new RegExp(operand.raw, "u");
    } catch {
      re = undefined;
    }
    return collected.some((path: string): boolean => (re === undefined ? path.includes(operand.raw) : re.test(path)));
  }
  const rel = operand.rel;
  if (rel === undefined) {
    return false;
  }
  return collected.some((path) => path === rel || (operand.isDirectory && path.startsWith(`${rel}/`)));
}

/** The operands whose fault is BARREN: they resolved, and the runner collected nothing from them. Only
 *  operands that survived the UNRESOLVED arm are judged — the two faults are reported one at a time so an
 *  operator never has to guess which sentence is about which path. */
export function barrenOperands(operands: readonly ScopedOperand[], collected: readonly string[]): readonly ScopedOperand[] {
  return operands.filter((o) => !isFed(o, collected));
}

/** The refusal text for the BARREN arm. It names the collected count, because "0 collected everywhere" and
 *  "0 collected from THIS one" are different operator mistakes and the number is the tell. */
export function barrenRefusal(barren: readonly ScopedOperand[], collected: readonly string[]): string {
  const named = barren.map((o) => o.raw).join(", ");
  return (
    `path exists but the runner collected NO tests from it: ${named}\n` +
    `  the run would have reported a verdict that says nothing about ${barren.length === 1 ? "it" : "them"} ` +
    `(${String(collected.length)} test file(s) collected in total).\n` +
    "  usual causes: a --grep/--project/-t filter that excludes everything in the file, a support module " +
    "named as if it were a spec, or a spec whose every case is skipped."
  );
}

const LEGACY_REFUSAL =
  `runs in CI's legacy jobs, not in a lane floor (docs/plans/test-foundation/design.md, the legacy folder).\n` +
  `  pass ${LEGACY_SCOPED_FLAG} to run legacy tests on purpose, or name tests outside ${LEGACY_TEST_ROOT}/.`;

/** A path claim inside the legacy folder, or a directory that holds it (`tests`, the repo root), made without
 *  the opt-in flag. */
export function legacyOperandRefusal(operands: readonly ScopedOperand[]): string | undefined {
  const legacy = operands.filter(({ rel }) => rel !== undefined && (isLegacyTestPath(rel) || rel === "" || LEGACY_TEST_ROOT.startsWith(`${rel}/`)));
  return legacy.length === 0 ? undefined : `${legacy.map(({ raw }) => raw).join(", ")} ${LEGACY_REFUSAL}`;
}

/** A pattern operand can still collect legacy files; the refusal names how many. */
export function collectedLegacyRefusal(collected: readonly string[]): string | undefined {
  const legacy = collected.filter(isLegacyTestPath);
  return legacy.length === 0 ? undefined : `the selection collects ${String(legacy.length)} legacy test file(s), which ${LEGACY_REFUSAL}`;
}

/** The scoped doors keep the legacy folder out unless the caller opts in; the flag never reaches the runner. */
export function splitLegacyFlag(argv: readonly string[]): { readonly legacy: boolean; readonly rest: readonly string[] } {
  return { legacy: argv.includes(LEGACY_SCOPED_FLAG), rest: argv.filter((arg) => arg !== LEGACY_SCOPED_FLAG) };
}

/** THE CT TITLE FILTER NEEDS A PATH (#2457, second half of the same door). `pnpm test:ct -g='<title>'`
 *  with no path operand collects ZERO specs and exits 1 — even for a title a path-scoped run executes.
 *  Measured 2026-09-19 on the unmodified door: `pnpm test:ct -g='aria-expanded follows'` (a title that
 *  lives in tests/legacy/client/features/config/components/config-search-input.ct.tsx) printed
 *  `CT SUMMARY — FAILED · 0 passed · 0 failed · 0 flaky · 0 skipped` and exited 1 — a run that certifies
 *  nothing while LOOKING like a failing test. There is nothing for the
 *  preflight to audit either: with no path claims it returns early and never collects, so the barren arm
 *  cannot see it. Refuse at parse instead, naming the operand that makes the invocation real.
 *
 *  CT ONLY. A bare `-t` on the NODE tier is a supported shape (vitest scans its projects and the door
 *  records the empty attribution as "no type claim" — `nodeConfigModeArgs`), so the same refusal there
 *  would break a working invocation. */
export function bareCtGrepRefusal(rest: readonly string[], pathOperandCount: number): string | undefined {
  if (pathOperandCount > 0) {
    return;
  }
  const grep = rest.find((arg) => arg === "-g" || arg === "--grep" || arg.startsWith("-g=") || arg.startsWith("--grep="));
  if (grep === undefined) {
    return;
  }
  const flag = grep.includes("=") ? grep.slice(0, grep.indexOf("=")) : grep;
  return (
    `${flag} needs a path operand: the CT config answers a title filter with no spec path by collecting nothing and exiting 1,\n` +
    "  so a bare title filter is a run that says nothing about the title it named.\n" +
    "  name the spec(s) too: pnpm test:ct tests/ui/x.ct.tsx -g='<title>'"
  );
}
