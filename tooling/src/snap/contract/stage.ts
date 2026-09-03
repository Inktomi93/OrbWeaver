// The isolated-stage shapes (--isolated/--dirty): ports, paths, the shared BAND TABLE (#108 → #1276), and
// the access/staleness/health/allocation verdict vocabularies.
//
// THE TABLE, NOT A MARKER (docs/design/1208-instrument-substrate.md §3.6). Until #1276 there was ONE row —
// `active.json` — because there was one band, so two lanes wanting a stage was a refusal by construction
// (four lanes blocked in one afternoon, 2026-09-02). A `StageRow` is now ONE row of
// `<main>/.cache/snap-stage/bands.json`, keyed by its band index in `_shared/ports.ts`'s `STAGE_BANDS`, and
// the #108 ownership rules apply PER ROW rather than to the box.
//
// DERIVED FIELDS ARE NOT STORED. `shortSha`/`baseUrl` used to live in the marker; they are functions of
// `sha` and `vitePort` (`shortSha()` / `stageBaseUrl()` in lib/stage-plan.ts), and a serialized copy of a
// derived value is a second home that drifts. Ports ARE stored because they are the band's identity as the
// row was written — a row whose ports disagree with `stageBandPorts(row.band)` is evidence of a registry
// edit, not something to silently paper over.
import type { ServedState } from "../../stack/index.ts";

export interface StagePorts {
  readonly server: number;
  readonly vite: number;
}

export interface StagePaths {
  readonly dir: string;
  readonly databaseUrl: string;
  readonly assetsDir: string;
}

/** Where a stage's DB came from, so `--stage-status` can answer "is this stage's data older than the dev
 *  db it was copied from?" without a second probe. Null when the checkout had no dev db to copy. */
export interface StageDbProvenance {
  readonly copiedFrom: string;
  readonly copiedAt: string;
  /** The dev db's mtime AT THE MOMENT OF THE COPY — a later dev-db mtime means the stage's data is behind. */
  readonly devDbMtimeAtCopy: string;
}

/** One row of the band table: a stage on band `k`, owned by one checkout, serving one sha. */
export interface StageRow {
  /** Index into `_shared/ports.ts` `STAGE_BANDS` — the row's key. */
  readonly band: number;
  readonly sha: string;
  readonly dir: string;
  readonly serverPort: number;
  readonly vitePort: number;
  /** The repo root snap ran from when this stage was booted — the OWNER (issue #108). A row whose
   *  checkout is not yours means a sibling holds that band; that is a refusal, never a teardown. */
  readonly checkout: string;
  /** The pid bound to the stage SERVER port at boot, or null when `ss` could not name one. Recorded for
   *  provenance; the refusal also reads the LIVE band pid, which is what a human can actually inspect. */
  readonly ownerPid: number | null;
  /** ISO timestamp of the boot that wrote this row — the "age" half of the refusal and of the ERA rule. */
  readonly startedAt: string;
  /** ISO timestamp of the LAST interaction through the substrate (#324 → §3.6): every `ensureStage`, every
   *  session call bound to this band, and every attached sibling run. A warm stage deliberately outlives
   *  the run that booted it, so its liveness cannot be a parent-process check — it is USE. A row nobody has
   *  touched for the stage TTL is a strand that reap-on-acquire or `--stage-sweep` may take. */
  readonly lastUsedAt: string;
  /** Session names bound to this band. A row with a LIVE session ref is NEVER a strand, whatever its idle
   *  age — a reaper that eats a live stage is worse than no reaper (§3.6). Liveness of each name is the
   *  session registry's answer, not this list's: the list is the claim, the daemon pid is the evidence. */
  readonly sessions: readonly string[];
  readonly dbProvenance: StageDbProvenance | null;
  /** How many `--dirty` rsyncs this stage has absorbed — the ERA rule's counter (a long-lived vite that
   *  absorbed a multi-merge era can serve a CORRUPT module graph; memory `long-lived-vite-corrupt-graph`). */
  readonly rsyncs: number;
}

