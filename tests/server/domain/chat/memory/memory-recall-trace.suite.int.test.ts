// The RECALL TRACE pins (#250) — `recallMemory`'s `MemoryRecallSlice`: the observability half the recall
// return now carries beside the text. These assert the thing the owner asked for in the words he asked for
// it: "what memories were fetched, and why" — so every VERDICT arm gets a case that produces it through the
// real recall pipeline (real db pool, real bridge, injected scan), never a hand-built slice.
//
// Sibling files: `recall/recall.int.test.ts` (the rendered `{{memory}}` text),
// `memory-recall-eval.suite.int.test.ts` (recall@k through the REAL search cosine over fixture vectors).
//
// A `.suite.int.test.ts` (the cross-cutting property spelling, `test-layout`) rather than a per-source
// mirror: the property is that ONE recall slice reaches THREE readers — the assembly trace, the structured
// log entry, and the injected ring — which is a fact about the seam, not about `recall.ts` alone.

import type { MemoryRecallCandidate, MemoryRecallVerdict } from "@orb/contracts/chat";
import type { ScoredBlock } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";
import { fakeSearchDigests, GROUP_CHAR, seedDigest, seedSegment, sharedScope } from "./_support.ts";

const aria = castId<CharacterId>("character_aria");

let db: Db;
// The fixture owner. Hoisted out of `beforeEach` because `seedSegment` needs it: a segment's
// `embed_generations` row is owner-scoped and these chats seat no human HOST for it to derive one from
// (D18 — there is no `chats.ownerId`, the host participant is the authority), so the owner is passed.
let owner: UserId;
beforeEach(async () => {
  db = await freshDb();
  owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "group");
  await seedCharacter(db, owner, "aria");
});

/** The candidate for one block, by its `(tier, blockIdx)` identity — the trace's rows are unordered beyond
 *  "admitted first", so a test names the block it means rather than an index. */
function candidateAt(candidates: readonly MemoryRecallCandidate[], tier: number, blockIdx: number): MemoryRecallCandidate | undefined {
  return candidates.find((c) => c.tier === tier && c.blockIdx === blockIdx);
}

function verdictAt(candidates: readonly MemoryRecallCandidate[], tier: number, blockIdx: number): MemoryRecallVerdict | undefined {
  return candidateAt(candidates, tier, blockIdx)?.verdict;
}

