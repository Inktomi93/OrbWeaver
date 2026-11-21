// @subject packages/client/src/lib/display-script-stops.ts
// The notice for a script this browser's display pass stopped, in a room whose panel is shut: it offers Show this script, and
// its next step names the control the reader's own row holds. The action lands on the script's row.

import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeOrbSocket } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { REGEX_STOP_OPEN_SCRIPT_NAME, regexStopNextStep } from "#client/features/chat/lib/regex-stop-copy.ts";
import { displayScriptsStoppedDescription, displayScriptsStoppedTitle } from "#client/lib/display-pass-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import { findHostedRoom } from "./hosted-room.fixtures.ts";
import { rosterRow, rowAnchor, serveHostedRoom } from "./regex-stop-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const UTC = "UTC";
/** Backtracks exponentially on a run of `a` that does not end the line: at forty, for longer than any test runs. */
const RUNAWAY = { name: "Runaway", findRegex: "(a+)+$", replaceString: "MATCHED" } as const;
const RUNAWAY_TEXT = `${"a".repeat(40)}!`;
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

test("a stopped script's notice offers its row and names the switch the reader's own row holds", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const runaway = await host.regex.createScript({ input: { ...RUNAWAY, targets: ["AI_OUTPUT", "USER_INPUT"], passes: ["display"] } });
  await host.regex.attachGlobal({ scriptId: runaway.id });
  const newest = (await host.chat.listMessages({ chatId, limit: 1 })).messages.at(-1);
  if (newest === undefined) {
    throw new Error("The corpus room has no message to rewrite");
  }
  await host.chat.editMessage({ chatId, messageId: newest.id, content: RUNAWAY_TEXT, timeZone: UTC });
  await seedShellState(page, { activeSection: "chats" });
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [] });
  await corpusMedia();
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  // The host's own script: its row holds the switch, so that is the control the notice names.
  const notice = noticeToast(page, {
    title: displayScriptsStoppedTitle(1),
    description: displayScriptsStoppedDescription(RUNAWAY.name, "slow", 1, regexStopNextStep("switch")),
  });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: REGEX_STOP_OPEN_SCRIPT_NAME, exact: true }).click();

  await expect(rosterRow(page, RUNAWAY.name)).toBeVisible();
  await expect(rowAnchor(page, "regex-on-screen", RUNAWAY.name)).toBeInViewport({ ratio: 1 });
  await expect(rowAnchor(page, "regex-on-screen", RUNAWAY.name)).toBeFocused();
});
