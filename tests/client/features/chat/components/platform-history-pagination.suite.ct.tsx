// Ordinary Chats pages real persisted canon without entering a Corpus source window.

import { DIALOG_VERBS, RETRY_NAME } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expectPinnedFailure, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize, settledBox, settledReadingRow } from "@orb/testkit/browser/spec";
import {
  absenceWindow,
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
import { nonEmpty } from "@orb/testkit/iso";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution, seedTranscript } from "@orb/testkit/node/composed";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import {
  CHAT_EARLIER_MESSAGES_NAME,
  CHAT_HISTORY_DISMISS_NAME,
  CHAT_HISTORY_FAILURE_COPY,
  CHAT_MESSAGE_INPUT_NAME,
  CHAT_WINDOW_PRESS_FAILURE,
} from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// Past the moment a stray read would have started.
const QUIET_SPELL_MS = 800;
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

/** The oldest row a room's history holds, read back page by page the way the pager walks it. */
async function oldestOf(caller: Caller, chatId: ChatId): Promise<CanonMessage | undefined> {
  let page = await caller.chat.listMessages({ chatId });
  while (page.previousCursor !== null) {
    page = await caller.chat.listMessages({ chatId, cursor: page.previousCursor });
  }
  return page.messages[0];
}

async function prepareHistory(root: Root, caller: Caller): Promise<HistoryFixture> {
  const [card] = (await caller.character.list({})).items;
  if (card === undefined) {
    throw new Error("The corpus needs a character to seat in the imported room");
  }
  // A long history is bulk data, so the native chat import writes it in one call; a commit per row is a verb run per row.
  // The seated card opens and answers, as in a played room, so every page mixes speakers and roles.
  const imported = await seedTranscript(root, {
    ownerId: root.ownerId,
    characterHandles: [card.handle],
    lines: Array.from({ length: EXTRA_ROWS }, (_, index) => ({
      ...(index % 2 === 0 ? { role: "assistant", speakerHandle: card.handle } : { role: "user" }),
      content: `History pagination witness ${index + 1}. The observatory lantern burns through the rain.`,
    })),
  });
  const listed = (await caller.chat.listChats({})).items;
  const room = listed.find((row) => row.id === imported.chatId);
  const other = listed.find((row) => row.id !== imported.chatId);
  if (room === undefined || other === undefined) {
    throw new Error("The imported room and a corpus room must both list");
  }
  const rooms = [room, other];
  const original = await oldestOf(caller, room.id);
  const otherTail = (await caller.chat.commitMessage({ chatId: other.id, content: "A short room keeps its own canon.", timeZone: UTC_TIME_ZONE })).messages.at(
    -1,
  );
  if (original === undefined || otherTail === undefined) {
    throw new Error("Both rooms need their persisted reading witnesses");
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
  readonly windowIntercept?: Parameters<typeof serveCorpusProcedures<"chat.getMessageWindow">>[2];
}

interface LiveRoom extends AsyncDisposable {
  /** How many `chat.listMessages` reads the room has served. */
  readonly reads: () => number;
  readonly settle: () => Promise<void>;
}

/** A served room on its live socket. `settle` commits and removes a row so the bus invalidates the room's reads. */
async function serveLiveRoom({ root, caller, corpus, page, rooms, chatId, chatStyle, intercept, windowIntercept }: LiveRoomOptions): Promise<LiveRoom> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({ chatStyle, backgroundImageKind: "none" }) });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  const calls = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls", "notifications.presence"]),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], intercept),
    ...serveCorpusProcedures(caller, ["chat.getMessageWindow"], windowIntercept),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && rooms.some((row) => row.id === ref.chatId) ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && rooms.some((row) => row.id === ref.chatId) ? null : trpcError({ code: "NOT_FOUND" })),
  });
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const stop = new AbortController();
  let started = false;
  await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }],
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

/** Keeps every distinct failure line the transcript shows, in order: what a screen reader hears change. */
async function recordAlerts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    Reflect.set(globalThis, "__alerts", seen);
    const read = (): void => {
      const text = document.querySelector('[data-slot="message-list-scroll"] [role="alert"]')?.textContent ?? "";
      if (seen.at(-1) !== text) {
        seen.push(text);
      }
    };
    read();
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

function alertsSeen(page: Page): Promise<unknown> {
  return page.evaluate((): unknown => Reflect.get(globalThis, "__alerts"));
}

