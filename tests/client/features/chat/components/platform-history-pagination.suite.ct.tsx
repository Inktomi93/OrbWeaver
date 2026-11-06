// Ordinary Chats pages real persisted canon without entering a Corpus source window.

import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState, settledBox, settledReadingRow } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  holdServed,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_HISTORY_RETRY_NAME, CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const EXTRA_ROWS = 115;
// The transcript's own busy state: a loading Earlier messages carries `aria-busy` too.
const TRANSCRIPT_BUSY = '[aria-busy]:not([data-slot="button"])';
const ARRIVALS = 55;
type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof createCorpusHarness>>["internalCallerFor"]>>;

type HistoryPage = Awaited<ReturnType<Caller["chat"]["listMessages"]>>;
type CanonMessage = HistoryPage["messages"][number];
type ListedRoom = Awaited<ReturnType<Caller["chat"]["listChats"]>>["items"][number];
interface HistoryFixture {
  readonly rooms: readonly ListedRoom[];
  readonly room: ListedRoom;
  readonly other: ListedRoom;
  readonly original: CanonMessage;
  readonly otherTail: CanonMessage;
  readonly tail: HistoryPage;
  readonly anchor: CanonMessage;
  readonly loadedFirst: CanonMessage;
  readonly removed: CanonMessage;
}

async function commitArrivals(caller: Caller, chatId: ChatId): Promise<readonly CanonMessage[]> {
  const messages: CanonMessage[] = [];
  for (let index = 0; index < ARRIVALS; index++) {
    const outcome = await caller.chat.commitMessage({ chatId, content: `New live history arrival ${index + 1}`, timeZone: UTC_TIME_ZONE });
    messages.push(...outcome.messages);
  }
  return messages;
}

