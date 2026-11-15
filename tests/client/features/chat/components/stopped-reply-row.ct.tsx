// A reply the reader stopped mid-stream stays in the room as an ordinary tail row: it can be continued, swiped,
// edited and deleted like any finished reply. Across the Stop itself, the streamed text never leaves the screen, the
// transcript never shrinks while the streaming bubble hands over to the kept row, and the bubble does not stay behind a
// kept row that was deleted before this page saw it.
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  ROOM_PROCEDURES,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_CONTINUE_REPLY_NAME, CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME, CHAT_STOP_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
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

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** A corpus room with a character reply, its chat turns bound to the loopback corpus endpoint. */
async function streamingRoom(root: Harness): Promise<{ readonly caller: Caller; readonly room: { readonly id: ChatId } }> {
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
  for (const chat of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: chat.id, limit: 6 });
    if (messages.some((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard")) {
      return { caller, room: chat };
    }
  }
  throw new Error("Corpus needs a room with a character reply");
}

test("a reply stopped after streamed text stays as the tail row and offers continue, swipe, edit and delete", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { providerFetch });
  const principal = await root.principalFor(root.ownerId);
  const { caller, room } = await streamingRoom(root);
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

/** One frame of the transcript as painted: how often the stopped reply's text shows, whether the streaming bubble and
 *  the kept row are mounted, and the list's height. */
interface PaintedFrame {
  readonly copies: number;
  readonly bubble: boolean;
  readonly kept: boolean;
  readonly scrollHeight: number;
}

// A frame may shrink the list by this much without counting as a jump: sub-pixel rounding and a caret leaving.
const SHRINK_TOLERANCE_PX = 8;
// Frames sampled after the kept row first shows, long enough for a second render of the reply to paint.
const FRAMES_PAST_SWAP = 30;
const BUBBLE = '[data-slot="ghost-message-row"]';

/** A live room on the page: the corpus root runs the turn, and its bus reaches the page in socket bodies. A connection
 *  opened before the text streamed carries the turn up to it; one opened after waits for `final`. Every body replays the
 *  events so far, which the client drops below its cursor, so a connection the page abandons on open loses nothing. */
async function openLiveRoom(
  page: Page,
  corpus: Parameters<typeof createShellAmbientReads>[0],
  root: Harness,
  final: (events: readonly ChatBusEvent[]) => boolean,
): Promise<{ readonly chatId: ChatId; readonly keptId: () => MessageId | null } & Disposable> {
  const { caller, room } = await streamingRoom(root);
  const chatId = room.id;
  const events: StreamFrame[] = [];
  const seen: ChatBusEvent[] = [];
  const streamed = Promise.withResolvers<void>();
  const settled = Promise.withResolvers<void>();
  let textStreamed = false;
  let keptId: MessageId | null = null;
  const unsubscribe = root.app.liveBuses.chat.subscribeAllChatEvents(({ event, seq }: { event: ChatBusEvent; seq: number | null }) => {
    if (event.chatId !== chatId) {
      return;
    }
    events.push({ channel: "chat", chatId, seq, event });
    seen.push(event);
    if (event.type === "delta" && event.delta.kind === "text" && event.delta.text.includes(KEPT)) {
      textStreamed = true;
      streamed.resolve();
    }
    if (event.type === "messageCommitted" && event.view?.role === "assistant") {
      keptId = event.messageId;
    }
    if (final(seen)) {
      settled.resolve();
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SHELL_MOUNT_PROCEDURES,
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "rpg.getGame",
      "rpg.listTurnToolCalls",
      "chat.send",
      "chat.abort",
    ]),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId !== chatId ? trpcError({ code: "NOT_FOUND" }) : null),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId !== chatId ? trpcError({ code: "NOT_FOUND" }) : null),
  });
  await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }],
    // Every body but the last ends without a close, so the page reconnects for the next one.
    dropConnectionCount: 2,
    frames: async (): Promise<readonly StreamFrame[]> => {
      await (textStreamed ? settled.promise : streamed.promise);
      return [...events];
    },
  });
  return { chatId, keptId: () => keptId, [Symbol.dispose]: unsubscribe };
}

