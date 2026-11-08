// The count and size notices a picture raises in its room. The room bus carries a warning to every seat and the client
// raises it without asking who owns the picture; a member's side of delivery is the server replay in
// tests/server/domain/imagery/verbs/generation-policy.int.test.ts.

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
import { warningNotice } from "#client/features/chat/lib/warning-notice.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// Past any sequence the corpus room holds, so the scripted frames land as new live events.
const FIRST_SEQ = 1_000_000;

test("a dropped image count and size each raise a notice in a shared room", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const room = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (room === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  const chatId = typeIdSchema(ID_PREFIX.chat).parse(room.id);
  const caller = await root.internalCallerFor(root.ownerId);
  const warning = (code: typeof WARNING_CODE.imageCountDropped | typeof WARNING_CODE.imageSizeDropped, seq: number): StreamFrame => ({
    channel: "chat",
    chatId,
    seq,
    event: { type: "warning", chatId, code },
  });
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"]),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page, {
    awaitAttaches: 1,
    frames: [warning(WARNING_CODE.imageCountDropped, FIRST_SEQ), warning(WARNING_CODE.imageSizeDropped, FIRST_SEQ + 1)],
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(2);
  // Each code raises its own notice: the copy production maps that code to, so one notice standing in for both fails.
  for (const code of [WARNING_CODE.imageCountDropped, WARNING_CODE.imageSizeDropped]) {
    await expect(noticeToast(page, warningNotice({ code }))).toBeVisible();
  }
});
