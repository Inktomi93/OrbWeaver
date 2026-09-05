// THE BAND TABLE's pure rules (tooling/src/snap/lib/stage-bands.ts, design §3.6 / issue #1276): the
// owner-ruled limits, the strand rule and its LIVE-SESSION fence, the allocator's five arms in the spec's
// order, the exhaustion refusals, and the three-probe health verdict with its ERA rule. No git, no stack,
// no `ss` — every observation the imperative half makes is an input here, which is why the arms can be
// driven in both directions.
//
// PLANTED CONTROLS, BOTH DIRECTIONS, because each of these is a way the feature could silently not work:
//  • two allocations against a table where the first has CLAIMED its band land on DIFFERENT bands (and the
//    positive control: with an empty table the first one lands on band 0, or "different" would be trivially
//    satisfied by an allocator that always refuses);
//  • a row past its TTL is `stranded` — AND a row past its TTL WITH A LIVE SESSION is `live`. The second is
//    the one that matters: a reaper that eats a live stage is worse than no reaper;
//  • exhaustion names EVERY row with its idle age (a bare "no bands free" is a mystery, not a refusal);
//  • a killed watcher reads `degraded`, never `warm` — and a healthy stage reads `warm`, or "degraded" would
//    just be a way to rebuild every time.
import { STAGE_BAND_COUNT, stageBandPorts } from "../../../../tooling/src/_shared/ports.ts";
import type { StageBandView, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import {
  allocateStageBand,
  DEFAULT_STAGE_CAP,
  DEFAULT_STAGE_TTL_MIN,
  resolveStageLimits,
  rowIsDangling,
  STAGE_ERA_MAX_RSYNCS,
  stageHealthVerdict,
  stageSweepVerdict,
} from "../../../../tooling/src/snap/lib/stage-bands.ts";
import { DIRTY_STAGE_KEY } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "f".repeat(40);
const MAIN_CHECKOUT = "/home/dev/orbweaver";
const LANE_CHECKOUT = "/home/dev/orbweaver/.claude/worktrees/agent-lane";
const NOW = Date.parse("2026-09-02T18:00:00.000Z");
const MS_PER_MINUTE = 60_000;
const TTL_MS = 60 * MS_PER_MINUTE;
const LIMITS = { ttlMs: TTL_MS, cap: 3 };
const USED_RECENTLY = new Date(NOW - 5 * MS_PER_MINUTE).toISOString();
const USED_LONG_AGO = new Date(NOW - 6 * 60 * MS_PER_MINUTE).toISOString();

function row(band: number, over: Partial<StageRow> = {}): StageRow {
  const ports = stageBandPorts(band);
  return {
    band,
    sha: SHA,
    dir: `${MAIN_CHECKOUT}/.cache/snap-stage/0123456789ab`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: MAIN_CHECKOUT,
    ownerPid: 4242,
    startedAt: USED_RECENTLY,
    lastUsedAt: USED_RECENTLY,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    ...over,
  };
}

/** A full ten-band census with the given rows placed and every other band FREE — the shape the imperative
 *  census hands the allocator. */
function views(placed: readonly { readonly row: StageRow; readonly over?: Partial<StageBandView> }[]): readonly StageBandView[] {
  return Array.from({ length: STAGE_BAND_COUNT }, (_unused, band) => {
    const hit = placed.find((entry) => entry.row.band === band);
    if (hit === undefined) {
      return { band, row: null, bandBound: false, bandIsStageRooted: false, healthy: false, liveSessions: [] };
    }
    return { band, row: hit.row, bandBound: true, bandIsStageRooted: true, healthy: true, liveSessions: [], ...hit.over };
  });
}

const ALLOC = { checkout: MAIN_CHECKOUT, targetSha: SHA, dirty: false, fresh: false, limits: LIMITS, nowMs: NOW };

// ── limits (owner fork F5) ────────────────────────────────────────────────────────────────────────────

test("the stage TTL and cap default to the owner's ruling (60 min / 3), and the env overrides both", () => {
  expect(DEFAULT_STAGE_TTL_MIN).toBe(60);
  expect(DEFAULT_STAGE_CAP).toBe(3);
  const { limits, errors } = resolveStageLimits({ ttlMinEnv: undefined, capEnv: undefined });
  expect(limits).toEqual({ ttlMs: 60 * MS_PER_MINUTE, cap: 3 });
  expect(errors).toEqual([]);
  expect(resolveStageLimits({ ttlMinEnv: "5", capEnv: "1" }).limits).toEqual({ ttlMs: 5 * MS_PER_MINUTE, cap: 1 });
});

test("an unparseable TTL/cap is a NAMED refusal that falls back, never a silent default", () => {
  const bad = resolveStageLimits({ ttlMinEnv: "soon", capEnv: "0" });
  expect(bad.errors).toHaveLength(2);
  expect(bad.errors[0]).toContain("ORB_STAGE_TTL_MIN");
  expect(bad.errors[1]).toContain("ORB_STAGE_CAP");
  expect(bad.limits).toEqual({ ttlMs: 60 * MS_PER_MINUTE, cap: 3 });
});

// ── the strand rule, and the fence that matters ───────────────────────────────────────────────────────

const BOUND_STAGE = { bandBound: true, bandIsStageRooted: true, bandProcessAgeSeconds: null, nowMs: NOW };

test("a row past its idle TTL is STRANDED, and a fresh one is LIVE", () => {
  expect(stageSweepVerdict({ ...BOUND_STAGE, row: row(0, { lastUsedAt: USED_LONG_AGO }), liveSessions: [] }, TTL_MS)).toBe("stranded");
  expect(stageSweepVerdict({ ...BOUND_STAGE, row: row(0, { lastUsedAt: USED_RECENTLY }), liveSessions: [] }, TTL_MS)).toBe("live");
});

test("A ROW WITH A LIVE SESSION IS NEVER A STRAND, however long it has sat idle", () => {
  // The negative control this whole rule exists for: the daemon is DRIVING that stage, so an idle-age read
  // is measuring the wrong thing. Reaping here kills a lane's browser mid-drive.
  const driven = row(0, { lastUsedAt: USED_LONG_AGO, sessions: ["p-home-perf"] });
  expect(stageSweepVerdict({ ...BOUND_STAGE, row: driven, liveSessions: ["p-home-perf"] }, TTL_MS)).toBe("live");
  // …and the moment that daemon is gone, the SAME row is reapable — or the fence would be a way to leak.
  expect(stageSweepVerdict({ ...BOUND_STAGE, row: driven, liveSessions: [] }, TTL_MS)).toBe("stranded");
});

test("T4 — a stage marked DEAD is immediately sweepable even while its session daemon is alive", () => {
  const dead = row(7, {
    sessions: ["p-home-perf"],
    dead: { detectedAt: "2026-09-02T17:59:00.000Z", op: "--goto settings" },
  });
  expect(stageSweepVerdict({ ...BOUND_STAGE, row: dead, liveSessions: ["p-home-perf"] }, TTL_MS)).toBe("stranded");
  const occupied = Array.from({ length: STAGE_BAND_COUNT }, (_unused, band) =>
    band === 7
      ? { row: dead, over: { liveSessions: ["p-home-perf"] } }
      : { row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA }), over: { liveSessions: [`p-${band}`] } },
  );
  expect(allocateStageBand({ ...ALLOC, targetSha: "e".repeat(40), limits: { ...LIMITS, cap: STAGE_BAND_COUNT }, views: views(occupied) })).toEqual({
    kind: "reap",
    band: 7,
    row: dead,
  });
});

