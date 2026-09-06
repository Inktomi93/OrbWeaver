// The vocabulary of the SCOPED TEST front door (`cli.ts scoped-test <runner> …`, #1192).
//
// The two names are the house TIER names, not the vendor names, because that is what every brief and every
// standing fact already says: "node suites = `pnpm test:scoped`, CT = `pnpm ct:scoped`"
// (.claude/rules/lane-standing-facts.md). Which vendor binary each tier spawns is an implementation fact
// that lives in ops/scoped-test.ts and is free to change; the tier name is the stable surface.
export const SCOPED_TEST_RUNNERS = ["node", "ct"] as const;

export type ScopedTestRunner = (typeof SCOPED_TEST_RUNNERS)[number];

/** What a runner's LIST/collection pass answered: the test files it would actually open, repo-relative
 *  posix — or the reason it could not answer, which is never silently treated as "collected nothing"
 *  (a blind zero here would rebuild the exact defect this door exists to refuse). */
export type ScopedTestCollection = { readonly files: readonly string[] } | { readonly error: string };

/** ONE INVOCATION'S CT LEASE (#1581): where it builds, and how it gives the worktree back. `release` is
 *  idempotent — the runner calls it from a `finally`, so a refused preflight frees the tree too. */
interface CtRunnerLease {
  /** The per-invocation build cache — absolute, freshly created (hence COLD), removed by `release`. */
  readonly cacheDir: string;
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
