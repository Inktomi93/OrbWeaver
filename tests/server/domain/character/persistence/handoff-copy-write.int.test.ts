// `createCopyHandoffCards` — the character-owned card copy the host-handoff property offer executes. The op
// crosses OWNERS by construction (a gift the departing host offered and the nominee accepted), so its two
// gates are the whole test: the source read carries `fromOwnerId` in its WHERE, and the provenance stamp is
// the find-before-mint key that makes a retried accept converge instead of minting a second library.

import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { CopyAvatarToOwner } from "../../../../../packages/server/src/domain/character";
import { createCopyHandoffCards, handoffProvenance } from "../../../../../packages/server/src/domain/character";
import { freshDb } from "../../../../support/db";
import { seedUser } from "../../../../support/factories/user";
import { expect, test } from "../../../../support/fixtures";

const AT = 1_700_000_000_000;
const CHAT = castId<ChatId>("chat_transfer");

async function seedCard(
  db: Db,
  ownerId: UserId,
  key: string,
  over: { readonly avatarAssetId?: AssetId; readonly trustHtml?: boolean; readonly handle?: string } = {},
): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({
    id,
    ownerId,
    handle: over.handle ?? key,
    name: key,
    description: `${key} body`,
    contentHash: key,
    tokenSize: 0,
    trustHtml: over.trustHtml ?? false,
    avatarAssetId: over.avatarAssetId ?? null,
    createdAt: AT,
  });
  return id;
}

/** A CAS asset row the `avatar_asset_id` FK can point at. */
async function seedAsset(db: Db, ownerId: UserId, key: string): Promise<AssetId> {
  const id = castId<AssetId>(`asset_${key}`);
  await db.insert(assets).values({ id, ownerId, hash: key, kind: "avatar", mime: "image/png", size: 1, uploadedAt: AT });
  return id;
}

/** The op with a deterministic minter + a recording avatar re-own. */
function copier(db: Db, copyAvatar: CopyAvatarToOwner = () => Promise.resolve(null)): ReturnType<typeof createCopyHandoffCards> {
  let n = 0;
  return createCopyHandoffCards({
    db,
    now: () => AT,
    newCharacterId: (): CharacterId => {
      n += 1;
      return castId<CharacterId>(`character_copy_${n}`);
    },
    copyAvatar,
  });
}

test("copies the departing host's card under the recipient, provenance-stamped, policies carried", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria", { trustHtml: true });

  const result = await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  expect(result).toEqual([{ sourceCharacterId: source, characterId: castId<CharacterId>("character_copy_1"), minted: true }]);
  const [copy] = await db.select().from(characters).where(eq(characters.ownerId, nominee.id));
  expect(copy?.name).toBe("aria");
  expect(copy?.description).toBe("aria body");
  // The render/theme POLICY is a property of the card, not of its owner — a card the old host marked
  // `trustHtml` must not silently change posture because it changed hands.
  expect(copy?.trustHtml).toBe(true);
  // The provenance stamp IS the idempotency key (and is why `duplicate`'s provenance-CLEARING is wrong here).
  expect(copy?.importedFrom).toBe(handoffProvenance(CHAT, source));
  expect(copy?.importHash).toBeNull();
  // The original is untouched.
  expect((await db.select().from(characters).where(eq(characters.id, source)))[0]?.ownerId).toBe(oldHost.id);
});

test("a card the claimed source owner does NOT own is silently absent (naming an id is not a license)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const stranger = await seedUser(db, { handle: castId("stranger") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const mine = await seedCard(db, oldHost.id, "aria");
  const foreign = await seedCard(db, stranger.id, "foreign");

  const result = await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [mine, foreign] });

  // Only the departing host's own card came back — the caller's seat for the other falls to the D64 drop.
  expect(result.map((r) => r.sourceCharacterId)).toEqual([mine]);
  expect(await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).toHaveLength(1);
});

test("a RETRIED accept finds the existing copy by provenance — zero duplicates, `minted:false`", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = copier(db);

  const first = await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });
  const second = await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  expect(second).toEqual([{ sourceCharacterId: source, characterId: first[0]?.characterId, minted: false }]);
  expect(await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).toHaveLength(1);
});

test("the provenance key is CHAT-scoped — the same card gifted through two rooms yields two copies", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = copier(db);

  await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });
  await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: castId<ChatId>("chat_other"), characterIds: [source] });

  // Two independent gifts of the same card are two independent copies — the alternative would silently make
  // one room's later edits show up in the other's cast.
  expect(await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).toHaveLength(2);
});

test("a handle already taken in the recipient's library is uniquified, never a constraint throw", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  // The recipient already has an UNRELATED card sitting on that handle.
  await seedCard(db, nominee.id, "nominee_own", { handle: "aria" });

  await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  const handles = (await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).map((c) => c.handle).sort();
  expect(handles).toEqual(["aria", "aria-2"]);
});

test("the avatar is RE-OWNED through the injected op, never carried by id", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const hostAvatar = await seedAsset(db, oldHost.id, "host_avatar");
  const reowned = await seedAsset(db, nominee.id, "nominee_avatar");
  const source = await seedCard(db, oldHost.id, "aria", { avatarAssetId: hostAvatar });
  const asked: { fromOwnerId: string; toOwnerId: string; assetId: AssetId }[] = [];

  await copier(db, (args) => {
    asked.push(args);
    return Promise.resolve(reowned);
  })({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  // BOTH owners arrive explicitly (the injected-op caller gate), and the copy points at the RECIPIENT's asset
  // — carrying the source id would be a pointer into a library they cannot read plus a GC root on the
  // departed host's blob (`assets` is per-owner with a `(owner_id, hash)` dedup, D21).
  expect(asked).toEqual([{ fromOwnerId: oldHost.id, toOwnerId: nominee.id, assetId: hostAvatar }]);
  expect((await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0]?.avatarAssetId).toBe(reowned);
});

test("an avatar that cannot be re-owned lands the copy FACELESS rather than borrowing the source's asset", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria", { avatarAssetId: await seedAsset(db, oldHost.id, "gone") });

  await copier(db, () => Promise.resolve(null))({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  expect((await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0]?.avatarAssetId).toBeNull();
});
