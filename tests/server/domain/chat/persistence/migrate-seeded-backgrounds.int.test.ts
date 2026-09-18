// persistence/migrate-seeded-backgrounds — the `kind:"seeded"` retirement's ROOM half (owner ask
// 2026-09-18). The `domain/settings` and `domain/character` siblings, over `chats.metadata.background`.
//
// The same row classes, plus the one claim this half owes ALONE: scope is the HOST participant. D18 says
// there is NO `chats.ownerId` — a room's authority is its host — and the plate asset the rewrite points at
// has to be an asset SOMEBODY owns. So the sweep is "the rooms THIS user hosts", and a room hosted by
// someone else is their own pass to make. Getting that wrong would mint a cross-user CAS reference nobody
// asked for, which is exactly what `selectCarriedBackgroundReferencedAssetIds` would then GC-root forever.

import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { migrateSeededRoomBackgrounds } from "../../../../../packages/server/src/domain/chat/persistence/migrate-seeded-backgrounds.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant, seedUser } from "../_support.ts";

const AT = 1_750_000_000_000;
const SHIPPED_SLUG = "morgatha-bg";
const DELETED_SLUG = "granite-valley";
const PLATE: ThemeBackground = canonicalBackgroundSource({
  kind: "asset",
  assetId: "asset_plate_morgatha",
  assetHash: "hash_plate_morgatha",
  mime: "image/jpeg",
  externalUrl: "",
  provenanceUrl: "",
});

function resolver(slug: string): Promise<ThemeBackground | null> {
  return Promise.resolve(slug === SHIPPED_SLUG ? PLATE : null);
}

/** A room with a HOST seat, carrying the RAW legacy background shape — a parse would have collapsed it. */
async function roomWithLegacyBackground(db: Db, hostHandle: string, key: string, slug: string): Promise<ChatId> {
  const host = await seedUser(db, castId<Handle>(hostHandle));
  const chatId = await seedChat(db, key, {
    metadata: { background: { kind: "seeded", seededId: slug, externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" } },
  });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  return chatId;
}

async function readBackground(db: Db, chatId: ChatId): Promise<Record<string, unknown> | undefined> {
  const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  return (rows[0]?.metadata as { background?: Record<string, unknown> } | null)?.background;
}

test("class 1 — a still-shipped slug becomes the HOST's own plate asset", async () => {
  const db = await freshDb();
  const chatId = await roomWithLegacyBackground(db, "keeps", "keeps", SHIPPED_SLUG);

  expect(await migrateSeededRoomBackgrounds(db, castId("user_keeps"), resolver, AT)).toBe(1);

  const after = await readBackground(db, chatId);
  expect(after?.["kind"]).toBe("asset");
  expect(after?.["assetId"]).toBe(PLATE.assetId);
  expect(after?.["assetHash"]).toBe(PLATE.assetHash);
});

test("class 2 — a deleted placeholder slug clears to `none` with no smuggled asset reference", async () => {
  const db = await freshDb();
  const chatId = await roomWithLegacyBackground(db, "drops", "drops", DELETED_SLUG);

  expect(await migrateSeededRoomBackgrounds(db, castId("user_drops"), resolver, AT)).toBe(1);

  const after = await readBackground(db, chatId);
  expect(after?.["kind"]).toBe("none");
  expect(after?.["assetId"]).toBe("");
});

test("the REST of the room's metadata survives the rewrite (it is a key edit, not a blob replace)", async () => {
  const db = await freshDb();
  const host = await seedUser(db, castId<Handle>("keepsmeta"));
  const chatId = await seedChat(db, "keepsmeta", {
    metadata: {
      background: { kind: "seeded", seededId: SHIPPED_SLUG, externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" },
      roomOverrides: { scenario: "a tavern at the world's edge" },
    },
  });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

  expect(await migrateSeededRoomBackgrounds(db, host, resolver, AT)).toBe(1);

  const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  const metadata = rows[0]?.metadata as { background?: Record<string, unknown>; roomOverrides?: Record<string, unknown> } | null;
  expect(metadata?.background?.["kind"]).toBe("asset");
  // The room's own overrides are the host's authored content — a rewrite that replaced the blob would
  // silently destroy them, and nothing downstream would report the loss.
  expect(metadata?.roomOverrides).toEqual({ scenario: "a tavern at the world's edge" });
});

test("scope is the HOST — a room this user only SITS in is not rewritten under their plates", async () => {
  const db = await freshDb();
  const chatId = await roomWithLegacyBackground(db, "realhost", "shared", SHIPPED_SLUG);
  const guest = await seedUser(db, castId<Handle>("guest"));
  await seedParticipant(db, { chatId, key: "g", userId: guest, role: "member" });

  // The guest's own pass reaches nothing: they host no room. D18 — membership is not authority.
  expect(await migrateSeededRoomBackgrounds(db, guest, resolver, AT)).toBe(0);
  expect((await readBackground(db, chatId))?.["kind"]).toBe("seeded");

  // The HOST's pass is the one that rewrites it, pointing at the host's own plate asset.
  expect(await migrateSeededRoomBackgrounds(db, castId("user_realhost"), resolver, AT)).toBe(1);
  expect((await readBackground(db, chatId))?.["kind"]).toBe("asset");
});

test("idempotent by its own predicate — a second pass rewrites nothing", async () => {
  const db = await freshDb();
  await roomWithLegacyBackground(db, "twice", "twice", SHIPPED_SLUG);

  expect(await migrateSeededRoomBackgrounds(db, castId("user_twice"), resolver, AT)).toBe(1);
  expect(await migrateSeededRoomBackgrounds(db, castId("user_twice"), resolver, AT + 1)).toBe(0);
});