test("a band held by something that is NOT stage-rooted is never ours to reap, whatever the row says", () => {
  const evidence = { ...BOUND_STAGE, bandIsStageRooted: false, row: row(0, { lastUsedAt: USED_LONG_AGO }), liveSessions: [] };
  expect(stageSweepVerdict(evidence, TTL_MS)).toBe("live");
});

test("a ROW-LESS bound band is judged by its PROCESS age, and an unanswerable age is left alone", () => {
  const lost = { ...BOUND_STAGE, row: null, liveSessions: [] };
  expect(stageSweepVerdict({ ...lost, bandProcessAgeSeconds: 6 * 60 * 60 }, TTL_MS)).toBe("stranded");
  expect(stageSweepVerdict({ ...lost, bandProcessAgeSeconds: 30 }, TTL_MS)).toBe("live");
  expect(stageSweepVerdict({ ...lost, bandProcessAgeSeconds: null }, TTL_MS)).toBe("live");
});

test("rowIsDangling names a row whose band is free — the corpse `--stage-sweep` reconciles", () => {
  expect(rowIsDangling(row(0), "unbound")).toBe(true);
  expect(rowIsDangling(null, "unbound")).toBe(false);
  expect(rowIsDangling(row(0), "live")).toBe(false);
});

// ── the allocator, in §3.6's order ────────────────────────────────────────────────────────────────────

test("an empty table hands out the LOWEST band — the positive control the isolation arm rests on", () => {
  expect(allocateStageBand({ ...ALLOC, views: views([]) })).toEqual({ kind: "free", band: 0 });
});

