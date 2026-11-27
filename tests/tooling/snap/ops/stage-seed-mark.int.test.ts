// @subject tooling/src/snap/ops/stage-census.ts
// A seeding run's mark on its own warm stage is written by the acquire, inside the allocation lock, so the table never
// shows an unmarked stage a sibling could be handed between the verdict and the mark.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { onTestFinished } from "vitest";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import type { StageBandAcquireInput, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { acquireStageBand } from "../../../../tooling/src/snap/ops/stage-census.ts";
import { readBands, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OWNER = "/stage-seed-mark/repo";
const NOW_ISO = new Date(FROZEN_AT_MS).toISOString();

function scratchHome(): string {
  const home = mkdtempSync(join(tmpdir(), "stage-seed-mark-"));
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  return home;
}

function ownRow(): StageRow {
  const ports = stageBandPorts(3);
  return {
    band: 3,
    sha: SHA,
    dir: `${OWNER}/.cache/snap-stage/0123456789ab`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: OWNER,
    ownerPid: null,
    startedAt: NOW_ISO,
    lastUsedAt: NOW_ISO,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    holders: [],
  };
}

function acquire(home: string, seedsConnection: boolean): ReturnType<typeof acquireStageBand> {
  const input: StageBandAcquireInput = {
    home,
    root: home,
    checkout: OWNER,
    targetSha: SHA,
    dirty: false,
    fresh: false,
    seedsConnection,
    nowMs: FROZEN_AT_MS,
    auth: "single-user",
    claim: () => {
      throw new Error("a warm stage of our own is reused, never claimed");
    },
  };
  return acquireStageBand(input);
}

test("acquiring our own warm stage for a seeding run marks the row in the same lock; one that seeds nothing leaves it unmarked", () => {
  const control = scratchHome();
  writeRow(control, ownRow());
  expect(acquire(control, false).allocation).toMatchObject({ kind: "ours", band: 3 });
  expect(readBands(control)[0]?.connectionSeeded).toBeUndefined();

  const home = scratchHome();
  writeRow(home, ownRow());
  const { allocation } = acquire(home, true);
  expect(allocation).toMatchObject({ kind: "ours", band: 3, row: { connectionSeeded: true } });
  expect(readBands(home)[0]?.connectionSeeded).toBe(true);
});
