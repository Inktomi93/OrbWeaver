// substrate/group-bucket — the shared memory bucket key. The GROUP-MEMORY ROUND-TRIP regression (stickler
// slice-1 F1): 673 green tests hid a dead subsystem because every digest fixture seeded an FK-satisfying
// `character_group` row and hand-keyed the scope — the ENGINE's own key construction
// (`castId(\`__group__${chatId}\`)`) was never driven against the real store. This pins that the key BUILD
// resolves (`resolveGroupBucketCharacterId`) equals the key RECALL reads (`findSyntheticGroupCharacter`), and
// that the fabricated handle FK-throws (the original silent killer).

import type { Db } from "@orb/db";
import { chatDigests, embedGenerations, userConnections } from "@orb/db";
import type { CharacterId, EmbedGenerationId, Handle, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { generateDigests } from "../../../../../packages/server/src/domain/chat/memory/generate/digests.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { resolveGroupBucketCharacterId } from "../../../../../packages/server/src/domain/chat/substrate/group-bucket.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";
import { fakeEmbeddingsStore, fakeSummarize } from "../memory/_support.ts";

const BUILD_CFG = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 } as const;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("group memory build↔recall round-trip (F1 regression)", () => {
  test("digests built under the engine's resolved key are recalled under the same key — no fabricated handle", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    // Two seated characters + the REAL synthetic group-as-character (a hidden `characters` row minted for the
    // room). The FK target for the shared bucket is this synthetic row — NOT the `__group__` handle string.
    const c1 = await seedCharacter(db, host, "aria");
    const c2 = await seedCharacter(db, host, "bram");
    const synthetic = await seedCharacter(db, host, "grp_synthetic");
    const chatId = await seedChat(db, "grp");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c1", characterId: c1 });
    await seedParticipant(db, { chatId, key: "c2", characterId: c2 });
    // Four aged-out turns → two blocks (seq 1-2, 3-4) digest under blockSize 2 / verbatimWindow 0.
    for (let seq = 1; seq <= 4; seq += 1) {
      await seedMessage(db, chatId, seq, {
        characterId: seq % 2 === 0 ? c2 : c1,
        content: `group turn ${seq}`,
      });
    }

    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, {
      // find-or-mint both return the REAL synthetic row (idempotent) — build mints, recall finds.
      mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: synthetic }),
      findSyntheticGroupCharacter: () => Promise.resolve({ characterId: synthetic }),
      summarize: fakeSummarize().op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
    });

    // ── BUILD: exactly the engine's §3a group path — resolve the bucket key, then digest under it. ──
    const buildKey = await resolveGroupBucketCharacterId(ctx, { ownerId: host, chatId });
    expect(buildKey).toBe(synthetic); // the real minted id, never `__group__${chatId}`
    const built = await generateDigests(ctx, {
      scope: { chatId, scopedCharacterId: buildKey, isGroup: true },
      config: BUILD_CFG,
      funderUserId: host,
    });
    expect(built.written).toBe(2); // two aged-out blocks digested — the FK did NOT throw

    // The rows actually landed under the synthetic id (proving the write succeeded against the real FK).
    const rows = await db.select().from(chatDigests);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.scopedCharacterId === synthetic)).toBe(true);

    // ── RECALL: the assemble-gather path — key the shared bucket via `findSyntheticGroupCharacter`. ──
    const group = await ctx.findSyntheticGroupCharacter({ ownerId: host, chatId });
    const recallKey = group?.characterId ?? c1;
    expect(recallKey).toBe(buildKey); // build key === recall key (the round-trip invariant that was broken)
    const { text: memory } = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: recallKey, isGroup: true },
      groupCharacterId: recallKey,
      config: { mode: "mixA" },
      recent: [],
      names: new Map<CharacterId, string>(),
    });

    // Recall returns what build wrote (the stored digest `text`) — group memory is ALIVE, not permanently "".
    expect(memory).not.toBe("");
    expect(memory).toContain("entities"); // the summarizer's distilled digest body surfaced into {{memory}}
  });

  test("the OLD fabricated `__group__` key FK-throws against the real store (the silent killer, now impossible)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "grp");
    const generationId = castId<EmbedGenerationId>("embed_generation_group_bucket_bad");
    const connectionId = castId<UserConnectionId>("user_connection_group_bucket_bad");
    await db
      .insert(userConnections)
      .values({ id: connectionId, ownerId: host, label: "group bucket embed", providerId: testProviderId("custom-openai"), model: testModelId("m") });
    await db.insert(embedGenerations).values({
      id: generationId,
      ownerId: host,
      task: "embed",
      via: "embed",
      connectionId,
      connectionRef: connectionId,
      fingerprint: "test:group-bucket",
      space: "m",
    });
    // A direct insert with the fabricated handle (what engine.ts:477 / backfill.ts:50 did) violates the
    // `chat_digests.scopedCharacterId → characters.id` FK — this is the throw the engine silently swallowed.
    await expect(
      // @orb-waive no-test-fabrication(never): this IS the invalid-input probe — a fabricated non-row id whose FK MUST reject. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      db.insert(chatDigests).values({
        id: castId("chat_digest_bad"),
        chatId,
        scopedCharacterId: castId<CharacterId>(`__group__${chatId}`),
        isGroup: true,
        tier: 0,
        blockIdx: 0,
        text: "orphan",
        embedding: new Float32Array(1024),
        contentHash: "h",
        keywords: [],
        topicAnchor: null,
        model: "m",
        generationId,
        dim: 1024,
      } as never),
    ).rejects.toThrow();
  });
});
