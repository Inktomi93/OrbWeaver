// The isolated-stage shapes (--isolated/--dirty): ports, paths, the shared BAND TABLE (#108 → #1276), and
// the access/staleness/health/allocation verdict vocabularies.
//
// THE TABLE, NOT A MARKER. Until #1276 there was ONE row —
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

/** A session observed that one half of this stage's port pair disappeared. Kept on the band row so
 *  `--stage-status` and `--stage-sweep` see the same death the session recorded. */
interface StageDeath {
  readonly detectedAt: string;
  readonly op: string;
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
  /** Absent for a usable stage; present until the dead band is rebuilt or swept. */
  readonly dead?: StageDeath;
  /** The stage's OWN idle timer (#1163 arm b): a detached, niced sleeper bound to this band that tears the
   *  stage down when nothing has used it for the TTL. Absent means no timer is armed — which is a degraded
   *  state, never a protected one: the keeper is NEVER a fence, so a row whose keeper pid is dead stays
   *  exactly as reapable by reap-on-acquire and `--stage-sweep` as it was before the timer existed. */
  readonly keeper?: StageKeeper;
}

/** The armed idle timer for one band. `pid` is the keeper process's own pid (its own process group, so a
 *  teardown reaps its whole tree); `armedAt` is when this keeper took the band, which is what lets a keeper
 *  recognise that a REBUILD replaced it and release rather than reap somebody else's fresh stage. */
export interface StageKeeper {
  readonly pid: number;
  readonly armedAt: string;
}

/** WHICH ARM ended a stage — the five teardown paths, named so `--stage-status` can answer "what happened
 *  to band 3?" after the row is gone:
 *   • `timer`     — the stage's own idle keeper (#1163 arm b);
 *   • `acquire`   — lazy reap-on-acquire: the next lane that needed a band took the strand (arm a);
 *   • `sweep`     — `--stage-sweep`, the deliberate reaper;
 *   • `down`      — `--stage-down`, an operator tearing down a stage they are finished with;
 *   • `boot-dead` — the run that BOOTED this stage never got a settled app out of it, warm-up navigation
 *     included (#1837). Distinct from `timer` on purpose: this stage was never warm, so it would otherwise
 *     hold its band, port pair and process group for the full TTL and hand the same dead app to every
 *     reuse. Never fires for a stage a run merely reused — that is #324's rule and `lib/stage-run-binding.ts`
 *     is where it is enforced. */
const STAGE_REAP_ARMS = ["timer", "acquire", "sweep", "down", "boot-dead"] as const;
export type StageReapArm = (typeof STAGE_REAP_ARMS)[number];

/** One row of `<main>/.cache/snap-stage/reaps.json` — a bounded ring of the most recent teardowns. A reaped
 *  band leaves NO row behind, so without this ledger "band 3 is free" and "band 3 was reaped out from under
 *  a lane 40 seconds ago" are the same observation. */
export interface StageReapEntry {
  readonly band: number;
  readonly arm: StageReapArm;
  readonly sha: string;
  readonly checkout: string;
  readonly at: string;
  /** How long the row had been idle when the arm fired — 0 for a deliberate `--stage-down`. */
  readonly idleMs: number;
}

/** `<main>/.cache/snap-stage/reaps.json` — versioned and `rows`-keyed exactly like `StageBandsFile`, so
 *  the two files beside each other read the same way. */
export interface StageReapsFile {
  readonly v: 1;
  readonly rows: readonly StageReapEntry[];
}

/** What ONE poll of the stage's own idle timer decides (#1163 arm b):
 *   • `wait`    — something still accounts for this band (inside the TTL, a live session, or a connected
 *                 client): re-arm and poll again. The DEFAULT for every uncertainty.
 *   • `reap`    — idle past the TTL with no live session and no connected client: tear it down.
 *   • `release` — this keeper no longer owns the row (cleared, or rebuilt under a new keeper): exit
 *                 touching NOTHING, because whatever is on the band now is not what this timer was armed for.
 *   • `refuse`  — the row names a RESERVED port pair (the dev stack, the fixture, an e2e mode): exit 2
 *                 loudly. A timer that could reach the operator's own stack is not a timer, it is an outage. */
