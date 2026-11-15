// One stored message holds at most MESSAGE_TEXT_MAX_CHARS characters of content or reasoning, whatever writes it: a
// send, an edit, a model reply, a continue, a reasoning edit or an import. A live writer is refused with the named
// code and stores nothing; a runaway reply stops streaming; an import lands the rest of the chat and names the row.
// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// @subject packages/server/src/domain/chat/engine/stream-cap.ts
// @subject packages/server/src/domain/chat/persistence/import-write.ts

import type { MessageView } from "@orb/contracts/chat";
import { MESSAGE_MACRO_BUDGET_OP_CODE, MESSAGE_TEXT_MAX_CHARS, MESSAGE_TOO_LONG_OP_CODE } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { createChatRoot, readRoomCanon } from "@orb/testkit/node/composed";
import { textProvider, textRoom } from "../scenario-physical.ts";

// One copy each: a V8 repeat is a flat string, so the cases share them instead of allocating per case.
const AT_CAP = "x".repeat(MESSAGE_TEXT_MAX_CHARS);
const OVER_CAP = `${AT_CAP}x`;
const REFUSED = { code: MESSAGE_TOO_LONG_OP_CODE };

// The runaway stream sends this much text per chunk, and would send up to the bound if nothing stopped it.
const RUNAWAY_CHUNK_CHARS = 500_000;
const RUNAWAY_PULL_BOUND = 40;

async function firstReply(h: ChatRoot): Promise<MessageView> {
  const reply = (await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.role === "assistant");
  if (reply === undefined) {
    throw new Error("the turn wrote no assistant reply");
  }
  return reply;
}

test("a send over the cap is refused by name and stores nothing", async () => {
  await using h = await textRoom(["The answer."]);
  const { chat } = h.root.services;

  // A draft this large passes the macro engine's input limit first, so the send path's earlier bound names it.
  await expect(chat.send({ principal: h.owner, chatId: h.chatId, content: OVER_CAP })).rejects.toMatchObject({ code: MESSAGE_MACRO_BUDGET_OP_CODE });
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
  // Positive control: the same send with a short line commits it and its reply.
  await chat.send({ principal: h.owner, chatId: h.chatId, content: "Ask." });
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).map((message) => message.content)).toEqual(["Ask.", "The answer."]);
});

test("an edit over the cap is refused and the stored body is unchanged, while an edit exactly at the cap lands", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;
  await chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "Short line." });
  const [row] = await readRoomCanon(h.root, h.owner, h.chatId);
  if (row === undefined) {
    throw new Error("the commit wrote no row");
  }

  await expect(chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: row.id, content: OVER_CAP })).rejects.toMatchObject(REFUSED);
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).map((message) => message.content)).toEqual(["Short line."]);

  await chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: row.id, content: AT_CAP });
  const [stored] = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(stored?.content.length).toBe(MESSAGE_TEXT_MAX_CHARS);
});

test("a reasoning edit over the cap is refused and the reply keeps no reasoning", async () => {
  await using h = await textRoom(["The answer."]);
  const { chat } = h.root.services;
  await chat.send({ principal: h.owner, chatId: h.chatId, content: "Ask." });
  const reply = await firstReply(h);

  await expect(chat.editReasoning({ principal: h.owner, chatId: h.chatId, messageId: reply.id, reasoning: OVER_CAP })).rejects.toMatchObject(REFUSED);
  // Positive control: the same edit at the cap lands.
  await chat.editReasoning({ principal: h.owner, chatId: h.chatId, messageId: reply.id, reasoning: AT_CAP });
  const stored = (await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.id === reply.id);
  expect(stored?.reasoning?.length).toBe(MESSAGE_TEXT_MAX_CHARS);
});

