// `createCopyPresetToUser` — the preset-owned GM-voice copy the host-handoff property offer executes.
// The op is the only way an OWNED preset crosses owners, so its gates are the whole test: the source read is
// owner-scoped, the copy lands under the recipient, and a retried accept converges via the `forkedFrom` lineage instead of minting a library.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createCopyPresetToUser, SYSTEM_DEFAULT_PRESET_ID } from "../../../../../packages/server/src/domain/preset/index.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
/** The write the concurrency pins park: the copy's own INSERT (guarded admission since #1572). */
const PRESET_INSERT = /insert into "presets"/iu;

async function seedPreset(db: Db, id: string, ownerId: UserId | null, name = id): Promise<PresetId> {
  const presetId = castId<PresetId>(id);
  await db.insert(presets).values({ id: presetId, ownerId, name, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: AT, updatedAt: AT });
  return presetId;
}

/** A copy op with a deterministic minter, so a test can name the copy it expects. */
function copier(db: Db): ReturnType<typeof createCopyPresetToUser> {
  let n = 0;
  return createCopyPresetToUser({
    db,
    now: () => AT,
    newPresetId: (): PresetId => {
      n += 1;
      return castId<PresetId>(`preset_copy_${n}`);
    },
  });
}

test("copies a preset the DEPARTING host owns into the recipient's library, verbatim, lineage-stamped", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedPreset(db, "preset_gm", oldHost.id, "Grim GM");

  const copyId = await copier(db)({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source });

  expect(copyId).toBe("preset_copy_1");
  const [copy] = await db
    .select()
    .from(presets)
    .where(eq(presets.id, castId<PresetId>("preset_copy_1")));
  expect(copy?.ownerId).toBe(nominee.id);
  expect(copy?.name).toBe("Grim GM");
  // The lineage names the row that was actually GIVEN — which is also the retry key below.
  expect(copy?.forkedFrom).toBe(source);
  // The source is untouched: a gift is a copy, never a transfer of the original.
  expect((await db.select().from(presets).where(eq(presets.id, source)))[0]?.ownerId).toBe(oldHost.id);
});

test("a preset the claimed source owner does NOT own yields null (the ownership axis is in the WHERE)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const stranger = await seedUser(db, { handle: castId("stranger") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  // A preset that belongs to neither party in the handoff — naming its id must not gift it.
  const foreign = await seedPreset(db, "preset_foreign", stranger.id);

  expect(await copier(db)({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: foreign })).toBeNull();
  expect(await db.select().from(presets).where(eq(presets.ownerId, nominee.id))).toEqual([]);
});

test("the SHARED system default is not copied — the recipient already reads it", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  await seedPreset(db, SYSTEM_DEFAULT_PRESET_ID, null, "System default");

  expect(await copier(db)({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: SYSTEM_DEFAULT_PRESET_ID })).toBeNull();
  expect(await db.select().from(presets).where(eq(presets.ownerId, nominee.id))).toEqual([]);
});

test("a RETRIED accept converges on the existing copy (the crash arm mints no second library)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedPreset(db, "preset_gm", oldHost.id);
  const copy = copier(db);

  const first = await copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source });
  const second = await copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source });

  expect(second).toBe(first);
  expect(await db.select().from(presets).where(eq(presets.ownerId, nominee.id))).toHaveLength(1);
});

// #1572 — the accept used to be `findOwnedForkOf` THEN `insertPreset`: a find-before-mint whose window two
// concurrent accepts of one offer both pass, minting the recipient two copies of one gift. The uniqueness
// claim now rides the write itself (`insertConvergedPresetForkIfAbsent`), so the loser writes nothing and
// converges on the winner. The `(owner_id, forked_from)` pair stays NON-unique in the schema on purpose —
// the update verb's `{mode:"new"}` mints legal siblings of one source — which is
// why the admission is verb-scoped rather than a constraint.

test("two CONCURRENT accepts of one gift converge on ONE copy (the claim rides the write, not a prior read)", async () => {
  const { db, hold } = await freshHeldDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedPreset(db, "preset_gm", oldHost.id, "Grim GM");
  const copy = copier(db);
  // Both accepts park at their INSERT, so each has finished every read it makes before either row lands.
  const inserts = hold(PRESET_INSERT, 2);

  const accepts = [
    copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source }),
    copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source }),
  ] as const;
  await inserts.reached;
  inserts.release();
  const [first, second] = await Promise.all(accepts);

  // The loser CLAIMS the winner rather than failing: an accept never surfaces a race to the recipient.
  expect(second).toBe(first);
  const owned = await db.select().from(presets).where(eq(presets.ownerId, nominee.id));
  expect(owned.map((row) => row.id)).toEqual([first]);
});

test("an accept retried AFTER a lost race still returns the winning copy (no second library, no throw)", async () => {
  const { db, hold } = await freshHeldDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedPreset(db, "preset_gm", oldHost.id);
  const copy = copier(db);
  const inserts = hold(PRESET_INSERT, 2);

  const raced = [
    copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source }),
    copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source }),
  ] as const;
  await inserts.reached;
  inserts.release();
  const [winner] = await Promise.all(raced);

  expect(await copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source })).toBe(winner);
  expect(await db.select().from(presets).where(eq(presets.ownerId, nominee.id))).toHaveLength(1);
});

test("a retry after the SOURCE was deleted yields null and mints nothing (the lineage was SET NULL with it)", async () => {
  // The convergence read moved AFTER the write in #1572, so this is the one arm the reorder could have
  // changed — and it cannot: `forked_from` is SET NULL on the source's delete, so the copy stops being a
  // fork OF it either way, and the owner-scoped source read is what refuses. The caller heals conditionally.
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedPreset(db, "preset_gm", oldHost.id);
  const copy = copier(db);
  const first = await copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source });
  await db.delete(presets).where(eq(presets.id, source));

  expect(await copy({ fromOwnerId: oldHost.id, toUserId: nominee.id, presetId: source })).toBeNull();
  const owned = await db.select().from(presets).where(eq(presets.ownerId, nominee.id));
  expect(owned.map((row) => [row.id, row.forkedFrom])).toEqual([[first, null]]);
});
