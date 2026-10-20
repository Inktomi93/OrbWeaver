// Contribution test: assets' three CAS maintenance kinds. The load-bearing one is `assets-backfill` — its
// GATHER (a `db.select` over `characters` + a per-row CAS probe) used to run at the ENTRY tier because the
// retired hub demanded a count-only op shape. It lives in the domain now, so this is an .int over a real db
// + a real temp CAS: it pins the scope resolution (SINGULAR vs BULK), the CAS-presence filter, the per-owner
// fan-out, and the summed projection. `assets-gc`/`assets-fsck` pin their projections + the dryRun echo.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { CharacterHandle, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, onTestFinished, vi } from "vitest";
import type { AssetsWorkloadDeps } from "#server/domain/assets/contract/service.ts";
import { createAssetsWorkloadContributions } from "#server/domain/assets/workload-contributions.ts";
import { everyOwnerAuthority } from "../workloads/_support.ts";
import { makeHarness, seedCharacter, seedUser } from "./_support.ts";

// Every-owner authority as the workload runner and the estimate door hand it out.
const EVERY_OWNER = await everyOwnerAuthority();

const T0 = 1_700_000_000_000;
const sig = (): AbortSignal => new AbortController().signal;

let db: Db;
let ownerId: UserId;
let otherOwnerId: UserId;
let cas: AssetsWorkloadDeps["cas"];
let harness: Awaited<ReturnType<typeof makeHarness>>;

function ctxFor(owner: UserId | null): WorkloadRunContext {
  return owner === null
    ? { ...EVERY_OWNER.run, userId: ownerId, funderUserId: ownerId, now: () => T0 }
    : { userId: ownerId, ownerId: owner, funderUserId: ownerId, now: () => T0 };
}

/** The three contributions over the real db/CAS plus a recording `assets` slice. */
function build(): {
  readonly assets: AssetsWorkloadDeps["assets"];
  readonly contributions: ReturnType<typeof createAssetsWorkloadContributions>;
} {
  // A recording slice of the three verbs the contributions call — the projections are what is under test,
  const assets: AssetsWorkloadDeps["assets"] = {
    backfillAvatars: vi.fn(async ({ cards }) => ({ scanned: cards.length, linked: cards.length })),
    collectGarbage: vi.fn(async () => ({ scanned: 10, reclaimed: 4 })),
    fsck: vi.fn(async () => ({ danglingRows: 1, corruptBlobs: 0, orphanBlobs: 2 })),
  } as unknown as AssetsWorkloadDeps["assets"];
  return { assets, contributions: createAssetsWorkloadContributions({ db: databaseHandle(db), cas, assets }) };
}

/** A character with a recorded import hash whose card blob IS in the CAS (a real backfill candidate). */
async function seedStagedCard(owner: UserId, id: string): Promise<void> {
  const characterId = await seedCharacter(db, owner, { id, handle: castId<CharacterHandle>(id) });
  const { hash } = await cas.putBytes(owner, new Uint8Array([1, 2, 3, id.length]), T0);
  await db.update(characters).set({ importHash: hash }).where(eq(characters.id, characterId));
}

beforeEach(async () => {
  db = await freshDb();
  harness = await makeHarness(db);
  onTestFinished(harness.cleanup);
  cas = harness.ctx.cas;
  ownerId = await seedUser(db, { id: "user_owner", handle: castId<Handle>("owner") });
  otherOwnerId = await seedUser(db, { id: "user_other", handle: castId<Handle>("other") });
});