/** `<main>/.cache/snap-stage/bands.json` — the whole table, versioned like the session registry's rows so a
 *  future field addition is a readable migration rather than a silent misparse. */
export interface StageBandsFile {
  readonly v: 1;
  readonly rows: readonly StageRow[];
}

/** What `--stage-sweep` may do to whatever currently holds a band (#324). The #108 ownership rules are
 *  unchanged — this only decides whether a stage has outlived its use:
 *   • `live`      — the band is bound and the stage was used inside the TTL (or holds a live session):
 *                   NEVER touched, whoever owns it.
 *   • `stranded`  — the band is bound by a stage-rooted process that no live use accounts for: reap it.
 *   • `unbound`   — nothing holds the band; only dirs/row reconciliation is left to do. */
const STAGE_SWEEP_VERDICTS = ["live", "stranded", "unbound"] as const;
export type StageSweepVerdict = (typeof STAGE_SWEEP_VERDICTS)[number];

/** The evidence `stageSweepVerdict` judges for ONE band — every field is observed by the imperative
 *  caller, so the verdict itself stays pure and unit-testable. */
export interface StageSweepEvidence {
  /** The band's row, or null when none accounts for it (the lost-row case). */
  readonly row: StageRow | null;
  /** Is either half of this band bound right now? */
  readonly bandBound: boolean;
  /** True only when the bound band's process is rooted in a `.cache/snap-stage/` dir. A bound band that
   *  is NOT stage-rooted is somebody else's server, and the sweep must keep its hands off it. */
  readonly bandIsStageRooted: boolean;
  /** Elapsed seconds of the bound band's process, or null when `ps` could not say — the age signal for a
   *  ROW-LESS stage, which has no heartbeat to read. */
  readonly bandProcessAgeSeconds: number | null;
  /** Names from `row.sessions` whose daemon is ALIVE right now. A non-empty list pins the row `live`
   *  regardless of idle age — the negative control the TTL exists to not violate. */
  readonly liveSessions: readonly string[];
  readonly nowMs: number;
}

/** A band as the allocator sees it: its row plus everything the imperative caller observed about it.
 *  `row: null` = an EMPTY band (no row); `bandBound` still matters there, because a band whose ports are
 *  held by something no row accounts for must not be allocated onto. */
export interface StageBandView {
  readonly band: number;
  readonly row: StageRow | null;
  readonly bandBound: boolean;
  readonly bandIsStageRooted: boolean;
  readonly healthy: boolean;
  readonly liveSessions: readonly string[];
}

/** How a checkout may use ONE band, given its row (issue #108, generalized per row by #1276):
 *   • `ours`         — no row, or we wrote it: the existing staleness rules apply unchanged.
 *   • `take-over`    — a foreign row whose band is NOT bound: a dead stage, reclaim it.
 *   • `shared-reuse` — a foreign, healthy stage at the SAME commit: identical frozen source, so point at
 *                      it read-only rather than fighting for the pair.
 *   • `refuse`       — a foreign LIVE stage we would have to rebuild, re-sync or kill. Name the owner. */
const BAND_ACCESS = ["ours", "shared-reuse", "take-over", "refuse"] as const;
export type BandAccess = (typeof BAND_ACCESS)[number];

/** What the allocator decided, in §3.6's order. Every arm names the band the caller is to act on, so the
 *  imperative half never re-derives the choice:
 *   • `ours`         — this checkout's own row for (checkout, sha): reuse-or-rebuild IN PLACE on its band.
 *   • `shared-reuse` — a sibling's healthy row at the same sha: drive it read-only, stamp its heartbeat.
 *   • `free`         — the lowest band with no row and no bound port: boot here.
 *   • `reap`         — the lowest STRANDED row: tear it down, then boot here (lazy reap-on-acquire).
 *   • `exhausted`    — the cap or the range is full: exit 2 with `refusal`, having measured nothing. */