describe("memory/recall — the trace slice (#250)", () => {
  test("mode off: the trace still reports, with the REASON — a silent zero-work recall is the hole this closes", async () => {
    const chatId = await seedChat(db, "off");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0 });
    const { text, trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "off" },
    });
    expect(text).toBe("");
    expect(trace.mode).toBe("off");
    expect(trace.note).toBe("mode off");
    expect(trace.surfaced).toBe(0);
    expect(trace.queryEmbedded).toBe(false);
    expect(trace.candidates).toEqual([]);
  });

  test("an empty pool reports 'no digests' rather than an absent trace", async () => {
    const chatId = await seedChat(db, "empty");
    const { trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(trace.note).toBe("no digests");
    expect(trace.poolSize).toBe(0);
  });

  test("mixA: the surfaced blocks carry their RANK in prompt order; a higher tier reads 'mode-excluded'", async () => {
    const chatId = await seedChat(db, "mixa");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: [] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: [] });
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, topicAnchor: "[T1]", keywords: [] });
    const { trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(trace.poolSize).toBe(3);
    expect(trace.surfaced).toBe(2);
    expect(candidateAt(trace.candidates, 0, 0)).toMatchObject({ verdict: "admitted", rank: 0 });
    expect(candidateAt(trace.candidates, 0, 1)).toMatchObject({ verdict: "admitted", rank: 1 });
    expect(verdictAt(trace.candidates, 1, 0)).toBe("mode-excluded");
    // A pure-assembly mode runs no scan, so an admitted block carries no score — absent, never a fake 0.
    expect(candidateAt(trace.candidates, 0, 0)?.score).toBeUndefined();
    expect(trace.queryText).toBeNull();
  });

  test("tiered: a tier-0 block covered by a surfaced consolidation reads 'bridge-covered'", async () => {
    const chatId = await seedChat(db, "tiered");
    for (let b = 0; b < 4; b += 1) {
      await seedDigest(db, { chatId, tier: 0, blockIdx: b, topicAnchor: `[t0.${b}]`, keywords: [] });
    }
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, topicAnchor: "[T1.0]", keywords: [] });
    const { trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "tiered", fanOut: 2 },
    });
    // fine zone = the last two tier-0 blocks; [0,1] is covered by the tier-1 consolidation.
    expect(verdictAt(trace.candidates, 1, 0)).toBe("admitted");
    expect(verdictAt(trace.candidates, 0, 0)).toBe("bridge-covered");
    expect(verdictAt(trace.candidates, 0, 1)).toBe("bridge-covered");
    expect(verdictAt(trace.candidates, 0, 2)).toBe("admitted");
    expect(trace.candidateCount).toBe(3);
  });

  test("mixC: an admitted block carries the SCORE + RELEVANCE it was admitted on, and the query it matched", async () => {
    const chatId = await seedChat(db, "mixc");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: [] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: [] });
    const hits: ScoredBlock[] = [{ blockKey: { chatId, tier: 0, blockIdx: 1, scopedCharacterId: GROUP_CHAR }, score: -0.82, relevance: 0.82 }];
    const ctx = makeChatContext(db, { searchDigests: fakeSearchDigests(hits).fn });
    const { trace } = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC", queryWindow: 4 },
      recent: [{ seq: 1, role: "user", kind: "standard", characterId: null, authorUserId: null, personaId: null, content: "tell me about the bath house" }],
    });
    expect(trace.queryEmbedded).toBe(true);
    expect(trace.queryText).toContain("bath house");
    expect(candidateAt(trace.candidates, 0, 1)).toMatchObject({ verdict: "admitted", rank: 0, score: -0.82, relevance: 0.82 });
    // The candidate the scan did NOT return lost the retrieval cut — and carries no invented score.
    expect(verdictAt(trace.candidates, 0, 0)).toBe("below-floor");
    expect(candidateAt(trace.candidates, 0, 0)?.score).toBeUndefined();
  });

  test("witnessing + live window: a block reads the STAGE that dropped it, not a generic miss", async () => {
    const chatId = await seedChat(db, "stages");
    // Two blocks of 4 messages each: block 0 = seq 1-4, block 1 = seq 5-8.
    await seedSegment(db, { ownerId: owner, chatId, blockIdx: 0, seqStart: 1, seqEnd: 4 });
    await seedSegment(db, { ownerId: owner, chatId, blockIdx: 1, seqStart: 5, seqEnd: 8 });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[b0]", keywords: [] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[b1]", keywords: [] });
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 5, leftSeq: null });

    // aria joined at seq 5 ⇒ block 0 is unwitnessed; the live-window cutoff at 5 ⇒ block 1 is still verbatim.
    const { trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 5, leftSeq: null }],
      liveWindowCutoffSeq: 5,
      config: { mode: "mixA" },
    });
    expect(verdictAt(trace.candidates, 0, 0)).toBe("unwitnessed");
    expect(verdictAt(trace.candidates, 0, 1)).toBe("live-window");
    expect(trace.poolSize).toBe(0);
    expect(trace.note).toBe("no digests");
  });

  test("the trace reaches BOTH sinks — the structured log entry and the injected recall recorder", async () => {
    const chatId = await seedChat(db, "sinks");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: [] });
    const recorded: { chatId: ChatId; surfaced: number }[] = [];
    const ctx = makeChatContext(db, {
      recordRecall: (record) => recorded.push({ chatId: record.chatId, surfaced: record.trace.surfaced }),
    });
    const { trace } = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(recorded).toEqual([{ chatId, surfaced: 1 }]);
    expect(trace.surfaced).toBe(1);
  });
});
