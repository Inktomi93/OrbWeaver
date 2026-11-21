// @subject packages/client/src/features/app-shell/surfaces/shell/chrome.css
// On a touch phone the room's turn notice leaves the room header, the character bar and the first row in view: the
// stack takes the bottom edge instead of hanging from the chrome over the top of the room.

import type { ChatWarning } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  noticeToast,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { CHAT_CHARACTER_BAR_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { warningNotice } from "#client/features/chat/lib/warning-notice.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import { findHostedRoom } from "./hosted-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// Past any sequence the corpus room holds, so the scripted frame lands as a new live event.
const FIRST_SEQ = 1_000_000;
const WARNING: ChatWarning = { code: "provider_refused" };
const PHONE = { width: 390, height: 844 } as const;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element has no box");
  }
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test("a turn notice on a touch phone covers neither the room header, the character bar nor the first row in view", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(host, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
  });
  const frame: StreamFrame = { channel: "chat", chatId, seq: FIRST_SEQ, event: { type: "warning", chatId, ...WARNING } };
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [frame] });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  const notice = noticeToast(page, warningNotice(WARNING));
  await expect(notice).toBeVisible();
  const header = page.locator("header.shell-topbar");
  const bar = page.getByRole("group", { name: CHAT_CHARACTER_BAR_NAME, exact: true });
  const rows = page.locator('[data-slot="message-row"]');
  // The positive controls: each subject is on screen, so a missing overlap is not a missing element.
  await expect(header).toBeVisible();
  await expect(bar).toBeVisible();
  await expect(rows.first()).toBeVisible();

  const stack = await boxOf(page.locator('[data-slot="toast-stack"]'));
  const thread = await boxOf(page.locator('[data-slot="chat-room-thread"]'));
  // The first row the reader sees: the earliest row whose bottom edge is below the transcript's top.
  const firstInView = await rows.evaluateAll((nodes, top) => nodes.findIndex((node) => node.getBoundingClientRect().bottom > top), thread.y);
  expect(firstInView).toBeGreaterThanOrEqual(0);
  for (const covered of [header, bar, rows.nth(firstInView)]) {
    expect(overlaps(stack, await boxOf(covered))).toBe(false);
  }
  // The stack stays whole on the screen at the bottom edge.
  expect(stack.y + stack.height).toBeLessThanOrEqual(PHONE.height);
  expect(stack.y).toBeGreaterThan(thread.y);
});