/** Waits past the moment a stray read would have started: the behaviour under test is a request that never leaves. */
function quietSpell(page: Page): Promise<void> {
  return absenceWindow(page, QUIET_SPELL_MS);
}

/** A room with older pages loaded whose forward reads from `floor` up fail once `bridgeDown` says so, past a real refresh. */
function forwardFails(floor: number, down: () => boolean): NonNullable<ListMessagesIntercept> {
  return ({ cursor }) => (down() && cursor?.kind === "after" && cursor.seq >= floor ? trpcError({ code: "BAD_REQUEST" }) : undefined);
}

/** How many lines `node`'s text lays out on, read from the text's own line boxes. */
function lineCount(node: Locator): Promise<number> {
  return node.evaluate(async (element) => {
    // A fallback face sets a different measure; the line count is the loaded face's.
    await document.fonts.ready;
    const tops = new Set<number>();
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let text = texts.nextNode(); text !== null; text = texts.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const box of range.getClientRects()) {
        tops.add(Math.round(box.top));
      }
    }
    return tops.size;
  });
}

type Shell = "desktop" | "mobile";

// Enlarged browser text moves the desktop shell's breakpoint past a 1280 viewport, so those cells measure the mobile shell.
function shellAt({ coarse }: { readonly coarse: boolean }, textScale: number): Shell {
  return !coarse && textScale === 1 ? "desktop" : "mobile";
}