test("a continue whose merged reply crosses the cap is refused and the reply keeps its stored body", async () => {
  const nearCap = "y".repeat(MESSAGE_TEXT_MAX_CHARS - 4);
  await using h = await textRoom([nearCap, "and then some more"]);
  const { chat } = h.root.services;
  await chat.send({ principal: h.owner, chatId: h.chatId, content: "Ask." });
  const reply = await firstReply(h);

  await expect(chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: reply.id })).rejects.toMatchObject(REFUSED);
  const stored = (await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.id === reply.id);
  expect(stored?.content).toBe(nearCap);
  expect(stored?.hasContinuation).toBe(false);
});

interface RunawayProvider extends Disposable {
  readonly execute: typeof fetch;
  /** How many chunks the reply stream handed out. */
  readonly pulled: () => number;
}

/** A provider whose chat reply streams text until its request is aborted, the way a fetch body ends on abort. */
function runawayProvider(): RunawayProvider {
  using construction = new DisposableStack();
  const fallback = construction.use(textProvider([])).execute;
  const frame = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "z".repeat(RUNAWAY_CHUNK_CHARS) } }] })}\n\n`);
  let pulled = 0;
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
      return await fallback(request);
    }
    const body = new ReadableStream<Uint8Array>({
      start: (controller): void => {
        request.signal.addEventListener("abort", () => controller.error(request.signal.reason), { once: true });
      },
      pull: (controller): void => {
        pulled += 1;
        if (pulled > RUNAWAY_PULL_BOUND) {
          controller.close();
          return;
        }
        controller.enqueue(frame);
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  };
  const lifetime = construction.move();
  return { execute, pulled: () => pulled, [Symbol.dispose]: () => lifetime.dispose() };
}

test("a model reply that streams past the cap stops its stream, is refused with the named code and stores no reply", async () => {
  using provider = runawayProvider();
  await using h = await createChatRoot({ memoryEnabled: false, providerFetch: provider.execute });
  const { chat } = h.root.services;

  await expect(chat.send({ principal: h.owner, chatId: h.chatId, content: "Tell me everything." })).rejects.toMatchObject(REFUSED);
  // The cap stopped the stream: the provider never reached the end of what it would have sent. The body pipeline
  // reads a few chunks ahead, so the stop lands a little past the cap rather than on it.
  expect(provider.pulled()).toBeGreaterThan(MESSAGE_TEXT_MAX_CHARS / RUNAWAY_CHUNK_CHARS);
  expect(provider.pulled()).toBeLessThan(RUNAWAY_PULL_BOUND);
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).map((message) => message.role)).toEqual(["user"]);
});

test("an imported chat with one over-long row imports the rest and names the refused row", async () => {
  await using h = await textRoom([]);
  const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
  const card = h.characters[0];
  if (descriptor === undefined || card === undefined) {
    throw new Error("the import needs the production chat descriptor and a seated character");
  }
  const sentAt = JSON.stringify(new Date(h.root.clock.now()).toISOString());
  const line = (user: boolean, text: string): string =>
    `{"name":${JSON.stringify(user ? h.owner.handle : card.name)},"is_user":${String(user)},"is_system":false,"mes":${JSON.stringify(text)},"send_date":${sentAt}}`;
  const header = `{"character_name":${JSON.stringify(card.name)},"user_name":${JSON.stringify(h.owner.handle)},"create_date":${sentAt}}`;
  const bytes = new TextEncoder().encode([header, line(true, "First line."), line(false, OVER_CAP), line(true, "Third line.")].join("\n"));

  const outcome = await descriptor.importFile(h.owner.userId, { filename: `${card.handle}/runaway.jsonl`, bytes });

  expect(outcome).toMatchObject({ ok: true, created: true });
  expect(outcome.ok && outcome.notes).toHaveLength(1);
  const rooms = (await h.root.services.chat.listChats({ principal: h.owner })).items;
  const imported = await Promise.all(rooms.map(async (room) => await readRoomCanon(h.root, h.owner, room.id)));
  const landed = imported.find((canon) => canon[0]?.content === "First line.");
  // The refused row's seq stays empty, so the rows around it keep their places.
  expect(landed?.map(({ content, seq }) => ({ content, seq }))).toEqual([
    { content: "First line.", seq: 1 },
    { content: "Third line.", seq: 3 },
  ]);
});
