// The verification STAGE vocabulary (UNIFIED-VERIFICATION-DESIGN.md §3.1) plus the run's own result
// shapes: what a stage is, how it scopes, how its child's native exit maps into the 0/1/2/3 contract, and
// what one run leaves in reports/verify.json. The registry DATA is ../lib/registry.ts; the runner is
// ../ops/run.ts.
import type { Selection } from "./selection.ts";

const TIERS = ["changed", "static", "push", "full", "manual"] as const;
export type Tier = (typeof TIERS)[number];

const STAGE_GROUPS = ["lint", "types", "structure", "imports", "deps", "docs", "tests", "browser", "quality"] as const;
export type StageGroup = (typeof STAGE_GROUPS)[number];

/** The scoped invocation for a stage, or the sentinels: "whole-only" ⇒ DEFER at a scoped tier (print the
 *  named notice, record it in the artifact — the check:scope pattern promoted to run level, §3.4);
 *  "skip-empty" ⇒ the scope resolves to no relevant paths, so the stage is a no-op this run (e.g. eslint
 *  with no files in its surface). */
export type ScopedArgv = readonly [string, ...string[]] | "whole-only" | "skip-empty";

export interface StageDef {
  /** kebab, unique — "lint:biome", "types:graph", "tests:node", … */
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
  /** For `manual`-tier stages: WHY it isn't automated (rendered in `verify --list`). */
  readonly manualReason?: string;
}

const STAGE_MODES = ["full", "scoped", "deferred", "skipped"] as const;
export type StageMode = (typeof STAGE_MODES)[number];

export interface StageResult {
  readonly name: string;
  readonly group: string;
  readonly mode: StageMode;
  readonly ok: boolean;
  readonly exitCode: number;
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

export interface VerifyReport {
  readonly tier: Tier;
  readonly scope: string;
  readonly ok: boolean;
  readonly exitCode: number;
  /** The count of stages that failed (violations or tool-error) — the top-of-file verdict at a glance. */
  readonly failed: number;
  readonly stages: readonly StageResult[];
}