/** Assert that the mounted page lays out the shell a cell is named for. */
async function expectShell(page: Page, shell: Shell): Promise<void> {
  expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["shell-desktop"])).toBe(shell === "desktop");
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
      const { rooms, room, other, original, otherTail, tail, anchor, loadedFirst, removed } = await prepareHistory(root, caller);
      expect(nonEmpty(tail.messages).some((message) => message.id === original.id)).toBe(false);
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
        awaitRooms: [{ channel: "chat", chatId: room.id }],
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
    test("a burst of room events reads the loaded history once, as one invalidation does", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      await using live = await serveLiveRoom({ root, caller, corpus, page, rooms, chatId: room.id, chatStyle: regime.chatStyle, intercept: () => undefined });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true, invalidator: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      const busy = page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY);
      await expect(busy).toHaveAttribute("aria-busy", "false");
      // The control: what one invalidation of the room's reads costs with these pages loaded.
      const idle = live.reads();
      await page.getByRole("button", { name: "Invalidate the room", exact: true }).dispatchEvent("click");
      await expect.poll(() => live.reads()).toBeGreaterThan(idle);
      await expect(busy).toHaveAttribute("aria-busy", "false");
      const once = live.reads() - idle;
      const before = live.reads();
      // Edits move no row, so the burst owes no bridge read: everything it reads is refresh.
      let revised = "";
      let lastId = "";
      for (const message of tail.messages) {
        revised = `${message.content} Revised.`;
        lastId = message.id;
        await caller.chat.editMessage({ chatId: room.id, messageId: message.id, content: revised, timeZone: UTC_TIME_ZONE });
      }
      await live.settle();
      await expect(list.locator(`[data-message-id="${lastId}"]`)).toContainText(revised);
      await expect.poll(() => live.reads()).toBeGreaterThan(before);
      await expect(busy).toHaveAttribute("aria-busy", "false");
      await quietSpell(page);
      expect(live.reads() - before).toBe(once);
    });
    for (const textScale of PLATFORM_TEXT_SCALES) {
      test(`a failed refresh at ${String(textScale)}x text in the ${shellAt(regime, textScale)} shell reports without moving or pinning, a press still pages, and recovery wastes no press`, async ({
        corpus,
        mount,
        page,
        browserName,
      }) => {
        test.skip(textScale !== 1 && browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
        await using _textSize = textScale === 1 ? null : await setPlatformTextSize(page, textScale);
        await using root = await historyRoot();
        const caller = await root.internalCallerFor(root.ownerId);
        const { rooms, room } = await prepareHistory(root, caller);
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
        await expectShell(page, shellAt(regime, textScale));
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
        await expect(list.getByRole("button", { name: RETRY_NAME, exact: true })).toBeAttached();
        // Enlarged text wraps the refresh line beside Try again on the phone, so the press changes the chrome's height as it pins.
        const lines = await lineCount(alert);
        test.info().annotations.push({ type: "refresh-lines", description: String(lines) });
        expect(lines).toBeGreaterThanOrEqual(regime.coarse && textScale !== 1 ? 2 : 1);
        // The press asks for older rows even through a failed refresh, so what it reports is its own failure.
        const rows = await loadedRows(list);
        await earlier.dispatchEvent("click");
        await expectPinnedFailure(list);
        // The plate pins from out of view, so it lays over the rows (`reading-row.ts`).
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
      test(`a press offline through a failed refresh at ${String(textScale)}x text in the ${shellAt(regime, textScale)} shell pins the longer offline line without moving the reader`, async ({
        corpus,
        mount,
        page,
        browserName,
      }) => {
        test.skip(textScale !== 1 && browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
        await using _textSize = textScale === 1 ? null : await setPlatformTextSize(page, textScale);
        await using root = await historyRoot();
        const caller = await root.internalCallerFor(root.ownerId);
        const { rooms, room } = await prepareHistory(root, caller);
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
        await expectShell(page, shellAt(regime, textScale));
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
        await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.refresh);
        await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
        const rows = await loadedRows(list);
        await page.context().setOffline(true);
        await earlier.dispatchEvent("click");
        await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.offline);
        await expectPinnedFailure(list);
        // The plate pins from out of view, so it lays over the rows whatever the longer line does to its height (`reading-row.ts`).
        await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
        failing = false;
        await page.context().setOffline(false);
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
      });
    }
    test("a failed refresh leaves a reader at the tail on the tail", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
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
      const { rooms, other } = await prepareHistory(root, caller);
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
      await list.getByRole("button", { name: RETRY_NAME, exact: true }).dispatchEvent("click");
      await expect(alert).toHaveCount(0);
    });
    test("a failed bridge reports its own kind, stops reading, and one retry with the server down is one announcement", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      const floor = tail.messages[0]?.seq ?? 0;
      let bridgeDown = false;
      let allDown = false;
      const forward = forwardFails(floor, () => bridgeDown);
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: (input) => (allDown && input.cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : forward(input)),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      bridgeDown = true;
      await commitArrivals(caller, room.id);
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.bridge);
      await expect(alert).not.toBeInViewport();
      const busy = page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY);
      await expect(busy).toHaveAttribute("aria-busy", "false");
      // A failed bridge re-firing itself is a stream of reads against a server that is down.
      const reads = live.reads();
      await quietSpell(page);
      expect(live.reads()).toBe(reads);
      allDown = true;
      await recordAlerts(page);
      await alert.evaluate((node) => node.setAttribute("data-before-retry", ""));
      const retry = list.getByRole("button", { name: RETRY_NAME, exact: true });
      await retry.dispatchEvent("click");
      // A fresh node is what makes a repeated failure speak; the same line must not flip through another kind on the way.
      await expect(list.locator('[role="alert"]:not([data-before-retry])')).toHaveCount(1);
      await quietSpell(page);
      expect(await alertsSeen(page)).toEqual([CHAT_HISTORY_FAILURE_COPY.bridge]);
      allDown = false;
      await retry.dispatchEvent("click");
      await quietSpell(page);
      expect(await alertsSeen(page)).toEqual([CHAT_HISTORY_FAILURE_COPY.bridge]);
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.bridge);
      bridgeDown = false;
      await retry.dispatchEvent("click");
      await expect(alert).toHaveCount(0);
      await expect(busy).toHaveAttribute("aria-busy", "false");
    });
    test("a press that fails through a failed bridge keeps its own failure in the reader's view", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      let bridgeDown = false;
      let allDown = false;
      const forward = forwardFails(tail.messages[0]?.seq ?? 0, () => bridgeDown);
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: (input) => (allDown && input.cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : forward(input)),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      bridgeDown = true;
      await commitArrivals(caller, room.id);
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.bridge);
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      allDown = true;
      await recordAlerts(page);
      const reads = live.reads();
      await earlier.dispatchEvent("click");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.press);
      await quietSpell(page);
      await expect(alert).toBeInViewport({ ratio: 1 });
      await expect(list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true })).toBeAttached();
      expect(await alertsSeen(page)).toEqual([CHAT_HISTORY_FAILURE_COPY.bridge, CHAT_HISTORY_FAILURE_COPY.press]);
      // One press, one read: the bridge must not fire behind it.
      expect(live.reads()).toBe(reads + 1);
    });
    test("a dismissed press leaves the failed bridge behind it showing", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      let bridgeDown = false;
      let allDown = false;
      const forward = forwardFails(tail.messages[0]?.seq ?? 0, () => bridgeDown);
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: (input) => (allDown && input.cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : forward(input)),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      bridgeDown = true;
      await commitArrivals(caller, room.id);
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.bridge);
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      allDown = true;
      await earlier.dispatchEvent("click");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.press);
      await quietSpell(page);
      const reads = live.reads();
      await list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true }).click();
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.bridge);
      await expect(list.getByRole("button", { name: RETRY_NAME, exact: true })).toBeAttached();
      await expect(list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true })).toHaveCount(0);
      // The bridge is still failed, not due again: dismissing shows it and reads nothing.
      await quietSpell(page);
      expect(live.reads()).toBe(reads);
    });
    test("a refresh that fails in a bridging room keeps reporting after the forward read could land, until it is repeated", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      let bridgeDown = false;
      let refreshDown = false;
      const forward = forwardFails(tail.messages[0]?.seq ?? 0, () => bridgeDown);
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: (input) => (refreshDown && input.cursor?.kind === "before" ? trpcError({ code: "BAD_REQUEST" }) : forward(input)),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      bridgeDown = true;
      await commitArrivals(caller, room.id);
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.bridge);
      bridgeDown = false;
      refreshDown = true;
      const retry = list.getByRole("button", { name: RETRY_NAME, exact: true });
      await retry.dispatchEvent("click");
      await quietSpell(page);
      await expect(alert).toHaveCount(1);
      refreshDown = false;
      await retry.dispatchEvent("click");
      await expect(alert).toHaveCount(0);
      await expect(page.getByRole("main", { name: "Chats content", exact: true }).locator(TRANSCRIPT_BUSY)).toHaveAttribute("aria-busy", "false");
    });
    test("a failed press stays pinned through a later failed refresh", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room } = await prepareHistory(root, caller);
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
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      await earlier.dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toBeInViewport({ ratio: 1 });
      await recordAlerts(page);
      const reads = live.reads();
      await live.settle();
      await expect.poll(() => live.reads()).toBeGreaterThan(reads);
      await quietSpell(page);
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.press);
      await expect(alert).toBeInViewport({ ratio: 1 });
      await expect(list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true })).toBeAttached();
      expect(await alertsSeen(page)).toEqual([CHAT_HISTORY_FAILURE_COPY.press]);
    });
    test("a dismissed press leaves the failed refresh behind it showing", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room } = await prepareHistory(root, caller);
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
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      await earlier.dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.press);
      const reads = live.reads();
      await live.settle();
      await expect.poll(() => live.reads()).toBeGreaterThan(reads);
      await list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true }).click();
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.refresh);
      await expect(list.getByRole("button", { name: RETRY_NAME, exact: true })).toBeAttached();
      await expect(list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true })).toHaveCount(0);
    });
    test("a Try again from the keyboard that succeeds leaves focus on the pager", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room } = await prepareHistory(root, caller);
      let failing = true;
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
      await expect(list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeAttached();
      await live.settle();
      const retry = list.getByRole("button", { name: RETRY_NAME, exact: true });
      await retry.focus();
      failing = false;
      await page.keyboard.press("Enter");
      await expect(list.getByRole("alert")).toHaveCount(0);
      await expect(list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeFocused();
    });
    test("a Try again that succeeds in a room with nothing older keeps a place for focus", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, other } = await prepareHistory(root, caller);
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
      await list.getByRole("button", { name: RETRY_NAME, exact: true }).focus();
      failing = false;
      await page.keyboard.press("Enter");
      await expect(list.getByRole("alert")).toHaveCount(0);
      await expect(list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeFocused();
    });
    test("a reader at the top of a room with no pager stays there, and sees a failed refresh", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, other } = await prepareHistory(root, caller);
      for (let index = 0; index < 20; index += 1) {
        await caller.chat.commitMessage({
          chatId: other.id,
          content: `Long one-page row ${String(index)}. ${"The observatory lantern burns through the rain. ".repeat(12)}`,
          timeZone: UTC_TIME_ZONE,
        });
      }
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: other.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: other.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(list.locator('[data-slot="message-list-row"]').first()).toBeVisible();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await settledReadingRow(list);
      await live.settle();
      const alert = list.getByRole("alert");
      await expect(alert).toBeAttached();
      await expect(alert).toBeInViewport({ ratio: 1 });
      expect(await list.evaluate((node) => node.scrollTop)).toBe(0);
    });
    test("a press a room invalidation cancels still ends in the older rows", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      const press = holdServed();
      await using held = new AsyncDisposableStack();
      held.defer(press.release);
      let armed = true;
      await using live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => {
          if (!armed || cursor?.kind !== "before" || cursor.seq !== tail.previousCursor?.seq) {
            return;
          }
          armed = false;
          return press;
        },
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await earlier.dispatchEvent("click");
      await press.requested;
      await live.settle();
      press.release();
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      await expect(list.getByRole("alert")).toHaveCount(0);
    });
    test("a press every read of which an invalidation cancels says so and pins its reason", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      const reads = [holdServed(), holdServed(), holdServed()] as const;
      await using held = new AsyncDisposableStack();
      held.defer(() => {
        for (const read of reads) {
          read.release();
        }
      });
      let served = 0;
      await using _live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ cursor }) => {
          const read = cursor?.kind === "before" && cursor.seq === tail.previousCursor?.seq ? reads[served] : undefined;
          served += read === undefined ? 0 : 1;
          return read;
        },
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true, invalidator: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      const invalidate = page.getByRole("button", { name: "Invalidate the room", exact: true });
      await earlier.dispatchEvent("click");
      for (const read of reads) {
        await read.requested;
        await invalidate.dispatchEvent("click");
      }
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.press);
      await expect(alert).toBeInViewport({ ratio: 1 });
      await expect(list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true })).toBeAttached();
    });
    test("an anchored press every read of which an invalidation cancels says so", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, tail } = await prepareHistory(root, caller);
      const target = tail.messages[0];
      if (target === undefined) {
        throw new Error("The room's tail is empty");
      }
      const reads = [holdServed(), holdServed(), holdServed()] as const;
      await using held = new AsyncDisposableStack();
      held.defer(() => {
        for (const read of reads) {
          read.release();
        }
      });
      let served = 0;
      await using _live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: () => undefined,
        windowIntercept: ({ cursor }) => {
          const read = cursor?.kind === "before" ? reads[served] : undefined;
          served += read === undefined ? 0 : 1;
          return read;
        },
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true, invalidator: true, moment: { kind: "message", messageId: target.id } });
      const earlier = page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeEnabled();
      const invalidate = page.getByRole("button", { name: "Invalidate the room", exact: true });
      await earlier.dispatchEvent("click");
      for (const read of reads) {
        await read.requested;
        await invalidate.dispatchEvent("click");
      }
      await expect(page.getByRole("alert")).toHaveText(CHAT_WINDOW_PRESS_FAILURE);
    });
    test("a window whose target is gone keeps its paging toolbar while the latest page loads", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, removed } = await prepareHistory(root, caller);
      await caller.chat.deleteMessages({ chatId: room.id, messageIds: [removed.id] });
      const latest = holdServed();
      await using held = new AsyncDisposableStack();
      held.defer(() => latest.release());
      await using _live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ chatId }) => (chatId === room.id ? latest : undefined),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true, moment: { kind: "message", messageId: removed.id } });
      await latest.requested;
      await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeVisible();
      latest.release();
      await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible();
    });
    test("a window whose target is gone keeps its toolbar when the latest page fails, and Retry recovers", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room, removed } = await prepareHistory(root, caller);
      await caller.chat.deleteMessages({ chatId: room.id, messageIds: [removed.id] });
      let failing = true;
      await using _live = await serveLiveRoom({
        root,
        caller,
        corpus,
        page,
        rooms,
        chatId: room.id,
        chatStyle: regime.chatStyle,
        intercept: ({ chatId, cursor }) => (failing && chatId === room.id && cursor === undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true, moment: { kind: "message", messageId: removed.id } });
      await expect(page.locator('[data-slot="query-error"]')).toBeVisible();
      await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeVisible();
      failing = false;
      await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
      await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible();
      await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeVisible();
    });
    test("a repeated press with the connection down is heard again, and the held read lands when it returns", async ({ corpus, mount, page }) => {
      await using root = await historyRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { rooms, room } = await prepareHistory(root, caller);
      await using _live = await serveLiveRoom({ root, caller, corpus, page, rooms, chatId: room.id, chatStyle: regime.chatStyle, intercept: () => undefined });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, socket: true });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
      await expect(earlier).toBeAttached();
      const rows = await loadedRows(list);
      await page.context().setOffline(true);
      await earlier.dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.offline);
      await alert.evaluate((node) => node.setAttribute("data-first-press", ""));
      await earlier.dispatchEvent("click");
      // A fresh node is what makes the same line speak again.
      await expect(list.locator('[role="alert"]:not([data-first-press])')).toHaveText(CHAT_HISTORY_FAILURE_COPY.offline);
      await page.context().setOffline(false);
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      await expect(alert).toHaveCount(0);
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
