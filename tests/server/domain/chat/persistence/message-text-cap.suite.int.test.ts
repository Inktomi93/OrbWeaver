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

/** One SillyTavern transcript line: a user or character turn, with an optional swipe pool and the swipe shown. */
interface StLine {
  readonly user: boolean;
  readonly text: string;
  readonly swipes?: readonly string[];
  readonly swipeId?: number;
}

type ChatImport = NonNullable<ReturnType<ChatRoot["root"]["app"]["portability"]["find"]>>;

/** The production chat import door and the bytes of a SillyTavern file for the room's first character. */
function stTranscript(h: ChatRoot, lines: readonly StLine[]): { readonly door: ChatImport; readonly filename: string; readonly bytes: Uint8Array } {
  const door = h.root.app.portability.find((entity) => entity.kind === "chat");
  const card = h.characters[0];
  if (door === undefined || card === undefined) {
    throw new Error("the import needs the production chat descriptor and a seated character");
  }
  const sentAt = new Date(h.root.clock.now()).toISOString();
  // SillyTavern's own field names.
  const header = { ["character_name"]: card.name, ["user_name"]: h.owner.handle, ["create_date"]: sentAt };
  const rows = lines.map((line) => ({
    name: line.user ? h.owner.handle : card.name,
    ["is_user"]: line.user,
    ["is_system"]: false,
    mes: line.text,
    ["send_date"]: sentAt,
    ...(line.swipes === undefined ? {} : { swipes: line.swipes, ["swipe_id"]: line.swipeId ?? 0 }),
  }));
  const bytes = new TextEncoder().encode([header, ...rows].map((row) => JSON.stringify(row)).join("\n"));
  return { door, filename: `${card.handle}/imported.jsonl`, bytes };
}

/** The canon of the room whose first line is `first`. */
async function importedCanon(h: ChatRoot, first: string): Promise<MessageView[]> {
  const rooms = (await h.root.services.chat.listChats({ principal: h.owner })).items;
  const canons = await Promise.all(rooms.map(async (room) => await readRoomCanon(h.root, h.owner, room.id)));
  const canon = canons.find((rows) => rows[0]?.content === first);
  if (canon === undefined) {
    throw new Error("the import landed no room with that first line");
  }
  return canon;
}

test("an imported chat with one over-long row imports the rest and names the refused row", async () => {
  await using h = await textRoom([]);
  const file = stTranscript(h, [
    { user: true, text: "First line." },
    { user: false, text: OVER_CAP },
    { user: true, text: "Third line." },
  ]);

  const outcome = await file.door.importFile(h.owner.userId, { filename: file.filename, bytes: file.bytes });

  expect(outcome).toMatchObject({ ok: true, created: true });
  expect(outcome.ok && outcome.notes).toHaveLength(1);
  // The refused row's seq stays empty, so the rows around it keep their places.
  expect((await importedCanon(h, "First line.")).map(({ content, seq }) => ({ content, seq }))).toEqual([
    { content: "First line.", seq: 1 },
    { content: "Third line.", seq: 3 },
  ]);
});

test("an import that refuses a swipe keeps the kept swipes' positions dense, so a later swipe of that message lands", async () => {
  await using h = await textRoom(["Swiped onto the first.", "Swiped onto the second."]);
  const { chat } = h.root.services;
  // The refused swipe is the shown one in the first reply, and sits between two kept swipes in the second.
  const file = stTranscript(h, [
    { user: true, text: "Opening." },
    { user: false, text: OVER_CAP, swipes: [OVER_CAP, "Kept after a refused first."], swipeId: 0 },
    { user: true, text: "Again." },
    { user: false, text: "Kept last.", swipes: ["Kept first.", OVER_CAP, "Kept last."], swipeId: 2 },
  ]);

  const outcome = await file.door.importFile(h.owner.userId, { filename: file.filename, bytes: file.bytes });

  expect(outcome).toMatchObject({ ok: true, created: true });
  expect(outcome.ok && outcome.notes).toHaveLength(2);
  const [, first, , second] = await importedCanon(h, "Opening.");
  if (first === undefined || second === undefined) {
    throw new Error("the import landed fewer than four rows");
  }
  // A refused shown swipe hands the selection to the first kept swipe; a kept shown swipe stays shown at its new place.
  expect({ content: first.content, idx: first.selectedVariantIdx }).toEqual({ content: "Kept after a refused first.", idx: 0 });
  expect({ content: second.content, idx: second.selectedVariantIdx }).toEqual({ content: "Kept last.", idx: 1 });

  for (const message of [first, second]) {
    await chat.swipe({ principal: h.owner, chatId: message.chatId, messageId: message.id });
  }
  const positions = await Promise.all(
    [first, second].map(async (message) =>
      (await chat.listMessageVariants({ principal: h.owner, chatId: message.chatId, messageId: message.id })).map(({ idx }) => idx),
    ),
  );
  expect(positions).toEqual([
    [0, 1],
    [0, 1, 2],
  ]);

  // The same file again is the same import: held, not landed twice.
  const again = await file.door.importFile(h.owner.userId, { filename: file.filename, bytes: file.bytes });
  expect(again).toMatchObject({ ok: true, created: false });
  expect((await chat.listChats({ principal: h.owner })).items.filter((room) => room.id === first.chatId)).toHaveLength(1);
});
