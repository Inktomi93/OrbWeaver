import type { Db } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  loadCanonThroughSeq,
  loadChatMeta,
  loadDigestHashes,
  loadDigestSpeakers,
  loadDigestsForScope,
  loadSegmentHashes,
  loadSegmentSpans,
  loadWitnessHorizons,
} from "../../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../_support.ts";
import { GROUP_CHAR, seedDigest, seedSegment, testGenerationId } from "../_support.ts";

const aria = castId<CharacterId>("character_aria");

let db: Db;
let owner: UserId;
beforeEach(async () => {
  db = await freshDb();
  // FK parents for the digest `scopedCharacterId` (the synthetic group char + aria — inv 8, real CharacterIds).
  owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "group"); // id === GROUP_CHAR
  await seedCharacter(db, owner, "aria");
});

describe("memory/persistence/queries", () => {
  test("loadChatMeta returns max(seq) (0 when empty)", async () => {
    const chatId = await seedChat(db, "m");
    expect(await loadChatMeta(db, chatId)).toEqual({ maxSeq: 0 });
    await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 2);
    expect(await loadChatMeta(db, chatId)).toEqual({ maxSeq: 2 });
  });

  test("loadCanonThroughSeq returns slot ⋈ selected-variant rows ≤ cutoff, oldest-first", async () => {
    const chatId = await seedChat(db, "c");
    await seedMessage(db, chatId, 1, { content: "one" });
    await seedMessage(db, chatId, 2, { content: "two" });
    await seedMessage(db, chatId, 3, { content: "three" });
    const rows = await loadCanonThroughSeq(db, chatId, 2);
    expect(rows.map((r) => r.content)).toEqual(["one", "two"]);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  // F-A (stickler 2026-08-08 §11): memory ingested EVERYTHING — no `excludedFromPrompt` filter and no
  // hidden-span strip — so a row the host had HIDDEN from the prompt, and the covered truth of a `<lie>`,
  // were digested and could re-enter the very prompt they were held out of via `{{memory}}` recall.
  // Compaction has filtered both since it shipped (`verbs/compaction.ts` — the row filter + the
  // `projectBodyForSummary` strip); the one canon LOAD memory builds from must agree with it. Owner ruling
  // (2026-08-07): hidden means hidden EVERYWHERE derived.
  test("loadCanonThroughSeq drops prompt-hidden rows and strips hidden-class spans (recall can never resurface them)", async () => {
    const chatId = await seedChat(db, "hid");
    await seedMessage(db, chatId, 1, { content: "the party enters the market" });
    await seedMessage(db, chatId, 2, {
      content: "the host's out-of-band note about the twist",
      excludedFromPrompt: true,
    });
    await seedMessage(db, chatId, 3, {
      content: 'she smiles <lie character="Zandik" type="location" truth="he is in the crypt" reason="the heist"/> and leaves',
    });
    const rows = await loadCanonThroughSeq(db, chatId, 3);
    // The hidden ROW is gone from the ingest set entirely (the compaction row-filter's twin).
    expect(rows.map((r) => r.seq)).toEqual([1, 3]);
    const ingested = rows.map((r) => r.content).join("\n");
    expect(ingested).not.toContain("out-of-band note");
    // The hidden SPAN's covered truth never reaches a digest (the `projectBodyForSummary` strip's twin);
    // the surrounding prose survives byte-identically.
    expect(ingested).not.toContain("crypt");
    expect(rows.at(-1)?.content).toBe("she smiles  and leaves");
  });

  test("loadDigestHashes is scoped to one bucket (the shared group-char bucket excludes the scoped bucket)", async () => {
    const chatId = await seedChat(db, "d");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, contentHash: "h00" });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, contentHash: "h01" });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: aria,
      tier: 0,
      blockIdx: 0,
      contentHash: "ego",
    });
    const shared = await loadDigestHashes(db, chatId, GROUP_CHAR, testGenerationId(owner));
    expect(shared.get("0:0")).toBe("h00");
    expect(shared.get("0:1")).toBe("h01");
    expect(shared.size).toBe(2); // the aria-scoped digest is NOT in the shared bucket
    expect((await loadDigestHashes(db, chatId, aria, testGenerationId(owner))).get("0:0")).toBe("ego");
  });

  test("loadSegmentHashes maps `blockIdx:chunkIdx` → content hash (a block is a ROW SET, #172)", async () => {
    const chatId = await seedChat(db, "s");
    await seedSegment(db, { chatId, blockIdx: 0, seqStart: 1, seqEnd: 16, contentHash: "s0", ownerId: owner });
    await seedSegment(db, { chatId, blockIdx: 1, chunkIdx: 0, seqStart: 17, seqEnd: 17, contentHash: "s1c0", ownerId: owner });
    await seedSegment(db, { chatId, blockIdx: 1, chunkIdx: 1, seqStart: 17, seqEnd: 17, contentHash: "s1c1", ownerId: owner });
    const map = await loadSegmentHashes(db, chatId, testGenerationId(owner));
    expect(map.get("0:0")).toBe("s0");
    // The two chunks of block 1 are DISTINCT gate entries — the per-chunk key is what lets a half-written
    // block self-heal (a missing chunk has no row, so nothing skips it).
    expect(map.get("1:0")).toBe("s1c0");
    expect(map.get("1:1")).toBe("s1c1");
  });

  test("loadSegmentSpans folds a chunked block to its WHOLE span (min start, max end)", async () => {
    const chatId = await seedChat(db, "spans");
    await seedSegment(db, { chatId, blockIdx: 0, chunkIdx: 0, seqStart: 1, seqEnd: 4, ownerId: owner });
    await seedSegment(db, { chatId, blockIdx: 0, chunkIdx: 1, seqStart: 5, seqEnd: 8, ownerId: owner });
    const spans = await loadSegmentSpans(db, chatId);
    // Reading one arbitrary chunk would shrink the witnessing window and hide real digests.
    expect(spans.get(0)).toEqual({ seqStart: 1, seqEnd: 8 });
  });

  test("loadDigestsForScope orders tier-asc, blockIdx-asc; the tier filter narrows", async () => {
    const chatId = await seedChat(db, "f");
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0 });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1 });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0 });
    const all = await loadDigestsForScope(db, chatId, GROUP_CHAR);
    expect(all.map((d) => [d.tier, d.blockIdx])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    const tier0 = await loadDigestsForScope(db, chatId, GROUP_CHAR, { tier: 0 });
    expect(tier0.map((d) => d.blockIdx)).toEqual([0, 1]);
  });

  test("loadDigestSpeakers maps digestId → contained character ids", async () => {
    const chatId = await seedChat(db, "sp");
    const id = await seedDigest(db, { chatId, tier: 0, blockIdx: 0, speakers: [aria] });
    const map = await loadDigestSpeakers(db, [id]);
    expect(map.get(id)).toEqual([aria]);
    expect(await loadDigestSpeakers(db, [])).toEqual(new Map());
  });

  test("loadWitnessHorizons returns a character's join/leave intervals, joinSeq-ascending (kick→re-add)", async () => {
    const chatId = await seedChat(db, "wh");
    // Two presence episodes for aria (a kick→re-add): [1,9) then [17, present).
    await seedParticipant(db, { chatId, key: "aria1", characterId: aria, joinSeq: 1, leftSeq: 9 });
    await seedParticipant(db, {
      chatId,
      key: "aria2",
      characterId: aria,
      joinSeq: 17,
      leftSeq: null,
    });
    const horizons = await loadWitnessHorizons(db, chatId, aria);
    expect(horizons).toEqual([
      { joinSeq: 1, leftSeq: 9 },
      { joinSeq: 17, leftSeq: null },
    ]);
    // A character with no participant row has no horizons (never present).
    expect(await loadWitnessHorizons(db, chatId, GROUP_CHAR)).toEqual([]);
  });

  test("loadSegmentSpans maps blockIdx → its seq-span (the recall witnessing filter's seq resolver)", async () => {
    const chatId = await seedChat(db, "ss");
    await seedSegment(db, { chatId, blockIdx: 0, seqStart: 1, seqEnd: 8, ownerId: owner });
    await seedSegment(db, { chatId, blockIdx: 1, seqStart: 9, seqEnd: 16, ownerId: owner });
    const spans = await loadSegmentSpans(db, chatId);
    expect(spans.get(0)).toEqual({ seqStart: 1, seqEnd: 8 });
    expect(spans.get(1)).toEqual({ seqStart: 9, seqEnd: 16 });
    expect(spans.get(2)).toBeUndefined();
  });
});
