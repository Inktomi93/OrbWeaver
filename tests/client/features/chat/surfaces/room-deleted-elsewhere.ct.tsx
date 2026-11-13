// @subject packages/client/src/features/chat/surfaces/chat-room-surface.tsx
// @subject packages/client/src/features/chat/hooks/use-room-read.ts
// @subject packages/client/src/features/chat/components/room-read-failure.tsx
// A room whose own read settles not found is left for the Chats list: open and idle when another session deletes it (told by the room's
// own event or only by the owner's list change), reached again from Home after the delete, or a stale id restored at load, which draws
// no composer, next-reply line or failure plate on its way. A send that finds the room gone shows one notice. Only a settled, current
// not-found leaves: a room that answered not found once and reads found again opens, and a failed read shows the failure plate and stays.

import type { StreamFrame } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import type { ShellAmbientStory, ShellBusStory } from "@orb/testkit/browser";
import { seedActiveChat, seedShellState } from "@orb/testkit/browser/spec";
import type { ServedHold, TrpcRecorder } from "@orb/testkit/ct";
import {
  absenceWindow,
  createShellAmbientReads,
  holdServed,
  noticeToast,
  ROOM_PROCEDURES,
  routeOrbSocket,
  routeTrpc,
  SECTION_LABELS,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
  trpcHold,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { z } from "zod";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import {
  CHAT_GONE_DRAFT_NOTICE,
  CHAT_LIST_NAME,
  CHAT_MESSAGE_INPUT_NAME,
  CHAT_ROOM_READ_LABEL,
  CHAT_SEND_NAME,
} from "#client/features/chat/lib/chat-surface-names.ts";
import { SEND_FAILED_TITLE } from "#client/features/chat/lib/send-failure-copy.ts";
import { NO_CHAT_SELECTED_TITLE } from "#client/lib/chat-launch-names.ts";
import { deriveChatTitle } from "#client/lib/chat-title.ts";
import { COPIED_TO_CLIPBOARD_NOTICE } from "#client/lib/clipboard-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
// The shell with the socket and the user bus the app root wires beside it, so a server event reaches the room.
const BUS_STORY = "tests/support/browser/ct-shell-reads-stories/ShellBusStory";
const ROOM_SURFACE = '[data-slot="chat-room-surface"]';
const NEXT_TURN_LINE = '[data-slot="composer-next-turn"]';
const TRANSCRIPT_LOADING = '[data-slot="transcript-loading"]';
const DRAFT = "Is anyone still hosting?";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const SERVED = [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "chat.send"] as const;
/** A refusal the test answers a request with before the server sees it, or `undefined` to let the server answer. */
type Intercept = (input: unknown) => ReturnType<typeof trpcError> | ServedHold | undefined;

function chatIdOf(input: unknown): unknown {
  return typeof input === "object" && input !== null && "chatId" in input ? input.chatId : undefined;
}

interface ShellServing {
  /** The section the shell opens on. */
  readonly section: string;
  /** Fails chosen requests before the server sees them. */
  readonly intercept?: Intercept;
  /** Answers a roster read in place of the server, holding or failing it, when it returns an answer. */
  readonly getChat?: (chatId: ChatId) => ReturnType<typeof trpcHold<"chat.getChat">> | ReturnType<typeof trpcError> | null;
  /** Refuses a send in place of the server when it returns a refusal. */
  readonly send?: (chatId: ChatId) => ReturnType<typeof trpcError> | null;
}

/** The production shell's reads and the send answered by the root's owner, and the section it opens on. */
async function serveShell(
  root: Root,
  corpus: CorpusPlayback,
  page: Page,
  serving: ShellServing,
): Promise<{ readonly caller: Caller; readonly rpc: TrpcRecorder }> {
  const caller = await root.internalCallerFor(root.ownerId);
  const served = serveCorpusProcedures(caller, SERVED, serving.intercept);
  const serveGetChat = served["chat.getChat"];
  const serveSend = served["chat.send"];
  const rpc = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...served,
    "chat.getChat": (input) => serving.getChat?.(input.chatId) ?? (typeof serveGetChat === "function" ? serveGetChat(input) : serveGetChat),
    "chat.send": (input) => serving.send?.(input.chatId) ?? (typeof serveSend === "function" ? serveSend(input) : serveSend),
    // The page's rooms attach to the scripted socket; the attach itself is the transport's, answered void as the server does.
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "chat" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "chat" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await seedShellState(page, { activeSection: serving.section });
  return { caller, rpc };
}

interface OwnerRoom {
  readonly id: ChatId;
  /** What the room's own heading reads, from its roster. */
  readonly heading: string;
  /** What its chat list row reads. */
  readonly listTitle: string;
}

async function ownerRooms(caller: Caller): Promise<readonly [OwnerRoom, OwnerRoom]> {
  const [first, second] = await Promise.all(
    (await caller.chat.listChats({})).items.slice(0, 2).map(async (row) => {
      const chat = await caller.chat.getChat({ chatId: row.id });
      return {
        id: row.id,
        heading: deriveChatTitle(
          chat.title,
          chat.participants.map((participant) => participant.displayName),
        ),
        listTitle: deriveChatTitle(row.title, row.participantNames),
      };
    }),
  );
  if (first === undefined || second === undefined) {
    throw new Error("The committed corpus holds fewer than two owner rooms");
  }
  return [first, second];
}

/** The open room, named by its title: the room surface labels itself with its heading. */
function openRoom(page: Page, room: OwnerRoom): ReturnType<Page["locator"]> {
  return page.locator(ROOM_SURFACE).getByRole("heading", { name: room.heading, exact: true });
}

function listRow(page: Page, room: OwnerRoom): ReturnType<Page["locator"]> {
  return page.getByLabel(CHAT_LIST_NAME, { exact: true }).getByText(room.listTitle, { exact: true }).first();
}

/** The two live events the root emits when a room is deleted: the room's own on the chat channel, the owner's list change on the user channel. */
type DeletionSignal = "chatDeleted" | "chatsChanged";

/**
 * Serve the page the named live events the root really emits when its room is deleted, forwarded over the scripted socket as the
 * server's streams carry them; the others are withheld. `listening` resolves once the buses are listened to, so a delete made after
 * it cannot be missed.
 */
async function forwardRoomDeletion(args: {
  readonly page: Page;
  readonly root: Root;
  readonly chatId: ChatId;
  readonly cleanup: AsyncDisposableStack;
  readonly deliver: readonly DeletionSignal[];
}): Promise<{ readonly listening: Promise<void>; readonly roomAttached: () => boolean }> {
  const { page, root, chatId, cleanup, deliver } = args;
  const stop = new AbortController();
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  let started = false;
  cleanup.defer(async () => {
    stop.abort();
    if (started) {
      await joined.promise;
    }
  });
  // Only the user room is awaited: the shell holds its own readiness on the socket, and the room attaches after the shell is up. The
  // frames come back only once the delete has happened, by which time the caller has seen the room attach (`roomAttached`).
  const socket = await routeOrbSocket(page, {
    awaitRooms: [{ channel: "user" }],
    frames: async (signal): Promise<readonly StreamFrame[]> => {
      started = true;
      const aborted = AbortSignal.any([signal, stop.signal]);
      const chatEvents = root.app.liveBuses.chat.subscribeChatEvents(chatId, aborted)[Symbol.asyncIterator]();
      const userEvents = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, aborted)[Symbol.asyncIterator]();
      listening.resolve();
      try {
        const frames: StreamFrame[] = [];
        const chatDeleted = (async (): Promise<void> => {
          if (!deliver.includes("chatDeleted")) {
            return;
          }
          for (let next = await chatEvents.next(); next.done !== true; next = await chatEvents.next()) {
            if (next.value.event.type === "chatDeleted") {
              frames.push({ channel: "chat", chatId, seq: next.value.seq, event: next.value.event });
              return;
            }
          }
        })();
        const chatsChanged = (async (): Promise<void> => {
          if (!deliver.includes("chatsChanged")) {
            return;
          }
          for (let next = await userEvents.next(); next.done !== true; next = await userEvents.next()) {
            if (next.value.type === "chatsChanged") {
              frames.push({ channel: "user", event: next.value });
              return;
            }
          }
        })();
        await Promise.all([chatDeleted, chatsChanged]);
        return frames;
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
    listening: listening.promise,
    roomAttached: (): boolean => socket.attachedChannels().includes(roomKey({ channel: "chat", chatId })),
  };
}

interface RoomChromeSeen {
  composer: boolean;
  nextTurnLine: boolean;
  failurePlate: boolean;
}

declare global {
  // What room chrome the page has attached since it loaded.
  var roomChromeSeen: RoomChromeSeen | undefined;
}

/** Record, from the first node the page attaches, whether the room's composer, its next-reply line or the room's failure plate is ever
 *  in the document. A check at the end would miss a state that came and went. */
async function recordRoomChrome(page: Page): Promise<() => Promise<RoomChromeSeen | undefined>> {
  await page.addInitScript(
    ({ input, nextTurnLine, plate }) => {
      if (globalThis.top !== globalThis.self) {
        return;
      }
      const seen: RoomChromeSeen = { composer: false, nextTurnLine: false, failurePlate: false };
      globalThis.roomChromeSeen = seen;
      new MutationObserver(() => {
        seen.composer ||= document.querySelector(`[aria-label="${input}"]`) !== null;
        seen.nextTurnLine ||= document.querySelector(nextTurnLine) !== null;
        seen.failurePlate ||= document.documentElement.textContent.includes(plate);
      }).observe(document, { subtree: true, childList: true, characterData: true });
    },
    { input: CHAT_MESSAGE_INPUT_NAME, nextTurnLine: NEXT_TURN_LINE, plate: queryFailedLabel(CHAT_ROOM_READ_LABEL) },
  );
  return async () => await page.evaluate(() => globalThis.roomChromeSeen);
}

const DELIVERIES = [
  { name: "both events", deliver: ["chatDeleted", "chatsChanged"] },
  { name: "the room's own event alone", deliver: ["chatDeleted"] },
  // The owner's list change names the room; re-reading it is what finds the room gone.
  { name: "the list change alone", deliver: ["chatsChanged"] },
] as const satisfies readonly { readonly name: string; readonly deliver: readonly DeletionSignal[] }[];

for (const { name, deliver } of DELIVERIES) {
  test(`a room open and idle lands on the chat list when another session deletes it, told by ${name}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await using cleanup = new AsyncDisposableStack();
    const { caller } = await serveShell(root, corpus, page, { section: "chats" });
    const [room] = await ownerRooms(caller);
    await seedActiveChat(page, room.id);
    const forwarded = await forwardRoomDeletion({ page, root, chatId: room.id, cleanup, deliver });
    await mount<typeof ShellBusStory>(BUS_STORY, {});
    await expect(openRoom(page, room)).toBeVisible();
    await forwarded.listening;
    await expect.poll(forwarded.roomAttached).toBe(true);
    await caller.chat.delete({ chatId: room.id });
    await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
    await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
  });
}

// The composer draft store persists under a per-user key that ends in its store name; the blob's drafts are keyed by room.
const COMPOSER_DRAFT_STORE = "composer-draft";
const NOTICE_BEAT_MS = 1000;

async function storedDrafts(page: Page): Promise<Readonly<Record<string, string>>> {
  const stored = await page.evaluate((name) => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.endsWith(name) === true) {
        return localStorage.getItem(key);
      }
    }
    return null;
  }, COMPOSER_DRAFT_STORE);
  if (stored === null) {
    return {};
  }
  return z.object({ state: z.object({ drafts: z.record(z.string(), z.string()).optional() }).optional() }).parse(JSON.parse(stored)).state?.drafts ?? {};
}

/** Open `room` idle with the room's own deletion event and the owner's list change both delivered, ready for the delete. */
async function openRoomToBeDeleted(args: {
  readonly page: Page;
  readonly mountRoom: () => Promise<unknown>;
  readonly root: Root;
  readonly corpus: CorpusPlayback;
  readonly cleanup: AsyncDisposableStack;
}): Promise<{ readonly caller: Caller; readonly room: OwnerRoom }> {
  const { page, mountRoom, root, corpus, cleanup } = args;
  const { caller } = await serveShell(root, corpus, page, { section: "chats" });
  const [room] = await ownerRooms(caller);
  await seedActiveChat(page, room.id);
  const forwarded = await forwardRoomDeletion({ page, root, chatId: room.id, cleanup, deliver: ["chatDeleted", "chatsChanged"] });
  await mountRoom();
  await expect(openRoom(page, room)).toBeVisible();
  await forwarded.listening;
  await expect.poll(forwarded.roomAttached).toBe(true);
  return { caller, room };
}

test("a draft typed into a room another session deletes is offered back in a notice, and the store keeps no entry for the room", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const { caller, room } = await openRoomToBeDeleted({ page, mountRoom: () => mount<typeof ShellBusStory>(BUS_STORY, {}), root, corpus, cleanup });
  await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill(DRAFT);
  // The control for the absence below: the draft is on disk under the room before the room is deleted.
  await expect.poll(async () => (await storedDrafts(page))[room.id]).toBe(DRAFT);
  await caller.chat.delete({ chatId: room.id });
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  const notice = noticeToast(page, { title: CHAT_GONE_DRAFT_NOTICE.title, description: CHAT_GONE_DRAFT_NOTICE.description });
  await expect(notice).toHaveCount(1);
  await expect.poll(async () => Object.keys(await storedDrafts(page))).not.toContain(room.id);
  await notice.getByRole("button", { name: CHAT_GONE_DRAFT_NOTICE.copyName, exact: true }).click();
  await expect(noticeToast(page, { title: COPIED_TO_CLIPBOARD_NOTICE })).toHaveCount(1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DRAFT);
});

test("a room another session deletes while its composer is empty leaves no draft notice", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { caller, room } = await openRoomToBeDeleted({ page, mountRoom: () => mount<typeof ShellBusStory>(BUS_STORY, {}), root, corpus, cleanup });
  await caller.chat.delete({ chatId: room.id });
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  // The notice mounts a beat after the call that raises it, so the absence is read after the beat the positive case needs.
  await absenceWindow(page, NOTICE_BEAT_MS);
  await expect(noticeToast(page, { title: CHAT_GONE_DRAFT_NOTICE.title })).toHaveCount(0);
  expect(Object.keys(await storedDrafts(page))).not.toContain(room.id);
});

test("a restored room that still exists opens its room with its composer, not the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, { section: "chats" });
  const [live] = await ownerRooms(caller);
  const seen = await recordRoomChrome(page);
  await seedActiveChat(page, live.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(openRoom(page, live)).toBeVisible();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
  // The recorder's control: it does see the composer of a room that draws one.
  expect((await seen())?.composer).toBe(true);
});

test("a stale room id restored at load goes from the skeleton to the chat list, drawing no room chrome and sending no retry", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  // The gone room's reads wait until its body has drawn, so the room is caught mid-load, where a room that drew its chrome before
  // knowing the room exists would show it; released, the server answers each not found.
  const reads = holdServed();
  let goneId: ChatId | undefined;
  const { caller, rpc } = await serveShell(root, corpus, page, {
    section: "chats",
    intercept: (input) => (goneId !== undefined && chatIdOf(input) === goneId ? reads : undefined),
  });
  const [gone] = await ownerRooms(caller);
  await caller.chat.delete({ chatId: gone.id });
  goneId = gone.id;
  await using held = new AsyncDisposableStack();
  held.defer(reads.release);
  const seen = await recordRoomChrome(page);
  await seedActiveChat(page, gone.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await reads.requested;
  await expect(page.locator(TRANSCRIPT_LOADING)).toBeVisible();
  reads.release();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
  expect(await seen()).toEqual({ composer: false, nextTurnLine: false, failurePlate: false } satisfies RoomChromeSeen);
  // A not-found answer is final: each room read is asked once per reader that mounts around it, never re-sent on the retry schedule
  // (its third attempt is what a burst would add).
  const Readers = 2;
  expect(rpc.count("chat.getChat")).toBeGreaterThan(0);
  expect(rpc.count("chat.getChat")).toBeLessThanOrEqual(Readers);
  expect(rpc.count("chat.listMessages")).toBeLessThanOrEqual(Readers);
});

test("a room reached again from Home after another session deleted it lands on the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { caller } = await serveShell(root, corpus, page, { section: "chats" });
  const [room] = await ownerRooms(caller);
  await seedActiveChat(page, room.id);
  // Only the owner's list change reaches this session: its room is not attached while it sits on Home.
  const forwarded = await forwardRoomDeletion({ page, root, chatId: room.id, cleanup, deliver: ["chatsChanged"] });
  await mount<typeof ShellBusStory>(BUS_STORY, {});
  await expect(openRoom(page, room)).toBeVisible();
  await forwarded.listening;
  const rail = page.locator(".shell-rail");
  await rail.getByRole("button", { name: SECTION_LABELS.home, exact: true }).click();
  await caller.chat.delete({ chatId: room.id });
  await rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
});

test("a send that finds the room already deleted shows its refusal and the draft notice once each, and lands on the chat list", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, { section: "chats" });
  const [room] = await ownerRooms(caller);
  await seedActiveChat(page, room.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(openRoom(page, room)).toBeVisible();
  // No event told this session: the delete is known only to the server when the draft goes out.
  await caller.chat.delete({ chatId: room.id });
  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await input.fill(DRAFT);
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
  await expect(noticeToast(page, { title: SEND_FAILED_TITLE })).toHaveCount(1);
  // The refused draft is still in the composer when the room is left, so the reader is told what became of it: no other notice appears.
  await expect(noticeToast(page, { title: CHAT_GONE_DRAFT_NOTICE.title })).toHaveCount(1);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(2);
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
});

test("a room deleted from another session while this one is on Home lands on the chat list when Chats opens", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, { section: "home" });
  const [gone] = await ownerRooms(caller);
  await seedActiveChat(page, gone.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const rail = page.locator(".shell-rail");
  await expect(rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true })).toBeVisible();
  await caller.chat.delete({ chatId: gone.id });
  await rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
});

// A member removed from a room and invited back reads it as not found and then found again. The room's reads and its sends answer
// not found while `lost` names it, as they do for the removed member; the data every other answer carries is the server's.
function losableRoom(): { readonly intercept: Intercept; lose: (room: OwnerRoom | null) => void } {
  let lost: ChatId | null = null;
  return {
    intercept: (input) => (lost !== null && chatIdOf(input) === lost ? trpcError({ code: "NOT_FOUND" }) : undefined),
    lose: (room): void => {
      lost = room?.id ?? null;
    },
  };
}

test("a room whose refetch answered not found after the reader left it opens when it reads found again", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  // Room B's send is refused as the removed member's is, and the roster read it asks for next is held until the test answers it.
  let held: ReturnType<typeof trpcHold<"chat.getChat">> | null = null;
  let sendLost = false;
  const { caller, rpc } = await serveShell(root, corpus, page, {
    section: "chats",
    send: (chatId) => (sendLost && chatId === roomB.id ? trpcError({ code: "NOT_FOUND" }) : null),
    getChat: (chatId) => (chatId === roomB.id ? takeHeld() : null),
  });
  const takeHeld = (): ReturnType<typeof trpcHold<"chat.getChat">> | null => {
    const next = held;
    held = null;
    return next;
  };
  const [roomA, roomB] = await ownerRooms(caller);
  await seedActiveChat(page, roomB.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(openRoom(page, roomB)).toBeVisible();
  const reread = trpcHold<"chat.getChat">();
  held = reread;
  sendLost = true;
  await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill(DRAFT);
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
  await reread.requested;
  // The reader moves to room A while room B's re-read is still out.
  await listRow(page, roomA).click();
  await expect(openRoom(page, roomA)).toBeVisible();
  // Room B's read settles not found while nothing shows it: the cache now holds that answer beside B's old roster.
  const settled = page.waitForResponse((response) => response.url().includes("chat.getChat"));
  reread.release(trpcError({ code: "NOT_FOUND" }));
  await settled;
  sendLost = false;
  const reads = rpc.count("chat.getChat");
  await listRow(page, roomB).click();
  // The mount's refetch is what answers: room B reads found and stays open, the cached not-found never sends the reader back.
  await expect.poll(() => rpc.count("chat.getChat")).toBeGreaterThan(reads);
  await expect(openRoom(page, roomB)).toBeVisible();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
});

test("a room left because it answered not found opens again from the list once it reads found", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const losable = losableRoom();
  const { caller, rpc } = await serveShell(root, corpus, page, { section: "chats", intercept: losable.intercept });
  const [room] = await ownerRooms(caller);
  await seedActiveChat(page, room.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(openRoom(page, room)).toBeVisible();
  losable.lose(room);
  await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill(DRAFT);
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  losable.lose(null);
  const reads = rpc.count("chat.getChat");
  await listRow(page, room).click();
  await expect.poll(() => rpc.count("chat.getChat")).toBeGreaterThan(reads);
  await expect(openRoom(page, room)).toBeVisible();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
});

test("a room whose roster read fails stays the active room, shows the failure plate, and Retry opens it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  let failing = true;
  const { caller } = await serveShell(root, corpus, page, {
    section: "chats",
    getChat: (chatId) => (failing && chatId === room.id ? trpcError() : null),
  });
  const [room] = await ownerRooms(caller);
  await seedActiveChat(page, room.id);
  await mount<typeof ShellAmbientStory>(STORY, {});
  // The default schedule retries a server failure before the plate shows; a not-found would have settled at once and left.
  await expect(page.getByText(queryFailedLabel(CHAT_ROOM_READ_LABEL), { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toBeVisible();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toHaveCount(0);
  failing = false;
  await page.locator(ROOM_SURFACE).getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(openRoom(page, room)).toBeVisible();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
});
