// `createCopyPresetToUser` — the preset-owned GM-voice copy the host-handoff property offer executes.
// The op is the only way an arbitrary OWNED preset crosses owners (`clonePackaged` clones shipped templates
// by well-known key), so its gates are the whole test: the source read is owner-scoped, the copy lands under
// the recipient, and a retried accept converges via the `forkedFrom` lineage instead of minting a library.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createCopyPresetToUser, SYSTEM_DEFAULT_PRESET_ID } from "../../../../../packages/server/src/domain/preset";
import { freshDb } from "../../../../support/db";
import { seedUser } from "../../../../support/factories/user";
import { expect, test } from "../../../../support/fixtures";

const AT = 1_700_000_000_000;

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
