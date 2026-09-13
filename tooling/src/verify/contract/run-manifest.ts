// THE RUN MANIFEST (#410) — the shape that makes "this artifact is a complete verdict" a machine fact
// rather than an assumption a reader brings.
//
// THE DEFECT IT CLOSES. `reports/check-structure.json` recorded a VERDICT and nothing about the RUN that
// produced it. Three ways that lies, all of them silent:
//   1. a SHORTER run — the loader silently `continue`s past a module that exports no `gate` (loader.ts), so
//      a corpus file can stop registering and the report simply has one fewer entry. Nothing compares the
//      count on disk against the count that ran.
//   2. a KILLED run — the artifact is written once, at the END. A run killed mid-walk (SIGKILL, a wall-clock
//      kill, an OOM abort under the heap ceiling) leaves the PREVIOUS run's file on disk, and every reader
//      the doctrine sends there ("read reports/check-structure.json, never re-run") consumes a stale
//      complete-looking verdict as this run's.
//   3. a run whose exit code was lost — a caller that only inspects the artifact cannot tell 0 from 137.
//
// THE MECHANISM. The artifact is written TWICE: an IN-FLIGHT stub the moment the run starts (`complete:
// false`, carrying the run identity), and the finished report at the end. A killed run therefore leaves an
// artifact that says so, and every reader refuses it. Before the run may exit 0/1 it also asserts the
// counts reconcile — `ran === active` and `registered + unregistered === corpus` — and a mismatch is
// exit-2 class, never a shorter clean report.
//
// WHERE THOSE TWO WRITES LAND CHANGED (#1029, owner ruling 2026-09-01 "all reports need to be able to be
// ran concurrently"). Both writes used to go to the ONE fixed `reports/check-structure.json`, and that path
// is precisely what concurrent runs clobber — measured live, a complete 248-gate verdict was replaced by a
// SIBLING run's in-flight stub inside 30s, which is this manifest's own tell firing for the wrong run. So
// the run writes into its private slot (`reports/runs/structure/<runId>/`, `_shared/artifacts.ts`) and
// publishes `reports/check-structure.json` as a symlink into it at COMPLETION ONLY.
//
// The ruling survives — its INPUT changed. The stub still exists, still says `complete: false`, and is
// still refused by every reader; what retired is the assumption that a reader arriving at the fixed path
// is looking at the last run STARTED. The killed-run tell now reaches that reader through
// `abandonedRuns()`: a slot whose in-flight marker outlived its pid. That is strictly finer than the old
// signal, which could not distinguish "my run died" from "a sibling lane is mid-run".
import type { PolicySelector } from "./policy-plan.ts";

/** IS THIS ARTIFACT A STATEMENT ABOUT THE REAL TREE? (#2167) — the axis `complete` was never able to carry.
 *
 *  `complete` answers "did the run FINISH" (#410). A run can finish perfectly and still be worthless as
 *  evidence, and that is the gap a fresh-context verifier fell into on 2026-09-12: it built a whole
 *  REAL-TREE LIVENESS section on slot `main-2930600`, whose 443 `__g_` findings are a fixture suite's props.
 *  The artifact said `complete: true` and carried no marker, so the reader acted correctly on every rule it
 *  had. THREE of the twelve published slots are that shape — derived, not remembered, with the predicate
 *  "any `__g_`/`__dc_` path in a slot's violations": a real-tree run STRIPS those (lib/pass.ts
 *  `stripProbeFindings`), so a slot that CONTAINS them is by construction a run that opted out, i.e. the
 *  gate self-test's own child (`ORB_GATE_FIXTURES=1`).
 *
 *  So the two axes are orthogonal and both are recorded: `complete` = the run finished · `verdict` = what it
 *  finished is about the real tree. Every reader refuses a `non-verdict` LOUDLY and names the reason.
 *  @public knip type-face false positive — the one-home vocabulary tuple behind the exported `RunVerdictKind` union (line 51) —
 *  the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite the
 *  re-spell `no-inline-union-redecl` exists to stop. */
export const RUN_VERDICT_KINDS = ["verdict", "non-verdict"] as const;
/** @public knip type-face false positive — a structural field (`verdict`) of the exported `RunManifest` shape (line 56), never
 *  referenced by its own name at any call site. */
export type RunVerdictKind = (typeof RUN_VERDICT_KINDS)[number];

