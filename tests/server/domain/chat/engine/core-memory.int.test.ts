// @subject packages/server/src/domain/chat/memory/generate/turn.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { chatDigests, chatParticipants, chatSegments, messages } from "@orb/db";
import { initTracing, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { and, eq, max } from "drizzle-orm";

test("the actual scoped digest build excludes complete blocks from before a character joined", async () => {
  initTracing();
  const summaries: string[] = [];
  // Replies the late witness speaks after joining; the turn under test takes the keeper's line once they run out.
  const lateReplies = [6, 7, 8].map((seq) => `Joined bridge ${seq}.`);
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body): string => {
      if (!body.includes("Transcript block:")) {
        return lateReplies.shift() ?? "The keeper records the completed scene.";
      }
      summaries.push(body);
      return body.includes("Unwitnessed opening")
        ? "Earlier span\nUnwitnessed opening facts remain with their witness.\nKeywords: earlier"
        : "Joined span\nJoined bridge facts remain with their witness.\nKeywords: joined";
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    providerFetch: physical.execute,
    memoryEnabled: true,
    memoryDefaults: { mode: "mixA", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
    group: { output: "per-speaker", cardScope: "scoped", policy: "list" },
    transcript: [
      ...[1, 2, 3, 4].map((seq) => ({ role: "assistant" as const, content: `Unwitnessed opening ${seq}.` })),
      { role: "assistant", content: "Joined bridge 5." },
    ],
  });
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the actual memory room has no founding character");
  }
  const [head] = await h.root.db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, h.chatId));
  const late = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "A late witness to the bridge." }),
  });
  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: late.id });
  const seat = await h.root.db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.characterId, late.id)))
    .get();
  expect(seat?.joinSeq).toBe(head?.seq);
  // The late witness's lines are real forced turns, each settled so its memory pass ends before the next.
  for (const _line of [6, 7, 8]) {
    const spoken = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: late.id });
    expect(spoken.aborted).toBe(false);
    await h.root.settleBackground();
  }
  expect(lateReplies).toEqual([]);
  const outer = `controlled-core-memory:${h.chatId}`;
  const beforeTraces = new Set(recentTraces(100).map((trace) => trace.requestId));
  const outcome = await withRequestSpan(outer, "controlled public memory turn", {}, () =>
    h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: first.id }),
  );
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  const digests = await h.root.db.select().from(chatDigests).where(eq(chatDigests.chatId, h.chatId)).orderBy(chatDigests.blockIdx);
  const own = digests.filter((row) => row.scopedCharacterId === late.id);
  expect(own.map((row) => row.blockIdx)).toEqual([2, 3]);
  expect(own.every((row) => row.text.includes("Joined bridge"))).toBe(true);
  expect(own.every((row) => !row.text.includes("Unwitnessed opening"))).toBe(true);
  expect(digests.filter((row) => row.scopedCharacterId === first.id && row.blockIdx === 0).map((row) => row.text)).toEqual([
    expect.stringContaining("Unwitnessed opening"),
  ]);
  expect(summaries.some((body) => body.includes("Aria: Unwitnessed opening"))).toBe(true);
  expect(summaries.some((body) => body.includes("Bryn: Joined bridge"))).toBe(true);
  expect(summaries.every((body) => !(body.includes(first.id) || body.includes(late.id)))).toBe(true);
  const segments = await h.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, h.chatId)).orderBy(chatSegments.blockIdx, chatSegments.chunkIdx);
  expect(segments.length).toBeGreaterThan(0);
  expect(segments.every((segment) => segment.text.length > 0)).toBe(true);
  expect(segments.some((segment) => segment.text.includes("Aria: Unwitnessed opening"))).toBe(true);
  expect(segments.some((segment) => segment.text.includes("Bryn: Joined bridge"))).toBe(true);
  expect(segments.every((segment) => !(segment.text.includes(first.id) || segment.text.includes(late.id)))).toBe(true);
  const traces = recentTraces(100).filter(
    (trace) =>
      !beforeTraces.has(trace.requestId) && trace.rootName === "memory.turnCompleted" && trace.spans.some((span) => span.attributes["chatId"] === h.chatId),
  );
  expect(traces).toHaveLength(1);
  expect(traces[0]).toMatchObject({ status: "ok", requestId: expect.stringMatching(/^memory-turn:/u) });
  expect(traces[0]?.requestId).not.toBe(outer);
  expect(traces[0]?.spans.find((span) => span.name === "memory.turnCompleted")?.parentSpanId).toBeUndefined();
});
