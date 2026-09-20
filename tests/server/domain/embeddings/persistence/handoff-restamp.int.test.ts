// `createHandoffRestampStatements` — the embeddings-owned digest re-key the host-handoff copy executes.
// The op WRITES NOTHING: it returns the statements chat folds into its role-swap batch, so both halves are
// asserted — the rows stay put until the caller commits, and the commit moves BOTH columns, chat-scoped.
//
// Why both columns: `chat_digests.scopedCharacterId` (the egocentric bucket key) and
// `chat_digest_speakers.characterId` (the cross-room "which characters this digest contains" join) are BOTH
// `characters.id … onDelete:"cascade"`. Re-keying only the join would leave the digest ROW hanging off the
// departed host's card, so their next library cleanup would still evaporate the transferred room's memory.

import type { Db } from "@orb/db";
import { characters, chatDigestSpeakers, chatDigests, embedGenerations, userConnections } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, ChatDigestId, ChatId, EmbedGenerationId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createHandoffRestampStatements } from "../../../../../packages/server/src/domain/embeddings/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;

async function seedCard(db: Db, ownerId: UserId, key: string): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({ id, ownerId, handle: castId<CharacterHandle>(key), name: key, contentHash: key, tokenSize: 0, createdAt: AT });
  return id;
}

/** One digest row + its speakers entry, both keyed to `characterId`. */
async function seedDigest(db: Db, key: string, chatId: ChatId, characterId: CharacterId): Promise<ChatDigestId> {
  const id = castId<ChatDigestId>(`chat_digest_${key}`);
  const ownerId = (await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)))[0]?.ownerId;
  if (ownerId === undefined) {
    throw new Error(`missing owner for ${characterId}`);
  }
  const generationId = castId<EmbedGenerationId>(`embed_generation_${ownerId}_embed_m`);
  const connectionId = castId<UserConnectionId>(`user_connection_${ownerId}_embed_m`);
  await db
    .insert(userConnections)
    .values({ id: connectionId, ownerId, label: "handoff restamp embed", providerId: castId("custom-openai"), model: "m" })
    .onConflictDoNothing();
  await db
    .insert(embedGenerations)
    .values({
      id: generationId,
      ownerId,
      task: "embed",
      via: "embed",
      connectionId,
      connectionRef: connectionId,
      fingerprint: "test:handoff-restamp",
      space: "m",
    })
    .onConflictDoNothing();
  await db.insert(chatDigests).values({
    id,
    chatId,
    scopedCharacterId: characterId,
    tier: 0,
    blockIdx: 0,
    text: "t",
    contentHash: key,
    topicAnchor: "a",
    keywords: [],
    model: "m",
    generationId,
    dim: 1,
    embedding: new Float32Array([0]),
  });
  await db.insert(chatDigestSpeakers).values({ digestId: id, characterId });
  return id;
}

test("both digest columns move onto the copy — and ONLY inside the transferred chat", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = await seedCard(db, nominee.id, "aria_copy");
  const transferred = (await seedChat(db)).id;
  const otherRoom = (await seedChat(db)).id;
  const mine = await seedDigest(db, "mine", transferred, source);
  const theirs = await seedDigest(db, "theirs", otherRoom, source);

  const stmts = await createHandoffRestampStatements({ db })({
    chatId: transferred,
    pairs: [{ sourceCharacterId: source, characterId: copy }],
  });

  // A pure producer: nothing moves until chat's swap batch runs (the atomicity property — the re-key is a
  // property of the authority move, never a second write a crash could skip).
  expect((await db.select().from(chatDigests).where(eq(chatDigests.id, mine)))[0]?.scopedCharacterId).toBe(source);
  await db.batch(batchMany(stmts));

  expect((await db.select().from(chatDigests).where(eq(chatDigests.id, mine)))[0]?.scopedCharacterId).toBe(copy);
  expect((await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, mine)))[0]?.characterId).toBe(copy);
  // The OTHER room's rows for the same card are untouched — the speakers UPDATE joins through `chat_digests`
  // for its chat scope rather than sweeping a bare `characterId` across every room the card ever spoke in.
  expect((await db.select().from(chatDigests).where(eq(chatDigests.id, theirs)))[0]?.scopedCharacterId).toBe(source);
  expect((await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, theirs)))[0]?.characterId).toBe(source);
});

test("an empty pair list produces no statements (an offer-less handoff writes nothing here)", async () => {
  const db = await freshDb();
  const chatId = (await seedChat(db)).id;

  expect(await createHandoffRestampStatements({ db })({ chatId, pairs: [] })).toEqual([]);
});
