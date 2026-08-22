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
export interface RunManifest {
  /** Identity of the process that produced this artifact: pid + start instant. Two concurrent runs write
   *  to the same path (last writer wins, deliberately — concurrent commits must not block), so a reader
   *  comparing identities can tell "this is my run's report" from "somebody else's landed on top". */
  readonly runId: string;
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
  /** Why the reconciliation failed, when it did. Empty on a complete, reconciled run. */
  readonly incompleteReasons: readonly string[];
}