const STAGE_KEEPER_VERDICTS = ["wait", "reap", "release", "refuse"] as const;
export type StageKeeperVerdict = (typeof STAGE_KEEPER_VERDICTS)[number];

/** The evidence ONE keeper poll judges — every field observed by the imperative loop, so the verdict stays
 *  pure and unit-testable (the `stageSweepVerdict` discipline). */
export interface StageKeeperEvidence {
  /** The band's row as the table reads it RIGHT NOW, or null when nothing holds the band any more. */
  readonly row: StageRow | null;
  /** This keeper process's own pid — compared against `row.keeper.pid` to detect a rebuild. */
  readonly keeperPid: number;
  /** Names from `row.sessions` whose daemon is ALIVE (the same fence `stageSweepVerdict` reads). */
  readonly liveSessions: readonly string[];
  /** A DESCRIPTION of something holding an ESTABLISHED connection to one of the row's ports that is not
   *  one of the stage's own processes — a driving browser, a sibling instrument, an operator's curl. Null
   *  = nobody is connected. Unidentifiable and off-box peers describe as foreign: "I could not identify
   *  the client" never grants permission to reap (ops/stage-probe.ts `foreignBandPeer`). */
  readonly foreignPeer: string | null;
  /** Those of the row's ports that a RESERVED row owns (`_shared/ports.ts`) — normally empty. */
  readonly reservedPorts: readonly number[];
  readonly nowMs: number;
  readonly ttlMs: number;
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
 *   • `shared`       — a SIBLING's band the ALLOCATOR itself handed this run (#2441): readable, not ours.
 *   • `foreign`      — a band owned by another checkout: its pixels are not ours to report.
 *   • `unowned`      — a band port with no row accounting for it: whose tree is serving is unknowable.
 *
 *  WHY `shared` HAD TO EXIST (#2441). The allocator's arm 2 hands a lane "a sibling's healthy row at our
 *  sha" (`bandAccess` → `shared-reuse`, #108: identical bytes, strictly cheaper than a 55 s boot) and this
 *  guard then called that exact row `foreign` and exited 2 with "nothing was measured" — so every lane
 *  whose `--ref` matched a live sibling's stage (at main tip, that is every lane) could never run an
 *  isolated snap, and the refusal's own advice ("boot your own stage") looped straight back into the reuse
 *  that produced it. #1186's RULING SURVIVES — its INPUT changed. The incident it was minted from is a
 *  chained instrument reading a band NOBODY handed it, and that is still `foreign`: `shared` is granted
 *  ONLY against the row this run's own allocation bound (`lib/stage-run-binding.ts`), never re-derived
 *  from the table, so a `--base` typed at a sibling's port is refused exactly as before. */
const STAGE_BAND_CLAIMS = ["not-the-band", "ours", "shared", "foreign", "unowned"] as const;
export type StageBandClaim = (typeof STAGE_BAND_CLAIMS)[number];

export type StageDecision = "reuse" | "rebuild";

/** The owner-ruled calibration knobs (design §12.2 F5): stage idle TTL 60 min, cap 3 live stages, both
 *  env-overridable (`ORB_STAGE_TTL_MIN` / `ORB_STAGE_CAP`). The band RANGE (0..9) is the hard ceiling. */
export interface StageLimits {
  readonly ttlMs: number;
  readonly cap: number;
}

/** ONE established TCP socket as `ss -tnp` reports it: the local port it terminates, the peer it faces,
 *  and the pid owning the LOCAL end (null when `ss` named none). The stage timer's raw signal — a band
 *  port's clients are found by matching each connection's PEER port against the local port of another
 *  connection, which is how a loopback pair identifies both of its ends from one snapshot. */
export interface EstablishedConnection {
  readonly localPort: number;
  readonly peerHost: string;
  readonly peerPort: number;
  readonly pid: number | null;
}

export interface EnsureStageOpts {
  readonly ref?: string;
  readonly fresh: boolean;
  readonly dirty?: boolean;
}
