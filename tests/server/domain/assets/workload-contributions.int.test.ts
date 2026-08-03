// Contribution test: assets' three CAS maintenance kinds. The load-bearing one is `assets-backfill` — its
// GATHER (a `db.select` over `characters` + a per-row CAS probe) used to run at the ENTRY tier because the
// retired hub demanded a count-only op shape. It lives in the domain now, so this is an .int over a real db
// + a real temp CAS: it pins the scope resolution (SINGULAR vs BULK), the CAS-presence filter, the per-owner
// fan-out, and the summed projection. `assets-gc`/`assets-fsck` pin their projections + the dryRun echo.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterHandle, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe, onTestFinished, vi } from "vitest";
import type { AssetsWorkloadDeps } from "../../../../packages/server/src/domain/assets/contract/service.ts";
import { createAssetsWorkloadContributions } from "../../../../packages/server/src/domain/assets/workload-contributions.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { makeHarness, seedCharacter, seedUser } from "./_support.ts";

const T0 = 1_700_000_000_000;
const sig = (): AbortSignal => new AbortController().signal;

let db: Db;
let ownerId: UserId;
let otherOwnerId: UserId;
let cas: AssetsWorkloadDeps["cas"];

function ctxFor(owner: UserId | null): WorkloadRunContext {
  return { userId: ownerId, ownerId: owner, now: () => T0 };
}

/** The three contributions over the real db/CAS plus a recording `assets` slice. */
function build(): {
  readonly assets: AssetsWorkloadDeps["assets"];
  readonly contributions: ReturnType<typeof createAssetsWorkloadContributions>;
} {
  // A recording slice of the three verbs the contributions call — the projections are what is under test,
  // FABRICATION-OK: a full AssetsService factory would state far more than these three bodies touch.
  const assets: AssetsWorkloadDeps["assets"] = {
    backfillAvatars: vi.fn(async ({ cards }) => ({ scanned: cards.length, linked: cards.length })),
    collectGarbage: vi.fn(async () => ({ scanned: 10, reclaimed: 4 })),
    fsck: vi.fn(async () => ({ danglingRows: 1, corruptBlobs: 0, orphanBlobs: 2 })),
  } as unknown as AssetsWorkloadDeps["assets"];
  return { assets, contributions: createAssetsWorkloadContributions({ db, cas, assets }) };
}

/** A character with a recorded import hash whose card blob IS in the CAS (a real backfill candidate). */
async function seedStagedCard(owner: UserId, id: string): Promise<void> {
  const characterId = await seedCharacter(db, owner, { id, handle: castId<CharacterHandle>(id) });
  const { hash } = await cas.putBytes(owner, new Uint8Array([1, 2, 3, id.length]), T0);
  await db.update(characters).set({ importHash: hash }).where(eq(characters.id, characterId));
}

beforeEach(async () => {
  db = await freshDb();
  const harness = await makeHarness(db);
  onTestFinished(harness.cleanup);
  cas = harness.ctx.cas;
  ownerId = await seedUser(db, { id: "user_owner", handle: castId<Handle>("owner") });
  otherOwnerId = await seedUser(db, { id: "user_other", handle: castId<Handle>("other") });
});

describe("assets-backfill", () => {
  test("a SINGULAR run gathers only THAT owner's staged cards", async () => {
    await seedStagedCard(ownerId, "character_mine");
    await seedStagedCard(otherOwnerId, "character_theirs");

    const { assets, contributions } = build();
    const result = await contributions[0].run(ctxFor(ownerId), {}, vi.fn(), sig());

    expect(assets.backfillAvatars).toHaveBeenCalledTimes(1);
    expect(vi.mocked(assets.backfillAvatars).mock.calls[0]?.[0]?.ownerId).toBe(ownerId);
    expect(result).toEqual({ scanned: 1, changed: 1, dryRun: false });
  });

  test("a BULK run (ownerId null) fans out PER OWNER and SUMS the counts", async () => {
    await seedStagedCard(ownerId, "character_mine");
    await seedStagedCard(otherOwnerId, "character_theirs");

    const { assets, contributions } = build();
    const result = await contributions[0].run(ctxFor(null), {}, vi.fn(), sig());

    expect(assets.backfillAvatars).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scanned: 2, changed: 2, dryRun: false });
  });

  test("a character whose card blob is NOT in the CAS is skipped (no phantom candidate)", async () => {
    const characterId = await seedCharacter(db, ownerId, { id: "character_ghost", handle: castId<CharacterHandle>("ghost") });
    await db.update(characters).set({ importHash: "deadbeef-not-in-cas" }).where(eq(characters.id, characterId));

    const { assets, contributions } = build();
    const result = await contributions[0].run(ctxFor(ownerId), {}, vi.fn(), sig());

    expect(assets.backfillAvatars).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, changed: 0, dryRun: false });
  });

  test("dryRun is threaded to the verb AND echoed in the result", async () => {
    await seedStagedCard(ownerId, "character_mine");
    const { assets, contributions } = build();
    const result = await contributions[0].run(ctxFor(ownerId), { dryRun: true }, vi.fn(), sig());
    expect(vi.mocked(assets.backfillAvatars).mock.calls[0]?.[0]?.dryRun).toBe(true);
    expect(result.dryRun).toBe(true);
  });
});

describe("assets-gc", () => {
  test("projects scanned/reclaimed into the maintenance counts + the dryRun echo", async () => {
    const { assets, contributions } = build();
    const result = await contributions[1].run(ctxFor(null), { dryRun: true }, vi.fn(), sig());
    expect(assets.collectGarbage).toHaveBeenCalledWith({ dryRun: true, signal: expect.any(AbortSignal) });
    expect(result).toEqual({ scanned: 10, changed: 4, dryRun: true });
  });
});

describe("assets-fsck", () => {
  test("returns the three fault counts and mutates nothing", async () => {
    const { assets, contributions } = build();
    const result = await contributions[2].run(ctxFor(null), {}, vi.fn(), sig());
    expect(assets.fsck).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ danglingRows: 1, corruptBlobs: 0, orphanBlobs: 2 });
  });
});

describe("the contribution set", () => {
  test("contributes exactly assets' three maintenance kinds, all sweep-lane + idempotent-restart", () => {
    const { contributions } = build();
    expect(contributions.map((contribution) => contribution.kind)).toEqual(["assets-backfill", "assets-gc", "assets-fsck"]);
    for (const contribution of contributions) {
      expect(contribution.lane).toBe("sweep");
      expect(contribution.resume).toBe("idempotent-restart");
    }
  });
});