export type StageAllocation =
  | { readonly kind: "ours"; readonly band: number; readonly row: StageRow }
  | { readonly kind: "shared-reuse"; readonly band: number; readonly row: StageRow }
  | { readonly kind: "free"; readonly band: number }
  | { readonly kind: "reap"; readonly band: number; readonly row: StageRow }
  | { readonly kind: "exhausted"; readonly refusal: string };

/** The three-probe health verdict (§3.6). `healthz ok` ∧ `vite answers` ∧ `served-probe fresh` — plus the
 *  ERA rule for a `--dirty` stage:
 *   • `warm`      — all three answered and the stage is inside its era: reuse it.
 *   • `degraded`  — at least one probe says no. A DEAD WATCHER is the case that motivated the third probe:
 *                   healthz green, vite pid alive, and every page load white-screening on a pre-change
 *                   transform for 24 minutes (#524). A degraded stage is rebuilt, never reused.
 *   • `rebuild`   — every probe is green but the stage has absorbed too many rsyncs / too much wall clock
 *                   to be trusted (memory `long-lived-vite-corrupt-graph`). Only a `--dirty` stage can
 *                   reach this: a `--ref` stage never HMRs, so its era never ends. */
const STAGE_HEALTH = ["warm", "degraded", "rebuild"] as const;
export type StageHealth = (typeof STAGE_HEALTH)[number];

/** What the three probes answered for one band.
 *
 *  `served` IS the stack tool's `ServedState`, imported TYPE-ONLY through its front door — not a copy of it.
 *  The first draft re-spelled the four members here with a comment claiming that kept the stack tool behind
 *  snap's door; `no-inline-union-redecl` was right and the comment was wrong. The purity that comment was
 *  actually protecting is about VALUES: a type-only import is erased at compile time, so this file still
 *  pulls in no stack code, no `ss`, no fetch and no runtime edge — while the vocabulary keeps ONE home
 *  (`tooling/src/stack/contract/types.ts` `SERVED_STATES`, exported as `ServedState` at that tool's
 *  index.ts). The IMPERATIVE probe that produces the value still enters through the same front door
 *  (ops/stage-probe.ts spawns the stack's own `served-probe` entry), which is what §4.2 requires. */
export interface StageHealthEvidence {
  readonly healthzOk: boolean;
  readonly viteOk: boolean;
  readonly served: ServedState;
  /** Is this the `--dirty` stage? Only it HMRs, so only it has an era. */
  readonly dirty: boolean;
  readonly rsyncs: number;
  readonly ageMs: number;
}

/** How the INVOKING checkout may read a `--base`/`--url` an instrument was pointed at (#1186). Every band
 *  is a registered port pair and the table names each one's owner, so this is exact:
 *   • `not-the-band` — an ordinary base (the dev stack, a CT server): nothing to arbitrate.
 *   • `ours`         — a band whose row names THIS checkout: measure away.
 *   • `foreign`      — a band owned by another checkout: its pixels are not ours to report.
 *   • `unowned`      — a band port with no row accounting for it: whose tree is serving is unknowable. */
const STAGE_BAND_CLAIMS = ["not-the-band", "ours", "foreign", "unowned"] as const;
export type StageBandClaim = (typeof STAGE_BAND_CLAIMS)[number];

export type StageDecision = "reuse" | "rebuild";

/** The owner-ruled calibration knobs (design §12.2 F5): stage idle TTL 60 min, cap 3 live stages, both
 *  env-overridable (`ORB_STAGE_TTL_MIN` / `ORB_STAGE_CAP`). The band RANGE (0..9) is the hard ceiling. */
export interface StageLimits {
  readonly ttlMs: number;
  readonly cap: number;
}

export interface EnsureStageOpts {
  readonly ref?: string;
  readonly fresh: boolean;
  readonly dirty?: boolean;
}
