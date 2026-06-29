import type { BlockKey } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import { recallMemory } from "../../../../../../packages/server/src/domain/chat/memory/recall/recall";
import type { MemoryScope } from "../../../../../../packages/server/src/domain/chat/memory/types";
import { freshDb } from "../../../../../support/db";
import { makeChatContext, seedChat } from "../../_support";
import { fakeSearchDigests, seedDigest } from "../_support";

const aria = castId<CharacterId>("character_aria");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const sharedScope = (chatId: ChatId): MemoryScope => ({
  chatId,
  scopedCharacterId: "",
  isGroup: false,
});

// Build the expected {{memory}} block(s) from parts (avoids a `keywords:`-shaped literal tripping noSecrets).
const facet = (anchor: string, kw: string): string => `${anchor}\nkeywords: ${kw}`;
const joinBlocks = (...blocks: string[]): string => blocks.join("\n\n");

describe("memory/recall — the 5 modes + the 6 chat-scoped semantics", () => {
  test("#1 off → empty string (D36)", async () => {
    const chatId = await seedChat(db, "off");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0 });
    const ctx = makeChatContext(db);
    expect(await recallMemory(ctx, { scope: sharedScope(chatId), config: { mode: "off" } })).toBe(
      "",
    );
  });

  test("#1 mixA → all this bucket's tier-0 digests, chronological (pure assembly, NO search call)", async () => {
    const chatId = await seedChat(db, "mixa");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: ["b"] });
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, topicAnchor: "[T1]", keywords: ["x"] }); // higher tier ignored by mixA
    // searchDigests left as the throwing stub — mixA must NOT call it.
    const ctx = makeChatContext(db);
    const out = await recallMemory(ctx, { scope: sharedScope(chatId), config: { mode: "mixA" } });
    expect(out).toBe(joinBlocks(facet("[s0]", "a"), facet("[s1]", "b")));
  });

  test("#1/#4/#5/#6 mixC → delegates the cosine scan to ctx.searchDigests + formats the ranked keys", async () => {
    const chatId = await seedChat(db, "mixc");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: ["b"] });
    // search returns block 1 ranked ABOVE block 0.
    const ranked: BlockKey[] = [
      { chatId, tier: 0, blockIdx: 1, scopedCharacterId: "" },
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: "" },
    ];
    const search = fakeSearchDigests(ranked);
    const ctx = makeChatContext(db, { searchDigests: search.fn });
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      config: { mode: "mixC", minScore: 0.3 },
    });
    // the cosine scan was delegated, scoped to this chat (#5), with the egocentric bucket (#4) + the knobs (#6).
    expect(search.calls).toHaveLength(1);
    const q = search.calls.at(0);
    expect(q?.scopedCharacterId).toBe("");
    expect(q?.options).toMatchObject({ scope: { chat: chatId }, mode: "mixC", minScore: 0.3 });
    // formatted in the search-returned (ranked) order.
    expect(out).toBe(joinBlocks(facet("[s1]", "b"), facet("[s0]", "a")));
  });

  test("#2/#3 tiered → the bridge (coarse high-tier + fine tier-0, uncovered-only, tip excluded)", async () => {
    const chatId = await seedChat(db, "tier");
    // tier-0 blocks 0..3 + tier-1 blocks 0 (covers 0,1) and 1 (covers 2,3). fanOut 2.
    for (let b = 0; b < 4; b += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedDigest(db, {
        chatId,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[t0.${b}]`,
        keywords: [],
      });
    }
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, topicAnchor: "[T1.0]", keywords: [] });
    await seedDigest(db, { chatId, tier: 1, blockIdx: 1, topicAnchor: "[T1.1]", keywords: [] });
    const ctx = makeChatContext(db); // tiered is pure assembly — no search call
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      config: { mode: "tiered", fanOut: 2 },
    });
    // fine zone = last 2 tier-0 (blocks 2,3); coarse [0,1] → ONE tier-1 digest (block 0). Uncovered-only:
    expect(out).toContain("[T1.0]"); // the coarse cover for the distant past
    expect(out).toContain("[t0.2]");
    expect(out).toContain("[t0.3]");
    expect(out).not.toContain("[t0.0]"); // covered by [T1.0] → never also surfaced
    expect(out).not.toContain("[t0.1]");
  });

  test("#4 egocentric-only: a scoped bucket recalls ONLY its own digests, not the shared bucket", async () => {
    const chatId = await seedChat(db, "ego");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[shared]", keywords: [] });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: aria,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[aria-pov]",
      keywords: [],
    });
    const ctx = makeChatContext(db);
    const egocentric = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      config: { mode: "mixA" },
    });
    expect(egocentric).toBe("[aria-pov]");
    expect(egocentric).not.toContain("[shared]");

    const shared = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      config: { mode: "mixA" },
    });
    expect(shared).toBe("[shared]");
  });

  test("an empty bucket → empty string", async () => {
    const chatId = await seedChat(db, "empty");
    const ctx = makeChatContext(db);
    expect(await recallMemory(ctx, { scope: sharedScope(chatId), config: { mode: "mixA" } })).toBe(
      "",
    );
  });
});
