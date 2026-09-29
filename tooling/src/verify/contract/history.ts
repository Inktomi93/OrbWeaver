// TIMING RETENTION (#411) — one append-only line per verify-family run, so "the gate got slower" stops
// being a thing somebody half-remembers and becomes a thing the next run can SEE.
//
// THE DEFECT IT CLOSES. `reports/verify.json` holds the CURRENT run's per-stage `durationMs` and is
// overwritten by the next one, so the repo has never retained a second data point. Every performance claim
// about the gate battery — "structure:full is slower since X", "the cold-vs-warm confound bit again" — has
// had to be re-measured by hand, from memory, against a baseline nobody kept. A regression that arrives one
// stage at a time is invisible by construction.
//
// WHAT IT IS NOT. Not a budget, not a gate, and never a non-zero exit: a slow run on a loaded box is not a
// defect, and a threshold that fires on contention would train agents to ignore it. The retained line is
// EVIDENCE; the advisory is one printed line pointing at the two runs to compare.
export interface RunHistoryStage {
  readonly name: string;
  /** "full" | "scoped" | "deferred" | "skipped" — a deferred stage's 0ms must never be compared against a
   *  run that actually executed it. */
  readonly mode: string;
  readonly durationMs: number;
}

export interface RunHistoryEntry {
  /** The run identity `reports/verify.json` carries, so a line here can be tied back to its artifact. */
  readonly runId: string;
  readonly at: string;
  readonly tier: string;
  readonly scope: string;
  /** The commit the run judged — short sha, or "unknown" when git could not answer (a tarball checkout,
   *  a detached worktree mid-operation). Never fabricated. */
  readonly sha: string;
  readonly exitCode: number;
  /** The sum of the stage durations; `wallMs` adds the run's own selection and startup time. */
  readonly totalMs: number;
  /** Start to finish of the run, or null for a report with no run identity. */
  readonly wallMs: number | null;
  readonly stages: readonly RunHistoryStage[];
}

/** One stage that got materially slower than the previous run at the SAME tier. */
export interface SlowdownAdvisory {
  readonly stage: string;
  readonly wasMs: number;
  readonly nowMs: number;
  readonly ratio: number;
}
