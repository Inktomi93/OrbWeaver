// @subject packages/server/src/domain/chat/memory/generate/turn.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { chatDigests, chatParticipants, chatSegments } from "@orb/db";
import { initTracing, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";

test("the actual scoped digest build excludes complete blocks from before a character joined", async () => {
  initTracing();
  const summaries: string[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body): string => {
      if (!body.includes("Transcript block:")) {
        return "The keeper records the completed scene.";
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
  });
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the actual memory room has no founding character");
  }
  for (let seq = 1; seq <= 4; seq += 1) {
    await seedMessage(h.root.db, { chatId: h.chatId, seq, characterId: first.id, content: `Unwitnessed opening ${seq}.` }, h.root.idSource);
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 5, characterId: first.id, content: "Joined bridge 5." }, h.root.idSource);
  const late = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "A late witness to the bridge." }),
  });
  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: late.id });
  const seat = await h.root.db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.characterId, late.id)))
    .get();
  expect(seat?.joinSeq).toBe(5);
  for (let seq = 6; seq <= 8; seq += 1) {
    await seedMessage(h.root.db, { chatId: h.chatId, seq, characterId: late.id, content: `Joined bridge ${seq}.` }, h.root.idSource);
  }
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
