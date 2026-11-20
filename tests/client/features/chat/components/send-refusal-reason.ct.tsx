// A refused send names its reason from the turn copy and keeps the draft: a room being removed says the chat is no
// longer available, an unavailable host says only that, and a reason the client does not know reads as a failed send.
// @subject packages/client/src/lib/turn-abort-notice.ts
// @subject packages/client/src/features/chat/hooks/use-send-message.ts

import { TURN_HOST_UNAVAILABLE_OP_CODE, TURN_ROOM_CLOSING_OP_CODE } from "@orb/contracts/chat";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, noticeToast, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { SEND_FAILED_TITLE } from "#client/features/chat/lib/send-failure-copy.ts";
import { TURN_HOST_UNAVAILABLE_COPY, TURN_ROOM_CLOSING_COPY } from "#client/lib/turn-refusal-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const SETTINGS_READS = [
  "chat.getGroupConfig",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "chat.listEffectiveRegex",
  "regex.listForChat",
  "automation.listRules",
] as const;
const DRAFT = "Is anyone still hosting?";
// A reason this client build has no copy for, as a newer server could send.
const UNMAPPED_REASON = "a_reason_this_build_has_not_seen";
const REFUSALS = [
  { reason: TURN_ROOM_CLOSING_OP_CODE, title: TURN_ROOM_CLOSING_COPY },
  { reason: TURN_HOST_UNAVAILABLE_OP_CODE, title: TURN_HOST_UNAVAILABLE_COPY },
  { reason: UNMAPPED_REASON, title: SEND_FAILED_TITLE },
] as const;

for (const { reason, title } of REFUSALS) {
  test(`a send refused with ${reason} shows its notice and keeps the draft`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const room = corpus.reads["chat.getChat"][0]?.output;
    if (room === undefined) {
      throw new Error("The committed corpus omitted a room");
    }
    await seedShellState(page, { activeSection: "chats" });
    const rpc = await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
      ...serveCorpusProcedures(caller, ["chat.send"], (sent) => (sent.content === DRAFT ? trpcError({ code: "BAD_REQUEST", reason }) : undefined)),
    });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });

    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    await input.fill(DRAFT);
    await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();

    await expect(noticeToast(page, { title })).toBeVisible();
    await expect(input).toHaveValue(DRAFT);
    expect(rpc.inputs("chat.send")).toMatchObject([{ chatId: room.id, content: DRAFT }]);
  });
}