export interface RunManifest {
  /** `non-verdict` when this run cannot speak for the real tree: it is in flight, it ran in FIXTURE MODE, it
   *  OBSERVED planted paths it did not plant, or an operator TOMBSTONED it (`structure --void`). A
   *  `non-verdict` run never publishes `reports/check-structure.json`, so the pointer can only ever resolve
   *  to a run that both finished AND meant it. */
  readonly verdict: RunVerdictKind;
  /** WHY, in the operator's words or the run's own — printed verbatim by every refusing reader. Null exactly
   *  when `verdict` is `"verdict"`: a non-verdict without a reason is a refusal nobody can act on. */
  readonly nonVerdictReason: string | null;
  /** WHICH gates this run was asked about (#1964). `{kind:"all"}` is the whole corpus — the only shape that
   *  publishes `reports/check-structure.json`. Anything else is a GATE-SCOPED run: every count below is a
   *  denominator over the SELECTION, and the artifact is reachable only through its own slot, so a partial
   *  run can never be picked up as the corpus verdict by a reader holding the fixed path. */
  readonly selection: PolicySelector;
  /** FALSE when this run OBSERVED PLANTED FIXTURE PATHS (`__g_` / `__dc_`) it did not plant (#2069). A
   *  fixture-planting suite and a real-tree structure run are mutually exclusive in BOTH directions: the
   *  planter's files are materialized inside the real package tree for the milliseconds-to-minutes of its own
   *  child run, and an overlapping run reads a tree that does not exist — inflated raw counts that look
   *  exactly like a real number (slot `main-2930600`, 2026-09-12). A not-quiet run records the paths it saw
   *  in `incompleteReasons`, so its own artifact refuses to be read as a verdict. The check-gates suite's OWN
   *  child runs are exempt by `ORB_GATE_FIXTURES=1` — they MUST see what they planted. */
  readonly quiet: boolean;
  /** Identity of the run that produced this artifact: `<checkout>-<pid>-<timestamp>` (#1029). The checkout
   *  half is `main` for the primary checkout and the worktree directory name for a lane, so a run id names
   *  WHERE it ran as well as when — an artifact can never be misattributed across worktrees. */
  readonly runId: string;
  /** The checkout the run judged (`main` / the worktree basename) — the run id's first field, broken out
   *  so a reader does not have to parse it. */
  readonly checkout: string;
  /** The repo-relative slot this run's own artifacts live in, so a reader holding the published pointer can
   *  name the run it actually read. */
  readonly artifactDir: string;
  /** OTHER runs of this instrument that were in flight when this one opened its slot. Named, never
   *  silently tolerated: a race is a fact about the run, and `[]` on a solo run is the honest zero. */
  readonly concurrent: readonly string[];
  readonly startedAt: string;
  /** null while the run is in flight — the tell a reader refuses on. */
  readonly finishedAt: string | null;
  /** FALSE until the finished report replaces the in-flight stub. A `false` on disk means the run DIED:
   *  its artifact is not a verdict at any exit code. */
  readonly complete: boolean;
  /** Gate `.ts` files the corpus dir holds (the denominator the loader started from). */
  readonly corpusFiles: number;
  /** Descriptors the loader accepted. */
  readonly registered: number;
  /** Corpus files that registered NOTHING — the loader's silent `continue`. Recorded, never tolerated
   *  quietly: `gate-modernization` arm A reds them, and this count is how a reader sees the gap at all. */
  readonly unregistered: readonly string[];
  /** Descriptors with `status: "active"` — the set `runPass` was supposed to run. */
  readonly active: number;
  /** Gates that actually produced a result this pass. */
  readonly ran: number;
  /** THE MIXED RUNTIME'S SPLIT (#1584 §5): `registered`/`active`/`ran` above are the SUMS across both contracts, so a
   *  pre-mixed reader keeps its meaning; these halves say which contract each count came from. A final policy has
   *  no dormant state (every registered policy is active), and `withheld` counts the final owners central
   *  authority refused to reconcile (an incomplete owner, a spoofed finding) — each of those is also a tool error. */
  readonly legacy: { readonly registered: number; readonly active: number; readonly ran: number };
  readonly final: { readonly registered: number; readonly ran: number; readonly withheld: number };
  /** Why the reconciliation failed, when it did. Empty on a complete, reconciled run. */
  readonly incompleteReasons: readonly string[];
}