async function prepareHistory(caller: Caller): Promise<HistoryFixture> {
  const rooms = (await caller.chat.listChats({ limit: 2 })).items;
  const room = rooms[0];
  const other = rooms[1];
  if (room === undefined || other === undefined) {
    throw new Error("The corpus needs two rooms");
  }
  const original = (await caller.chat.listMessages({ chatId: room.id })).messages[0];
  const otherTail = (await caller.chat.commitMessage({ chatId: other.id, content: "A short room keeps its own canon.", timeZone: UTC_TIME_ZONE })).messages.at(
    -1,
  );
  if (original === undefined || otherTail === undefined) {
    throw new Error("Both rooms need their persisted reading witnesses");
  }
  for (let index = 0; index < EXTRA_ROWS; index++) {
    await caller.chat.commitMessage({
      chatId: room.id,
      content: `History pagination witness ${index + 1}. The observatory lantern burns through the rain.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  const tail = await caller.chat.listMessages({ chatId: room.id });
  const anchor = tail.messages[0];
  if (anchor === undefined || tail.previousCursor === null) {
    throw new Error("The production tail needs an earlier page");
  }
  const previous = await caller.chat.listMessages({ chatId: room.id, cursor: tail.previousCursor });
  const loadedFirst = previous.messages[0];
  const removed = previous.messages[1];
  if (loadedFirst === undefined || removed === undefined) {
    throw new Error("The earlier page needs two reading witnesses");
  }
  return { rooms, room, other, original, otherTail, tail, anchor, loadedFirst, removed };
}

type ChatEvents = ReturnType<Awaited<ReturnType<typeof createCorpusHarness>>["app"]["liveBuses"]["chat"]["subscribeChatEvents"]>;

async function throughDeletion(events: ChatEvents, chatId: ChatId): Promise<StreamFrame[]> {
  const frames: StreamFrame[] = [];
  for await (const entry of events) {
    if (entry.event.type !== "messageCommitted" && entry.event.type !== "messageEdited" && entry.event.type !== "messagesDeleted") {
      continue;
    }
    if (entry.seq === null) {
      throw new Error("A persisted canon event needs its durable sequence");
    }
    frames.push({ channel: "chat", chatId, seq: entry.seq, event: entry.event });
    if (entry.event.type === "messagesDeleted") {
      return frames;
    }
  }
  return frames;
}

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type ListMessagesIntercept = Parameters<typeof serveCorpusProcedures<"chat.listMessages">>[2];
type CorpusPlayback = Parameters<typeof createShellAmbientReads>[0];

interface LiveRoomOptions {
  readonly root: Root;
  readonly caller: Caller;
  readonly corpus: CorpusPlayback;
  readonly page: Page;
  readonly rooms: readonly ListedRoom[];
  readonly chatId: ChatId;
  readonly chatStyle: "flat" | "document";
  readonly intercept: ListMessagesIntercept;
}

interface LiveRoom extends AsyncDisposable {
  /** How many `chat.listMessages` reads the room has served. */
  readonly reads: () => number;
  readonly settle: () => Promise<void>;
}

/** A served room on its live socket. `settle` commits and removes a row so the bus invalidates the room's reads. */
async function serveLiveRoom({ root, caller, corpus, page, rooms, chatId, chatStyle, intercept }: LiveRoomOptions): Promise<LiveRoom> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({ chatStyle, backgroundImageKind: "none" }) });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  const calls = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls", "notifications.presence"]),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], intercept),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && rooms.some((row) => row.id === ref.chatId) ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && rooms.some((row) => row.id === ref.chatId) ? null : trpcError({ code: "NOT_FOUND" })),
  });
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const stop = new AbortController();
  let started = false;
  await routeOrbSocket(page, {
    awaitAttaches: 1,
    frames: async (signal) => {
      started = true;
      const events = root.app.liveBuses.chat.subscribeChatEvents(chatId, AbortSignal.any([signal, stop.signal]));
      listening.resolve();
      try {
        return await throughDeletion(events, chatId);
      } catch (error) {
        if (!stop.signal.aborted) {
          throw error;
        }
        return [];
      } finally {
        joined.resolve();
      }
    },
  });
  return {
    reads: (): number => calls.count("chat.listMessages"),
    settle: async (): Promise<void> => {
      await listening.promise;
      const [message] = (await caller.chat.commitMessage({ chatId, content: "A row that lands while the older reads are down.", timeZone: UTC_TIME_ZONE }))
        .messages;
      if (message === undefined) {
        throw new Error("The commit returned no row");
      }
      await caller.chat.deleteMessages({ chatId, messageIds: [message.id] });
      await joined.promise;
    },
    [Symbol.asyncDispose]: async (): Promise<void> => {
      stop.abort();
      if (started) {
        await joined.promise;
      }
    },
  };
}

function historyRoot(): Promise<Root> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  return createCorpusHarness(undefined, { providerFetch: provider.execute });
}

function loadedRows(list: Locator): Promise<string | null> {
  return list.locator('[data-slot="message-list-row"]').first().getAttribute("aria-setsize");
}

for (const regime of [
  { viewport: { width: 1280, height: 900 }, chatStyle: "flat", coarse: false },
  { viewport: { width: 390, height: 844 }, chatStyle: "document", coarse: true },
] as const) {
  test.describe(`${regime.viewport.width}x${regime.viewport.height} ${regime.chatStyle}`, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });
    test("ordinary history reaches its original canon, preserves the prepend anchor and scopes pages to the room", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, other, original, otherTail, tail, anchor, loadedFirst, removed } = await prepareHistory(caller);
      expect(tail.messages.some((message) => message.id === original.id)).toBe(false);
      await caller.settings.updateUserSettingsSection({
        section: "appearance",
        patch: appearanceSettingsSchema.parse({ chatStyle: regime.chatStyle, backgroundImageKind: "none" }),
      });
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      const auth = await root.http.request("/api/auth/config");
      const authBody = await auth.text();
      await routeAuthConfig(page, authBody);
      const refresh = holdServed();
      let holdReads = false;
      await using heldRefresh = new AsyncDisposableStack();
      heldRefresh.defer(refresh.release);
      const calls = await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls", "notifications.presence"]),
        ...serveCorpusProcedures(caller, ["chat.listMessages"], ({ chatId }) => (holdReads && chatId === room.id ? refresh : undefined)),
        "stream.attach": ({ ref }) => (ref.channel === "chat" && rooms.some((row) => row.id === ref.chatId) ? null : trpcError({ code: "NOT_FOUND" })),
        "stream.detach": ({ ref }) => (ref.channel === "chat" && rooms.some((row) => row.id === ref.chatId) ? null : trpcError({ code: "NOT_FOUND" })),
      });
      const listening = Promise.withResolvers<void>();
      const joined = Promise.withResolvers<void>();
      const stop = new AbortController();
      let started = false;
      await using subscription = new AsyncDisposableStack();
      subscription.defer(async () => {
        stop.abort();
        if (started) {
          await joined.promise;
        }
      });
      await routeOrbSocket(page, {
        awaitAttaches: 1,
        frames: async (signal) => {
          started = true;
          const events = root.app.liveBuses.chat.subscribeChatEvents(room.id, AbortSignal.any([signal, stop.signal]));
          listening.resolve();
          try {
            return await throughDeletion(events, room.id);
          } catch (error) {
            if (!stop.signal.aborted) {
              throw error;
            }
            return [];
          } finally {
            joined.resolve();
          }
        },
      });
      const mounted = await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const port = page.locator('[data-slot="message-list-scroll"]');
      const earlier = page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeVisible();
      await port.evaluate((node) => {
        node.scrollTop = 0;
      });
      const reading = page.locator(`[data-slot="message-row"][data-message-id="${anchor.id}"]`);
      await expect(reading).toBeVisible();
      const before = await settledBox(reading);
      await page.screenshot({ path: test.info().outputPath("long-history-earlier-affordance.png") });
      const beforeRequests = calls.count("chat.listMessages");
      await earlier.click();
      await expect.poll(() => calls.count("chat.listMessages")).toBeGreaterThan(beforeRequests);
      await expect(earlier).toBeEnabled();
      await expect(page.getByRole("button", { name: /^Jump to latest/u })).toHaveCount(0);
      await expect
        .poll(async () => {
          const after = await reading.boundingBox();
          return after === null ? Number.POSITIVE_INFINITY : Math.abs(after.y - before.y);
        })
        .toBeLessThanOrEqual(1);
      const canonical = page.locator(`[data-slot="message-row"][data-message-id="${loadedFirst.id}"]`);
      const deleted = page.locator(`[data-slot="message-row"][data-message-id="${removed.id}"]`);
      await page.getByRole("listitem").filter({ has: reading }).focus();
      await page.keyboard.press("Home");
      await expect(canonical).toBeVisible();
      await expect(canonical).toContainText(loadedFirst.content);
      await expect(deleted).toBeVisible();
      expect(calls.count("chat.listMessages")).toBeGreaterThan(1);
      await listening.promise;
      await page.screenshot({ path: test.info().outputPath("long-history-reading.png") });
      const stable = await settledBox(canonical);
      holdReads = true;
      const arrivals = await commitArrivals(caller, room.id);
      await caller.chat.editMessage({ chatId: room.id, messageId: loadedFirst.id, content: "Edited oldest history witness", timeZone: UTC_TIME_ZONE });
      await caller.chat.deleteMessages({ chatId: room.id, messageIds: [removed.id] });
      await joined.promise;
      await refresh.requested;
      await expect(canonical).toContainText("Edited oldest history witness");
      await expect(deleted).toHaveCount(0);
      const jump = page.getByRole("button", { name: `Jump to latest, ${ARRIVALS} new messages`, exact: true });
      await expect(jump).toBeVisible();
      await expect
        .poll(async () => {
          const after = await canonical.boundingBox();
          return after === null ? Number.POSITIVE_INFINITY : Math.abs(after.y - stable.y);
        })
        .toBeLessThanOrEqual(1);
      holdReads = false;
      refresh.release();
      await expect(page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY)).toHaveAttribute("aria-busy", "false");
      await expect(canonical).toContainText("Edited oldest history witness");
      await expect(deleted).toHaveCount(0);
      await jump.click();
      const last = arrivals.at(-1);
      if (last === undefined) {
        throw new Error("The native arrival batch is empty");
      }
      const newest = page.locator(`[data-message-id="${last.id}"]`);
      await expect(newest).toBeVisible();
      await expect(jump).toHaveCount(0);
      await page.getByRole("listitem").filter({ has: newest }).focus();
      for (const arrival of arrivals.toReversed().slice(1)) {
        await page.keyboard.press("ArrowUp");
        await expect(page.getByRole("listitem").filter({ has: page.locator(`[data-message-id="${arrival.id}"]`) })).toBeFocused();
      }
      await earlier.click();
      await expect(page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY)).toHaveAttribute("aria-busy", "false");
      await expect(earlier).toBeDisabled();
      // The end of history is on screen, not only announced: its statement is a laid-out box, not the 1px screen-reader clip.
      const endStatement = page.locator(`[id="${(await earlier.getAttribute("aria-describedby")) ?? ""}"]`);
      await expect(endStatement).toBeVisible();
      const endBox = await endStatement.boundingBox();
      expect(endBox?.height ?? 0).toBeGreaterThan(1);
      expect(endBox?.width ?? 0).toBeGreaterThan(1);
      const firstArrival = arrivals[0] ?? last;
      await page
        .getByRole("listitem")
        .filter({ has: page.locator(`[data-message-id="${firstArrival.id}"]`) })
        .focus();
      await page.keyboard.press("Home");
      await expect(page.locator(`[data-message-id="${original.id}"]`)).toContainText(original.content);
      await mounted.update({ chatId: other.id, socket: true });
      const otherWitness = page.locator(`[data-message-id="${otherTail.id}"]`);
      await expect(otherWitness).toBeVisible();
      await expect(earlier).toHaveCount(0);
      await page.evaluate(async () => {
        if ("activeViewTransition" in document) {
          await document.activeViewTransition?.finished;
        }
        await Promise.allSettled(
          document
            .getAnimations()
            .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
            .map((animation) => animation.finished),
        );
      });
      await page.screenshot({ path: test.info().outputPath("short-room-no-history-chrome.png") });
      await expect(page.locator(`[data-message-id="${original.id}"]`)).toHaveCount(0);
      await mounted.update({ chatId: room.id, socket: true });
      await expect(earlier).toBeDisabled();
      await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
    });
    test("a failed refresh reports without moving or pinning, a press still pages, and recovery wastes no press", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room } = await prepareHistory(caller);
      let failing = false;
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => (failing && cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      const reading = list.locator(`[data-slot="message-row"][data-message-id="${(await settledReadingRow(list)).id ?? ""}"]`);
      const { y } = await settledBox(reading);
      failing = true;
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toBeAttached();
      await expect(alert).not.toBeInViewport();
      await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
      await expect(list.getByRole("button", { name: CHAT_HISTORY_RETRY_NAME, exact: true })).toBeAttached();
      // The press asks for older rows even through a failed refresh, so what it reports is its own failure.
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect(alert).toBeInViewport({ ratio: 1 });
      await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
      failing = false;
      const reads = live.reads();
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      await expect(alert).toHaveCount(0);
      await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
      // The landed page and then the refresh the outage cost: the loaded pages are read again.
      await expect.poll(() => live.reads()).toBeGreaterThan(reads + 1);
      await page.screenshot({ path: test.info().outputPath("recovered-refresh.png") });
    });
    test("a failed refresh leaves a reader at the tail on the tail", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(caller);
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const last = tail.messages.at(-1);
      if (last === undefined) {
        throw new Error("The tail is empty");
      }
      const newest = list.locator(`[data-slot="message-row"][data-message-id="${last.id}"]`);
      const before = await settledBox(newest);
      await live.settle();
      await expect(list.getByRole("alert")).toBeAttached();
      await expect
        .poll(async () => {
          const after = await settledBox(newest);
          return Math.abs(after.y - before.y);
        })
        .toBeLessThanOrEqual(1);
    });
    test("a failed refresh in a room with nothing older keeps its own way to retry", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, other } = await prepareHistory(caller);
      let failing = true;
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: other.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => (failing && cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: other.id, socket: true });
      await expect(page.locator('[data-slot="message-list-row"]').first()).toBeVisible();
      await live.settle();
      const list = page.locator('[data-slot="message-list-scroll"]');
      const alert = list.getByRole("alert");
      await expect(alert).toBeAttached();
      await expect(list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeDisabled();
      failing = false;
      await list.getByRole("button", { name: CHAT_HISTORY_RETRY_NAME, exact: true }).dispatchEvent("click");
      await expect(alert).toHaveCount(0);
    });
    test("a failed bridge reports once, reads nothing more until asked, and its retry reaches the tail", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room } = await prepareHistory(caller);
      let failing = false;
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => (failing && cursor?.kind === "after" ? trpcError({ code: "BAD_REQUEST" }) : undefined),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      failing = true;
      await commitArrivals(caller, room.id);
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toBeAttached();
      await expect(alert).not.toBeInViewport();
      await expect(page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY)).toHaveAttribute("aria-busy", "false");
      const reads = live.reads();
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 500)));
      expect(live.reads()).toBe(reads);
      failing = false;
      await list.getByRole("button", { name: CHAT_HISTORY_RETRY_NAME, exact: true }).dispatchEvent("click");
      await expect(alert).toHaveCount(0);
      await expect(page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY)).toHaveAttribute("aria-busy", "false");
    });
    test("a newly created room renders its complete warm opening while confirmation is held", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "history-warm-opening",
          name: "History warm opening",
          description: "A keeper greets the reader in a new room.",
          greetings: [{ text: "A fresh greeting has no unseen history." }],
        }),
      });
      await caller.settings.updateUserSettingsSection({
        section: "appearance",
        patch: appearanceSettingsSchema.parse({ chatStyle: regime.chatStyle, backgroundImageKind: "none" }),
      });
      const initial = await caller.chat.startChat({ characterIds: [card.id] });
      const before = initial.opening?.messages[0];
      if (before === undefined) {
        throw new Error("The real creation needs its seeded greeting");
      }
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      const confirmation = holdServed();
      await using held = new AsyncDisposableStack();
      held.defer(confirmation.release);
      const calls = await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [
          ...SECTION_PROCEDURES,
          ...ROOM_PROCEDURES,
          "chat.startChat",
          "chat.reapHusk",
          "rpg.getGame",
          "rpg.listTurnToolCalls",
        ]),
        ...serveCorpusProcedures(caller, ["chat.listMessages"], ({ chatId }) => (chatId === initial.chat.id ? undefined : confirmation)),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: initial.chat.id });
      await expect(page.locator(`[data-message-id="${before.id}"]`)).toBeVisible();
      await page.getByRole("button", { name: "Chat options", exact: true }).click();
      await page.getByRole("menuitem", { name: "New chat with the same characters", exact: true }).click();
      await confirmation.requested;
      const requested = calls.lastInput("chat.listMessages");
      if (requested === undefined) {
        throw new Error("The new room never requested confirmation");
      }
      expect(requested.chatId).not.toBe(initial.chat.id);
      const pageData = await caller.chat.listMessages({ chatId: requested.chatId });
      const opening = pageData.messages[0];
      if (opening === undefined) {
        throw new Error("The native new room has no opening");
      }
      expect(pageData.previousCursor).toBeNull();
      expect(pageData.nextCursor).toBeNull();
      await expect(page.locator(`[data-message-id="${opening.id}"]`)).toContainText("A fresh greeting has no unseen history.");
      await expect(page.locator(`[data-message-id="${before.id}"]`)).toHaveCount(0);
      await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("new-room-warm-opening.png") });
      confirmation.release();
      await expect(page.locator(`[data-message-id="${opening.id}"]`)).toBeVisible();
    });
  });
}
