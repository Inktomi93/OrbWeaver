// The verification STAGE vocabulary (UNIFIED-VERIFICATION-DESIGN.md §3.1) plus the run's own result
// shapes: what a stage is, how it scopes, how its child's native exit maps into the 0/1/2/3 contract, and
// what one run leaves in reports/verify.json. The registry DATA is ../lib/registry.ts; the runner is
// ../ops/run.ts.
import type { Selection } from "./selection.ts";

/** @public knip type-face false positive — the one-home vocabulary tuple behind the exported `Tier` union — the ONE
 *  importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite the re-spell
 *  `no-inline-union-redecl` exists to stop. */
export const VERIFY_TIERS = ["changed", "static", "push", "full", "manual"] as const;
export type Tier = (typeof VERIFY_TIERS)[number];
export type RunnableVerifyTier = Exclude<Tier, "manual">;
export const RUNNABLE_VERIFY_TIERS: readonly RunnableVerifyTier[] = VERIFY_TIERS.filter((tier): tier is RunnableVerifyTier => tier !== "manual");

const STAGE_GROUPS = ["lint", "types", "structure", "imports", "deps", "docs", "tests", "browser", "quality"] as const;
export type StageGroup = (typeof STAGE_GROUPS)[number];

/** The scoped invocation for a stage, or the sentinels: "whole-only" ⇒ DEFER at a scoped tier (print the
 *  named notice, record it in the artifact — the check:scope pattern promoted to run level, §3.4);
 *  "skip-empty" ⇒ the scope resolves to no relevant paths, so the stage is a no-op this run (e.g. eslint
 *  with no files in its surface). */
export type ScopedArgv = readonly [string, ...string[]] | "whole-only" | "skip-empty";

/** What an OUTPUT AUDIT found in a stage's transcript (#1245). A stage exists whose child can exit CLEAN
 *  while having measured NOTHING — biome under a broken `biome.json` processes zero files, prints no
 *  diagnostic, and (with `--no-errors-on-unmatched`) exits 0 — so for that stage the exit code alone is not
 *  the verdict. `refusal` ⇒ the run is not a verdict and the stage becomes a TOOL ERROR (exit 2, never a
 *  green and never a mere violation); `notice` ⇒ the stage's verdict stands, but the reader is told
 *  something the exit code does not carry (rendered through `StageResult.notices`). */
export interface TranscriptAudit {
  readonly kind: "refusal" | "notice";
  readonly message: string;
}

export interface StageDef {
  /** kebab, unique — "lint:biome", "types:native", "tests:node", … */
  readonly name: string;
  readonly group: StageGroup;
  /** Every tier that includes this stage. The whole-tree ladder nests `static ⊂ push ⊂ full`; `changed`
   *  is the SCOPED inner loop (`changed ⊆ push`) — it carries related-tests static omits, so it is NOT a
   *  subset of static (static is the born-compliant test-free commit gate). */
  readonly tiers: readonly Tier[];
  /** The whole-scope invocation (the `pnpm <script>` form, spawned shell:false). */
  readonly argv: readonly [string, ...string[]];
  /** Extra env for the child (merged over the inherited env + the run's NO_COLOR). No current stage
   *  needs one (the former CT_GATE consumer retired 2026-07-17 — gate retries are a visible CLI flag in
   *  the `pnpm test` composition now); the seam stays for the next genuinely env-shaped stage knob. */
  readonly env?: Readonly<Record<string, string>>;
  /** How to run this stage over a Selection (§3.4). ABSENT ⇒ whole-only (deferred at a scoped tier). */
  readonly scopedArgv?: (sel: Selection) => ScopedArgv;
  /** Map the child's native exit into the 0/1/2/3 contract (generalizes the runner's speaksScheme). */
  readonly classify: (status: number | null) => 0 | 1 | 2 | 3;
  /** OUTPUT HONESTY (#1245) — for a stage whose child can report a clean exit over an EMPTY measurement.
   *  Runs only when `classify` already returned clean or violations (a stage that is already a tool error
   *  has no transcript worth auditing), and a `refusal` OVERRIDES that verdict with exit 2. Absent for
   *  every stage whose exit code IS its whole verdict — this is a per-tool fact, not a policy knob. */
  readonly auditTranscript?: (transcript: string, root: string) => TranscriptAudit | null;
  /** For `manual`-tier stages: WHY it isn't automated (rendered in `verify --list`). */
  readonly manualReason?: string;
  /** THIS STAGE'S OWN HANG CEILING, in quiet-box ms, for a stage whose honest runtime does not fit the
   *  runner's default (#1848). ABSENT ⇒ the default. It is DATA DERIVED FROM THE PROFILE
   *  (`_shared/concurrency-profile.ts` `readStageBudgets`), never a literal typed here: the CT suite's
   *  wall clock is a function of `ctWorkers`, and on 2026-09-06 a single hand-typed 45 minutes applied to
   *  every stage turned a QUIET-box product-test run into `[tool-error] TIMED OUT`. The runner still
   *  passes it through `budget()`, so a contended box stretches it further. */
  readonly hangCeilingBaseMs?: number;
  /** CONDITIONAL MEMBERSHIP AT A WHOLE TIER (#1523). `tiers` is the ladder; this narrows one rung of it
   *  by a fact about the RUN rather than about a Selection — a whole-tier run carries no Selection, so
   *  `scopedArgv` (which is the scoped-tier hook) cannot express "run at `push` only when the branch
   *  touched an instrument". Membership stays DATA: the tiers list still names every tier the stage can
   *  run at, and this row states, in one place, the condition under which one of them applies.
   *
   *  `satisfied` returns `null` for CANNOT-TELL, and the runner treats that as RUN — an expensive stage
   *  skipped because its precondition could not be computed is a false clean wearing a tier's clothes. */
  readonly tierPrecondition?: {
    /** The tiers this precondition narrows. Every other tier in `tiers` runs unconditionally. */
    readonly tiers: readonly Tier[];
    /** Rendered in `verify --list` and as the skip reason, so the ladder reads honestly either way. */
    readonly reason: string;
    readonly satisfied: (root: string) => boolean | null;
  };
}

