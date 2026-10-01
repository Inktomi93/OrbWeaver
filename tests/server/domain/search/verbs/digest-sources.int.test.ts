import { chatDigests } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { consolidationHash, resolveTier0Range } from "@orb/server/domain/chat";
import { eq } from "drizzle-orm";
import { createDigestSourceCoverage } from "../../../../../packages/server/src/domain/search/verbs/digest-sources.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedChatDigest, seedChatSegment, seedUser, vec } from "../_support.ts";

test("a higher-tier source proves its original generation grid and rejects a changed fanOut before rebuild", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("source-owner") });
  const character = await seedCharacter(db, { id: mintTypeId(ID_PREFIX.character), ownerId: owner, name: "Source" });
  const chatId = await seedChat(db, mintTypeId(ID_PREFIX.chat));
  const hashes: string[] = [];
  for (let blockIdx = 0; blockIdx <= 7; blockIdx += 1) {
    const hash = `leaf-${blockIdx}`;
    await seedChatDigest(db, { id: mintTypeId(ID_PREFIX.chatDigest), chatId, scopedCharacterId: character, blockIdx, contentHash: hash, embedding: vec(1) });
    await seedChatSegment(db, { id: mintTypeId(ID_PREFIX.chatSegment), chatId, blockIdx, embedding: vec(1) });
    if (blockIdx >= 4) {
      hashes.push(hash);
    }
  }
  const contentHash = consolidationHash(`${character}:1:1`, hashes);
  const id = await seedChatDigest(db, {
    id: mintTypeId(ID_PREFIX.chatDigest),
    chatId,
    scopedCharacterId: character,
    tier: 1,
    blockIdx: 1,
    contentHash,
    embedding: vec(1),
  });
  const [source] = await db.select().from(chatDigests).where(eq(chatDigests.id, id));
  if (source === undefined) {
    throw new Error("missing source fixture");
  }
  const original = await createDigestSourceCoverage({
    db,
    digestConsolidationHash: consolidationHash,
    tier0RangeOf: (tier, blockIdx) => resolveTier0Range({ fanOut: 4 }, tier, blockIdx),
  })(source, 0);
  expect(original).toMatchObject({ seqStart: 40, seqEnd: 79 });
  const changed = await createDigestSourceCoverage({
    db,
    digestConsolidationHash: consolidationHash,
    tier0RangeOf: (tier, blockIdx) => resolveTier0Range({ fanOut: 2 }, tier, blockIdx),
  })(source, 0);
  expect(changed).toEqual({ seqStart: null, seqEnd: null, messageStartId: null, messageEndId: null });
});