/** Send from the composer and wait until the streaming bubble shows the reply's text. */
async function sendUntilStreamed(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill("Open the door.");
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
  await expect(page.locator(BUBBLE)).toContainText(KEPT);
}

test("across a Stop, the streamed text stays painted once and the transcript never shrinks while the kept row takes over", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { providerFetch });
  using live = await openLiveRoom(page, corpus, root, (events) => events.some((event) => event.type === "turnAborted"));
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: live.chatId, socket: true });
  await sendUntilStreamed(page);

  // Sample every painted frame from the press until some frames past the first one with the kept row.
  const sampling = page.evaluate(
    async ({ text, bubble, past }): Promise<readonly PaintedFrame[]> => {
      const frames: PaintedFrame[] = [];
      const scroller = document.querySelector('[data-slot="message-list-scroll"]');
      if (scroller === null) {
        throw new Error("the transcript has no scroller");
      }
      const keptRow = (): boolean => [...document.querySelectorAll('[data-slot="message-row"]')].some((row) => row.textContent.includes(text));
      const deadline = performance.now() + 10_000;
      let remaining: number | null = null;
      for (;;) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const kept = keptRow();
        frames.push({
          copies: scroller.textContent.split(text).length - 1,
          bubble: document.querySelector(bubble) !== null,
          kept,
          scrollHeight: scroller.scrollHeight,
        });
        if (remaining !== null) {
          remaining -= 1;
        } else if (kept) {
          remaining = past;
        }
        if (remaining === 0 || performance.now() > deadline) {
          return frames;
        }
      }
    },
    { text: KEPT, bubble: BUBBLE, past: FRAMES_PAST_SWAP },
  );
  const before = await page.locator('[data-slot="message-list-scroll"]').evaluate((node) => node.scrollHeight);
  await page.getByRole("button", { name: CHAT_STOP_NAME, exact: true }).click();
  const frames = await sampling;
  const swap = frames.findIndex((frame) => frame.kept);
  expect(swap).toBeGreaterThanOrEqual(0);
  expect(frames.filter((frame) => frame.copies === 0)).toEqual([]);
  expect(frames.filter((frame) => frame.scrollHeight < before - SHRINK_TOLERANCE_PX)).toEqual([]);
  // From the swap on, the kept row alone carries the reply: the bubble has left and the text shows exactly once.
  expect(frames.slice(swap).filter((frame) => frame.bubble || frame.copies !== 1)).toEqual([]);
  expect(frames.length - swap).toBeGreaterThan(FRAMES_PAST_SWAP);
});

test("a kept reply deleted before this page heard of it leaves no streaming bubble behind", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { providerFetch });
  const principal = await root.principalFor(root.ownerId);
  // The page's last body carries the commit, the Stop and the delete together, as a socket that lagged would replay them.
  using live = await openLiveRoom(page, corpus, root, (events) => events.some((event) => event.type === "messagesDeleted"));
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: live.chatId, socket: true });
  await sendUntilStreamed(page);
  // Another device stops the reply, keeping it, and then deletes the kept row.
  await root.services.chat.abort({ principal, chatId: live.chatId });
  // The abort returns once the turn is told to stop; its kept row commits after.
  await expect.poll(() => live.keptId()).not.toBeNull();
  const keptId = live.keptId();
  if (keptId === null) {
    throw new Error("the stopped turn kept no reply");
  }
  await root.services.chat.deleteMessages({ principal, chatId: live.chatId, messageIds: [keptId] });

  // The turn is closed on the page once the composer offers Send again; positive control that the last body landed.
  await expect(page.getByRole("button", { name: CHAT_SEND_NAME, exact: true })).toBeVisible();
  await expect(page.locator(BUBBLE)).toHaveCount(0);
  await expect(page.locator('[data-slot="message-row"]', { hasText: KEPT })).toHaveCount(0);
});
