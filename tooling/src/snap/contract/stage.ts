// The isolated-stage shapes (--isolated/--dirty): ports, paths, the shared ownership marker (#108),
// and the band-access/staleness verdict vocabulary.
export interface StagePorts {
  readonly server: number;
  readonly vite: number;
}

export interface StagePaths {
  readonly dir: string;
  readonly databaseUrl: string;
  readonly assetsDir: string;
}

export interface ActiveStage {
  readonly sha: string;
  readonly shortSha: string;
  readonly dir: string;
  readonly serverPort: number;
  readonly vitePort: number;
  readonly baseUrl: string;
  /** The repo root snap ran from when this stage was booted — the OWNER (issue #108). A marker whose
   *  checkout is not yours means a sibling holds the band; that is a refusal, never a teardown. */
  readonly checkout: string;
  /** The pid bound to the stage SERVER port at boot, or null when `ss` could not name one. Recorded for
   *  provenance; the refusal also reads the LIVE band pid, which is what a human can actually inspect. */
  readonly ownerPid: number | null;
  /** ISO timestamp of the boot that wrote this marker — the "age" half of the refusal. */
  readonly startedAt: string;
  /** ISO timestamp of the LAST `ensureStage` that booted OR reused this stage — the heartbeat (#324).
   *  A warm stage deliberately outlives the snap run that booted it (that is the whole design), so its
   *  liveness cannot be a parent-process check: it is USE. A stage nobody has snapped against for
   *  `STAGE_IDLE_TTL_MS` is a strand `--stage-sweep` may reap. A marker written before this field
   *  existed reads back with `lastUsedAt === startedAt` (`readActive` backfills — a marker that cannot
   *  say when it was last used must not look fresh, and its boot stamp is the honest floor). */
  readonly lastUsedAt: string;
}

/** What `--stage-sweep` may do to whatever currently holds the stage band (#324). The one-band design and
 *  the #108 ownership rules are unchanged — this only decides whether a stage has outlived its use:
 *   • `live`      — the band is bound and the stage was used inside the TTL: NEVER touched, whoever owns it.
 *   • `stranded`  — the band is bound by a stage-rooted process that no live use accounts for: reap it.
 *   • `unbound`   — nothing holds the band; only dirs/marker reconciliation is left to do. */
const STAGE_SWEEP_VERDICTS = ["live", "stranded", "unbound"] as const;
export type StageSweepVerdict = (typeof STAGE_SWEEP_VERDICTS)[number];

/** The evidence `stageSweepVerdict` judges — every field is observed by the imperative caller, so the
 *  verdict itself stays pure and unit-testable. */
export interface StageSweepEvidence {
  /** The shared marker, or null when it is missing/unreadable (the lost-marker case). */
  readonly active: ActiveStage | null;
  /** Is either half of the fixed band bound right now? */
  readonly bandBound: boolean;
  /** True only when the bound band's process is rooted in a `.cache/snap-stage/` dir. A bound band that
   *  is NOT stage-rooted is somebody else's server, and the sweep must keep its hands off it. */
  readonly bandIsStageRooted: boolean;
  /** Elapsed seconds of the bound band's process, or null when `ps` could not say — the age signal for a
   *  MARKER-LESS stage, which has no heartbeat to read. */
  readonly bandProcessAgeSeconds: number | null;
  readonly nowMs: number;
}

/** How a checkout may use the band, given the shared marker (issue #108). The one-band design is
 *  unchanged — this only decides whether a foreign owner is reused, reclaimed, or respected:
 *   • `ours`         — no marker, or we wrote it: the existing staleness rules apply unchanged.
 *   • `take-over`    — a foreign marker whose band is NOT bound: a dead stage, reclaim it.
 *   • `shared-reuse` — a foreign, healthy stage at the SAME commit: identical frozen source, so point at
 *                      it read-only rather than fighting for the pair.
 *   • `refuse`       — a foreign LIVE stage we would have to rebuild, re-sync or kill. Name the owner. */
const BAND_ACCESS = ["ours", "shared-reuse", "take-over", "refuse"] as const;
export type BandAccess = (typeof BAND_ACCESS)[number];

/** How the INVOKING checkout may read a `--base`/`--url` an instrument was pointed at (#1186). The band
 *  is one fixed port pair for the whole box and its owner marker is one shared file, so this is exact:
 *   • `not-the-band` — an ordinary base (the dev stack, a CT server): nothing to arbitrate.
 *   • `ours`         — the band, and the marker names THIS checkout: measure away.
 *   • `foreign`      — the band, owned by another checkout: its pixels are not ours to report.
 *   • `unowned`      — the band, and no marker accounts for it: whose tree is serving is unknowable. */
const STAGE_BAND_CLAIMS = ["not-the-band", "ours", "foreign", "unowned"] as const;
export type StageBandClaim = (typeof STAGE_BAND_CLAIMS)[number];

export type StageDecision = "reuse" | "rebuild";

export interface EnsureStageOpts {
  readonly ref?: string;
  readonly fresh: boolean;
  readonly dirty?: boolean;
}
