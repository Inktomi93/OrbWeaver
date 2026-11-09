// A failed temp-chat sweep is housekeeping the person did not start: it logs and shows no toast (client-architecture-state-and-gates.md §11).

import { watchToastMounts } from "@orb/testkit/browser/spec";
import { noticeToast, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { BACKGROUND_FAILURE_LOGS } from "#client/data/background-failure-logs.ts";
import type { TempChatTileStory } from "./_temp-chat-sweep-stories.tsx";

const STORY = "tests/client/features/chat/lib/_temp-chat-sweep-stories/TempChatTileStory";
const SWEEP_FAILURE = "Scripted temporary-chat sweep failure";
const CONTROL_NOTICE = "Control notice";

test("a temp-chat sweep that fails writes its log and raises no toast", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  let sweeps = 0;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    "chat.reapTemporaryChats": () => (sweeps++ === 0 ? trpcError({ message: SWEEP_FAILURE }) : { reaped: 0 }),
  });
  const toastMounts = await watchToastMounts(page);
  const logged = page.waitForEvent("console", {
    predicate: (message) => message.type() === "error" && message.text().includes(BACKGROUND_FAILURE_LOGS.tempChatSweep),
  });
  await mount<typeof TempChatTileStory>(STORY, { controlNotice: CONTROL_NOTICE });

  await logged;
  expect(sweeps).toBe(1);
  await page.getByRole("button", { name: CONTROL_NOTICE, exact: true }).click();
  await expect(noticeToast(page, { title: CONTROL_NOTICE })).toBeVisible();
  expect(await toastMounts()).toBe(1);
});
