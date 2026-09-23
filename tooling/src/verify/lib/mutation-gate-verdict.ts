// The OUTPUT-HONESTY audit for the `quality:mutation-gate` stage (#2505). Stryker's exit code is not its
// whole verdict, and the two things it conflates are the two things a barrier most needs apart:
//
//   • "mutants survived, the score is under the break threshold" — a real verdict, a real red;
//   • "Stryker died before running a single mutant" — no verdict at all.
//
// Both leave the child at exit 1, and the registry row classifies Stryker with `asViolations` (any
// non-zero ⇒ 1), so the barrier read "mutants survived" on a run that ran none. Measured 2026-09-20: the
// sandbox's node_modules walk hit ENOENT on a lane worktree swept mid-run, the rejection went uncaught,
// node exited 1, and `reports/verify.json` recorded a violation over ZERO tested mutants.
//
// THE DISCRIMINATOR IS EXACT, NOT HEURISTIC. Stryker sets its own exit code in exactly ONE place —
// `dist/src/reporters/mutation-test-report-helper.js` `determineExitCode`, the single `setExitCode` call
// site in the whole package (verified by enumeration on 10.0.0) — and that function ALWAYS logs one of
// two sentences first. So a transcript carrying neither sentence, and no report-ready summary line, did
// not reach `determineExitCode`: whatever exit code it carries was written by node or by the package
// manager, and the run is not a verdict.
//
// THE REFUSAL CARRIES THE PLANTED POSITIVE CONTROL IN THE SAME INVOCATION: the progress reporter's own
// `N/M tested` counter, read from the transcript, states how many mutants the run actually got through
// before it died. "0 of 1177" is the sentence a reader needs; a bare "it failed" is the sentence that let
// this sit. A mutation run that finds no survivors because it ran no mutants is otherwise
// indistinguishable from a clean one.
import type { TranscriptAudit } from "../contract/stage.ts";

/** `determineExitCode`'s FAILING branch — the only way Stryker itself produces a non-zero exit. */
const BREAK_THRESHOLD_FAILED = /Final mutation score [\d.]+ under breaking threshold [\d.]+/u;

/** `determineExitCode`'s PASSING branch. */
const BREAK_THRESHOLD_MET = /Final mutation score of [\d.]+ is greater than or equal to break threshold [\d.]+/u;

/** The clear-text reporter's unconditional report-ready closer. It is the third accepted marker because
 *  the two above are printed only when `thresholds.break` is a number: `stryker.gate.config.ts` pins it
 *  (82), but that coupling should not be this module's only floor — a profile that nulls the threshold
 *  must still be able to produce a verdict rather than a permanent refusal. */
const REPORT_READY = /Ran [\d.]+ tests per mutant on average\./u;

/** The progress reporter's counter: `Mutation testing 73% (…) 784/1161 tested (135 survived, 6 timed out)`.
 *  Global — the LAST match is how far the run got. */
const PROGRESS_TESTED = /(\d+)\/(\d+) tested/gu;

const REFUSAL_HEAD = "quality:mutation-gate produced NO VERDICT — this run did not measure a mutation score.";

/** How far the run got, as `{ tested, total }`, or `null` when the transcript carries no progress line at
 *  all (Stryker died before the first mutant — the measured #2505 case, where it died in sandbox setup). */
export function parseMutantProgress(transcript: string): { readonly tested: number; readonly total: number } | null {
  const matches = [...transcript.matchAll(PROGRESS_TESTED)];
  const last = matches.at(-1);
  if (last?.[1] === undefined || last[2] === undefined) {
    return null;
  }
  return { tested: Number.parseInt(last[1], 10), total: Number.parseInt(last[2], 10) };
}

/** Did this transcript reach Stryker's own verdict? */
export function reachedMutationVerdict(transcript: string): boolean {
  return BREAK_THRESHOLD_FAILED.test(transcript) || BREAK_THRESHOLD_MET.test(transcript) || REPORT_READY.test(transcript);
}

/** Judge one `pnpm test:mutation:gate` transcript. `null` ⇒ the stage's own exit code IS its verdict. */
export function mutationGateStageAudit(transcript: string): TranscriptAudit | null {
  if (reachedMutationVerdict(transcript)) {
    return null;
  }
  const progress = parseMutantProgress(transcript);
  const reached =
    progress === null
      ? "ZERO mutants were tested — it died before the first one (sandbox setup, instrumentation, or the type checker)"
      : `only ${String(progress.tested)} of ${String(progress.total)} mutants were tested`;
  return {
    kind: "refusal",
    message:
      `${REFUSAL_HEAD} Stryker never logged a break-threshold decision or a report-ready summary, so it never reached ` +
      `\`determineExitCode\` — its single exit-code site. ${reached}. Whatever non-zero this stage carried was written by node or pnpm, ` +
      "NOT by a mutation score, so do not read it as surviving mutants. Open the stage log for the cause.",
  };
}