describe("assets-backfill", () => {
  test("abort after a real CAS read gathers no next card and writes no links", async () => {
    await seedStagedCard(ownerId, "character_mine");
    await seedStagedCard(otherOwnerId, "character_theirs");
    const controller = new AbortController();
    const readReal = cas.read.bind(cas);
    const read = vi.spyOn(cas, "read").mockImplementationOnce(async (...args) => {
      const bytes = await readReal(...args);
      controller.abort();
      return bytes;
    });
    const contributions = createAssetsWorkloadContributions({ db: databaseHandle(db), cas, assets: createAssetsService(harness.ctx) });
    expect(await contributions[0].run(ctxFor(null), {}, vi.fn(), controller.signal)).toEqual({ scanned: 0, changed: 0, dryRun: false });
    expect(read).toHaveBeenCalledTimes(1);
    expect((await db.select().from(characters)).every((row) => row.avatarAssetId === null)).toBe(true);
  });

  test("abort after an owner's real links prevents the next owner and retry gathers only the remainder", async () => {
    await seedStagedCard(ownerId, "character_mine");
    await seedStagedCard(otherOwnerId, "character_theirs");
    const controller = new AbortController();
    const linkReal = harness.ctx.linkCharacterAvatars;
    const link = vi.fn(async (args: Parameters<typeof linkReal>[0]) => {
      await linkReal(args);
      controller.abort();
    });
    const assets = createAssetsService({ ...harness.ctx, linkCharacterAvatars: link });
    const contributions = createAssetsWorkloadContributions({ db: databaseHandle(db), cas, assets });
    expect(await contributions[0].run(ctxFor(null), {}, vi.fn(), controller.signal)).toEqual({ scanned: 1, changed: 1, dryRun: false });
    expect(link).toHaveBeenCalledTimes(1);
    expect((await db.select().from(characters)).filter((row) => row.avatarAssetId !== null)).toHaveLength(1);
    expect(await contributions[0].run(ctxFor(null), {}, vi.fn(), sig())).toEqual({ scanned: 1, changed: 1, dryRun: false });
    expect((await db.select().from(characters)).every((row) => row.avatarAssetId !== null)).toBe(true);
  });

  test("pre-abort starts no candidate or CAS work", async () => {
    await seedStagedCard(ownerId, "character_mine");
    const { assets, contributions } = build();
    const select = vi.spyOn(db, "select");
    const exists = vi.spyOn(cas, "exists");
    const read = vi.spyOn(cas, "read");
    const controller = new AbortController();
    controller.abort();
    expect(await contributions[0].run(ctxFor(ownerId), {}, vi.fn(), controller.signal)).toEqual({ scanned: 0, changed: 0, dryRun: false });
    expect(select).not.toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(assets.backfillAvatars).not.toHaveBeenCalled();
  });

  test("abort during a CAS presence probe starts no byte read or owner work", async () => {
    await seedStagedCard(ownerId, "character_mine");
    await seedStagedCard(otherOwnerId, "character_theirs");
    const controller = new AbortController();
    const existsReal = cas.exists.bind(cas);
    const exists = vi.spyOn(cas, "exists").mockImplementationOnce(async (...args) => {
      const found = await existsReal(...args);
      controller.abort();
      return found;
    });
    const read = vi.spyOn(cas, "read");
    const { assets, contributions } = build();
    expect(await contributions[0].run(ctxFor(null), {}, vi.fn(), controller.signal)).toEqual({ scanned: 0, changed: 0, dryRun: false });
    expect(exists).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(assets.backfillAvatars).not.toHaveBeenCalled();
  });

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
    // A WELL-FORMED hash that simply is not on disk — the state a real row holds. The old fixture used a
    // malformed string, which since `8e2fcf462b` throws out of `cas.exists` rather than answering false:
    // that fail-loud behaviour is correct for corrupt data and is pinned by its own test below, but it is
    // NOT what this test is about.
    const absent = "f".repeat(64);
    await db.update(characters).set({ importHash: absent }).where(eq(characters.id, characterId));

    const { assets, contributions } = build();
    const result = await contributions[0].run(ctxFor(ownerId), {}, vi.fn(), sig());

    expect(assets.backfillAvatars).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, changed: 0, dryRun: false });
  });

  test("a MALFORMED card hash fails loud — a corrupt row is never silently skipped as absent", async () => {
    // The other half of the contract `8e2fcf462b` minted: "not in the CAS" answers false, but a value that
    // is not a content hash at all is corruption, and treating it as a clean miss would let a backfill
    // report `scanned: 0` over rows it never understood. Loud beats a phantom clean.
    const characterId = await seedCharacter(db, ownerId, { id: "character_corrupt", handle: castId<CharacterHandle>("corrupt") });
    await db.update(characters).set({ importHash: "deadbeef-not-a-hash" }).where(eq(characters.id, characterId));

    const { contributions } = build();
    await expect(contributions[0].run(ctxFor(ownerId), {}, vi.fn(), sig())).rejects.toThrow(/not a valid content hash/u);
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
