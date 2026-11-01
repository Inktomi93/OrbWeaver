// A scoped digest build stores chat_digests and chat_segments rows only for blocks after a character joined.
// @subject packages/server/src/domain/chat/memory/generate/turn.ts
// @subject packages/server/src/domain/chat/engine/engine.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { chatDigests, chatParticipants, chatSegments, messages } from "@orb/db";
import { asymmetric } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  SUMMARIZE_TRANSCRIPT_MARKER,
  summaryReply,
} from "@orb/testkit/node/composed";
import { and, eq, max } from "drizzle-orm";

/** A scoped room whose second character joined after the opening: the late witness has spoken three settled lines. */
async function lateJoinerRoom(): Promise<{
  readonly h: ChatRoot;
  readonly first: ChatRoot["characters"][number];
  readonly late: ChatRoot["characters"][number];
  readonly summaries: string[];
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}> {
  const summaries: string[] = [];
  // Replies the late witness speaks after joining; the turn under test takes the keeper's line once they run out.
  const lateReplies = [6, 7, 8].map((seq) => `Joined bridge ${seq}.`);
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body): string => {
      if (!body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
        return lateReplies.shift() ?? "The keeper records the completed scene.";
      }
      summaries.push(body);
      return body.includes("Unwitnessed opening")
        ? summaryReply({ anchor: "Earlier span", facts: "Unwitnessed opening facts remain with their witness.", keywords: ["earlier"] })
        : summaryReply({ anchor: "Joined span", facts: "Joined bridge facts remain with their witness.", keywords: ["joined"] });
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: physical.execute,
      memoryEnabled: true,
      memoryDefaults: { mode: "mixA", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
      group: { output: "per-speaker", cardScope: "scoped", policy: "list" },
      transcript: [
        ...[1, 2, 3, 4].map((seq) => ({ role: "assistant" as const, content: `Unwitnessed opening ${seq}.` })),
        { role: "assistant", content: "Joined bridge 5." },
      ],
    }),
  );
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
  const lifetime = construction.move();
  return { h, first, late, summaries, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("the actual scoped digest build excludes complete blocks from before a character joined", async () => {
  await using room = await lateJoinerRoom();
  const { h, first, late, summaries } = room;
  const outer = `controlled-core-memory:${h.chatId}`;
  const beforeTraces = new Set(h.root.observability.traces(100).map((trace) => trace.requestId));
  const outcome = await h.root.observability.inRequestSpan(outer, "controlled public memory turn", () =>
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
    asymmetric(expect.stringContaining("Unwitnessed opening")),
  ]);
  // The summarizer body is JSON, so the block text is matched as it is escaped on the wire.
  const openingBlock = JSON.stringify(`${SUMMARIZE_TRANSCRIPT_MARKER}\n\nAria: Unwitnessed opening 1.\nAria: Unwitnessed opening 2.`).slice(1, -1);
  expect(summaries.some((body) => body.includes(openingBlock))).toBe(true);
  expect(summaries.some((body) => body.includes("Bryn: Joined bridge"))).toBe(true);
  expect(summaries.every((body) => !(body.includes(first.id) || body.includes(late.id)))).toBe(true);
  const segments = await h.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, h.chatId)).orderBy(chatSegments.blockIdx, chatSegments.chunkIdx);
  expect(segments.length).toBeGreaterThan(0);
  expect(segments.every((segment) => segment.text.length > 0)).toBe(true);
  expect(segments.some((segment) => segment.text.includes("Aria: Unwitnessed opening"))).toBe(true);
  expect(segments.some((segment) => segment.text.includes("Bryn: Joined bridge"))).toBe(true);
  expect(segments.every((segment) => !(segment.text.includes(first.id) || segment.text.includes(late.id)))).toBe(true);
  const traces = h.root.observability
    .traces(100)
    .filter(
      (trace) =>
        !beforeTraces.has(trace.requestId) && trace.rootName === "memory.turnCompleted" && trace.spans.some((span) => span.attributes["chatId"] === h.chatId),
    );
  expect(traces).toHaveLength(1);
  expect(traces[0]).toMatchObject({ status: "ok", requestId: asymmetric(expect.stringMatching(/^memory-turn:/u)) });
  expect(traces[0]?.requestId).not.toBe(outer);
  expect(traces[0]?.spans.find((span) => span.name === "memory.turnCompleted")?.parentSpanId).toBeUndefined();
});

test("a digest whose segment span is gone fails closed for a speaker bound by a join horizon", async () => {
  await using room = await lateJoinerRoom();
  const { h, late } = room;
  const verdictsOf = async (): Promise<ReadonlyMap<number, string>> => {
    const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
    const turn = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: late.id });
    expect(turn.aborted).toBe(false);
    await h.root.settleBackground();
    const record = h.root.app.recallRecorder
      .recent({ chatId: h.chatId })
      .filter((candidate) => candidate.seq > before && candidate.scopedCharacterId === late.id)
      .at(-1);
    return new Map(record?.trace.candidates.map((candidate) => [candidate.blockIdx, candidate.verdict]));
  };
  const own = (await h.root.db.select().from(chatDigests).where(eq(chatDigests.chatId, h.chatId))).filter((row) => row.scopedCharacterId === late.id);
  const [lost, kept] = own.map((row) => row.blockIdx).toSorted((a, b) => a - b);
  if (lost === undefined || kept === undefined) {
    throw new Error("the late witness holds fewer than two digests");
  }
  // The whole history is in the prompt, so a digest with its span clears witnessing and stops at the live window.
  const whole = await verdictsOf();
  expect(whole.get(lost)).toBe("live-window");
  expect(whole.get(kept)).toBe("live-window");

  await h.root.db.delete(chatSegments).where(and(eq(chatSegments.chatId, h.chatId), eq(chatSegments.blockIdx, lost)));
  const cut = await verdictsOf();
  expect(cut.get(lost)).toBe("unwitnessed");
  expect(cut.get(kept)).toBe("live-window");
});