test("TWO CONCURRENT ALLOCATIONS LAND ON DIFFERENT BANDS: the second sees the first's CLAIM and moves on", () => {
  // The claim is a written row — that is the whole point of writing it inside the lock BEFORE the 55 s
  // boot. Lane A takes band 0; lane B, at another sha in another checkout, must not take band 0 too.
  const first = allocateStageBand({ ...ALLOC, views: views([]) });
  expect(first).toEqual({ kind: "free", band: 0 });
  const claimed = row(0, { checkout: LANE_CHECKOUT, sha: OTHER_SHA });
  const second = allocateStageBand({ ...ALLOC, views: views([{ row: claimed }]) });
  expect(second).toEqual({ kind: "free", band: 1 });
  // …and the two bands cannot reach each other's ports, which is what "private by construction" means.
  expect(stageBandPorts(0)).not.toEqual(stageBandPorts(1));
  expect(new Set([stageBandPorts(0).server, stageBandPorts(0).vite, stageBandPorts(1).server, stageBandPorts(1).vite]).size).toBe(4);
});

test("our OWN row for (checkout, sha) wins over every free band — a lane re-drives its stage, never a second copy", () => {
  const ours = row(4);
  expect(allocateStageBand({ ...ALLOC, views: views([{ row: ours }]) })).toEqual({ kind: "ours", band: 4, row: ours });
});

test("a sibling's HEALTHY row at our sha is a shared-reuse before any free band is taken", () => {
  const theirs = row(3, { checkout: LANE_CHECKOUT });
  expect(allocateStageBand({ ...ALLOC, views: views([{ row: theirs }]) })).toEqual({ kind: "shared-reuse", band: 3, row: theirs });
  // …but NOT when we would mutate their tree: `--dirty` rsyncs into it and `--fresh` tears it down.
  expect(allocateStageBand({ ...ALLOC, dirty: true, views: views([{ row: theirs }]) }).kind).toBe("free");
  expect(allocateStageBand({ ...ALLOC, fresh: true, views: views([{ row: theirs }]) }).kind).toBe("free");
});

test("with every band occupied, the LOWEST STRANDED row is reaped on acquire", () => {
  const occupied = Array.from({ length: STAGE_BAND_COUNT }, (_unused, band) =>
    band === 7
      ? { row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA, lastUsedAt: USED_LONG_AGO }) }
      : { row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA, lastUsedAt: USED_RECENTLY }) },
  );
  const allocation = allocateStageBand({ ...ALLOC, limits: { ttlMs: TTL_MS, cap: STAGE_BAND_COUNT }, views: views(occupied) });
  expect(allocation.kind).toBe("reap");
  expect(allocation.kind === "reap" && allocation.band).toBe(7);
});

/** THE KEEPER IS NOT A FENCE (#1163 arm b). A stage now arms its own idle timer, and the one thing that
 *  must NOT follow is a band nobody can reclaim when that timer dies — the strand rule already covers a
 *  dead OWNER pid, and this is the same property for a dead KEEPER pid: the allocator reads `lastUsedAt`
 *  and never asks whether a keeper exists, so the arm-(a) backstop is unchanged by construction. Both
 *  directions are here: a LIVE keeper does not save the row either, because reap-on-acquire fires under
 *  band pressure and the timer fires under none. */
test("a keeper pid on the row changes NOTHING about reap-on-acquire — dead or alive, an idle strand is still the candidate", () => {
  const withKeeper = (keeperPid: number): { readonly row: StageRow } => ({
    row: row(7, { checkout: LANE_CHECKOUT, sha: OTHER_SHA, lastUsedAt: USED_LONG_AGO, keeper: { pid: keeperPid, armedAt: USED_LONG_AGO } }),
  });
  // A pid nothing owns (DEAD) and pid 1 (init — always ALIVE, and never ours): the allocator must not
  // consult either, so it reaps both.
  for (const keeperPid of [2_147_483_646, 1]) {
    const occupied = Array.from({ length: STAGE_BAND_COUNT }, (_unused, band) =>
      band === 7 ? withKeeper(keeperPid) : { row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA, lastUsedAt: USED_RECENTLY }) },
    );
    const allocation = allocateStageBand({ ...ALLOC, limits: { ttlMs: TTL_MS, cap: STAGE_BAND_COUNT }, views: views(occupied) });
    expect(allocation.kind, `keeper pid ${keeperPid}`).toBe("reap");
    expect(allocation.kind === "reap" && allocation.band).toBe(7);
  }
});

test("a stranded row whose SESSION is still live is not the reap candidate — the fence holds inside the allocator too", () => {
  const occupied = Array.from({ length: STAGE_BAND_COUNT }, (_unused, band) => ({
    row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA, lastUsedAt: USED_LONG_AGO, sessions: ["p-live"] }),
    over: { liveSessions: ["p-live"] },
  }));
  const allocation = allocateStageBand({ ...ALLOC, limits: { ttlMs: TTL_MS, cap: STAGE_BAND_COUNT }, views: views(occupied) });
  expect(allocation.kind).toBe("exhausted");
});

