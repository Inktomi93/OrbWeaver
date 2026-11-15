// A room whose host is unavailable disables Send before anything is typed into a doomed turn, and the composer's own
// refusal line and Send's description say only that the host is unavailable, never why. A struck key on the host's
// connection names a fix only to the host. A refusal whose cause this build has no words for still gives Send a reason.
// @subject packages/client/src/features/chat/hooks/use-send-availability.ts
// @subject packages/client/src/lib/injection-copy.ts

import { TURN_HOST_UNAVAILABLE_OP_CODE } from "@orb/contracts/chat";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  malformedOrForwardTrpcWire,
  ROOM_PROCEDURES,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { HOST_KEY_REJECTED_COPY, KEY_REJECTED_COPY } from "#client/lib/injection-copy.ts";
import { HOST_UNAVAILABLE_COPY } from "#client/lib/turn-refusal-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const DRAFT = "Is anyone still hosting?";

// A touch pointer: the band's visible refusal line is the coarse-pointer carrier of the reason.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("a room whose host is unavailable disables Send and says the host is unavailable", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = corpus.reads["chat.getChat"][0]?.output;
  if (room === undefined) {
    throw new Error("The committed corpus omitted a room");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.listCommands", "rpg.getGame", "rpg.listTurnToolCalls"]),
    // The verdict a member reads when the room's host is disabled; any other room is not this case.
    "chat.checkSendAvailability": (request) => (request.chatId === room.id ? { available: false, cause: TURN_HOST_UNAVAILABLE_OP_CODE } : trpcError()),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });

  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await input.fill(DRAFT);
  const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
  await expect(send).toBeDisabled();
  await expect(page.locator('[data-slot="composer-guided-refusal"]')).toHaveText(HOST_UNAVAILABLE_COPY);
  await expect(send).toHaveAccessibleDescription(HOST_UNAVAILABLE_COPY);
  // The next-turn line states only a missing chat connection; this refusal has one statement, the band's.
  await expect(page.locator('[data-slot="composer-next-turn"]')).toHaveCount(0);
  await expect(input).toHaveValue(DRAFT);
});

// A struck key on the host's bound chat connection: the host is told to replace it, a member only that the host's
// connection is out, since the key is not the member's and Saved keys is not theirs to open.
const KEY_REJECTED_READS = [
  { viewer: "host", copy: KEY_REJECTED_COPY },
  { viewer: "member", copy: HOST_KEY_REJECTED_COPY },
] as const;

for (const { viewer, copy } of KEY_REJECTED_READS) {
  test(`a room whose host's key was rejected tells the ${viewer} whose fix it is`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
    const room = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
    if (room === undefined || memberId === undefined) {
      throw new Error("The committed corpus omitted a shared human room");
    }
    await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
    // The multi-user toggle is read when a caller is built, so the viewer's caller is made after it is set.
    const caller = await root.internalCallerFor(viewer === "host" ? root.ownerId : memberId);
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.listCommands", "rpg.getGame", "rpg.listTurnToolCalls"]),
      "chat.checkSendAvailability": (request) => (request.chatId === room.id ? { available: false, cause: "key-rejected" } : trpcError()),
    });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });

    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    await input.fill(DRAFT);
    const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
    await expect(send).toBeDisabled();
    await expect(page.locator('[data-slot="composer-guided-refusal"]')).toHaveText(copy);
    await expect(send).toHaveAccessibleDescription(copy);
  });
}

test("a refusal whose cause this build does not know still gives Send a reason", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = corpus.reads["chat.getChat"][0]?.output;
  if (room === undefined) {
    throw new Error("The committed corpus omitted a room");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.listCommands", "rpg.getGame", "rpg.listTurnToolCalls"]),
    // The client does not parse this read, so a newer server's cause reaches the composer as the string it sent.
    "chat.checkSendAvailability": (request) =>
      request.chatId === room.id ? malformedOrForwardTrpcWire({ available: false, cause: "cause-from-a-newer-server" }) : trpcError(),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });

  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await input.fill(DRAFT);
  const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
  await expect(send).toBeDisabled();
  const refusal = page.locator('[data-slot="composer-guided-refusal"]');
  await expect(refusal).toHaveText(/\S/u);
  // One reason, the same words on the band and on Send.
  await expect(send).toHaveAccessibleDescription((await refusal.textContent()) ?? "");
  await expect(input).toHaveValue(DRAFT);
});
