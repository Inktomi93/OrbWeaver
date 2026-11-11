// A turn terminal closes the composer's live slot when its frame carries no cursor (a dropped append the server still
// fans, D342), and is dropped as a re-delivery when it carries one the room already passed. The server side of the
// null-cursor fan is tests/server/domain/chat/persistence/dropped-append-fan.int.test.ts.

import { WARNING_CODE } from "@orb/contracts/inference";
import type { StreamFrame } from "@orb/contracts/stream";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
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
import { CHAT_SEND_NAME, CHAT_STOP_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { warningNotice } from "#client/features/chat/lib/warning-notice.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// Past any sequence the corpus room holds, so the scripted frames land as new live events.
const FIRST_SEQ = 1_000_000;
// The last frame raises a notice: once it shows, the client has applied every frame before it.
const BARRIER_CODE = WARNING_CODE.imageCountDropped;

for (const { label, terminalSeq, live } of [
  { label: "a turn terminal with no cursor closes the open turn", terminalSeq: null, live: false },
  { label: "a turn terminal with a cursor the room already passed is dropped, and the turn stays open", terminalSeq: FIRST_SEQ, live: true },
] as const) {
  test(label, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const room = corpus.reads["chat.getChat"].at(0)?.output;
    if (room === undefined) {
      throw new Error("The corpus has no room");
    }
    const chatId = typeIdSchema(ID_PREFIX.chat).parse(room.id);
    const turnId = root.idSource.typeId(ID_PREFIX.chatTurn);
    const caller = await root.internalCallerFor(root.ownerId);
    const frames: readonly StreamFrame[] = [
      {
        channel: "chat",
        chatId,
        seq: FIRST_SEQ,
        event: { type: "turnAccepted", chatId, turnId, intent: "send", speakerCharacterId: null, targetMessageId: null },
      },
      { channel: "chat", chatId, seq: terminalSeq, event: { type: "turnCompleted", chatId, turnId, intent: "send", messageId: null } },
      { channel: "chat", chatId, seq: FIRST_SEQ + 1, event: { type: "warning", chatId, code: BARRIER_CODE } },
    ];
    await seedShellState(page, { activeSection: "chats" });
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"]),
      "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    });
    const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
    await socket.served();
    await expect(noticeToast(page, warningNotice({ code: BARRIER_CODE }))).toBeVisible();
    // The composer keys Stop and Send on the turn slot alone, so each name states whether the terminal reached it.
    await expect(page.getByRole("button", { name: live ? CHAT_STOP_NAME : CHAT_SEND_NAME, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: live ? CHAT_SEND_NAME : CHAT_STOP_NAME, exact: true })).toBeHidden();
  });
}
