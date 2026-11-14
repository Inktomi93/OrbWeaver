// A room whose own read failed refuses Send before anything reaches the server: a message sent under the failure plate would stay hidden,
// so Send is disabled with its reason visible at the composer, Enter sends nothing, no toast joins the plate, and Retry lifts the hold.
// @subject packages/client/src/features/chat/hooks/use-send-availability.ts
// @subject packages/client/src/features/chat/lib/next-turn-line.ts

import { seedShellState, watchToastMounts } from "@orb/testkit/browser/spec";
import { absenceWindow, createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const DRAFT = "Is anyone there?";
// The span a send that slipped past the gate would have taken to reach the wire.
const SEND_WINDOW_MS = 500;

// A touch pointer: the next-turn line is the coarse-pointer carrier of the reason.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("a room whose read failed disables Send with its reason, sends nothing and toasts nothing, and Retry enables Send", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = corpus.reads["chat.getChat"][0]?.output;
  if (room === undefined) {
    throw new Error("The committed corpus omitted a room");
  }
  let failing = true;
  await seedShellState(page, { activeSection: "chats" });
  const rpc = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.listCommands", "rpg.getGame", "rpg.listTurnToolCalls", "chat.send"]),
    ...serveCorpusProcedures(caller, ["chat.getChat"], () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
  });
  const toastMounts = await watchToastMounts(page);
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });

  const plate = page.locator('[data-slot="query-error"]');
  await expect(plate).toBeVisible();
  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await input.fill(DRAFT);
  const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
  await expect(send).toBeDisabled();
  const reason = page.locator('[data-slot="composer-next-turn"]');
  await expect(reason).toBeVisible();
  await expect(reason).toHaveText(/\S/u);
  await expect(send).toHaveAccessibleDescription((await reason.textContent()) ?? "");

  await input.press("Enter");
  await absenceWindow(page, SEND_WINDOW_MS);
  expect(rpc.count("chat.send")).toBe(0);
  expect(await toastMounts()).toBe(0);
  await expect(input).toHaveValue(DRAFT);

  failing = false;
  await plate.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(plate).toHaveCount(0);
  await expect(send).toBeEnabled();
  await expect(reason).toHaveCount(0);
});
