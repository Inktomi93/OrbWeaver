// The claim row the allocator writes before a boot: it must be held by the claiming process, or a full table
// reads it as dangling residue and reaps it while its stack is still coming up.
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { STAGE_BAND_COUNT, stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import type { StageBandView, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { allocateStageBand, liveHoldersOf } from "../../../../tooling/src/snap/lib/stage-bands.ts";
import { claimRow } from "../../../../tooling/src/snap/ops/stage-census.ts";
import { holderProcessRunning } from "../../../../tooling/src/snap/ops/stage-probe.ts";

const CHECKOUT = "/home/dev/orbweaver";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "f".repeat(40);
const MS_PER_MINUTE = 60_000;
const LIMITS = { ttlMs: 60 * MS_PER_MINUTE, cap: 99 };

function siblingRow(band: number, nowMs: number): StageRow {
  const ports = stageBandPorts(band);
  const at = new Date(nowMs - MS_PER_MINUTE).toISOString();
  return {
    band,
    sha: OTHER_SHA,
    dir: `/lane-${band}/.cache/snap-stage/ffffffffffff`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: `/lane-${band}`,
    ownerPid: 1,
    startedAt: at,
    lastUsedAt: at,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
  };
}

/** Band 0 holds `claim` with its port pair still unbound (the stack has not come up); every other band is a
 *  live sibling stage, so the only reap candidate left is the claim. */
function fullTable(claim: StageRow, nowMs: number): readonly StageBandView[] {
  return Array.from({ length: STAGE_BAND_COUNT }, (_unused, band): StageBandView => {
    if (band === 0) {
      return {
        band,
        row: claim,
        bandBound: false,
        bandIsStageRooted: false,
        healthy: false,
        liveSessions: [],
        liveHolders: liveHoldersOf(claim, nowMs, holderProcessRunning),
      };
    }
    return { band, row: siblingRow(band, nowMs), bandBound: true, bandIsStageRooted: true, healthy: false, liveSessions: [], liveHolders: [] };
  });
}

function allocateAgainst(claim: StageRow, nowMs: number): ReturnType<typeof allocateStageBand> {
  return allocateStageBand({ views: fullTable(claim, nowMs), checkout: "/other-owner", targetSha: SHA, dirty: false, fresh: false, limits: LIMITS, nowMs });
}

test("a claim still booting is held by the claiming process, so a full table does not reap it", () => {
  const nowMs = Date.now();
  const claim = claimRow({
    band: 0,
    checkout: CHECKOUT,
    owner: CHECKOUT,
    targetSha: SHA,
    dir: `${CHECKOUT}/.cache/snap-stage/0123456789ab`,
    nowIso: new Date(nowMs).toISOString(),
  });
  expect(claim.holders).toEqual([expect.objectContaining({ pid: process.pid, checkout: CHECKOUT })]);
  expect(allocateAgainst(claim, nowMs).kind).toBe("exhausted");
  // Positive control: the same claim with no holder is the dangling residue the reap exists for.
  expect(allocateAgainst({ ...claim, holders: [] }, nowMs)).toEqual(expect.objectContaining({ kind: "reap", band: 0 }));
});
