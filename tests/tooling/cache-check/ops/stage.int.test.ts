// cache:check seeds probe credentials and connections into the stage it is handed, so that stage must be its own.
import { CREDENTIALS_KEY_ENV } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/tooling";
import { parseCacheCheckArgs } from "@orb/tooling/cache-check";
import { bootStage } from "../../../../tooling/src/cache-check/ops/stage.ts";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import type { EnsureStageOps, StageAllocation, StageBandView, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { allocateStageBand } from "../../../../tooling/src/snap/lib/stage-bands.ts";
import { StageBusyError } from "../../../../tooling/src/snap/lib/stage-wait-plan.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { ensureStage } from "../../../../tooling/src/snap/ops/stage.ts";
import { stageAskFromArgs } from "../../../../tooling/src/snap/ops/stage-wait.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const CHECKOUT = "/stgkey/orbweaver";
const SIBLING = "/stgkey/orbweaver/.claude/worktrees/sibling";
const NOW = Date.parse("2026-11-20T18:00:00.000Z");
const USED_RECENTLY = new Date(NOW - 5 * 60_000).toISOString();
const LIMITS = { ttlMs: 60 * 60_000, cap: 3 };

const theirs: StageRow = {
  band: 0,
  sha: SHA,
  dir: `${SIBLING}/.cache/snap-stage/0123456789ab`,
  serverPort: stageBandPorts(0).server,
  vitePort: stageBandPorts(0).vite,
  checkout: SIBLING,
  ownerPid: 4242,
  startedAt: USED_RECENTLY,
  lastUsedAt: USED_RECENTLY,
  sessions: [],
  dbProvenance: null,
  rsyncs: 0,
};
// The sibling's healthy stage at the commit on band 0, and band 1 free.
const census: readonly StageBandView[] = [
  { band: 0, row: theirs, bandBound: true, bandIsStageRooted: true, healthy: true, liveSessions: [], liveHolders: [] },
  { band: 1, row: null, bandBound: false, bandIsStageRooted: false, healthy: false, liveSessions: [], liveHolders: [] },
];

test("cache:check never seeds a sibling's warm stage at its commit: it gets its own band", async () => {
  const verdicts: StageAllocation[] = [];
  const ops: EnsureStageOps = {
    repoRoot: (): string => CHECKOUT,
    resolveRef: (): string => SHA,
    markerRoot: (): string => CHECKOUT,
    // The census is planted and the allocator is the real one, judging the ask ensureStage built. It then refuses as
    // a full table does, so the verdict is read before anything boots or writes the table.
    acquireStageBand: (input) => {
      verdicts.push(allocateStageBand({ ...input, nowMs: NOW, views: census, limits: LIMITS }));
      throw new StageBusyError("planted census: the verdict is the observable");
    },
    armStageKeeper: (_home, armed) => armed,
  };
  // The positive control: a plain snap run on the same table shares the sibling's stage.
  expect(() => ensureStage(stageAskFromArgs(parseSnapArgs(["/", "--isolated"])), ops)).toThrow(StageBusyError);
  await expect(bootStage(parseCacheCheckArgs([]), { [CREDENTIALS_KEY_ENV]: "stgkey-credentials-key" }, ops)).rejects.toThrow(StageBusyError);
  expect(verdicts).toEqual([
    { kind: "shared-reuse", band: 0, row: theirs },
    { kind: "free", band: 1 },
  ]);
});
