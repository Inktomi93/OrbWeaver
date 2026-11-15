// A reply the reader stopped mid-stream stays in the room as an ordinary tail row: it can be continued, swiped,
// edited and deleted like any finished reply.
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { CHAT_CONTINUE_REPLY_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_EDIT_NAME, VARIANT_GENERATE_NAME } from "#client/features/chat/lib/message-action-names.ts";
import { ROW_DELETE_NAME } from "#client/lib/row-menu-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const KEPT = "The lantern gutters as the door";

/** The provider's stream: one prose frame, then an open response that ends only when the turn's own Stop closes it. */
function partialThenHeld(request: Request): Response {
  const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: KEPT } }] })}\n\n`;
  let sent = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller): Promise<void> {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode(frame));
          return;
        }
        const stopped = Promise.withResolvers<never>();
        request.signal.addEventListener("abort", () => stopped.reject(request.signal.reason), { once: true });
        request.signal.throwIfAborted();
        await stopped.promise;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

// The room's recall still embeds the turn's query; only the reply stream is the case's script.
const embeddings = createCorpusProviderExecution({
  modelIds: [CORPUS_EMBED_MODEL],
  embedding: CORPUS_EMBEDDING_VECTOR,
  chatText: "",
  structuredReplies: new Map(),
  images: [],
});

function providerFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
    return Promise.resolve(partialThenHeld(request));
  }
  return embeddings.execute(request);
}

test("a reply stopped after streamed text stays as the tail row and offers continue, swipe, edit and delete", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { providerFetch });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  // The corpus binds chat to a hosted provider; the case's reply comes from the loopback corpus endpoint instead.
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  let room: { readonly id: Parameters<typeof caller.chat.getChat>[0]["chatId"] } | undefined;
  for (const chat of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: chat.id, limit: 6 });
    if (messages.some((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard")) {
      room = chat;
      break;
    }
  }
  if (room === undefined) {
    throw new Error("Corpus needs a room with a character reply");
  }
  const streamed = Promise.withResolvers<void>();
  const unsubscribe = root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === room.id && event.type === "delta" && event.delta.kind === "text" && event.delta.text.includes(KEPT)) {
      streamed.resolve();
    }
  });
  let outcome: Awaited<ReturnType<typeof root.services.chat.send>>;
  try {
    const running = root.services.chat.send({ principal, chatId: room.id, content: "Open the door.", timeZone: UTC_TIME_ZONE });
    await Promise.race([
      streamed.promise,
      running.then(() => {
        throw new Error("the turn settled before its streamed text");
      }),
    ]);
    await root.services.chat.abort({ principal, chatId: room.id });
    outcome = await running;
  } finally {
    unsubscribe();
  }
  const kept = outcome.messages.find(({ role }) => role === "assistant");
  expect(outcome).toMatchObject({ aborted: true, abortReason: "user" });
  if (kept === undefined) {
    throw new Error("the stopped turn kept no reply");
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });
  const row = page.locator(`[data-slot="message-row"][data-message-id="${kept.id}"]`);
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator('[data-slot="message-bubble"]')).toContainText(KEPT);

  // Continue targets the tail reply, which is the stopped one.
  await expect(page.getByRole("button", { name: CHAT_CONTINUE_REPLY_NAME, exact: true })).toBeEnabled();
  await expect(row.getByRole("button", { name: VARIANT_GENERATE_NAME, exact: true })).toBeEnabled();
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_EDIT_NAME, exact: true }).click();
  await expect(row.getByRole("textbox")).toHaveValue(KEPT);
  await page.keyboard.press("Escape");
  await expect(row.getByRole("textbox")).toHaveCount(0);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true }).click();
  await page.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
});
