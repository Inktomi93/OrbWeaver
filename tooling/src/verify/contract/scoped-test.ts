// The vocabulary of the SCOPED TEST front door (`cli.ts scoped-test <runner> …`, #1192).
//
// The two names are the house TIER names, not the vendor names, because that is what every brief and every
// standing fact already says: "node suites = `pnpm test:scoped`, CT = `pnpm test:ct`"
// (.claude/skills/lane/SKILL.md). Which vendor binary each tier spawns is an implementation fact
// that lives in ops/scoped-test.ts and is free to change; the tier name is the stable surface.
export const SCOPED_TEST_RUNNERS = ["node", "ct"] as const;

export type ScopedTestRunner = (typeof SCOPED_TEST_RUNNERS)[number];

/** What a runner's LIST/collection pass answered: the test files it would actually open, repo-relative
 *  posix — or the reason it could not answer, which is never silently treated as "collected nothing"
 *  (a blind zero here would rebuild the exact defect this door exists to refuse).
 *
 *  `projects` is the NATIVE project names the same listing attributed those files to (vitest's
 *  `--filesOnly --json` emits `projectName` per row; playwright's suite tree has no equivalent, so the CT
 *  arm leaves it empty). It is what decides the node arm's RUNTIME-ONLY door (#2232, ops/scoped-test.ts):
 *  membership is READ from the runner, never guessed from a filename, so a directory operand holding a
 *  `.test-d.ts` is classified by the same authority that would run it. */
export type ScopedTestCollection = { readonly files: readonly string[]; readonly projects: readonly string[] } | { readonly error: string };

/** ONE INVOCATION'S CT LEASE (#1581): where it builds, and how it gives the worktree back. `release` is
 *  idempotent — the runner calls it from a `finally`, so a refused preflight frees the tree too. */
interface CtRunnerLease {
  /** The per-invocation build cache — absolute, freshly created (hence COLD), removed by `release`. */
  readonly cacheDir: string;
  /** THE RUN MARKER this invocation stamps into playwright's environment (#1848), INHERITED when the CT
   *  run is itself inside a marked run so the outer runner's kill path still reaches these browsers. It is
   *  NOT what `release` sweeps: an inherited value names the outer run, and killing it kills that run. */
  readonly runMarker: string;
  /** THE LEASE (#2504) — minted fresh for THIS invocation, never inherited, stamped beside the run marker
   *  on the same children. `release` sweeps exactly this: a chromium or a CT vite server still carrying it
   *  after playwright has returned outlived its own run, while everything else on the box is somebody's. */
  readonly runLease: string;
  readonly release: () => void;
  /** Set when a DEAD runner's lock was stolen — the caller prints it, so a self-heal is never silent. */
  readonly stolenFrom: number | null;
  /** The HOST-WIDE slot this run holds (#1835), or `null` when the host pool's wait ceiling was reached
   *  and it proceeded uncapped. The per-worktree lock above stops two runners CORRUPTING each other; this
   *  stops N worktrees' runners jointly saturating the box — six lanes × 4 chromium workers was the
   *  measured load. Absent (`undefined`) only on the worktree-lock-only door. */
  readonly hostSlot?: number | null;
  /** How long this run queued for its host slot. */
  readonly hostWaitedMs?: number;
}

/** Who holds the worktree's CT lock, as the lockfile records it. */
export interface CtRunnerLockRecord {
  readonly pid: number;
  readonly startedAt: string;
  readonly argv: string;
}

/** Taking the lock has exactly two outcomes, and the busy one carries the sentence the operator acts on. */
export type CtRunnerLock =
  | { readonly kind: "held"; readonly lease: CtRunnerLease }
  | { readonly kind: "busy"; readonly holder: CtRunnerLockRecord; readonly refusal: string };
