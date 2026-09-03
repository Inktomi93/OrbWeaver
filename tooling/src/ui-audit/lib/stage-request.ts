// The PURE half of design-audit's isolated-stage mode (#678): argv conflict verdicts, the refusal copy,
// the run label, and the db-provenance note. No git, no boot, no browser — ops/stage.ts owns that I/O, so
// every decision here is unit-testable in both directions (tests/tooling/ui-audit/lib/stage-request.test.ts).
//
// WHY THE MODE EXISTS: design-audit only ever measured whatever `--base` served, and its default is the dev
// stack on :5173 — which serves MAIN, never a lane's branch (AGENTS.md §L.6). So a lane fixing a rendered
// defect structurally could not produce the "design-audit rows clean" receipt for its own commit; the audit
// became a post-merge orchestrator step and a regression was only measurable after it shipped (paid on #674).
// `--isolated`/`--ref <sha>` boots the SAME isolated stage `snap --isolated` uses (snap owns it; we enter
// through its front door), so the audit reads the branch's pixels.
import type { Args } from "../contract/types.ts";

/** What a run measured — the RESULT line publishes it so a pasted receipt says WHICH tree it audited.
 *  A receipt without this is the exact ambiguity #678 is about. */
export function stageLabel(stageShortSha: string | null): string {
  return stageShortSha ?? "live";
}

/** The db a stage serves is NOT the dev db, and NOT empty either — it is whatever that stage dir holds.
 *  `seedStageData` (snap/ops/stage.ts) copies the dev db + WAL/SHM into a stage dir that has none, and
 *  skips a dir that already has one, so a FRESH sha renders the dev corpus while a CACHED stage keeps its
 *  older, possibly thinner state. A corpus-dependent finding — or its ABSENCE — is therefore a claim about
 *  the stage's db, and this note rides every isolated run so a receipt cannot silently omit it. */
export const STAGE_DB_NOTE =
  "STAGE DB      the stage serves its OWN db copy: a FRESH stage sha copies the dev db at boot, a CACHED stage dir keeps the db it already had (possibly older/thinner than dev). A corpus-dependent finding — or its absence — is a claim about THAT db: verify provenance before treating it as a verdict.";

/** The cold-stage caveat, printed with the note above: the vite dep-optimizer churns on the first run at a
 *  new sha (504s, failed navs), so a first run is not a verdict — re-run once warm. */
export const STAGE_WARMUP_NOTE =
  "STAGE WARMUP  the FIRST run at a new sha is not a verdict (the cold vite dep-optimizer churns) — this run boots the stage and then REFUSES; re-run to measure the warm stage.";

/** Did THIS invocation boot the stage? Exact, not a heuristic: the boot path stamps `startedAt` while we
 *  wait on it, so a stamp at-or-after the timestamp we took before calling is our own boot; a reuse carries
 *  the ORIGINAL boot's stamp, which is older. */
export function stageBootedByThisRun(startedAtIso: string, beforeEnsureMs: number): boolean {
  const startedMs = Date.parse(startedAtIso);
  return Number.isNaN(startedMs) ? false : startedMs >= beforeEnsureMs;
}

/** A COLD stage's first audit must not print a verdict — MEASURED on the #678 receipt run: immediately
 *  after boot the walk censused 14 nodes and reported `findings=0 … exit 0` on a tree carrying a planted
 *  1:1 contrast defect; the very next run censused 332 and REDed on it. That is a false clean of exactly
 *  the class this instrument's zero-hygiene exists to refuse (#409) — and it slips past the census/reach
 *  gaps, because 14 nodes and one reachable control are not zero. So the boot run is an INSTRUMENT
 *  failure (exit 2) by construction, and the warm re-run is the verdict. */
export const COLD_STAGE_REFUSAL =
  "COLD STAGE    this run BOOTED the stage; vite's dep-optimizer is still churning, so the walk would census a fraction of the surface and report it clean (measured: 14 nodes vs 332 one run later, over a planted P1). No verdict was printed — re-run the SAME command against the now-warm stage.";

/** Argv conflicts, collected without side effects — any entry is EXIT.misuse before git or a browser runs.
 *  Both arms exist because the silent alternative is a lie about which tree was audited: `--base` beside a
 *  stage flag means two answers to "where", and `--ref` beside `--dirty` means two answers to "which tree". */
export function stageArgErrors(args: Pick<Args, "isolated" | "dirty" | "ref" | "baseExplicit" | "session">): string[] {
  const errors: string[] = [];
  if (args.isolated && args.baseExplicit) {
    errors.push("--base and --isolated/--ref/--dirty both name WHERE to audit — pass one (the stage supplies its own base URL)");
  }
  if (args.dirty && args.ref !== null) {
    errors.push("--dirty stages the WORKING TREE and --ref stages a commit — pass one");
  }
  // #1285: `--session` attaches to the session's own BROWSER, but the run still names its OWN navigation
  // target with `--base`/route (design §5: "an attached sibling wires its own capture for the duration
  // of its run") — so `--base` composes with `--session`. What does NOT compose is snap's ISOLATED STAGE
  // machinery: booting/reusing a second dev stack is orthogonal to attaching a browser, and a caller who
  // wrote both is asking two unrelated things this run cannot do at once.
  if (args.session !== null && args.isolated) {
    errors.push(
      "--session attaches to a live session's browser; --isolated/--ref/--dirty/--fresh boot a stage — pass one (the stage the session itself was booted against is unaffected either way)",
    );
  }
  return errors;
}

/** A `--ref` this checkout cannot resolve REFUSES (EXIT.misuse). The silent alternative is the whole bug
 *  class: falling back to the default base would audit the DEV STACK (main) and report it as the ref's rows. */
export function unknownRefRefusal(ref: string): string {
  return `REF REFUSED   git cannot resolve ${JSON.stringify(ref)} to a commit in this checkout — no audit was run (a fallback would have audited the dev stack and reported it as ${ref}'s rows). Pass a sha/branch/tag this checkout knows.`;
}

/** The stage could not be BOOTED (a foreign stage holds the band, an unsupported ref, a failed stack) —
 *  an instrument failure (EXIT.toolError), never a finding and never a fallback audit of the dev stack. */
export function stageBootRefusal(reason: string): string {
  return `STAGE ERROR   ${reason}\n              no audit was run — a stage that will not boot is an instrument failure, not a clean surface. Stage admin lives on snap: pnpm snap --stage-status / --stage-down / --stage-sweep.`;
}
