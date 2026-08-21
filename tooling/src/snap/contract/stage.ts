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

export type StageDecision = "reuse" | "rebuild";

export interface EnsureStageOpts {
  readonly ref?: string;
  readonly fresh: boolean;
  readonly dirty?: boolean;
}