test("EXHAUSTION IS A REFUSAL THAT NAMES EVERY ROW WITH ITS IDLE AGE, not a bare failure", () => {
  const occupied = Array.from({ length: STAGE_BAND_COUNT }, (_unused, band) => ({
    row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA, lastUsedAt: USED_RECENTLY, sessions: [`p-lane-${band}`] }),
    over: { liveSessions: [`p-lane-${band}`] },
  }));
  const allocation = allocateStageBand({ ...ALLOC, limits: { ttlMs: TTL_MS, cap: STAGE_BAND_COUNT }, views: views(occupied) });
  expect(allocation.kind).toBe("exhausted");
  const refusal = allocation.kind === "exhausted" ? allocation.refusal : "";
  expect(refusal).toContain("STAGE REFUSED");
  for (let band = 0; band < STAGE_BAND_COUNT; band += 1) {
    expect(refusal, `band ${band} must be named in the refusal`).toContain(`band ${band}`);
    expect(refusal).toContain(`p-lane-${band}`);
  }
  expect(refusal).toContain("idle 5m ago");
  expect(refusal).toContain("--stage-sweep");
});

test("the CAP refuses before the range does, and names it — but never blocks the lane that already holds a stage", () => {
  const three = [0, 1, 2].map((band) => ({ row: row(band, { checkout: LANE_CHECKOUT, sha: OTHER_SHA }) }));
  const capped = allocateStageBand({ ...ALLOC, views: views(three) });
  expect(capped.kind).toBe("exhausted");
  expect(capped.kind === "exhausted" && capped.refusal).toContain("ORB_STAGE_CAP");
  // Our own row is decided BEFORE the cap: reusing a stage we already have adds nothing to the box.
  const withOurs = [...three.slice(1), { row: row(0) }];
  expect(allocateStageBand({ ...ALLOC, views: views(withOurs) }).kind).toBe("ours");
});

// ── the three probes + the ERA rule ───────────────────────────────────────────────────────────────────

const HEALTHY = { healthzOk: true, viteOk: true, served: "fresh" as const, dirty: false, rsyncs: 0, ageMs: 0 };

test("all three probes green reads WARM — the positive control the degraded arms rest on", () => {
  expect(stageHealthVerdict(HEALTHY)).toBe("warm");
});

test("A KILLED STAGE READS DEGRADED, NEVER WARM — whichever half of it died", () => {
  expect(stageHealthVerdict({ ...HEALTHY, healthzOk: false })).toBe("degraded");
  expect(stageHealthVerdict({ ...HEALTHY, viteOk: false })).toBe("degraded");
  // The dead WATCHER: healthz green, vite bound and answering, and every load served a pre-change
  // transform for 24 minutes (#524). Two probes call this stage warm; the third is why we have three.
  expect(stageHealthVerdict({ ...HEALTHY, served: "stale" })).toBe("degraded");
  expect(stageHealthVerdict({ ...HEALTHY, served: "unreachable" })).toBe("degraded");
});

test("an UNMEASURABLE freshness is degraded for a --dirty stage and harmless for a frozen --ref one", () => {
  // A `--dirty` tree changes under a live watcher — "I could not measure" there is not "it is fine".
  expect(stageHealthVerdict({ ...HEALTHY, dirty: true, served: "unverifiable" })).toBe("degraded");
  // A `--ref` worktree is frozen: nothing can go stale, so there is nothing the probe could have caught.
  expect(stageHealthVerdict({ ...HEALTHY, dirty: false, served: "unverifiable" })).toBe("warm");
});

test("the ERA rule rebuilds a long-lived --dirty stage, and EXEMPTS a --ref stage that never HMRs", () => {
  const dirty = { ...HEALTHY, dirty: true, served: "fresh" as const };
  expect(stageHealthVerdict({ ...dirty, rsyncs: STAGE_ERA_MAX_RSYNCS })).toBe("warm");
  expect(stageHealthVerdict({ ...dirty, rsyncs: STAGE_ERA_MAX_RSYNCS + 1 })).toBe("rebuild");
  expect(stageHealthVerdict({ ...dirty, ageMs: 7 * 60 * MS_PER_MINUTE })).toBe("rebuild");
  // Same age, same rsync count, a REF stage: exempt (§3.6) — its watchers never fire.
  expect(stageHealthVerdict({ ...HEALTHY, rsyncs: 999, ageMs: 7 * 60 * MS_PER_MINUTE })).toBe("warm");
});

test("the dirty stage's key is never a real sha, so its row can never collide with a ref stage's", () => {
  expect(DIRTY_STAGE_KEY).not.toMatch(/^[0-9a-f]{40}$/u);
  expect(row(0, { sha: DIRTY_STAGE_KEY }).sha).toBe("dirty");
});
