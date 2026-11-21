// @subject packages/client/src/features/chat/components/variant-wire-viewer.tsx
// What this reply sent lists the chat's injection and the world info seated at the top and bottom of its injections,
// in the order a real turn placed them, each naming where it came from. The turn runs on the composed server; the
// viewer reads its stored prompt through the production verb.

import { createCharacterSchema } from "@orb/contracts/character";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { sentInjectionLabel } from "#client/lib/injections-label.ts";
import type { VariantWireViewerStory } from "./_chat-reads-boundary-stories.tsx";

const STORIES = "tests/client/features/chat/components/_chat-reads-boundary-stories";
const SHELL_READS = ["sessions.me", "settings.getUserSettings", "connection.list", "connection.listBindings"] as const;
const NOTE = "NOTE-BODY";
const TOP = "TOPSEAT-LORE";
const BOTTOM = "BOTTOMSEAT-LORE";
// SillyTavern's own slot numbers for the top and bottom of the Author's Note.
const WORLD_FILE = JSON.stringify({
  entries: Object.fromEntries(
    [
      { content: TOP, slot: 2 },
      { content: BOTTOM, slot: 3 },
    ].map((entry, uid) => [
      String(uid),
      {
        uid,
        key: ["harbor"],
        keysecondary: [],
        comment: entry.content,
        content: entry.content,
        order: 100,
        position: entry.slot,
        disable: false,
        constant: true,
      },
    ]),
  ),
});

test("a real turn's prompt view lists the chat injection and its seated world info, top to bottom", async ({ mount, page }) => {
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
  const imported = await h.root.services.worldInfo.importFile({ principal: h.owner, filename: "Seats.json", fileText: WORLD_FILE });
  expect(imported.ok).toBe(true);
  const [book] = await h.root.services.worldInfo.listBooks({ principal: h.owner });
  if (book === undefined) {
    throw new Error("the imported world did not persist");
  }
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  await h.caller.chat.setChatInjection({ chatId: h.chatId, position: "in_chat", role: "system", depth: 2, order: 0, content: NOTE });
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "we sail on" });
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the turn produced no assistant message");
  }
  await routeTrpc(page, serveCorpusProcedures(h.caller, [...SHELL_READS, "chat.getVariantWire"]));
  await mount<typeof VariantWireViewerStory>(`${STORIES}/VariantWireViewerStory`, { chatId: h.chatId, variantId: assistant.selectedVariantId });

  const dialog = page.getByRole("dialog");
  const top = `${sentInjectionLabel({ origin: "world-info", seatedAt: "top" })} · system @ depth`;
  const note = `${sentInjectionLabel({ origin: "user" })} · system @ depth`;
  const bottom = `${sentInjectionLabel({ origin: "world-info", seatedAt: "bottom" })} · system @ depth`;
  await expect(dialog).toContainText(TOP);
  const shown = (await dialog.textContent()) ?? "";
  const at = [top, note, bottom].map((line) => shown.indexOf(line));
  expect(nonEmpty(at).every((index) => index >= 0)).toBe(true);
  expect(at).toEqual(at.toSorted((a, b) => a - b));
  expect(shown.indexOf(NOTE)).toBeGreaterThan(shown.indexOf(TOP));
  expect(shown.indexOf(BOTTOM)).toBeGreaterThan(shown.indexOf(NOTE));
});
