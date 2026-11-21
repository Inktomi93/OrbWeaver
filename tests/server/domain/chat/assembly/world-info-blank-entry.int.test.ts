// @subject packages/server/src/domain/chat/assembly/context.ts
// @subject packages/contracts/src/world-info/schemas.ts
// A lore entry the user has written no text for is not sent to the model. The New entry click saves a title and no
// content, so the entry the user has not yet written stays out of the prompt, whatever script or format would otherwise
// give its empty body text.

import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const WRITTEN = "WRITTEN-LORE";
const SCRIPTED = "SCRIPT-FILLED";

async function room(): Promise<Awaited<ReturnType<typeof createChatRoot>>> {
  await using construction = new AsyncDisposableStack();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      characters: [createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." })],
      providerFetch: (input, init) => physical.execute(new Request(input, init)),
    }),
  );
  construction.move();
  return h;
}

const completionSchema = z.object({ messages: z.array(z.object({ content: z.union([z.string(), z.array(z.looseObject({ text: z.string().optional() }))]) })) });

/** Send a turn and read every message of the prompt the provider received, as one text. */
async function sendAndReadWire(h: Awaited<ReturnType<typeof room>>): Promise<string> {
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "we sail on" });
  expect(outcome.aborted).toBe(false);
  const generation = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(generation).toHaveLength(1);
  const body = completionSchema.parse(JSON.parse(await present(generation[0]).text()));
  return body.messages
    .map((message) => (typeof message.content === "string" ? message.content : message.content.map((part) => part.text ?? "").join("")))
    .join("\n");
}

test("an entry with no text is not sent, and the entry beside it that has text is", async () => {
  await using h = await room();
  const book = await h.caller.worldInfo.createBook({ input: createBookSchema.parse({ name: "Lamps" }) });
  // The first two are what the New entry click and a cleared editor leave behind; the third is the control.
  await h.caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: "New entry", content: "" }) });
  await h.caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: "Spaces", content: "  \n " }) });
  await h.caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: "Written", content: WRITTEN }) });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  const wire = await sendAndReadWire(h);
  expect(wire).toContain(WRITTEN);
  const entries = await h.caller.worldInfo.listEntries({ bookId: book.id });
  expect(entries.map((entry) => entry.content)).toEqual(expect.arrayContaining(["", "  \n ", WRITTEN]));
  // The blank entries are enabled and always-on: only their empty text keeps them out, so none of their titles or wrapper rode along.
  expect(entries.filter((entry) => entry.enabled)).toHaveLength(3);
});

test("a script cannot give an entry with no text its body", async () => {
  await using h = await room();
  const script = await h.caller.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "fill empty lore", findRegex: "/^$/", replaceString: SCRIPTED, targets: ["WORLD_INFO"], passes: ["prompt"] }),
  });
  await h.caller.regex.attachGlobal({ scriptId: script.id });
  const book = await h.caller.worldInfo.createBook({ input: createBookSchema.parse({ name: "Lamps" }) });
  await h.caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: "New entry", content: "" }) });
  await h.caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: "Written", content: WRITTEN }) });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  const wire = await sendAndReadWire(h);
  expect(wire).toContain(WRITTEN);
  expect(wire).not.toContain(SCRIPTED);
});
