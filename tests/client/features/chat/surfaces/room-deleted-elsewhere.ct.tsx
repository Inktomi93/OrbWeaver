// @subject packages/client/src/features/chat/surfaces/chat-room-surface.tsx
// @subject packages/client/src/features/chat/surfaces/message-list-surface.tsx
// @subject packages/client/src/features/chat/hooks/use-leave-gone-room.ts
// A room whose own read answers not found is left for the Chats list: open and idle when another session deletes it (told by the room's
// own event or only by the owner's list change), reached again from Home after the delete, or a stale id restored at load. A send that
// finds the room gone shows one notice.

import type { StreamFrame } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import type { ShellAmbientStory, ShellBusStory } from "@orb/testkit/browser";
import { seedActiveChat, seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import {
  createShellAmbientReads,
  noticeToast,
  ROOM_PROCEDURES,
  routeOrbSocket,
  routeTrpc,
  SECTION_LABELS,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { SEND_FAILED_TITLE } from "#client/features/chat/lib/send-failure-copy.ts";
import { NO_CHAT_SELECTED_TITLE } from "#client/lib/chat-launch-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
// The shell with the socket and the user bus the app root wires beside it, so a server event reaches the room.
const BUS_STORY = "tests/support/browser/ct-shell-reads-stories/ShellBusStory";
const ROOM_SURFACE = '[data-slot="chat-room-surface"]';
const DRAFT = "Is anyone still hosting?";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** The production shell's reads and the send answered by the root's owner, and the section it opens on. */
async function serveShell(
  root: Root,
  corpus: CorpusPlayback,
  page: Page,
  section: string,
): Promise<{ readonly caller: Awaited<ReturnType<Root["internalCallerFor"]>>; readonly rpc: TrpcRecorder }> {
  const caller = await root.internalCallerFor(root.ownerId);
  const rpc = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "chat.send"]),
    // The page's rooms attach to the scripted socket; the attach itself is the transport's, answered void as the server does.
    "stream.attach": () => null,
    "stream.detach": () => null,
  });
  await seedShellState(page, { activeSection: section });
  return { caller, rpc };
}

async function ownerRoomId(caller: Awaited<ReturnType<Root["internalCallerFor"]>>): Promise<ChatId> {
  const [first] = (await caller.chat.listChats({})).items;
  if (first === undefined) {
    throw new Error("The committed corpus holds no owner room");
  }
  return first.id;
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
    const { caller } = await serveShell(root, corpus, page, "chats");
    const room = await ownerRoomId(caller);
    await seedActiveChat(page, room);
    const forwarded = await forwardRoomDeletion({ page, root, chatId: room, cleanup, deliver });
    await mount<typeof ShellBusStory>(BUS_STORY, {});
    await expect(page.locator(ROOM_SURFACE)).toBeVisible();
    await forwarded.listening;
    await expect.poll(forwarded.roomAttached).toBe(true);
    await caller.chat.delete({ chatId: room });
    await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
    await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
  });
}

test("a restored room that still exists opens its room, not the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "chats");
  const live = await ownerRoomId(caller);
  await seedActiveChat(page, live);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(page.locator(ROOM_SURFACE)).toBeVisible();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
});

test("a stale room id restored at load lands on the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "chats");
  const gone = await ownerRoomId(caller);
  await caller.chat.delete({ chatId: gone });
  await seedActiveChat(page, gone);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toHaveCount(0);
});

test("a room reached again from Home after another session deleted it lands on the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { caller } = await serveShell(root, corpus, page, "chats");
  const room = await ownerRoomId(caller);
  await seedActiveChat(page, room);
  // Only the owner's list change reaches this session: its room is not attached while it sits on Home.
  const forwarded = await forwardRoomDeletion({ page, root, chatId: room, cleanup, deliver: ["chatsChanged"] });
  await mount<typeof ShellBusStory>(BUS_STORY, {});
  await expect(page.locator(ROOM_SURFACE)).toBeVisible();
  await forwarded.listening;
  const rail = page.locator(".shell-rail");
  await rail.getByRole("button", { name: SECTION_LABELS.home, exact: true }).click();
  await caller.chat.delete({ chatId: room });
  await rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
});

test("a send that finds the room already deleted shows one notice and lands on the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "chats");
  const room = await ownerRoomId(caller);
  await seedActiveChat(page, room);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(page.locator(ROOM_SURFACE)).toBeVisible();
  // No event told this session: the delete is known only to the server when the draft goes out.
  await caller.chat.delete({ chatId: room });
  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await input.fill(DRAFT);
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
  await expect(noticeToast(page, { title: SEND_FAILED_TITLE })).toHaveCount(1);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
});

test("a room deleted from another session while this one is on Home lands on the chat list when Chats opens", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "home");
  const gone = await ownerRoomId(caller);
  await seedActiveChat(page, gone);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const rail = page.locator(".shell-rail");
  await expect(rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true })).toBeVisible();
  await caller.chat.delete({ chatId: gone });
  await rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
});