const STAGE_MODES = ["full", "scoped", "deferred", "skipped"] as const;
export type StageMode = (typeof STAGE_MODES)[number];

export interface StageResult {
  readonly name: string;
  readonly group: string;
  readonly mode: StageMode;
  readonly ok: boolean;
  readonly exitCode: number;
  /**
   * THE CHILD'S RAW EXIT, RETAINED (#2225) — `null` when the child was signal-killed, timed out, or was
   * never spawned at all (an unresolvable `argv[0]`); ABSENT when this stage ran no child (deferred,
   * skipped, or a `--strict-scope` refusal).
   *
   * WHY THE RAW DIGIT SURVIVES THE CLASSIFIER. `exitCode` is `classify(childExit)`, and `classify` is
   * PER-STAGE DATA — a row may spell any mapping it likes. Every classifier on the tree today maps `null`
   * to a tool error, but that is a property of four adapters, not of the contract, and a row whose
   * classifier answered `0` for `null` would launder a KILLED child into a green stage with nothing
   * structural to stop it. #2220 is what that costs: a stage that never produced a verdict was invisible
   * to its tier for a day. So the question "did a child actually report an exit" is answerable from the
   * artifact WITHOUT trusting the mapping that hid it.
   */
  readonly childExit?: number | null;
  readonly durationMs: number;
  readonly logFile: string | null;
  /** On failure: a short tail excerpt of the stage's output (the last few non-blank lines) so a bot
   *  reading ONLY reports/verify.json sees WHY it failed without opening the per-stage log. */
  readonly failureExcerpt: string | null;
  /** For a deferred stage: the tier where it DOES run (so a scoped green names what it skipped). */
  readonly runsAt: string | null;
  /**
   * Lines a PASSING stage needs the reader to see. A green stage's output goes to its per-stage log and
   * nowhere else — which is how a "warning printed at the decision point" becomes a warning nobody reads
   * (issue #534: the dev db was dropped by a change whose only signal was a log line). A stage opts in by
   * printing `[verify-notice] …` on its own stdout; the runner lifts those lines here and `printSummary`
   * renders them in the TAIL block, beside the verdict.
   *
   * DELIBERATELY NOT a severity tier: a notice never changes `ok`, `exitCode`, or the verdict. Gates have
   * no warn tier (GATE-AUTHORING §"no warn tier") and this does not smuggle one in — it is a PRESENTATION
   * channel for something the stage already decided was not a violation.
   */
  readonly notices: readonly string[];
}

/** WHO wrote this artifact (#1029). `reports/verify.json` is a `latest` POINTER now — published only when
 *  a run finishes — so the identity is part of the verdict: a reader who cannot say which run produced the
 *  file it is holding cannot say the verdict is theirs. `concurrent` names the other verify runs that were
 *  in flight on this checkout when this one opened its slot; `[]` is the honest solo-run zero. */
interface VerifyRunIdentity {
  readonly runId: string;
  readonly checkout: string;
  /** Repo-relative slot holding this run's own `verify.json` + per-stage logs. */
  readonly artifactDir: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly concurrent: readonly string[];
}

export interface VerifyReport {
  readonly tier: Tier;
  readonly scope: string;
  /** Optional only for the hand-built report fixtures in the unit tests; every real run carries it. */
  readonly run?: VerifyRunIdentity;
  readonly ok: boolean;
  readonly exitCode: number;
  /** The count of stages that failed (violations or tool-error) — the top-of-file verdict at a glance. */
  readonly failed: number;
  /**
   * EVERY STAGE THAT RAN AND PRODUCED NO VERDICT, BY NAME (#2225) — the general form of #2220. A stage
   * whose exit class was 2, or whose child reported no exit at all, MEASURED NOTHING: the tier's claim to
   * have covered it did not hold. `failed` cannot carry that, because it lumps "nothing was measured" in
   * with "your code has a lint finding", and a barrier reading only the count cannot tell a broken
   * instrument from a real red.
   *
   * A BARRIER READS THIS LIST BEFORE THE RED COUNT. It is a separate field rather than a filter the reader
   * is expected to apply, because the filter is exactly what nobody wrote for a day: `lint:hook-syntax`
   * sat at exit 2 on every static run since the day it landed and no reader of this artifact ever asked.
   * `[]` is the honest zero — every registered stage that ran came back with a verdict.
   */
  readonly noVerdict: readonly string[];
  readonly stages: readonly StageResult[];
}
