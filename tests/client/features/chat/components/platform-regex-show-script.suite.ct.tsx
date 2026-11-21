// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// The stopped-script notice's Show this script on a touch phone: the context sheet opens on the script's row, the whole
// row is on screen below the sheet's top edge, and focus is on it. A roster row and a prompt-only tier row each have
// the action's landing, because the notice names either.

import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeOrbSocket } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { REGEX_STOP_OPEN_SCRIPT_NAME } from "#client/features/chat/lib/regex-stop-copy.ts";
import { regexNotAppliedNotice } from "#client/features/chat/lib/warning-notice.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import { findHostedRoom } from "./hosted-room.fixtures.ts";
import { FIRST_SEQ, HISTORY, PROMPT_ONLY, rowAnchor, SLOW, serveHostedRoom, warning } from "./regex-stop-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PHONE = { width: 390, height: 844 } as const;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

// The roster draws a script that runs on screen, and so does its tier; the roster's row takes the request.
const CASES = [
  { where: "a roster row", script: SLOW, passes: ["display", "prompt"], group: "regex-on-screen" },
  { where: "a prompt-only tier row", script: PROMPT_ONLY, passes: ["prompt"], group: "regex-tier" },
] as const;

for (const { where, script: shape, passes, group } of CASES) {
  test(`Show this script on a phone lands on ${where}: whole in view and focused`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const host = await root.internalCallerFor(root.ownerId);
    const chatId = await findHostedRoom(host);
    const script = await host.regex.createScript({ input: { ...shape, targets: ["AI_OUTPUT"], passes: [...passes] } });
    await host.regex.attachGlobal({ scriptId: script.id });
    await seedShellState(page, { activeSection: "chats" });
    await serveHostedRoom(page, { root, corpus, host, chatId });
    const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [warning(chatId, script.id, HISTORY, FIRST_SEQ)] });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
    await socket.served();

    const notice = noticeToast(page, regexNotAppliedNotice([{ name: shape.name, ...HISTORY }]));
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: REGEX_STOP_OPEN_SCRIPT_NAME, exact: true }).click();

    const anchor = rowAnchor(page, group, shape.name);
    // The positive control: the row is drawn, so a missing viewport ratio is not a missing row.
    await expect(anchor).toHaveCount(1);
    await expect(anchor).toBeInViewport({ ratio: 1 });
    await expect(anchor).toBeFocused();
  });
}
